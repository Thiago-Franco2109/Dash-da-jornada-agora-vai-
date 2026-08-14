import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Parceiros pendentes de ativação — assinaram contrato mas ainda não
 * lançaram. Base da aba "Acompanhar Onboarding".
 *
 * Mesma definição de "pendente" já usada em `carteira.ts` e
 * `parceiros-status.ts`: `estabelecimento.delivery = 0` com pelo menos um
 * contrato em `venda_estabelecimento`. Esses parceiros ficam de FORA da
 * Function `jornada` de propósito — lá só entra quem já lançou de verdade.
 *
 * ADESÃO = `venda.data_adesao` do contrato (o dia que assinou). Como quem
 * está pendente normalmente tem um único contrato ainda não resolvido, não
 * há a confusão de "qual contrato" que existe em `jornada.ts` — mas por
 * segurança pega o contrato mais RECENTE (MAX venda_id), caso haja mais de
 * uma tentativa de fechamento.
 *
 * ?produto=cd filtra só assinantes do Cardápio Digital, mesma convenção da
 * `jornada.ts`. Sem o parâmetro, mostra pendente de qualquer produto.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const soCd = (event.queryStringParameters ?? {}).produto === 'cd';
    const filtroCd = soCd ? ' AND e.cardapio_digital = 1' : '';

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab,
                    e.nome AS nome,
                    IFNULL(l.nome, '') AS cidade,
                    v.id AS contratoId,
                    DATE_FORMAT(v.data_adesao, '%Y-%m-%d') AS adesao,
                    DATEDIFF(CURDATE(), v.data_adesao) AS diasPendente
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             JOIN venda v ON v.id = (
                 SELECT MAX(ve2.venda_id)
                 FROM venda_estabelecimento ve2
                 WHERE ve2.estabelecimento_id = e.id
             )
             WHERE e.delivery = 0
               AND e.id IN (SELECT estabelecimento_id FROM venda_estabelecimento)${filtroCd}
             ORDER BY v.data_adesao DESC`,
        );

        const pendentes = rows.map(r => ({
            estabId: String(r.estab),
            estabelecimento: String(r.nome ?? ''),
            cidade: String(r.cidade ?? ''),
            contratoId: Number(r.contratoId ?? 0) || 0,
            dataAdesao: String(r.adesao ?? ''),
            diasPendente: Number(r.diasPendente ?? 0),
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: pendentes.length,
                pendentes,
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
