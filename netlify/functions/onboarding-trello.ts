import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch, mapLabels, mapMembros, mapBadges, type TrelloLabelBruto, type TrelloMemberBruto, type TrelloBadgesBruto } from './_shared/trello';

/**
 * TODOS os cards do board de onboarding no Trello (TRELLO_BOARD_ID) — usado
 * pelas duas visualizações da Acompanhar Onboarding:
 *   - Tabela (pendentes do MySQL): casa cada linha com seu card pelo `estabId`
 *     (cards seguem o padrão "{estabelecimento_id} - {nome da loja}", ex.:
 *     "28509 - Sublime Açaí Express" -> estabId "28509"; cards sem esse
 *     padrão, tipo modelos/"Desistências", ficam com estabId null).
 *   - Quadro: espelha o board inteiro, uma coluna por lista, igual ao Trello
 *     de verdade — por isso `listas` inclui TODAS as listas do board, mesmo
 *     as sem nenhum card, e vem na ordem real de posição (não alfabética).
 *
 * Credenciais do Trello ficam só em env vars de servidor (TRELLO_API_KEY,
 * TRELLO_TOKEN, TRELLO_BOARD_ID) — nunca com prefixo VITE_.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloCard {
    id: string;
    name: string;
    idList: string;
    shortLink: string;
    due: string | null;
    dueComplete: boolean;
    closed: boolean;
    labels: TrelloLabelBruto[];
    idMembers: string[];
    badges: TrelloBadgesBruto;
}

interface TrelloList {
    id: string;
    name: string;
    closed: boolean;
}

interface TrelloAction {
    type: string;
    date: string;
    data: { card?: { id: string }; listAfter?: { id: string } };
}

/** "28509 - Sublime Açaí Express" -> "28509" */
function extrairEstabId(nomeCard: string): string | null {
    const m = nomeCard.match(/^\s*(\d+)\s*-/);
    return m ? m[1] : null;
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
    const boardId = process.env.TRELLO_BOARD_ID;

    const missing = [
        ['TRELLO_API_KEY', key],
        ['TRELLO_TOKEN', token],
        ['TRELLO_BOARD_ID', boardId],
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
        const [cards, listasBrutas, membrosBrutos, actions] = await Promise.all([
            trelloFetch<TrelloCard[]>(`/boards/${boardId}/cards`, key!, token!, {
                fields: 'id,name,idList,shortLink,due,dueComplete,closed,labels,idMembers,badges',
                filter: 'open',
            }),
            // lists=all-ish: listas fechadas também entram (colunas arquivadas
            // do board), pra bater com o board real na visão "Quadro".
            trelloFetch<TrelloList[]>(`/boards/${boardId}/lists`, key!, token!, { fields: 'name,closed', filter: 'all' }),
            trelloFetch<TrelloMemberBruto[]>(`/boards/${boardId}/members`, key!, token!, { fields: 'fullName,initials,avatarUrl' }),
            trelloFetch<TrelloAction[]>(`/boards/${boardId}/actions`, key!, token!, {
                limit: '1000',
                filter: 'updateCard:idList,createCard',
            }),
        ]);

        // ordem preserva a posição real das listas no board (a API já devolve
        // em ordem de posição) — usada pra ordenar as colunas do "Quadro"
        // igual ao board de verdade, em vez de alfabética.
        const listasPorId = new Map(listasBrutas.map((l, i) => [l.id, { ...l, ordem: i }]));
        const membrosPorId = new Map(membrosBrutos.map(m => [m.id, m]));

        const acoesPorCard = new Map<string, TrelloAction[]>();
        for (const acao of actions) {
            const cardId = acao.data.card?.id;
            if (!cardId) continue;
            if (!acoesPorCard.has(cardId)) acoesPorCard.set(cardId, []);
            acoesPorCard.get(cardId)!.push(acao);
        }

        const cardsEnriquecidos = cards.map(card => {
            const lista = listasPorId.get(card.idList);

            const acoesDoCard = (acoesPorCard.get(card.id) ?? []).sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            );
            const entrada = acoesDoCard.find(a =>
                (a.type === 'updateCard' && a.data.listAfter?.id === card.idList) || a.type === 'createCard',
            );
            const entrouEm = entrada?.date ?? null;
            const diasNaEtapa = entrouEm
                ? Math.floor((Date.now() - new Date(entrouEm).getTime()) / 86_400_000)
                : null;

            return {
                id: card.id,
                nome: card.name,
                estabId: extrairEstabId(card.name),
                listId: card.idList,
                etapa: lista?.name ?? 'Lista desconhecida',
                listaOrdem: lista?.ordem ?? 0,
                diasNaEtapa,
                cardUrl: `https://trello.com/c/${card.shortLink}`,
                due: card.due,
                dueComplete: card.dueComplete,
                closed: card.closed || (lista?.closed ?? false),
                labels: mapLabels(card.labels),
                membros: mapMembros(card.idMembers, membrosPorId),
                ...mapBadges(card.badges),
            };
        });

        // Só listas abertas viram coluna do Quadro — o board real também
        // esconde listas arquivadas da visão normal. `listasPorId` continua
        // com todas (aberta+arquivada) pra resolver etapa/ordem/closed certo
        // por card, mesmo quando a lista dele foi arquivada.
        const listas = [...listasPorId.values()]
            .filter(l => !l.closed)
            .sort((a, b) => a.ordem - b.ordem)
            .map(l => ({ id: l.id, nome: l.name, ordem: l.ordem }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: cardsEnriquecidos.length,
                cards: cardsEnriquecidos,
                listas,
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
