import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Relatório de ATIVAÇÃO de campanhas (read-only) — cupons de destaque e
 * promoções — a partir do que o banco `bigou` registra hoje.
 *
 * ⚠️ Limitações conhecidas do dado atual:
 *   - QUEM ativou não é gravado: cupom_desconto.usuario_id vem nulo e a tabela
 *     `log` (com admin_id) não cobre campanha/cupom. Depende de o backend Bigou
 *     passar a persistir o evento — ver HANDOFF.
 *   - Promoção não tem data nem usuário POR PARCEIRO: só a `data` da campanha.
 *     O `metadata.sucessoDoCliente` é um conjunto histórico DESALINHADO do
 *     `config` atual (interseção = 0), então NÃO é usado aqui.
 *
 * Cupons: fluxo de ativações na janela (`data` = criação do cupom) — tem QUANDO.
 * Promoções: estado atual das campanhas ativas (participação por cidade).
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const CS_CAMPAIGN_LABEL: Record<string, string> = {
    'Super Promos!': 'Super Promos',
    'Ofertas da Casa': 'Ofertas da Casa',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const windowDays = Math.min(Math.max(parseInt(q.window ?? '28', 10) || 28, 1), 180);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // ── CUPONS DE DESTAQUE: fluxo de ativações na janela (data = criação) ──
        const [cupTotal] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS n FROM cupom_desconto
             WHERE destaque = 1 AND ativo = 1 AND data >= NOW() - INTERVAL ${windowDays} DAY`,
        );
        const [cupPorDia] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS dia, COUNT(*) AS n
             FROM cupom_desconto
             WHERE destaque = 1 AND ativo = 1 AND data >= NOW() - INTERVAL ${windowDays} DAY
             GROUP BY dia ORDER BY dia`,
        );
        const [cupPorCidade] = await connection.query<RowDataPacket[]>(
            `SELECT l.nome AS cidade, COUNT(*) AS n
             FROM cupom_desconto cd
             JOIN estabelecimento e ON e.id = cd.estabelecimento_id
             JOIN localidade l ON l.id = e.localidade_id
             WHERE cd.destaque = 1 AND cd.ativo = 1 AND cd.data >= NOW() - INTERVAL ${windowDays} DAY
             GROUP BY l.nome ORDER BY n DESC`,
        );

        // ── PROMOÇÕES: estado atual das campanhas ativas/vigentes ──
        const VIGENTE = `(data_inicio IS NULL OR data_inicio <= NOW()) AND (data_fim IS NULL OR data_fim >= NOW())`;
        const [camps] = await connection.query<RowDataPacket[]>(
            `SELECT id, nome, data, config FROM campanha_promocao WHERE ativo = 1 AND ${VIGENTE}`,
        );

        const campanhas: { nome: string; data: string | null; participantes: number }[] = [];
        const allEstabIds = new Set<number>();
        let somaParticipacoes = 0;
        for (const cp of camps) {
            let cfg: Record<string, unknown> = {};
            try { cfg = JSON.parse(String(cp.config ?? '{}')); } catch { /* ignore */ }
            const ids = Object.keys(cfg).filter(k => /^\d+$/.test(k));
            somaParticipacoes += ids.length;
            for (const id of ids) allEstabIds.add(Number(id));
            campanhas.push({
                nome: CS_CAMPAIGN_LABEL[String(cp.nome)] ?? String(cp.nome),
                data: cp.data ? new Date(cp.data as string).toISOString() : null,
                participantes: ids.length,
            });
        }
        campanhas.sort((a, b) => b.participantes - a.participantes);

        // participações de promoção por cidade (mapeia estab → cidade numa query)
        let promoPorCidade: { cidade: string; n: number }[] = [];
        if (allEstabIds.size > 0) {
            const ids = [...allEstabIds];
            const placeholders = ids.map(() => '?').join(',');
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT l.nome AS cidade, COUNT(*) AS n
                 FROM estabelecimento e JOIN localidade l ON l.id = e.localidade_id
                 WHERE e.id IN (${placeholders})
                 GROUP BY l.nome ORDER BY n DESC`,
                ids,
            );
            promoPorCidade = rows.map(r => ({ cidade: String(r.cidade), n: Number(r.n) }));
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                windowDays,
                cupons: {
                    total: Number(cupTotal[0]?.n ?? 0),
                    porDia: cupPorDia.map(r => ({ dia: String(r.dia), n: Number(r.n) })),
                    porCidade: cupPorCidade.map(r => ({ cidade: String(r.cidade), n: Number(r.n) })),
                },
                promos: {
                    campanhas,
                    totalParticipacoes: somaParticipacoes,
                    parceirosDistintos: allEstabIds.size,
                    porCidade: promoPorCidade,
                },
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
