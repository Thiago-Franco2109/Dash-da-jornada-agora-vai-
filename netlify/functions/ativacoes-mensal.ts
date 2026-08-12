import type { Handler } from '@netlify/functions';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { agregarMensal, inicioDeNMesesAtras } from './_shared/ativacoesMensal';
import { supabaseLeitura, temSupabase } from './_shared/supabaseAdmin';

/**
 * Série MENSAL de ativação de ações na carteira (read-only): promoções e
 * cupons de destaque, mês a mês, com o corte CS vs parceiro nas promoções.
 *
 * DUAS FONTES, nesta ordem de preferência:
 *   1. `ativacoes_mensal_snapshot` (Supabase) — meses já CONGELADOS. Foto
 *      tirada quando o mês fechou, portanto o número real daquele mês.
 *   2. banco Bigou ao vivo — o mês corrente e qualquer mês ainda não congelado.
 *
 * Por que a fonte 1 existe: o Bigou reescreve o próprio passado.
 * `item_catalogo.data_modificacao_status` guarda só a ÚLTIMA mudança de status
 * (uma aprovação de maio some quando o item muda em julho), e a marca
 * `campanha_promocao.metadata.sucessoDoCliente` não é versionada. Um mês lido
 * ao vivo é um PISO que encolhe com o tempo; um mês congelado é o valor real.
 *
 * `confiabilidade` diz de qual mundo o mês veio — e a tela deve mostrar isso,
 * porque comparar um mês congelado com um mês erodido sem aviso é comparar
 * coisas diferentes.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const TABELA = 'ativacoes_mensal_snapshot';

interface LinhaSnapshot {
    mes: string;
    promo_total: number;
    promo_cs: number;
    promo_parceiro: number;
    promo_parceiros: number;
    cupons_total: number;
    cupons_parceiros: number;
    congelado_em: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const meses = Math.min(Math.max(parseInt(q.meses ?? '12', 10) || 12, 1), 36);

    let connection;
    const started = Date.now();
    try {
        const desde = inicioDeNMesesAtras(meses);

        connection = await getConnection();
        const vivo = await agregarMensal(connection, desde);

        // ── meses congelados (se o Supabase estiver disponível) ──
        const congelados = new Map<string, LinhaSnapshot>();
        let snapshotErro: string | null = null;
        if (temSupabase) {
            try {
                const { data, error } = await supabaseLeitura()
                    .from(TABELA)
                    .select('mes, promo_total, promo_cs, promo_parceiro, promo_parceiros, cupons_total, cupons_parceiros, congelado_em')
                    .eq('dimensao', 'total')
                    .gte('mes', desde.slice(0, 7));
                if (error) throw new Error(error.message);
                for (const r of (data ?? []) as LinhaSnapshot[]) congelados.set(r.mes, r);
            } catch (err: unknown) {
                // snapshot indisponível não derruba a tela — cai para o ao vivo
                snapshotErro = err instanceof Error ? err.message : 'falha ao ler snapshot';
            }
        }

        const agora = new Date();
        const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        const idxMes = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
        const idxAtual = idxMes(mesAtual);

        // união dos meses vistos ao vivo e dos congelados (um mês pode existir
        // só no snapshot, se o Bigou já apagou todo rastro dele)
        const todosMeses = [...new Set([...vivo.series.map(s => s.mes), ...congelados.keys()])].sort();
        const vivoPorMes = new Map(vivo.series.map(s => [s.mes, s]));

        const series = todosMeses.map(mes => {
            const congelado = congelados.get(mes);
            const v = vivoPorMes.get(mes);

            const promo = congelado
                ? {
                    total: congelado.promo_total,
                    cs: congelado.promo_cs,
                    parceiro: congelado.promo_parceiro,
                    parceiros: congelado.promo_parceiros,
                }
                : {
                    total: v?.promo.total ?? 0,
                    cs: v?.promo.cs ?? 0,
                    parceiro: v?.promo.parceiro ?? 0,
                    parceiros: v?.promo.parceiros ?? 0,
                };
            const cupons = congelado
                ? { total: congelado.cupons_total, parceiros: congelado.cupons_parceiros }
                : { total: v?.cupons.total ?? 0, parceiros: v?.cupons.parceiros ?? 0 };

            const idade = idxAtual - idxMes(mes);
            // mês congelado vale como alta em qualquer idade — a foto foi tirada
            // na hora certa. Sem foto, a confiança cai com a idade.
            const confiabilidade = congelado ? 'alta' : idade <= 1 ? 'alta' : idade <= 3 ? 'media' : 'baixa';

            return {
                mes,
                parcial: mes === mesAtual,
                congelado: Boolean(congelado),
                congeladoEm: congelado?.congelado_em ?? null,
                confiabilidade,
                promo: {
                    ...promo,
                    pctParceiro: promo.total > 0 ? Math.round((promo.parceiro / promo.total) * 100) : null,
                    // zero num mês antigo e NÃO congelado é sobrescrita, não
                    // ausência de atividade — o gráfico deve mostrar lacuna
                    semDado: promo.total === 0 && !congelado && confiabilidade !== 'alta',
                },
                cupons,
            };
        });

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                meses,
                series,
                porCampanha: vivo.porCampanha,
                porCidade: vivo.porCidade,
                snapshot: {
                    disponivel: temSupabase,
                    mesesCongelados: [...congelados.keys()].sort(),
                    erro: snapshotErro,
                },
                fonte: {
                    promo: 'item_catalogo.data_modificacao_status (última mudança de status)',
                    autoria: 'campanha_promocao.metadata.sucessoDoCliente (estado atual, sem histórico)',
                    cupom: 'cupom_desconto.data (criação, sem autor)',
                },
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }) };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
