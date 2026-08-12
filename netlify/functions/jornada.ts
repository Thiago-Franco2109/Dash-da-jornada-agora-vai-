import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Jornada dos novos parceiros — substitui as abas "novos formatado" (a do
 * Thiago e a da Laís). Uma linha por parceiro lançado na janela, com os
 * pedidos aceitos de cada semana desde o lançamento.
 *
 * A resposta imita o formato da aba (headers + rows) de propósito: o
 * `parseGatewayRows` do front continua o mesmo, só muda a origem das linhas.
 *
 * O analista NÃO vem daqui: o app já resolve pelo mapa de cidades
 * (INITIAL_CITY_MANAGER_MAP), que é onde essa informação sempre morou de
 * verdade — a separação em duas planilhas era só o reflexo disso.
 *
 * Regras assumidas:
 *  - LANÇAMENTO = `venda.data_lancamento` do contrato mais recente
 *  - semana 1 = dias 1 a 7 a partir do lançamento, e assim por diante
 *  - pedido ACEITO = status IN (1,2) — mesma régua do resto do app
 *  - DESEMPENHO sai vazio: o app calcula o índice por conta (calculations.ts)
 *
 * O FORCE INDEX (data) é necessário: sem ele o otimizador vai pelo índice de
 * `estabelecimento_id` e varre todo o histórico de cada parceiro — a query
 * salta de 1s para 14s.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const SEMANAS = 4;

const STATUS_POR_DELIVERY: Record<number, string> = {
    1: 'ativo',
    2: 'cancelado',
    4: 'suspenso',
    5: 'cancelado',
};

/** A jornada trabalha com data no formato DD/MM/AAAA (ver calculations.ts). */
function dataBR(iso: string): string {
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const dias = Math.min(Math.max(Number(q.dias) || 90, 7), 365);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [lancamentos] = await connection.query<RowDataPacket[]>(
            `SELECT ve.estabelecimento_id            AS estab,
                    DATE_FORMAT(MAX(v.data_lancamento), '%Y-%m-%d') AS lancamento
             FROM venda v
             JOIN venda_estabelecimento ve ON ve.venda_id = v.id
             WHERE v.data_lancamento >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND v.data_lancamento <= CURDATE()
             GROUP BY ve.estabelecimento_id`,
            [dias],
        );

        if (lancamentos.length === 0) {
            const headers = cabecalho();
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: true, total: 0, tabela: { headers, orderedHeaders: headers, rows: [] }, elapsedMs: Date.now() - started }),
            };
        }

        const ids = lancamentos.map(r => Number(r.estab));
        const lancamentoPorEstab = new Map(lancamentos.map(r => [String(r.estab), String(r.lancamento)]));
        const maisAntigo = [...lancamentoPorEstab.values()].sort()[0];

        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab, e.nome AS nome, IFNULL(l.nome, '') AS cidade, e.delivery AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.id IN (?)`,
            [ids],
        );

        // Pedidos por dia dos novos parceiros, a partir do lançamento mais
        // antigo da janela. O agrupamento por semana relativa é feito abaixo,
        // porque cada parceiro tem a própria data de largada.
        const [pedidos] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    COUNT(*) AS n
             FROM pedido FORCE INDEX (data)
             WHERE status IN (1, 2) AND data >= ? AND estabelecimento_id IN (?)
             GROUP BY estabelecimento_id, dia`,
            [maisAntigo, ids],
        );

        const dia = 24 * 60 * 60 * 1000;
        const semanasPorEstab = new Map<string, number[]>();

        for (const p of pedidos) {
            const estab = String(p.estab);
            const lancamento = lancamentoPorEstab.get(estab);
            if (!lancamento) continue;

            const diff = Math.floor((Date.parse(`${p.dia}T00:00:00Z`) - Date.parse(`${lancamento}T00:00:00Z`)) / dia);
            if (diff < 0) continue; // pedido anterior ao lançamento (recontratação)

            const semana = Math.floor(diff / 7);
            if (semana >= SEMANAS) continue;

            const semanas = semanasPorEstab.get(estab) ?? new Array(SEMANAS).fill(0);
            semanas[semana] += Number(p.n ?? 0);
            semanasPorEstab.set(estab, semanas);
        }

        const rows = parceiros
            .map(p => {
                const estab = String(p.estab);
                const semanas = semanasPorEstab.get(estab) ?? new Array(SEMANAS).fill(0);
                const row: Record<string, string> = {
                    'CIDADE': String(p.cidade ?? ''),
                    'ESTAB_ID': estab,
                    'ESTABELECIMENTO': String(p.nome ?? ''),
                    'STATUS': STATUS_POR_DELIVERY[Number(p.delivery)] ?? 'pendente',
                    'LANÇAMENTO': dataBR(lancamentoPorEstab.get(estab) ?? ''),
                    'DESEMPENHO': '',
                };
                semanas.forEach((n, i) => { row[`Week_${i + 1}`] = String(n); });
                return row;
            })
            .sort((a, b) => a.CIDADE.localeCompare(b.CIDADE, 'pt-BR') || a.ESTABELECIMENTO.localeCompare(b.ESTABELECIMENTO, 'pt-BR'));

        const headers = cabecalho();

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: rows.length,
                dias,
                tabela: { headers, orderedHeaders: headers, rows },
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};

/** Mesma ordem de colunas da aba: o parser do front lê por posição. */
function cabecalho(): string[] {
    return [
        'CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'STATUS', 'LANÇAMENTO', 'DESEMPENHO',
        ...Array.from({ length: SEMANAS }, (_, i) => `Week_${i + 1}`),
    ];
}
