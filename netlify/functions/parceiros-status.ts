import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Status do contrato por parceiro — substitui a aba PARCEIROS da planilha mestre.
 *
 * O contrato é a `venda` ligada ao estabelecimento por `venda_estabelecimento`
 * (o número que o CMS mostra em "Ver Contrato #N" é o venda_id). O status vem
 * de `estabelecimento.delivery`, que é o gabarito usado no resto do app:
 *   1 = ativo | 2 = cancelado | 4 = suspenso | 5 = desistência
 * Quem tem contrato mas ainda não caiu num desses códigos entra como pendente.
 *
 * Resposta: { ok, porEstab: { "28442": { status: "ativo", contratoId: 9383 } } }
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

type ContratoStatus = 'ativo' | 'suspenso' | 'cancelado' | 'pendente';

const STATUS_POR_DELIVERY: Record<number, ContratoStatus> = {
    1: 'ativo',
    2: 'cancelado',
    4: 'suspenso',
    5: 'cancelado', // desistência — a planilha também agrupava como cancelado
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

        // Um parceiro pode ter vários contratos (renovação); vale o mais recente.
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT ve.estabelecimento_id AS estab,
                    MAX(ve.venda_id)      AS contratoId,
                    e.delivery            AS delivery
             FROM venda_estabelecimento ve
             JOIN estabelecimento e ON e.id = ve.estabelecimento_id
             GROUP BY ve.estabelecimento_id, e.delivery`,
        );

        const porEstab: Record<string, { status: ContratoStatus; contratoId: number }> = {};
        for (const r of rows) {
            const delivery = r.delivery == null ? null : Number(r.delivery);
            porEstab[String(r.estab)] = {
                status: (delivery != null && STATUS_POR_DELIVERY[delivery]) || 'pendente',
                contratoId: Number(r.contratoId ?? 0) || 0,
            };
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: Object.keys(porEstab).length,
                porEstab,
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
