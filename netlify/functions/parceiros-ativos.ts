import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Lista de parceiros ATIVOS direto do banco (delivery=1), independente de ter
 * pedido/estar na planilha. Base para a carteira deixar de depender do INDICADOR
 * (que é montado por pedidos e ignora parceiros novos sem venda).
 *
 * Retorna id, nome, cidade (via localidade). Read-only, protegido por origem.
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

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT e.id, e.nome, e.uid, e.localidade_id, l.nome AS cidade
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery = 1
             ORDER BY e.nome`,
        );
        const data = rows.map(r => ({
            id: r.id as number,
            nome: r.nome as string,
            uid: (r.uid as string) ?? null,
            cidade: (r.cidade as string) ?? null,
            localidadeId: (r.localidade_id as number) ?? null,
        }));
        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, total: data.length, data, elapsedMs: Date.now() - started }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }) };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
