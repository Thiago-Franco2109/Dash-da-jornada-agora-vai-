import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Horários e recessos de UM parceiro, direto do banco (read-only).
 *
 * Antes essa tela lia as abas HORARIOS_FUNCIONAMENTO / RECESSOS_ESTABELECIMENTO
 * da planilha mestre, alimentadas pelo sync diário (SyncFuncionamento.gs). Como
 * o sync só traz parceiros com venda lançada nos últimos 90 dias (e roda 1x por
 * dia), lojas fora desse filtro apareciam sem nenhum horário mesmo estando
 * cadastradas no CMS. Aqui a fonte é a mesma do CMS, sem defasagem.
 *
 * Query params:
 *   ?estabId=28442        → um parceiro (horários + recessos dos últimos meses)
 *   ?mesesRecesso=3       → janela de recessos (padrão 3, máx 24); futuros sempre entram
 *   ?estabIds=1,2,3       → modo lote: vários parceiros de uma vez, para listas
 *   ?diasRecesso=16       → janela em dias no modo lote (padrão 16, máx 90)
 *
 * O modo lote existe para a coluna de aderência das listas (Churn/Carteira):
 * uma chamada por parceiro estouraria o orçamento de requisições da tela. Ele
 * devolve só o necessário para as duas últimas semanas, por isso a janela é em
 * dias e não em meses.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Teto do modo lote: uma tela de lista filtrada não passa disso. */
const MAX_IDS_LOTE = 400;

function mapHorario(r: RowDataPacket) {
    const dia = Number(r.dia_semana);
    return {
        diaSemana: dia,
        diaLabel: DIA_LABELS[dia] ?? `Dia ${dia}`,
        turno1Inicio: String(r.turno1Inicio ?? ''),
        turno1Fim: String(r.turno1Fim ?? ''),
        turno2Inicio: String(r.turno2Inicio ?? ''),
        turno2Fim: String(r.turno2Fim ?? ''),
    };
}

