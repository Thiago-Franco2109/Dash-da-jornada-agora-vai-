import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Parceiros e pedidos por semana — substitui quatro abas, conforme os
 * parâmetros:
 *   (padrão)                     → "novos formatado" do Thiago e da Laís
 *   ?produto=cd                  → CD_TODOS_NOVOS_FORMATADO
 *   ?produto=cd&modo=desempenho  → CD_TODOS_DESEMPENHO (12 semanas corridas)
 *
 * Uma linha por parceiro. As duas contagens de semana são opostas de
 * propósito, porque as abas eram assim:
 *   jornada    → Week_1 = primeira semana DEPOIS do lançamento (mais antiga)
 *   desempenho → Week_1 = semana ATUAL, Week_12 = doze semanas atrás
 * A segunda está documentada em calculations.ts (calculateTotalPedidosDesempenho).
 *
 * A resposta imita o formato da aba (headers + rows) de propósito: o
 * `parseGatewayRows` do front continua o mesmo, só muda a origem das linhas.
 *
 * O analista NÃO vem daqui: o app resolve pelo mapa de cidades
 * (INITIAL_CITY_MANAGER_MAP), que é onde essa informação sempre morou de
 * verdade — a separação em duas planilhas era só o reflexo disso.
 *
 * Regras assumidas:
 *  - LANÇAMENTO = MIN(`venda.data_lancamento`) do estabelecimento — o
 *    PRIMEIRO contrato, não o mais recente. Um parceiro pode ter vários
 *    registros em venda_estabelecimento (renovação anual, por exemplo); usar
 *    MAX pegava a renovação mais nova e fazia parceiro de 2020 aparecer como
 *    "lançado hoje" (conferido: estab 21817, 1º lançamento 2020-04-09 batendo
 *    com o 1º pedido 2020-04-11; a renovação mais recente é de 2026-08-10).
 *  - só entra quem JÁ lançou de verdade: delivery IN (1,2,4,5). Pendente
 *    (delivery=0, contrato assinado mas ainda não ativado) fica de fora —
 *    tem aba própria (`onboarding-pendentes.ts`).
 *  - semana 1 = dias 1 a 7 a partir da largada (lançamento ou início da janela)
 *  - pedido ACEITO = status IN (1,2) — mesma régua do resto do app
 *  - DESEMPENHO sai vazio: o app calcula o índice por conta (calculations.ts)
 *
 * O FORCE INDEX (data) não é enfeite: sem ele o otimizador vai pelo índice de
 * `estabelecimento_id` e varre o histórico inteiro de cada parceiro — 14s
 * contra 1,5s (e 20s quando o IN da lista de ids guia o plano).
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const SEMANAS_JORNADA = 4;
const SEMANAS_DESEMPENHO = 12;
const DIA_MS = 24 * 60 * 60 * 1000;

const STATUS_POR_DELIVERY: Record<number, string> = {
    1: 'ativo',
    2: 'cancelado',
    4: 'suspenso',
    5: 'cancelado',
};

