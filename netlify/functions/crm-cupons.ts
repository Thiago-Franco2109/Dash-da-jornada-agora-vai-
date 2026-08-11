import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Cupons em destaque por parceiro — substitui a aba CUPOM-PARCEIRO.
 *
 * Function separada da `crm-base` porque `cupom_desconto` tem 1,3 mi de linhas
 * e nenhum índice por estabelecimento, ativo ou destaque: a varredura leva ~4s
 * e junto com o resto passaria do limite de execução. (Um índice em
 * `estabelecimento_id` resolveria — precisa de alguém com acesso de escrita.)
 *
 * Regra assumida: cupom do parceiro = `ativo = 1` e `destaque = 1`, que é o
 * que a campanha "Cupons de destaque" usa. A vigência (data_inicio/data_fim)
 * vai crua para o front decidir, igual à aba.
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

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data_inicio, '%Y-%m-%d %H:%i:%s') AS inicio,
                    DATE_FORMAT(data_fim,    '%Y-%m-%d %H:%i:%s') AS fim
             FROM cupom_desconto
             WHERE ativo = 1 AND destaque = 1 AND estabelecimento_id IS NOT NULL`,
        );

        const cupons = rows.map(r => ({
            estabId: String(r.estab),
            dataInicio: String(r.inicio ?? ''),
            dataFim: String(r.fim ?? ''),
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: cupons.length,
                cupons,
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
