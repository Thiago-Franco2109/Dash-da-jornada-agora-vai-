import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Function read-only: dados de parceiros (tabela `estabelecimento`).
 *
 * O campo `delivery` guarda o status do contrato — é o "gabarito" de churn
 * histórico (ver HANDOFF_SESSAO_2026-07-21.md). Mapa dos códigos conhecidos:
 *   1 = ativo | 2 = cancelado | 4 = suspenso | 5 = desistência
 * (-1/0/3 = outros estados; a maioria são cadastros que nunca viraram
 *  parceiros de delivery.)
 *
 * Protegida: exige sessão válida no Gateway (mesmo login do app).
 *
 * Query params:
 *   ?summary=1        → só a contagem por status (rápido; ignora paginação)
 *   ?status=1         → filtra por código de delivery
 *   ?search=texto     → filtra por nome (LIKE)
 *   ?limit=100        → paginação (padrão 100, máx 500)
 *   ?offset=0         → paginação
 */

const STATUS_LABELS: Record<number, string> = {
    [-1]: 'nao_delivery',
    0: 'inativo',
    1: 'ativo',
    2: 'cancelado',
    3: 'outro',
    4: 'suspenso',
    5: 'desistencia',
};

function labelFor(delivery: number | null): string {
    if (delivery == null) return 'desconhecido';
    return STATUS_LABELS[delivery] ?? `codigo_${delivery}`;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    // 1) STOPGAP: checagem de origem (ver _shared/auth.ts).
    //    ⚠️ proteção fraca/temporária — trocar por auth real (Gateway/Supabase).
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const wantSummary = q.summary === '1' || q.summary === 'true';

    // sanitização dos parâmetros
    const statusRaw = q.status?.trim();
    const status = statusRaw != null && statusRaw !== '' && /^-?\d+$/.test(statusRaw)
        ? Number(statusRaw)
        : null;
    const search = q.search?.trim() || null;
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const offset = Math.max(Number(q.offset) || 0, 0);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // ---- modo resumo: contagem por status ----
        if (wantSummary) {
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT delivery, COUNT(*) AS total
                 FROM estabelecimento
                 GROUP BY delivery
                 ORDER BY delivery`,
            );
            const byStatus = rows.map(r => ({
                delivery: r.delivery as number | null,
                status: labelFor(r.delivery as number | null),
                total: Number(r.total),
            }));
            const total = byStatus.reduce((acc, r) => acc + r.total, 0);
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: true, mode: 'summary', total, byStatus, elapsedMs: Date.now() - started }),
            };
        }

        // ---- modo lista: parceiros com campos-chave ----
        const where: string[] = [];
        const params: (string | number)[] = [];
        if (status != null) { where.push('delivery = ?'); params.push(status); }
        if (search) { where.push('nome LIKE ?'); params.push(`%${search}%`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [countRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM estabelecimento ${whereSql}`,
            params,
        );
        const totalMatching = Number(countRows[0]?.total ?? 0);

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT id, uid, nome, delivery, ativo, localidade_id,
                    nota_qualificacao, indice_delivery, indice_destaque
             FROM estabelecimento
             ${whereSql}
             ORDER BY id
             LIMIT ? OFFSET ?`,
            [...params, limit, offset],
        );

        const data = rows.map(r => ({
            id: r.id,
            uid: r.uid,
            nome: r.nome,
            delivery: r.delivery,
            status: labelFor(r.delivery as number | null),
            ativo: r.ativo,
            localidadeId: r.localidade_id,
            notaQualificacao: r.nota_qualificacao,
            indiceDelivery: r.indice_delivery,
            indiceDestaque: r.indice_destaque,
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                mode: 'list',
                total: totalMatching,
                count: data.length,
                limit,
                offset,
                filters: { status, search },
                data,
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
