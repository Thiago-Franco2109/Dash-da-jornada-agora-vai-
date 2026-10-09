import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Resumo da atividade do dono do token no Trello numa janela de dias (fuso
 * America/Sao_Paulo): comentários feitos e cards movidos entre listas — em
 * qualquer board, numa chamada só por página (GET /1/members/me/actions, mesmo
 * padrão de /members/me/cards em trello-tarefas.ts: sem iterar board por board).
 *
 * O nome do arquivo diz "hoje" por motivo histórico: nasceu só pro cabeçalho da
 * tela Trello. Hoje atende dia avulso (diário) e semana (relatório semanal). O
 * caminho não foi renomeado pra não quebrar a URL já publicada.
 *
 * O filtro `updateCard:idList` já restringe as ações "updateCard" às que
 * mudaram de lista (mesmo atalho usado em onboarding-trello.ts) — sem isso
 * viria toda edição de card (renomear, mudar prazo etc.) misturada.
 *
 * PARÂMETROS (todos opcionais — sem nenhum, responde exatamente como antes,
 * que é o que o cabeçalho da tela Trello consome):
 *   ?data=YYYY-MM-DD    atalho de um dia só (equivale a de=ate=data).
 *   ?de= &ate=          janela fechada nas duas pontas. Default: hoje.
 *   ?anexos=1           inclui `addAttachmentToCard` na busca. É o print de
 *                       confirmação que o CS anexa ao fechar uma ação, então
 *                       pro diário conta como trabalho feito — mas pra tela
 *                       Trello seria ruído, por isso fica atrás de flag.
 *
 * O agrupamento `porLista` conta CARDS DISTINTOS por destino, não ações: um
 * card que volta e é movido de novo na mesma janela inflaria a conta (já
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

/** Teto da API do Trello por chamada. */
const POR_PAGINA = 1000;
/** Páginas no máximo — a function morre em 10s, melhor avisar que estourar. */
const MAX_PAGINAS = 5;

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
    const q = event.queryStringParameters ?? {};
    // `data` é o atalho de um dia só (de = ate); `de`/`ate` abrem a janela.
    const pedidas = {
        de: (q.de || q.data || '').trim(),
        ate: (q.ate || q.data || '').trim(),
    };
    for (const [nome, valor] of Object.entries(pedidas)) {
        if (valor && !FORMATO_DATA.test(valor)) {
            return {
                statusCode: 400,
                headers: erroHeaders,
                body: JSON.stringify({ ok: false, error: `Data inválida em "${nome}": "${valor}". Use YYYY-MM-DD.` }),
            };
        }
    }
    const de = pedidas.de || hojeSP;
    const ate = pedidas.ate || de;
    if (ate < de) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Janela invertida: "ate" (${ate}) é anterior a "de" (${de}).` }),
        };
    }
    const comAnexos = q.anexos === '1';

    const started = Date.now();
    try {
        const inicioJanela = `${de}T03:00:00.000Z`;
        const fimJanela = new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 86_400_000).toISOString();

        const filtros = ['commentCard', 'updateCard:idList'];
        if (comAnexos) filtros.push('addAttachmentToCard');

        // A API devolve no máximo 1000 ações por chamada, da mais nova pra mais
        // antiga. Um dia cabe folgado (~90), mas uma semana não necessariamente
        // — por isso pagina com `before` andando pra trás. O teto de páginas
        // existe porque a function morre em 10s: estourando, devolve `truncado`
        // em vez de um número menor sem avisar.
        const acoes: TrelloAction[] = [];
        const vistas = new Set<string>();
        let cursor = fimJanela;
        let truncado = false;

        for (let pagina = 0; ; pagina++) {
            if (pagina >= MAX_PAGINAS) { truncado = true; break; }

            const lote = await trelloFetch<TrelloAction[]>('/members/me/actions', key!, token!, {
                filter: filtros.join(','),
                since: inicioJanela,
                before: cursor,
                limit: String(POR_PAGINA),
                fields: 'type,date,data',
            });

            for (const acao of lote) {
                // Dedupe: duas ações no mesmo instante fazem a borda do cursor
                // repetir uma delas.
                if (vistas.has(acao.id)) continue;
                vistas.add(acao.id);
                acoes.push(acao);
            }

            if (lote.length < POR_PAGINA) break;
            const maisAntiga = lote[lote.length - 1]?.date;
            if (!maisAntiga || maisAntiga === cursor) break;
            cursor = maisAntiga;
        }

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
                // `data` continua sendo o primeiro dia da janela: o cabeçalho
                // da tela Trello lê esse campo desde antes de existir janela.
                data: de,
                de,
                ate,
                // Mantido como estava (comentários + movimentações) pra não
                // mudar o número que a tela Trello já mostra: anexo entra em
                // `anexos`, separado.
                totalMovimentacoes: comentarios + movimentacoesDeLista.length,
                comentarios,
                cardsMovidos,
                anexos: acoesDeAnexo.length,
                porLista: agruparCardsDistintos(movimentacoesDeLista, a => a.data.listAfter?.name),
                porBoard: agruparCardsDistintos(acoes, a => a.data.board?.name),
                // Verdadeiro só quando a paginação bateu no teto de páginas —
                // aí o resumo está incompleto e quem chama precisa saber, em
                // vez de exibir número menor em silêncio.
                truncado,
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
