import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch, type TrelloMemberBruto } from './_shared/trello';

/**
 * Posta um comentário num card do Trello — POST /1/cards/{id}/actions/comments.
 *
 * PRIMEIRA function de escrita no Trello desse projeto (as outras são todas
 * read-only). O token já tem permissão de write em Board (testado: `GET
 * /1/tokens/{token}` retorna write:true pra Board/Organization/Member) —
 * então isso posta como o usuário dono do TRELLO_TOKEN, visível pra equipe
 * inteira no board real. Sem confirmação extra além do STOPGAP de origem
 * (mesmo padrão das outras functions) — o texto do comentário é decidido
 * pelo usuário na hora, não é uma escrita automática/em lote.
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

    let body: { cardId?: unknown; texto?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';

    if (!cardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'cardId é obrigatório' }) };
    }
    if (!texto) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Comentário vazio' }) };
    }
    if (texto.length > TAMANHO_MAX_COMENTARIO) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: `Comentário muito longo (máx. ${TAMANHO_MAX_COMENTARIO} caracteres)` }) };
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
        const criado = await trelloFetch<TrelloActionCriada>(
            `/cards/${cardId}/actions/comments`,
            key!,
            token!,
            {
                text: texto,
                member_creator_fields: 'fullName,initials,avatarUrl',
            },
            'POST',
        );

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                comentario: {
                    id: criado.id,
                    texto: criado.data.text,
                    data: criado.date,
                    autor: {
                        nome: criado.memberCreator.fullName,
                        iniciais: criado.memberCreator.initials,
                        avatarUrl: criado.memberCreator.avatarUrl,
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
