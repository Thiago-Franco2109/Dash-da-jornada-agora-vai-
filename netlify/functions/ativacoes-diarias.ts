import type { Handler } from '@netlify/functions';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { agregarDiario } from './_shared/ativacoesDiarias';

/**
 * Ativação de campanhas por dia (read-only) — alimenta o widget "meu ritmo de
 * ativações" do perfil do gestor. `dias` limita a janela (default 365, máx.
 * 1095 ~3 anos) — sem isso a query varre item_catalogo/cupom_desconto
 * inteiros a cada chamada, com custo crescendo pra sempre (mesmo motivo de
 * `windowDays` em ativacoes-campanhas.ts e `meses` em ativacoes-mensal.ts).
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const dias = Math.min(Math.max(parseInt(q.dias ?? '365', 10) || 365, 1), 1095);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();
        const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const rows = await agregarDiario(connection, desde);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                dias,
                rows,
                fonte: {
                    promo: 'item_catalogo.data_modificacao_status (última mudança de status — dias antigos podem estar subcontados se o item foi mexido de novo)',
                    cupom: 'cupom_desconto.data (criação)',
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
