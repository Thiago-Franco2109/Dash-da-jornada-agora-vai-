import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Estado REAL das campanhas por parceiro (read-only), direto do banco —
 * substitui os exports estáticos das abas PROMO-ESPECIAL / CUPOM-PARCEIRO.
 *
 * - Super Promos / Ofertas da Casa (e outras) ← `campanha_promocao` ativa e
 *   vigente; participantes = chaves numéricas do JSON `config` (estabelecimento_id).
 * - Cupons de destaque ← `cupom_desconto` (ativo=1, destaque=1, vigente).
 *
 * O status de TRABALHO do CS (ofertei/aguardando/negado) NÃO vem daqui —
 * continua no override do Supabase, aplicado por cima no front.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json' };

// nomes de campanha no banco → chave de coluna no app
const CAMPAIGN_KEY: Record<string, string> = {
    'Super Promos!': 'super_promos',
    'Ofertas da Casa': 'ofertas_da_casa',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // por parceiro: { superPromos, ofertasDaCasa, cupons, campanhas: [...] }
        const data: Record<string, { superPromos: boolean; ofertasDaCasa: boolean; cupons: boolean; campanhas: string[] }> = {};
        const ensure = (id: string) => (data[id] ??= { superPromos: false, ofertasDaCasa: false, cupons: false, campanhas: [] });

        // 1) campanhas de promoção ativas/vigentes → participantes via config
        const [camps] = await connection.query<RowDataPacket[]>(
            `SELECT nome, config FROM campanha_promocao
             WHERE ativo = 1 AND NOW() BETWEEN data_inicio AND data_fim`,
        );
        for (const cp of camps) {
            const nome = cp.nome as string;
            let cfg: Record<string, unknown> = {};
            try { cfg = JSON.parse(String(cp.config ?? '{}')); } catch { /* ignore */ }
            const key = CAMPAIGN_KEY[nome];
            for (const estabId of Object.keys(cfg)) {
                if (!/^\d+$/.test(estabId)) continue;
                const p = ensure(estabId);
                if (!p.campanhas.includes(nome)) p.campanhas.push(nome);
                if (key === 'super_promos') p.superPromos = true;
                else if (key === 'ofertas_da_casa') p.ofertasDaCasa = true;
            }
        }

        // 2) cupons de destaque ativos/vigentes
        const [cupons] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT estabelecimento_id AS id FROM cupom_desconto
             WHERE ativo = 1 AND destaque = 1 AND NOW() BETWEEN data_inicio AND data_fim`,
        );
        for (const r of cupons) {
            const id = String(r.id);
            ensure(id).cupons = true;
        }

        const totais = {
            superPromos: Object.values(data).filter(p => p.superPromos).length,
            ofertasDaCasa: Object.values(data).filter(p => p.ofertasDaCasa).length,
            cupons: Object.values(data).filter(p => p.cupons).length,
            parceiros: Object.keys(data).length,
        };

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, totais, data, elapsedMs: Date.now() - started }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }) };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