function mapRecesso(r: RowDataPacket) {
    return {
        recessoId: String(r.recessoId ?? ''),
        dataInicio: String(r.dataInicio ?? ''),
        dataFim: String(r.dataFim ?? ''),
        descricao: String(r.descricao ?? ''),
        cadastradoEm: String(r.cadastradoEm ?? ''),
        urlTrello: String(r.urlTrello ?? ''),
        diasDuracao: Number(r.diasDuracao ?? 0) || 0,
        statusRecesso: String(r.statusRecesso ?? 'encerrado') as 'em_recesso' | 'futuro' | 'encerrado',
        emRecessoAgora: Number(r.emRecessoAgora ?? 0) === 1,
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
    const estabIdRaw = (q.estabId ?? '').trim();
    const estabIdsRaw = (q.estabIds ?? '').trim();
    const modoLote = estabIdsRaw.length > 0;

    const idsLote = estabIdsRaw
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d+$/.test(s))
        .map(Number)
        .slice(0, MAX_IDS_LOTE);

    if (modoLote && idsLote.length === 0) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabIds não tem nenhum id numérico' }) };
    }
    if (!modoLote && !/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Informe estabId (numérico) ou estabIds (lista separada por vírgula)' }) };
    }
    const estabId = Number(estabIdRaw);
    const meses = Math.min(Math.max(Number(q.mesesRecesso) || 3, 1), 24);
    const diasRecesso = Math.min(Math.max(Number(q.diasRecesso) || 16, 1), 90);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        if (modoLote) {
            const [horarioRows] = await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id,
                        dia_semana,
                        IFNULL(horario_inicio_1, '') AS turno1Inicio,
                        IFNULL(horario_fim_1, '')    AS turno1Fim,
                        IFNULL(horario_inicio_2, '') AS turno2Inicio,
                        IFNULL(horario_fim_2, '')    AS turno2Fim
                 FROM horario_funcionamento
                 WHERE estabelecimento_id IN (?) AND ativo = 1
                 ORDER BY estabelecimento_id, dia_semana`,
                [idsLote],
            );

            const [recessoRows] = await connection.query<RowDataPacket[]>(
                `SELECT r.estabelecimento_id,
                        r.id                                            AS recessoId,
                        DATE_FORMAT(r.data_inicio, '%Y-%m-%d %H:%i:%s') AS dataInicio,
                        DATE_FORMAT(r.data_fim,    '%Y-%m-%d %H:%i:%s') AS dataFim,
                        IFNULL(r.descricao, '')                         AS descricao,
                        DATE_FORMAT(r.data, '%Y-%m-%d %H:%i:%s')        AS cadastradoEm,
                        IFNULL(r.url, '')                               AS urlTrello,
                        DATEDIFF(r.data_fim, r.data_inicio) + 1          AS diasDuracao,
                        CASE
                            WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 'em_recesso'
                            WHEN r.data_inicio > NOW()                      THEN 'futuro'
                            ELSE 'encerrado'
                        END                                             AS statusRecesso,
                        CASE WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 1 ELSE 0 END AS emRecessoAgora
                 FROM recesso_estabelecimento r
                 WHERE r.estabelecimento_id IN (?)
                   AND r.ativo = 1
                   AND r.data_fim >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 ORDER BY r.estabelecimento_id, r.data_inicio DESC`,
                [idsLote, diasRecesso],
            );

            const lote: Record<string, { horarios: ReturnType<typeof mapHorario>[]; recessos: ReturnType<typeof mapRecesso>[] }> = {};
            for (const id of idsLote) lote[String(id)] = { horarios: [], recessos: [] };
            for (const row of horarioRows) {
                const bucket = lote[String(row.estabelecimento_id)];
                if (bucket) bucket.horarios.push(mapHorario(row));
            }
            for (const row of recessoRows) {
                const bucket = lote[String(row.estabelecimento_id)];
                if (bucket) bucket.recessos.push(mapRecesso(row));
            }

            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({
                    ok: true,
                    lote,
                    totalEstabs: idsLote.length,
                    diasRecesso,
                    elapsedMs: Date.now() - started,
                }),
            };
        }

        const [horarioRows] = await connection.query<RowDataPacket[]>(
            `SELECT dia_semana,
                    IFNULL(horario_inicio_1, '') AS turno1Inicio,
                    IFNULL(horario_fim_1, '')    AS turno1Fim,
                    IFNULL(horario_inicio_2, '') AS turno2Inicio,
                    IFNULL(horario_fim_2, '')    AS turno2Fim
             FROM horario_funcionamento
             WHERE estabelecimento_id = ? AND ativo = 1
             ORDER BY dia_semana`,
            [estabId],
        );

        const horarios = horarioRows.map(mapHorario);

        // ativo = 0 é o recesso arquivado no CMS — fica de fora, como na tela oficial.
        const [recessoRows] = await connection.query<RowDataPacket[]>(
            `SELECT r.id                                            AS recessoId,
                    DATE_FORMAT(r.data_inicio, '%Y-%m-%d %H:%i:%s') AS dataInicio,
                    DATE_FORMAT(r.data_fim,    '%Y-%m-%d %H:%i:%s') AS dataFim,
                    IFNULL(r.descricao, '')                         AS descricao,
                    DATE_FORMAT(r.data, '%Y-%m-%d %H:%i:%s')        AS cadastradoEm,
                    IFNULL(r.url, '')                               AS urlTrello,
                    DATEDIFF(r.data_fim, r.data_inicio) + 1          AS diasDuracao,
                    CASE
                        WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 'em_recesso'
                        WHEN r.data_inicio > NOW()                      THEN 'futuro'
                        ELSE 'encerrado'
                    END                                             AS statusRecesso,
                    CASE WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 1 ELSE 0 END AS emRecessoAgora
             FROM recesso_estabelecimento r
             WHERE r.estabelecimento_id = ?
               AND r.ativo = 1
               AND r.data_fim >= DATE_SUB(NOW(), INTERVAL ? MONTH)
             ORDER BY r.data_inicio DESC`,
            [estabId, meses],
        );

        const recessos = recessoRows.map(mapRecesso);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estabId,
                mesesRecesso: meses,
                horarios,
                recessos,
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
