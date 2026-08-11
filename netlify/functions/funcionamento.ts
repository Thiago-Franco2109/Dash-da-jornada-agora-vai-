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
 *   ?estabId=28442     → obrigatório
 *   ?mesesRecesso=3    → janela de recessos (padrão 3, máx 24); futuros sempre entram
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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
    if (!/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabId (numérico) é obrigatório' }) };
    }
    const estabId = Number(estabIdRaw);
    const meses = Math.min(Math.max(Number(q.mesesRecesso) || 3, 1), 24);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

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

        const horarios = horarioRows.map(r => {
            const dia = Number(r.dia_semana);
            return {
                diaSemana: dia,
                diaLabel: DIA_LABELS[dia] ?? `Dia ${dia}`,
                turno1Inicio: String(r.turno1Inicio ?? ''),
                turno1Fim: String(r.turno1Fim ?? ''),
                turno2Inicio: String(r.turno2Inicio ?? ''),
                turno2Fim: String(r.turno2Fim ?? ''),
            };
        });

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

        const recessos = recessoRows.map(r => ({
            recessoId: String(r.recessoId ?? ''),
            dataInicio: String(r.dataInicio ?? ''),
            dataFim: String(r.dataFim ?? ''),
            descricao: String(r.descricao ?? ''),
            cadastradoEm: String(r.cadastradoEm ?? ''),
            urlTrello: String(r.urlTrello ?? ''),
            diasDuracao: Number(r.diasDuracao ?? 0) || 0,
            statusRecesso: String(r.statusRecesso ?? 'encerrado') as 'em_recesso' | 'futuro' | 'encerrado',
            emRecessoAgora: Number(r.emRecessoAgora ?? 0) === 1,
        }));

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
