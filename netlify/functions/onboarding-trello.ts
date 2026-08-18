import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';

/**
 * Etapa atual (lista do Trello) de cada parceiro pendente de onboarding.
 *
 * Os cards do board seguem o padrão "{estabelecimento_id} - {nome da loja}"
 * (ex.: "28509 - Sublime Açaí Express") — é assim que casamos cada card com
 * a linha correspondente em `onboarding-pendentes.ts`, sem depender do nome
 * da loja bater exatamente.
 *
 * Credenciais do Trello ficam só em env vars de servidor (TRELLO_API_KEY,
 * TRELLO_TOKEN, TRELLO_BOARD_ID) — nunca com prefixo VITE_, pra não ir pro
 * bundle do navegador (mesma lógica do _shared/supabaseAdmin.ts pra chave
 * de servidor do Supabase).
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
}

interface TrelloList {
    id: string;
    name: string;
}

interface TrelloAction {
    type: string;
    date: string;
    data: { card?: { id: string }; listAfter?: { id: string } };
}

async function trelloFetch<T>(path: string, key: string, token: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({ key, token, ...params }).toString();
    const res = await fetch(`https://api.trello.com/1${path}?${query}`);
    if (!res.ok) {
        throw new Error(`Trello API ${res.status}: ${res.statusText}`);
    }
    return res.json();
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
        const [cards, lists, actions] = await Promise.all([
            trelloFetch<TrelloCard[]>(`/boards/${boardId}/cards`, key!, token!, { fields: 'id,name,idList,shortLink' }),
            trelloFetch<TrelloList[]>(`/boards/${boardId}/lists`, key!, token!, { fields: 'id,name' }),
            trelloFetch<TrelloAction[]>(`/boards/${boardId}/actions`, key!, token!, {
                limit: '1000',
                filter: 'updateCard:idList,createCard',
            }),
        ]);

        const nomeDaLista = new Map(lists.map(l => [l.id, l.name]));

        const acoesPorCard = new Map<string, TrelloAction[]>();
        for (const acao of actions) {
            const cardId = acao.data.card?.id;
            if (!cardId) continue;
            if (!acoesPorCard.has(cardId)) acoesPorCard.set(cardId, []);
            acoesPorCard.get(cardId)!.push(acao);
        }

        const etapas = cards
            .map(card => {
                const estabId = extrairEstabId(card.name);
                if (!estabId) return null;

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
                    estabId,
                    cardId: card.id,
                    cardUrl: `https://trello.com/c/${card.shortLink}`,
                    etapa: nomeDaLista.get(card.idList) ?? 'Desconhecida',
                    diasNaEtapa,
                };
            })
            .filter((e): e is NonNullable<typeof e> => e != null);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: etapas.length,
                etapas,
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
