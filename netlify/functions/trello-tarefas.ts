import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Todos os cards do Trello atribuídos ao dono do token (TRELLO_TOKEN), em
 * qualquer board — usa GET /1/members/me/cards, que já resolve isso numa
 * única chamada (sem precisar procurar em qual board está cada card nem de
 * TRELLO_BOARD_ID).
 *
 * Esse endpoint NÃO aceita `board=true`/`list=true` pra embutir nome do board
 * e da lista (testado contra a API real — o card volta sem essas chaves,
 * apesar de documentação de outros endpoints do Trello sugerir o contrário).
 * Pra não fazer 1 request por card, resolvemos os nomes com só 2 chamadas
 * extras: nome de todos os meus boards de uma vez (`/members/me/boards`) e as
 * listas de cada board DISTINTO que apareceu entre os cards (paralelo) — o
 * fan-out é por board, não por card.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloMemberCard {
    id: string;
    name: string;
    due: string | null;
    dueComplete: boolean;
    idBoard: string;
    idList: string;
    shortUrl: string;
    closed: boolean;
}

interface TrelloBoardRef {
    id: string;
    name: string;
}

interface TrelloListRef {
    id: string;
    name: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
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

    const started = Date.now();
    try {
        // filter=all: traz também cards arquivados — o front decide se mostra,
        // por padrão eles ficam ocultos (ver TrelloView).
        const cards = await trelloFetch<TrelloMemberCard[]>('/members/me/cards', key!, token!, {
            fields: 'name,due,dueComplete,idBoard,idList,shortUrl,closed',
            filter: 'all',
        });

        const idsDosBoards = [...new Set(cards.map(c => c.idBoard))];

        const [boards, listasPorBoard] = await Promise.all([
            trelloFetch<TrelloBoardRef[]>('/members/me/boards', key!, token!, { fields: 'name' }),
            Promise.all(idsDosBoards.map(id =>
                // filter=all: um card aberto pode estar numa lista arquivada
                // (lista fechada sem que o card em si tenha sido arquivado).
                trelloFetch<TrelloListRef[]>(`/boards/${id}/lists`, key!, token!, { fields: 'name', filter: 'all' }),
            )),
        ]);

        const nomeDoBoard = new Map(boards.map(b => [b.id, b.name]));
        const nomeDaLista = new Map(listasPorBoard.flat().map(l => [l.id, l.name]));

        const tarefas = cards.map(card => ({
            id: card.id,
            nome: card.name,
            due: card.due,
            dueComplete: card.dueComplete,
            boardId: card.idBoard,
            board: nomeDoBoard.get(card.idBoard) ?? 'Board desconhecido',
            listId: card.idList,
            lista: nomeDaLista.get(card.idList) ?? 'Lista desconhecida',
            cardUrl: card.shortUrl,
            closed: card.closed,
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: tarefas.length,
                tarefas,
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: message, elapsedMs: Date.now() - started }),
        };
    }
};
