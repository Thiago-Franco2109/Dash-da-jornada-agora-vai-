import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch, type TrelloMemberBruto } from './_shared/trello';

/**
 * Ciclo de vida do comentário num card do Trello:
 *   criar   -> POST   /1/cards/{id}/actions/comments
 *   editar  -> PUT    /1/cards/{idCard}/actions/{idAction}/comments
 *   excluir -> DELETE /1/actions/{idAction}
 *
 * Escreve no Trello como o dono do TRELLO_TOKEN, visível pra equipe inteira no
 * board real. Sem confirmação extra além do STOPGAP de origem (mesmo padrão das
 * outras functions) — é o usuário decidindo o conteúdo na hora, não escrita
 * automática/em lote. Editar/excluir só funcionam em comentário do próprio
 * dono do token: o Trello recusa os outros com 401.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const TAMANHO_MAX_COMENTARIO = 4000;

interface TrelloActionCriada {
    id: string;
    date: string;
    data: { text: string };
    memberCreator: TrelloMemberBruto;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let body: { cardId?: unknown; texto?: unknown; acao?: unknown; comentarioId?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const acao = body.acao === 'editar' || body.acao === 'excluir' ? body.acao : 'criar';
    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    const comentarioId = typeof body.comentarioId === 'string' ? body.comentarioId.trim() : '';
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';

    if (!cardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'cardId é obrigatório' }) };
    }
    if (acao !== 'criar' && !comentarioId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'comentarioId é obrigatório' }) };
    }
    if (acao !== 'excluir') {
        if (!texto) {
            return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Comentário vazio' }) };
        }
        if (texto.length > TAMANHO_MAX_COMENTARIO) {
            return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: `Comentário muito longo (máx. ${TAMANHO_MAX_COMENTARIO} caracteres)` }) };
        }
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
        if (acao === 'excluir') {
            await trelloFetch(`/actions/${comentarioId}`, key!, token!, {}, 'DELETE');
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true, comentarioId }) };
        }

        const salvo = acao === 'editar'
            ? await trelloFetch<TrelloActionCriada>(
                `/cards/${cardId}/actions/${comentarioId}/comments`,
                key!,
                token!,
                { text: texto, member_creator_fields: 'fullName,initials,avatarUrl' },
                'PUT',
            )
            : await trelloFetch<TrelloActionCriada>(
                `/cards/${cardId}/actions/comments`,
                key!,
                token!,
                { text: texto, member_creator_fields: 'fullName,initials,avatarUrl' },
                'POST',
            );

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                comentario: {
                    id: salvo.id,
                    texto: salvo.data.text,
                    data: salvo.date,
                    autorId: salvo.memberCreator.id,
                    autor: {
                        nome: salvo.memberCreator.fullName,
                        iniciais: salvo.memberCreator.initials,
                        avatarUrl: salvo.memberCreator.avatarUrl,
                    },
                },
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
