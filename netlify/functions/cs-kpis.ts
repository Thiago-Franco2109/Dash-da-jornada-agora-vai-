import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * KPIs de Sucesso do Cliente (read-only).
 *
 * Base: `Comissao_View` (comissão líquida por pedido) + `estabelecimento`/`pedido`.
 * Compara a janela atual (0-N dias) com a anterior (N-2N dias) por parceiro:
 *   - NRR / GRR / churn de receita
 *   - R$ perdido (parceiros que zeraram), em queda (>50%), receita de novos
 *   - taxa de atividade (ativos com pedido na janela)
 *   - top parceiros em risco por R$ (acionável)
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const windowDays = Math.min(Math.max(parseInt(q.window ?? '30', 10) || 30, 7), 90);
    const activityDays = Math.min(Math.max(parseInt(q.activity ?? '28', 10) || 28, 7), 90);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // comissão líquida por parceiro: janela atual vs anterior (uma varredura)
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS id, estabelecimento AS nome, cidade,
                    SUM(CASE WHEN data >= NOW()-INTERVAL ${windowDays} DAY THEN comissao_liquida ELSE 0 END) AS cur,
                    SUM(CASE WHEN data <  NOW()-INTERVAL ${windowDays} DAY THEN comissao_liquida ELSE 0 END) AS prev
             FROM Comissao_View
             WHERE data >= NOW() - INTERVAL ${windowDays * 2} DAY
             GROUP BY estabelecimento_id, estabelecimento, cidade`,
        );

        let totCur = 0, totPrev = 0, nrrNum = 0, nrrDen = 0, grrNum = 0;
        let perdidoVal = 0, perdidoCount = 0, quedaVal = 0, quedaCount = 0, novosVal = 0, novosCount = 0;
        const risco: { id: number; nome: string; cidade: string | null; anterior: number; atual: number; perda: number; tipo: 'zerou' | 'queda' }[] = [];

        for (const r of rows) {
            const cur = Number(r.cur) || 0;
            const prev = Number(r.prev) || 0;
            totCur += cur; totPrev += prev;
            if (prev > 0) {
                nrrDen += prev; nrrNum += cur; grrNum += Math.min(cur, prev);
                if (cur <= 0) {
                    perdidoVal += prev; perdidoCount++;
                    risco.push({ id: r.id as number, nome: r.nome as string, cidade: (r.cidade as string) ?? null, anterior: prev, atual: cur, perda: prev, tipo: 'zerou' });
                } else if (cur < prev * 0.5) {
                    quedaVal += (prev - cur); quedaCount++;
                    risco.push({ id: r.id as number, nome: r.nome as string, cidade: (r.cidade as string) ?? null, anterior: prev, atual: cur, perda: prev - cur, tipo: 'queda' });
                }
            } else if (cur > 0) {
                novosVal += cur; novosCount++;
            }
        }

        risco.sort((a, b) => b.perda - a.perda);

        // atividade: ativos (delivery=1) com pedido na janela
        const [ativosRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS n FROM estabelecimento WHERE delivery = 1`,
        );
        const [comPedidoRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT p.estabelecimento_id) AS n
             FROM pedido p JOIN estabelecimento e ON e.id = p.estabelecimento_id
             WHERE e.delivery = 1 AND p.data >= NOW() - INTERVAL ${activityDays} DAY`,
        );
        const totalAtivos = Number(ativosRows[0]?.n ?? 0);
        const comPedido = Number(comPedidoRows[0]?.n ?? 0);

        const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                windowDays,
                activityDays,
                comissao: {
                    atual: totCur,
                    anterior: totPrev,
                    variacaoPct: totPrev > 0 ? (totCur / totPrev - 1) * 100 : 0,
                },
                nrrPct: pct(nrrNum, nrrDen),
                grrPct: pct(grrNum, nrrDen),
                churnReceitaPct: nrrDen > 0 ? (1 - grrNum / nrrDen) * 100 : 0,
                perdido: { valor: perdidoVal, count: perdidoCount },
                emQueda: { valor: quedaVal, count: quedaCount },
                novos: { valor: novosVal, count: novosCount },
                atividade: {
                    totalAtivos,
                    comPedido,
                    semPedido: totalAtivos - comPedido,
                    taxaPct: pct(comPedido, totalAtivos),
                },
                topRisco: risco.slice(0, 20),
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