/** A jornada trabalha com data no formato DD/MM/AAAA (ver calculations.ts). */
function dataBR(iso: string): string {
    if (!iso) return '';
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
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
    const soCd = q.produto === 'cd';
    const modoDesempenho = q.modo === 'desempenho';
    const semanas = modoDesempenho ? SEMANAS_DESEMPENHO : SEMANAS_JORNADA;

    const filtroCd = soCd ? ' AND e.cardapio_digital = 1' : '';
    const filtroPedidoCd = soCd ? ' AND cardapio_digital = 1' : '';

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // ── quem entra na lista ───────────────────────────────────────────
        // MIN, não MAX: o 1º contrato de cada estabelecimento é o verdadeiro
        // lançamento. Um parceiro com renovação anual tem várias linhas em
        // venda_estabelecimento; pegar a mais recente faz parceiro de anos
        // atrás aparecer como "lançado hoje" — e nunca sair da tela, porque a
        // cada renovação o "lançamento" se atualiza de novo.
        //
        // delivery IN (1,2,4,5) nos dois modos: só quem JÁ lançou de verdade.
        // Pendente (delivery=0) fica de fora — vai para a aba de onboarding.
        const [primeirosLancamentos] = await connection.query<RowDataPacket[]>(
            `SELECT estab, primeiro_lancamento
             FROM (
                 SELECT ve.estabelecimento_id AS estab,
                        DATE_FORMAT(MIN(v.data_lancamento), '%Y-%m-%d') AS primeiro_lancamento
                 FROM venda v
                 JOIN venda_estabelecimento ve ON ve.venda_id = v.id
                 JOIN estabelecimento e ON e.id = ve.estabelecimento_id
                 WHERE e.delivery IN (1, 2, 4, 5)${filtroCd}
                 GROUP BY ve.estabelecimento_id
             ) t
             WHERE ${modoDesempenho ? '1 = 1' : 'primeiro_lancamento >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND primeiro_lancamento <= CURDATE()'}`,
            modoDesempenho ? [] : [dias],
        );
        const lancamentosRows = primeirosLancamentos.map(r => ({ estab: r.estab, lancamento: r.primeiro_lancamento }));

        const headers = cabecalho(semanas);

        if (lancamentosRows.length === 0) {
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: true, total: 0, tabela: { headers, orderedHeaders: headers, rows: [] }, elapsedMs: Date.now() - started }),
            };
        }

        const ids = lancamentosRows.map(r => Number(r.estab));
        const lancamentoPorEstab = new Map(lancamentosRows.map(r => [String(r.estab), String(r.lancamento ?? '')]));

        // Largada de cada parceiro: no modo desempenho, todos partem do mesmo
        // início de janela; na jornada, cada um do seu lançamento.
        const hojeIso = iso(new Date());
        const inicioJanela = iso(new Date(Date.now() - semanas * 7 * DIA_MS));
        const largadaPorEstab = new Map<string, string>();
        for (const [estab, lancamento] of lancamentoPorEstab) {
            largadaPorEstab.set(estab, modoDesempenho ? inicioJanela : lancamento);
        }

        const desde = modoDesempenho
            ? inicioJanela
            : [...largadaPorEstab.values()].filter(Boolean).sort()[0];

        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab, e.nome AS nome, IFNULL(l.nome, '') AS cidade, e.delivery AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.id IN (?)`,
            [ids],
        );

        const [pedidos] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    COUNT(*) AS n
             FROM pedido FORCE INDEX (data)
             WHERE status IN (1, 2) AND data >= ? AND estabelecimento_id IN (?)${filtroPedidoCd}
             GROUP BY estabelecimento_id, dia`,
            [desde, ids],
        );

        const semanasPorEstab = new Map<string, number[]>();
        for (const p of pedidos) {
            const estab = String(p.estab);
            const largada = largadaPorEstab.get(estab);
            if (!largada) continue;

            const diff = Math.floor((Date.parse(`${p.dia}T00:00:00Z`) - Date.parse(`${largada}T00:00:00Z`)) / DIA_MS);
            if (diff < 0) continue; // pedido anterior à largada (recontratação)

            // No desempenho a régua corre ao contrário: Week_1 é a semana
            // atual. Na jornada, Week_1 é a primeira semana após o lançamento.
            const semana = modoDesempenho
                ? Math.floor((Date.parse(`${hojeIso}T00:00:00Z`) - Date.parse(`${p.dia}T00:00:00Z`)) / DIA_MS / 7)
                : Math.floor(diff / 7);
            if (semana < 0 || semana >= semanas) continue;

            const acumulado = semanasPorEstab.get(estab) ?? new Array(semanas).fill(0);
            acumulado[semana] += Number(p.n ?? 0);
            semanasPorEstab.set(estab, acumulado);
        }

        const rows = parceiros
            .map(p => {
                const estab = String(p.estab);
                const acumulado = semanasPorEstab.get(estab) ?? new Array(semanas).fill(0);
                const row: Record<string, string> = {
                    'CIDADE': String(p.cidade ?? ''),
                    'ESTAB_ID': estab,
                    'ESTABELECIMENTO': String(p.nome ?? ''),
                    'STATUS': STATUS_POR_DELIVERY[Number(p.delivery)] ?? 'pendente',
                    'LANÇAMENTO': dataBR(lancamentoPorEstab.get(estab) ?? ''),
                    'DESEMPENHO': '',
                };
                acumulado.forEach((n: number, i: number) => { row[`Week_${i + 1}`] = String(n); });
                return row;
            })
            .sort((a, b) => a.CIDADE.localeCompare(b.CIDADE, 'pt-BR') || a.ESTABELECIMENTO.localeCompare(b.ESTABELECIMENTO, 'pt-BR'));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: rows.length,
                produto: soCd ? 'cd' : 'marketplace',
                modo: modoDesempenho ? 'desempenho' : 'jornada',
                dias: modoDesempenho ? null : dias,
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
function cabecalho(semanas: number): string[] {
    return [
        'CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'STATUS', 'LANÇAMENTO', 'DESEMPENHO',
        ...Array.from({ length: semanas }, (_, i) => `Week_${i + 1}`),
    ];
}
