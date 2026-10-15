import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Cria uma label no quadro — POST /1/labels.
 *
 * Existe porque 41 das 66 cidades de parceiro não têm label no quadro de
 * captação, e card de promoção sem a tag da cidade perde o filtro que o time
 * usa. A extensão oferece o botão; quem decide criar é o usuário, não uma
 * rotina automática (é escrita no quadro de todo mundo).
 *
 * A cor é escolhida aqui, e não mandada pelo cliente: o padrão do quadro é
 * uma cor por cidade, então pegamos a MENOS usada entre as labels que já
 * existem. Sem isso as 41 cidades novas sairiam todas iguais e a tag deixaria
 * de distinguir no olho.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** Paleta base do Trello — as variantes _light/_dark existem, mas misturar as três deixa o quadro sujo. */
const CORES = [
    'green', 'yellow', 'orange', 'red', 'purple',
    'blue', 'sky', 'lime', 'pink', 'black',
];

interface TrelloLabelBruta {
    id: string;
    name: string;
    color: string | null;
}

function corMenosUsada(existentes: TrelloLabelBruta[]): string {
    const contagem = new Map(CORES.map(c => [c, 0]));
    for (const l of existentes) {
        // Normaliza "blue_light" → "blue": a variante não importa pra
        // distribuir, o que conta é o matiz.
        const base = (l.color ?? '').split('_')[0];
        if (contagem.has(base)) contagem.set(base, contagem.get(base)! + 1);
    }
    return [...contagem.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let body: { boardId?: unknown; nome?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const boardId = typeof body.boardId === 'string' ? body.boardId.trim() : '';
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';

    if (!boardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'boardId é obrigatório' }) };
    }
    if (!nome) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'nome é obrigatório' }) };
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
        const existentes = await trelloFetch<TrelloLabelBruta[]>(
            `/boards/${boardId}/labels`,
            key!,
            token!,
            { fields: 'name,color', limit: '1000' },
        );

        // Já existe com esse nome: devolve a que está lá em vez de duplicar.
        // O quadro já tem 4 "Muriaé" justamente por criação repetida — não
        // vale a pena somar mais uma.
        const repetida = existentes.find(l => l.name.trim().toLowerCase() === nome.toLowerCase());
        if (repetida) {
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: true, jaExistia: true, label: { id: repetida.id, nome: repetida.name, cor: repetida.color } }),
            };
        }

        const criada = await trelloFetch<TrelloLabelBruta>(
            '/labels',
            key!,
            token!,
            { idBoard: boardId, name: nome, color: corMenosUsada(existentes) },
            'POST',
        );

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, jaExistia: false, label: { id: criada.id, nome: criada.name, cor: criada.color } }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};
