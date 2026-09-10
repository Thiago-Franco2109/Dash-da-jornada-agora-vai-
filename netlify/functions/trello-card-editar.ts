import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Edita campos do card — hoje só `due` (data de entrega), via
 * PUT /1/cards/{id}. Mesmo padrão de escrita de trello-card-comentar.ts
 * (primeiro write do projeto): token já tem permissão, sem confirmação
 * extra além do STOPGAP de origem, porque é o usuário decidindo o valor
 * na hora, não uma escrita automática/em lote.
 *
 * PUT /1/cards/{id} aceita due="" pra LIMPAR o prazo (testado: é o valor
 * documentado da API pra remover due date por esse endpoint) — por isso
 * `due: null` no body vira due="" na chamada, em vez de omitir o campo.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloCardAtualizado {
    id: string;
    due: string | null;
    dueComplete: boolean;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let body: { cardId?: unknown; due?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    if (!cardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'cardId é obrigatório' }) };
    }

    if (!('due' in body) || (body.due !== null && typeof body.due !== 'string')) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'due é obrigatório (ISO 8601 ou null pra limpar)' }) };
    }
    if (typeof body.due === 'string' && Number.isNaN(new Date(body.due).getTime())) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'due inválido' }) };
    }

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;

    const missing = [
        ['TRELLO_API_KEY', key],
        ['TRELLO_TOKEN', token],
    ].filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
        return {
            statusCode: 500,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Variáveis de ambiente ausentes: ${missing.join(', ')}` }),
        };
    }

    try {
        const atualizado = await trelloFetch<TrelloCardAtualizado>(
            `/cards/${cardId}`,
            key!,
            token!,
            { due: body.due ?? '', fields: 'due,dueComplete' },
            'PUT',
        );

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                due: atualizado.due,
                dueComplete: atualizado.dueComplete,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: message }),
        };
    }
};
