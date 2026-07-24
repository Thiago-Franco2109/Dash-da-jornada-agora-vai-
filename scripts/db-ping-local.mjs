// Teste de conectividade local com o banco de TESTE (MySQL).
// Lê as credenciais do .env e replica o que a Netlify Function db-ping faz.
// Uso: node scripts/db-ping-local.mjs
//
// OBS: isso testa a rede do SEU computador até o banco. O teste definitivo
// (pergunta 3 do handoff — "a Netlify enxerga o banco?") só depois do deploy.

import 'dotenv/config';
import mysql from 'mysql2/promise';

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
    console.error(`❌ Faltam variáveis no .env: ${missing.join(', ')}`);
    process.exit(1);
}

const started = Date.now();
let connection;

try {
    console.log(`⏳ Conectando em ${host}:${port} / ${database} ...`);
    connection = await mysql.createConnection({
        host, port, user, password, database, connectTimeout: 10_000,
    });

    await connection.query('SELECT 1 AS ping');
    console.log('✅ Conexão OK (SELECT 1 respondeu)');

    const [rows] = await connection.query(
        `SELECT table_name AS name
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY table_name`,
        [database],
    );
    const tables = rows.map(r => r.name);

    console.log(`✅ ${tables.length} tabelas no schema "${database}" (${Date.now() - started}ms)`);
    console.log('Primeiras tabelas:', tables.slice(0, 20).join(', '));
    if (tables.length > 20) console.log(`... e mais ${tables.length - 20}`);
} catch (err) {
    console.error(`❌ Falhou (${Date.now() - started}ms)`);
    console.error('   código:', err?.code ?? '—');
    console.error('   msg   :', err?.message ?? err);
    process.exit(1);
} finally {
    if (connection) { try { await connection.end(); } catch { /* ignore */ } }
}
