import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Listas e cards abertos de um board, numa chamada só — GET /1/boards/{id}
 * com `lists=open&cards=open`, que devolve as duas coleções embutidas (mesmo
 * truque do fan-out de trello-tarefas.ts, que já usa `lists=all` embutido).
 *
 * É o que a extensão de promoções (extensao-promo/) carrega ao abrir: o
 * painel filtra os cards no cliente enquanto o usuário digita, em vez de
 * bater em /1/search a cada tecla. Um board de promoções tem centenas de
 * cards, não dezenas de milhares — cabe de sobra em memória, e a busca fica
 * instantânea.
 *
 * `listaOrdem` sai da ordem que a API devolve, que já é a ordem visual das
 * colunas (mesma observação de trello-tarefas.ts) — serve pro select de
 * destino sair na ordem do board, não alfabética.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloBoardBruto {
    id: string;
    name: string;
    lists: { id: string; name: string }[];
    labels: { id: string; name: string; color: string | null }[];
    cards: {
        id: string;
        name: string;
        idList: string;
        shortUrl: string;
        dateLastActivity: string;
        isTemplate: boolean;
        closed: boolean;
        desc: string;
        idLabels: string[];
    }[];
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const boardId = (event.queryStringParameters?.boardId || '').trim();
    if (!boardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'boardId é obrigatório' }) };
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
        const board = await trelloFetch<TrelloBoardBruto>(
            `/boards/${boardId}`,
            key!,
            token!,
            {
                fields: 'name',
                lists: 'open',
                list_fields: 'name',
                labels: 'all',
                label_fields: 'name,color',
                labels_limit: '1000',
                // `all` e não `open`: o card arquivado não entra em nada do
                // que devolvemos, mas conta pro uso das labels — é ele que
                // desempata cidade com label repetida (ver `usos`).
                cards: 'all',
                card_fields: 'name,idList,shortUrl,dateLastActivity,isTemplate,desc,closed,idLabels',
            },
        );

        const nomeDaLista = new Map(board.lists.map(l => [l.id, l.name]));

        // Quantas vezes cada label foi usada, arquivados inclusive. O quadro
        // tem label de cidade duplicada (Muriaé aparece 4x, com cores
        // diferentes) e não dá pra adivinhar a certa pelo nome — a contagem
        // desempata: a que o CMS vem usando ganha de longe (179 contra 4).
        const usos = new Map<string, number>();
        for (const card of board.cards) {
            for (const id of card.idLabels) usos.set(id, (usos.get(id) ?? 0) + 1);
        }

        const abertos = board.cards.filter(c => !c.closed);
        // Card template não é destino de anexo — é fôrma. Sai da lista de
        // busca e vira opção de modelo na criação.
        const modelos = abertos.filter(c => c.isTemplate);
        const comuns = abertos.filter(c => !c.isTemplate);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                board: { id: board.id, nome: board.name },
                listas: board.lists.map((l, i) => ({ id: l.id, nome: l.name, ordem: i })),
                labels: board.labels
                    .filter(l => l.name.trim())
                    .map(l => ({ id: l.id, nome: l.name, cor: l.color, usos: usos.get(l.id) ?? 0 })),
                // `desc` só vai nos modelos: o painel usa pra preencher a
                // descrição na hora que o modelo é escolhido. Mandar a dos
                // 140+ cards comuns seria payload à toa.
                modelos: modelos.map(c => ({ id: c.id, nome: c.name, descricao: c.desc })),
                cards: comuns.map(c => ({
                    id: c.id,
                    nome: c.name,
                    listaId: c.idList,
                    listaNome: nomeDaLista.get(c.idList) ?? '',
                    shortUrl: c.shortUrl,
                    ultimaAtividade: c.dateLastActivity,
                })),
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};
