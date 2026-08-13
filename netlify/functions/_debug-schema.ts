import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * TEMPORÁRIO — descobre as colunas reais de `cupom_desconto` pra mapear
 * "1º Pedido" e "Taxa de Entrega" (ver plano "Ações Promocionais por Cidade").
 * Apagar assim que os nomes forem confirmados — não faz parte da feature.
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

    const table = event.queryStringParameters?.table || 'cupom_desconto';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Nome de tabela inválido' }) };
    }

    let connection;
    try {
        connection = await getConnection();
        const [rows] = await connection.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, table, columns: rows }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
