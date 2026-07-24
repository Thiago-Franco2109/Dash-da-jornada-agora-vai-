import mysql from 'mysql2/promise';

/**
 * Conexão read-only com o banco de teste (MySQL).
 * Credenciais vêm SÓ de env vars — nunca do cliente.
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * Cada invocação de function abre e fecha sua própria conexão (o ambiente
 * serverless da Netlify não mantém pool entre chamadas de forma confiável).
 */
export async function getConnection(): Promise<mysql.Connection> {
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
        throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    }

    return mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 10_000,
        // sem multipleStatements: só permitimos uma query por chamada
        multipleStatements: false,
    });
}
