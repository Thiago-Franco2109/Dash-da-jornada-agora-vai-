import { schedule } from '@netlify/functions';
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { supabaseAdmin, SupabaseIndisponivel, podeGravar } from './_shared/supabaseAdmin';
import { agregarMensal, inicioDeNMesesAtras, mesFechadoAnterior } from './_shared/ativacoesMensal';

/**
 * Congela o mês FECHADO no Supabase. Roda dia 1, 06:00 UTC (03:00 BRT).
 *
 * O banco Bigou reescreve o próprio passado: `data_modificacao_status` guarda
 * só a última mudança de status, e a marca `sucessoDoCliente` não é versionada.
 * Cada execução tira a foto do mês que acabou de fechar, enquanto ela ainda é
 * a mais fiel que existirá — depois disso o número só encolhe.
 *
 * Idempotente: `upsert` na PK (mes, dimensao, chave). Rodar duas vezes no mesmo
 * dia reescreve com o mesmo valor; rodar meses depois grava um número já
 * degradado — por isso o `congelado_em` fica registrado na linha.
 *
 * Também aceita GET manual (com checagem de origem) para backfill: `?mes=YYYY-MM`
 * congela um mês específico, `?meses=N` congela os N meses fechados anteriores.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const TABELA = 'ativacoes_mensal_snapshot';

interface Linha {
    mes: string;
    dimensao: 'total' | 'campanha' | 'cidade';
    chave: string;
    promo_total: number;
    promo_cs: number;
    promo_parceiro: number;
    promo_parceiros: number;
    cupons_total: number;
    cupons_parceiros: number;
    congelado_em: string;
}

async function congelar(mesesAlvo: string[]): Promise<{ meses: string[]; linhas: number }> {
    if (mesesAlvo.length === 0) return { meses: [], linhas: 0 };

    // busca desde o mês mais antigo pedido
    const maisAntigo = mesesAlvo.slice().sort()[0];
    const desde = `${maisAntigo}-01`;
    const alvo = new Set(mesesAlvo);

    let connection;
    let agregado;
    try {
        connection = await getConnection();
        agregado = await agregarMensal(connection, desde);
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }

    const congeladoEm = new Date().toISOString();
    const linhas: Linha[] = [];
    const base = (mes: string, dimensao: Linha['dimensao'], chave: string): Linha => ({
        mes, dimensao, chave,
        promo_total: 0, promo_cs: 0, promo_parceiro: 0, promo_parceiros: 0,
        cupons_total: 0, cupons_parceiros: 0,
        congelado_em: congeladoEm,
    });

    for (const m of agregado.series) {
        if (!alvo.has(m.mes)) continue;
        linhas.push({
            ...base(m.mes, 'total', ''),
            promo_total: m.promo.total,
            promo_cs: m.promo.cs,
            promo_parceiro: m.promo.parceiro,
            promo_parceiros: m.promo.parceiros,
            cupons_total: m.cupons.total,
            cupons_parceiros: m.cupons.parceiros,
        });
    }
    for (const c of agregado.porCampanha) {
        if (!alvo.has(c.mes)) continue;
        linhas.push({
            ...base(c.mes, 'campanha', c.campanha),
            promo_total: c.total, promo_cs: c.cs, promo_parceiro: c.parceiro,
        });
    }
    for (const c of agregado.porCidade) {
        if (!alvo.has(c.mes)) continue;
        linhas.push({
            ...base(c.mes, 'cidade', c.cidade),
            promo_total: c.total, promo_cs: c.cs, promo_parceiro: c.parceiro,
            cupons_total: c.cupons,
        });
    }

    if (linhas.length === 0) return { meses: mesesAlvo, linhas: 0 };

    const sb = supabaseAdmin();
    // lotes: o upsert vai numa requisição só, mas mês cheio pode passar de 400 linhas
    for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await sb
            .from(TABELA)
            .upsert(linhas.slice(i, i + 500), { onConflict: 'mes,dimensao,chave' });
        if (error) throw new Error(`Supabase: ${error.message}`);
    }

    return { meses: mesesAlvo, linhas: linhas.length };
}

/** Lista de meses 'YYYY-MM' terminando no último mês fechado. */
function mesesFechados(n: number, hoje = new Date()): string[] {
    const out: string[] = [];
    for (let i = 1; i <= n; i++) {
        const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - i, 1));
        out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return out.reverse();
}

/** Execução agendada: congela só o mês que acabou de fechar. */
const agendado = async (): Promise<HandlerResponse> => {
    const started = Date.now();
    try {
        const r = await congelar([mesFechadoAnterior()]);
        console.log(`[snapshot-ativacoes] congelado ${r.meses.join(', ')} — ${r.linhas} linhas em ${Date.now() - started}ms`);
        return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true, ...r }) };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error(`[snapshot-ativacoes] FALHOU: ${message}`);
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};

/** Execução manual (backfill / conferência). */
const manual = async (event: HandlerEvent): Promise<HandlerResponse> => {
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }
    if (!podeGravar) {
        return {
            statusCode: 503,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: false, error: 'Chave de servidor do Supabase ausente (SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY) — o snapshot não pode gravar.' }),
        };
    }

    const q = event.queryStringParameters ?? {};
    const started = Date.now();
    try {
        const alvo = q.mes && /^\d{4}-\d{2}$/.test(q.mes)
            ? [q.mes]
            : mesesFechados(Math.min(Math.max(parseInt(q.meses ?? '1', 10) || 1, 1), 24));
        const r = await congelar(alvo);
        return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true, ...r, elapsedMs: Date.now() - started }) };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const status = err instanceof SupabaseIndisponivel ? 503 : 502;
        return { statusCode: status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: message, elapsedMs: Date.now() - started }) };
    }
};

/**
 * O agendador da Netlify invoca via POST com `next_run` no corpo. Só isso conta
 * como execução agendada — TODO o resto cai no caminho manual, que exige origem
 * permitida.
 *
 * Não inverter esta regra: se "sem Referer" fosse tratado como agendado, uma
 * requisição anônima qualquer (um crawler, um curl) recongelaria o mês fechado
 * com o valor já erodido daquele momento, sobrescrevendo a foto boa. O snapshot
 * existe justamente para esse número não se mexer.
 */
function ehInvocacaoAgendada(event: HandlerEvent): boolean {
    if (event.httpMethod !== 'POST' || !event.body) return false;
    try {
        return 'next_run' in (JSON.parse(event.body) as Record<string, unknown>);
    } catch {
        return false;
    }
}

export const handler = schedule('0 6 1 * *', async (event): Promise<HandlerResponse> =>
    ehInvocacaoAgendada(event) ? agendado() : manual(event),
) as Handler;

export { congelar, mesesFechados, inicioDeNMesesAtras };
