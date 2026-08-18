import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Progresso do onboarding pós-lançamento — checklist de 5 etapas de setup
 * (cardápio, horário, pagamento, entrega, configurações) que o parceiro
 * completa sozinho ou com ajuda do CS. Base do alerta "onboarding 100%
 * concluído" (ver useOnboardingCompleto no front).
 *
 * `concluidoEm` só vem preenchido quando as 5 etapas estão em 1 — é a mais
 * recente das 5 datas, ou seja, o momento em que a última etapa fechou.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=10' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface OnboardingRow extends RowDataPacket {
    id: number;
    estabelecimento_id: number;
    nome: string | null;
    cidade: string | null;
    etapa_cardapio: number | null;
    etapa_horario: number | null;
    etapa_pagamento: number | null;
    etapa_entrega: number | null;
    etapa_configuracoes: number | null;
    data_cardapio: Date | null;
    data_horario: Date | null;
    data_pagamento: Date | null;
    data_entrega: Date | null;
    data_configuracoes: Date | null;
    feedback_experiencia: string | null;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [rows] = await connection.query<OnboardingRow[]>(
            `SELECT op.id AS id,
                    op.estabelecimento_id AS estabelecimento_id,
                    e.nome AS nome,
                    l.nome AS cidade,
                    op.etapa_cardapio, op.etapa_horario, op.etapa_pagamento, op.etapa_entrega, op.etapa_configuracoes,
                    op.data_cardapio, op.data_horario, op.data_pagamento, op.data_entrega, op.data_configuracoes,
                    op.feedback_experiencia
             FROM onboarding_parceiro op
             JOIN estabelecimento e ON e.id = op.estabelecimento_id
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE op.ativo = 1
             ORDER BY op.id DESC`,
        );

        const parceiros = rows.map(r => {
            const etapas = {
                cardapio: r.etapa_cardapio === 1,
                horario: r.etapa_horario === 1,
                pagamento: r.etapa_pagamento === 1,
                entrega: r.etapa_entrega === 1,
                configuracoes: r.etapa_configuracoes === 1,
            };
            const etapasConcluidas = Object.values(etapas).filter(Boolean).length;
            const completo = etapasConcluidas === 5;
            const datas = [r.data_cardapio, r.data_horario, r.data_pagamento, r.data_entrega, r.data_configuracoes]
                .filter((d): d is Date => d != null);
            const concluidoEm = completo && datas.length === 5
                ? new Date(Math.max(...datas.map(d => d.getTime()))).toISOString()
                : null;

            return {
                id: r.id,
                estabelecimentoId: r.estabelecimento_id,
                estabelecimento: String(r.nome ?? ''),
                cidade: String(r.cidade ?? ''),
                etapas,
                etapasConcluidas,
                completo,
                concluidoEm,
                feedbackExperiencia: r.feedback_experiencia,
            };
        });

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: parceiros.length,
                parceiros,
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
