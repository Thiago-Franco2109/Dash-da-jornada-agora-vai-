import type { Handler } from '@netlify/functions';
import mysql from 'mysql2/promise';

/**
 * Teste de conectividade read-only com o banco de TESTE (MySQL).
 *
 * Não recebe query do cliente — só valida se a Netlify Function consegue
 * abrir conexão, roda um `SELECT 1` e lista as tabelas do schema.
 * Objetivo: destravar a pergunta "a rede aceita conexão?" do handoff.
 *
 * Credenciais vêm SÓ de env vars (nunca do navegador):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * Local: .env  |  Produção: Netlify → Site settings → Environment variables
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT ?? 3306);
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    const missing = [
        ['DB_HOST', host],
        ['DB_USER', user],
        ['DB_PASSWORD', password],
        ['DB_NAME', database],
    ].filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: `Variáveis de ambiente ausentes: ${missing.join(', ')}`,
            }),
        };
    }

    const started = Date.now();
    let connection: mysql.Connection | null = null;

    try {
        connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            database,
            connectTimeout: 10_000,
            // read-only por natureza: só fazemos SELECT aqui
        });

        // 1) prova de vida
        await connection.query('SELECT 1 AS ping');

        // 2) lista tabelas do schema (confirma acesso + ajuda a validar o schema
        //    contra docs/bigou — pergunta 4 do handoff)
        const [rows] = await connection.query(
            `SELECT table_name AS name
             FROM information_schema.tables
             WHERE table_schema = ?
             ORDER BY table_name`,
            [database],
        );

        const tables = (rows as { name: string }[]).map(r => r.name);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: true,
                database,
                elapsedMs: Date.now() - started,
                tableCount: tables.length,
                tables,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ok: false,
                code: code ?? null,
                error: message,
                elapsedMs: Date.now() - started,
            }),
        };
    } finally {
        if (connection) {
            try { await connection.end(); } catch { /* ignore */ }
        }
    }
};
