import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Resumo da atividade do dono do token no Trello HOJE (fuso America/Sao_Paulo):
 * comentários feitos e cards movidos entre listas — em qualquer board, numa
 * única chamada (GET /1/members/me/actions, mesmo padrão de /members/me/cards
 * em trello-tarefas.ts: sem iterar board por board).
 *
 * O filtro `updateCard:idList` já restringe as ações "updateCard" às que
 * mudaram de lista (mesmo atalho usado em onboarding-trello.ts) — sem isso
 * viria toda edição de card (renomear, mudar prazo etc.) misturada.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloAction {
    id: string;
    type: 'commentCard' | 'updateCard';
    date: string;
    data: {
        card?: { id: string; name: string; shortLink: string };
        board?: { name: string };
        text?: string;
        listBefore?: { name: string };
        listAfter?: { name: string };
    };
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
        // "Hoje" no fuso de Brasília, não no fuso do servidor da function
        // (Netlify roda em UTC) — Brasil não tem mais horário de verão, então
        // o offset -03:00 é fixo.
        const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const desde = `${hojeSP}T03:00:00.000Z`;

        const acoes = await trelloFetch<TrelloAction[]>('/members/me/actions', key!, token!, {
            filter: 'commentCard,updateCard:idList',
            since: desde,
            limit: '1000',
            fields: 'type,date,data',
        });

        const comentarios = acoes.filter(a => a.type === 'commentCard').length;
        const movimentacoesDeLista = acoes.filter(a => a.type === 'updateCard');
        const cardsMovidos = new Set(movimentacoesDeLista.map(a => a.data.card?.id).filter(Boolean)).size;

        const movimentacoes = acoes
            .filter(a => a.data.card)
            .map(a => ({
                id: a.id,
                tipo: a.type === 'commentCard' ? 'comentario' as const : 'movido' as const,
                quando: a.date,
                cardNome: a.data.card!.name,
                cardUrl: `https://trello.com/c/${a.data.card!.shortLink}`,
                boardNome: a.data.board?.name ?? 'Board desconhecido',
                texto: a.data.text,
                listaAntes: a.data.listBefore?.name,
                listaDepois: a.data.listAfter?.name,
            }))
            .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                data: hojeSP,
                totalMovimentacoes: comentarios + movimentacoesDeLista.length,
                comentarios,
                cardsMovidos,
                movimentacoes,
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
