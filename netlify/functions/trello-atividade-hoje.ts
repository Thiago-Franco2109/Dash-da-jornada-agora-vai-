import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Resumo da atividade do dono do token no Trello num dia (fuso
 * America/Sao_Paulo): comentários feitos e cards movidos entre listas — em
 * qualquer board, numa única chamada (GET /1/members/me/actions, mesmo padrão
 * de /members/me/cards em trello-tarefas.ts: sem iterar board por board).
 *
 * O filtro `updateCard:idList` já restringe as ações "updateCard" às que
 * mudaram de lista (mesmo atalho usado em onboarding-trello.ts) — sem isso
 * viria toda edição de card (renomear, mudar prazo etc.) misturada.
 *
 * PARÂMETROS (todos opcionais — sem nenhum, responde exatamente como antes,
 * que é o que o cabeçalho da tela Trello consome):
 *   ?data=YYYY-MM-DD  dia a consultar no fuso de Brasília. Default: hoje.
 *   ?anexos=1         inclui `addAttachmentToCard` na busca. É o print de
 *                     confirmação que o CS anexa ao fechar uma ação, então pro
 *                     diário conta como trabalho feito — mas pra tela Trello
 *                     seria ruído, por isso fica atrás de flag.
 *
 * O agrupamento `porLista` conta CARDS DISTINTOS por destino, não ações: um
 * card que volta e é movido de novo no mesmo dia inflaria a conta (já
 * aconteceu: 11 ações para 10 cards num dia só).
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

type TipoAcao = 'commentCard' | 'updateCard' | 'addAttachmentToCard';

interface TrelloAction {
    id: string;
    type: TipoAcao;
    date: string;
    data: {
        card?: { id: string; name: string; shortLink: string };
        board?: { name: string };
        text?: string;
        listBefore?: { name: string };
        listAfter?: { name: string };
        attachment?: { name: string };
    };
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Contagem de cards distintos por chave, já ordenada do maior pro menor. */
function agruparCardsDistintos(
    acoes: TrelloAction[],
    chave: (a: TrelloAction) => string | undefined,
): { nome: string; cards: number }[] {
    const porChave = new Map<string, Set<string>>();
    for (const acao of acoes) {
        const k = chave(acao);
        const cardId = acao.data.card?.id;
        if (!k || !cardId) continue;
        if (!porChave.has(k)) porChave.set(k, new Set());
        porChave.get(k)!.add(cardId);
    }
    return [...porChave.entries()]
        .map(([nome, cards]) => ({ nome, cards: cards.size }))
        .sort((a, b) => b.cards - a.cards || a.nome.localeCompare(b.nome, 'pt-BR'));
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

    // "Hoje" no fuso de Brasília, não no fuso do servidor da function (Netlify
    // roda em UTC) — Brasil não tem mais horário de verão, então o offset
    // -03:00 é fixo e o dia vai de 03:00Z a 03:00Z do dia seguinte.
    const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const pedida = (event.queryStringParameters?.data || '').trim();
    if (pedida && !FORMATO_DATA.test(pedida)) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Data inválida: "${pedida}". Use YYYY-MM-DD.` }),
        };
    }
    const dia = pedida || hojeSP;
    const comAnexos = event.queryStringParameters?.anexos === '1';

    const started = Date.now();
    try {
        const desde = `${dia}T03:00:00.000Z`;
        const ate = new Date(new Date(desde).getTime() + 86_400_000).toISOString();

        const filtros = ['commentCard', 'updateCard:idList'];
        if (comAnexos) filtros.push('addAttachmentToCard');

        const acoes = await trelloFetch<TrelloAction[]>('/members/me/actions', key!, token!, {
            filter: filtros.join(','),
            since: desde,
            before: ate,
            limit: '1000',
            fields: 'type,date,data',
        });

        const comentarios = acoes.filter(a => a.type === 'commentCard').length;
        const movimentacoesDeLista = acoes.filter(a => a.type === 'updateCard');
        const acoesDeAnexo = acoes.filter(a => a.type === 'addAttachmentToCard');
        const cardsMovidos = new Set(movimentacoesDeLista.map(a => a.data.card?.id).filter(Boolean)).size;

        const movimentacoes = acoes
            .filter(a => a.data.card)
            .map(a => ({
                id: a.id,
                tipo: a.type === 'commentCard' ? 'comentario' as const
                    : a.type === 'addAttachmentToCard' ? 'anexo' as const
                        : 'movido' as const,
                quando: a.date,
                cardNome: a.data.card!.name,
                cardUrl: `https://trello.com/c/${a.data.card!.shortLink}`,
                boardNome: a.data.board?.name ?? 'Board desconhecido',
                texto: a.data.text,
                listaAntes: a.data.listBefore?.name,
                listaDepois: a.data.listAfter?.name,
                anexoNome: a.data.attachment?.name,
            }))
            .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                data: dia,
                // Mantido como estava (comentários + movimentações) pra não
                // mudar o número que a tela Trello já mostra: anexo entra em
                // `anexos`, separado.
                totalMovimentacoes: comentarios + movimentacoesDeLista.length,
                comentarios,
                cardsMovidos,
                anexos: acoesDeAnexo.length,
                porLista: agruparCardsDistintos(movimentacoesDeLista, a => a.data.listAfter?.name),
                porBoard: agruparCardsDistintos(acoes, a => a.data.board?.name),
                // A API corta em 1000 ações. Um dia normal fica bem abaixo
                // (~190), mas se bater no teto o resumo está incompleto e quem
                // chama precisa saber, em vez de exibir número menor em silêncio.
                truncado: acoes.length >= 1000,
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
