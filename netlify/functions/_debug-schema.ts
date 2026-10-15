import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * TEMPORÁRIO — descobre as colunas de `campanha_promocao` pra achar o campo da
 * imagem de capa da campanha (a que aparece no CMS como "Imagem de capa
 * 1200x400"). Apagar assim que o nome for confirmado; não faz parte de feature.
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

    const table = event.queryStringParameters?.table || 'campanha_promocao';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Nome de tabela inválido' }) };
    }

    let connection;
    try {
        connection = await getConnection();
        const [cols] = await connection.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
        // Amostra de 1 linha vigente só pra ver o formato do valor da capa.
        const [amostra] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM \`${table}\` WHERE ativo = 1 ORDER BY id DESC LIMIT 1`,
        );
        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, table, columns: cols, amostra }),
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
