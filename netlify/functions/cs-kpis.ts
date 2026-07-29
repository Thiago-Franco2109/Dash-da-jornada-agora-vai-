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

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface RiscoItem {
    id: number; nome: string; cidade: string | null;
    anterior: number; atual: number; perda: number; tipo: 'zerou' | 'queda';
}

function mkAcc() {
    return {
        totCur: 0, totPrev: 0, nrrNum: 0, nrrDen: 0, grrNum: 0,
        perdidoVal: 0, perdidoCount: 0, quedaVal: 0, quedaCount: 0,
        novosVal: 0, novosCount: 0, expansaoVal: 0, expansaoCount: 0,
        contracaoVal: 0, contracaoCount: 0, estavelCount: 0,
        risco: [] as RiscoItem[],
    };
}
type Acc = ReturnType<typeof mkAcc>;

function fold(acc: Acc, id: number, nome: string, cidade: string | null, cur: number, prev: number) {
    acc.totCur += cur; acc.totPrev += prev;
    if (prev > 0) {
        acc.nrrDen += prev; acc.nrrNum += cur; acc.grrNum += Math.min(cur, prev);
        if (cur > prev) { acc.expansaoVal += cur - prev; acc.expansaoCount++; }
        else if (cur > 0 && cur < prev) { acc.contracaoVal += prev - cur; acc.contracaoCount++; }
        else if (cur === prev) { acc.estavelCount++; }
        if (cur <= 0) {
            acc.perdidoVal += prev; acc.perdidoCount++;
            acc.risco.push({ id, nome, cidade, anterior: prev, atual: cur, perda: prev, tipo: 'zerou' });
        } else if (cur < prev * 0.5) {
            acc.quedaVal += prev - cur; acc.quedaCount++;
            acc.risco.push({ id, nome, cidade, anterior: prev, atual: cur, perda: prev - cur, tipo: 'queda' });
        }
    } else if (cur > 0) { acc.novosVal += cur; acc.novosCount++; }
}

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

function finalize(acc: Acc, totalAtivos: number, comPedido: number, pedidosCount: number, topN: number) {
    return {
        comissao: { atual: acc.totCur, anterior: acc.totPrev, variacaoPct: acc.totPrev > 0 ? (acc.totCur / acc.totPrev - 1) * 100 : 0 },
        nrrPct: pct(acc.nrrNum, acc.nrrDen),
        grrPct: pct(acc.grrNum, acc.nrrDen),
        churnReceitaPct: acc.nrrDen > 0 ? (1 - acc.grrNum / acc.nrrDen) * 100 : 0,
        expansao: { valor: acc.expansaoVal, count: acc.expansaoCount },
        contracao: { valor: acc.contracaoVal, count: acc.contracaoCount },
        estavelCount: acc.estavelCount,
        perdido: { valor: acc.perdidoVal, count: acc.perdidoCount },
        emQueda: { valor: acc.quedaVal, count: acc.quedaCount },
        novos: { valor: acc.novosVal, count: acc.novosCount },
        atividade: { totalAtivos, comPedido, semPedido: totalAtivos - comPedido, taxaPct: pct(comPedido, totalAtivos), pedidosCount },
        topRisco: acc.risco.sort((a, b) => b.perda - a.perda).slice(0, topN),
    };
}

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

        // acumula global + por cidade numa passada
        const global = mkAcc();
        const byCity = new Map<string, Acc>();
        for (const r of rows) {
            const cur = Number(r.cur) || 0;
            const prev = Number(r.prev) || 0;
            const id = r.id as number;
            const nome = r.nome as string;
            const cidade = (r.cidade as string) || '(sem cidade)';
            fold(global, id, nome, cidade, cur, prev);
            let acc = byCity.get(cidade);
            if (!acc) { acc = mkAcc(); byCity.set(cidade, acc); }
            fold(acc, id, nome, cidade, cur, prev);
        }

        // atividade: global + por cidade (join com localidade p/ o nome da cidade)
        const [ativosRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS n FROM estabelecimento WHERE delivery = 1`,
        );
        const [comPedidoRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT p.estabelecimento_id) AS n
             FROM pedido p JOIN estabelecimento e ON e.id = p.estabelecimento_id
             WHERE e.delivery = 1 AND p.data >= NOW() - INTERVAL ${activityDays} DAY`,
        );
        const [ativosCidade] = await connection.query<RowDataPacket[]>(
            `SELECT l.nome AS cidade, COUNT(*) AS n
             FROM estabelecimento e JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery = 1 GROUP BY l.nome`,
        );
        const [comPedidoCidade] = await connection.query<RowDataPacket[]>(
            `SELECT l.nome AS cidade, COUNT(DISTINCT p.estabelecimento_id) AS n
             FROM pedido p JOIN estabelecimento e ON e.id = p.estabelecimento_id
             JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery = 1 AND p.data >= NOW() - INTERVAL ${activityDays} DAY
             GROUP BY l.nome`,
        );
        // nº de pedidos (contagem de linhas em `pedido`) na janela de atividade — global e por cidade
        const [pedidosRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS n
             FROM pedido p JOIN estabelecimento e ON e.id = p.estabelecimento_id
             WHERE e.delivery = 1 AND p.data >= NOW() - INTERVAL ${activityDays} DAY`,
        );
        const [pedidosCidade] = await connection.query<RowDataPacket[]>(
            `SELECT l.nome AS cidade, COUNT(*) AS n
             FROM pedido p JOIN estabelecimento e ON e.id = p.estabelecimento_id
             JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery = 1 AND p.data >= NOW() - INTERVAL ${activityDays} DAY
             GROUP BY l.nome`,
        );
        const ativosMap = new Map(ativosCidade.map(r => [r.cidade as string, Number(r.n)]));
        const comPedidoMap = new Map(comPedidoCidade.map(r => [r.cidade as string, Number(r.n)]));
        const pedidosMap = new Map(pedidosCidade.map(r => [r.cidade as string, Number(r.n)]));

        const totalAtivos = Number(ativosRows[0]?.n ?? 0);
        const comPedido = Number(comPedidoRows[0]?.n ?? 0);
        const pedidosTotal = Number(pedidosRows[0]?.n ?? 0);

        const cidades = [...byCity.entries()]
            .map(([cidade, acc]) => ({
                cidade,
                ...finalize(acc, ativosMap.get(cidade) ?? 0, comPedidoMap.get(cidade) ?? 0, pedidosMap.get(cidade) ?? 0, 10),
            }))
            .sort((a, b) => b.comissao.atual - a.comissao.atual);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                windowDays,
                activityDays,
                ...finalize(global, totalAtivos, comPedido, pedidosTotal, 20),
                cidades,
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
