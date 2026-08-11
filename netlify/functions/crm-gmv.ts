import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * GMV mês a mês por parceiro — a parte pesada do que era o INDICADOR.
 *
 * Fica separada da `crm-base` porque a agregação sobre `pedido` (4,5 mi de
 * linhas) leva ~6s: junto com o resto passaria do limite de execução.
 *
 * Regras assumidas (não deu para conferir contra a planilha):
 *  - pedido ACEITO = status IN (1,2) → 1 em andamento, 2 finalizado
 *  - status 3 = cancelado e -1 = expirado (o parceiro não respondeu) ficam de
 *    fora; são ~3,5 mil por mês, então a escolha muda o total
 *  - GMV = soma de `pedido.total` dos aceitos, agrupada pelo mês de `data`
 *
 * A query não cruza com `estabelecimento` de propósito: filtrar por delivery
 * aqui força varredura por parceiro e o tempo salta de 6s para minutos. O
 * recorte de quem é parceiro vivo é feito no front, com a lista da crm-base.
 * O filtro de data tem os dois lados (>= e <) de propósito: com a janela
 * fechada o otimizador usa o índice de `data` e a agregação cai para ~3s;
 * só com o limite inferior ele tende ao índice de `status` e dobra o tempo.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const MESES_ABREV = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** Rótulo igual ao cabeçalho da planilha: "jun./26" */
function mesLabel(mesIso: string): string {
    const [ano, mes] = mesIso.split('-');
    return `${MESES_ABREV[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

function mesIso(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Últimos N meses, do mais recente para o mais antigo (ordem das colunas da aba).
 * `deslocamento` = 1 começa no mês anterior, deixando o mês corrente de fora.
 */
function ultimosMeses(quantidade: number, hoje: Date, deslocamento: number): string[] {
    const meses: string[] = [];
    for (let i = 0; i < quantidade; i++) {
        meses.push(mesIso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i - deslocamento, 1))));
    }
    return meses;
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
    const meses = Math.min(Math.max(Number(q.meses) || 6, 1), 24);
    // Por padrão a janela termina no mês passado: o mês corrente está pela
    // metade e, como headline, faria todo parceiro parecer em queda.
    const incluirMesAtual = q.incluirMesAtual === '1' || q.incluirMesAtual === 'true';

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const hoje = new Date();
        const janela = ultimosMeses(meses, hoje, incluirMesAtual ? 0 : 1);
        const desde = `${janela[janela.length - 1]}-01`;
        // Limite superior = primeiro dia do mês seguinte ao mais recente da janela.
        const maisRecente = janela[0].split('-').map(Number);
        const ate = `${mesIso(new Date(Date.UTC(maisRecente[0], maisRecente[1], 1)))}-01`;

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data, '%Y-%m') AS mes,
                    SUM(total) AS gmv
             FROM pedido
             WHERE status IN (1, 2) AND data >= ? AND data < ?
             GROUP BY estabelecimento_id, mes`,
            [desde, ate],
        );

        const porEstab: Record<string, Record<string, number>> = {};
        for (const r of rows) {
            const estab = String(r.estab);
            (porEstab[estab] ??= {})[String(r.mes)] = Number(r.gmv ?? 0);
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                meses: janela.map(mes => ({ mes, label: mesLabel(mes) })),
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
