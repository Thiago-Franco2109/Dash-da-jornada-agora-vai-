import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch, mapLabels, mapMembros, mapBadges, type TrelloLabelBruto, type TrelloMemberBruto, type TrelloBadgesBruto } from './_shared/trello';

/**
 * Todos os cards do Trello atribuídos ao dono do token (TRELLO_TOKEN), em
 * qualquer board — usa GET /1/members/me/cards, que já resolve isso numa
 * única chamada (sem precisar procurar em qual board está cada card nem de
 * TRELLO_BOARD_ID).
 *
 * Esse endpoint NÃO aceita `board=true`/`list=true` pra embutir nome do board
 * e da lista (testado contra a API real — o card volta sem essas chaves,
 * apesar de documentação de outros endpoints do Trello sugerir o contrário).
 * Mas `labels`, `idMembers` e `badges` (testado direto contra a API) vêm
 * certinho nesse endpoint — não precisou de gambiarra pra esses.
 *
 * Pra não fazer 1 request por card, resolvemos nome do board/lista e os
 * membros com só 2 chamadas extras: nome de todos os meus boards de uma vez
 * (`/members/me/boards`) e, por board DISTINTO que apareceu entre os cards
 * (paralelo, fan-out por board — não por card), UMA chamada combinada
 * `/boards/{id}?lists=all&members=all` que já traz lista E membros do board
 * juntos (testado: `members` é enum open/closed/all/none, não boolean).
 *
 * `listaOrdem` é a posição real da lista no board (ordem que a Trello API
 * devolve, que já é a ordem visual das colunas) — usada pra ordenar as
 * colunas do "Quadro" igual ao board de verdade, em vez de alfabética.
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
    labels: TrelloLabelBruto[];
    idMembers: string[];
    badges: TrelloBadgesBruto;
}

interface TrelloBoardRef {
    id: string;
    name: string;
}

interface TrelloBoardComListasEMembros {
    id: string;
    lists: { id: string; name: string; closed: boolean }[];
    members: TrelloMemberBruto[];
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
            fields: 'name,due,dueComplete,idBoard,idList,shortUrl,closed,labels,idMembers,badges',
            filter: 'all',
        });

        const idsDosBoards = [...new Set(cards.map(c => c.idBoard))];

        const [boards, boardsComListasEMembros] = await Promise.all([
            trelloFetch<TrelloBoardRef[]>('/members/me/boards', key!, token!, { fields: 'name' }),
            Promise.all(idsDosBoards.map(id =>
                // Uma chamada só por board: lista + membros juntos.
                // lists=all (não só "open"): um card aberto pode estar numa lista
                // arquivada (lista fechada sem que o card em si tenha sido
                // arquivado) — e nesse caso o Trello já trata o card como
                // "arquivado" pra quem tá olhando o board, mesmo com
                // card.closed = false.
                trelloFetch<TrelloBoardComListasEMembros>(`/boards/${id}`, key!, token!, {
                    fields: 'id',
                    lists: 'all',
                    list_fields: 'name,closed',
                    members: 'all',
                    member_fields: 'fullName,initials,avatarUrl',
                }),
            )),
        ]);

        const nomeDoBoard = new Map(boards.map(b => [b.id, b.name]));

        // listaOrdem preserva a ordem real das colunas no board (a API já
        // devolve as listas em ordem de posição) — usada pra ordenar as
        // colunas do "Quadro" igual ao board de verdade, em vez de alfabética.
        const listasPorId = new Map<string, { name: string; closed: boolean; ordem: number }>();
        const membrosPorId = new Map<string, TrelloMemberBruto>();
        let ordemGlobal = 0;
        for (const b of boardsComListasEMembros) {
            for (const lista of b.lists) {
                listasPorId.set(lista.id, { name: lista.name, closed: lista.closed, ordem: ordemGlobal++ });
            }
            for (const membro of b.members) {
                membrosPorId.set(membro.id, membro);
            }
        }

        const tarefas = cards.map(card => {
            const lista = listasPorId.get(card.idList);
            return {
                id: card.id,
                nome: card.name,
                due: card.due,
                dueComplete: card.dueComplete,
                boardId: card.idBoard,
                board: nomeDoBoard.get(card.idBoard) ?? 'Board desconhecido',
                listId: card.idList,
                lista: lista?.name ?? 'Lista desconhecida',
                listaOrdem: lista?.ordem ?? 0,
                cardUrl: card.shortUrl,
                // "Arquivado" pro usuário é card fechado OU lista fechada —
                // ver comentário acima sobre lista arquivada com card aberto.
                closed: card.closed || (lista?.closed ?? false),
                labels: mapLabels(card.labels),
                membros: mapMembros(card.idMembers, membrosPorId),
                ...mapBadges(card.badges),
            };
        });

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
