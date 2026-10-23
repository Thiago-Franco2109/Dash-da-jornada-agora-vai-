import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';

/**
 * Cria um card — POST /1/cards. Mesmo padrão de escrita de
 * trello-card-editar.ts: o token já tem permissão e quem decide o conteúdo é
 * o usuário na hora, então não há confirmação extra além do STOPGAP de origem.
 *
 * Nasceu pra extensão de promoções (extensao-promo/), que cria o card e em
 * seguida anexa o print por trello-card-anexar.ts. São duas chamadas, e não
 * uma só com o arquivo junto, porque /1/cards não aceita upload no mesmo
 * POST — o anexo sempre é um segundo request contra /cards/{id}/attachments.
 *
 * `pos: 'top'` porque card de promoção é sempre o mais recente: entra no topo
 * da lista, onde ele vai procurar.
 *
 * Com `modeloId`, o card nasce de um card template do quadro
 * (`idCardSource`). `keepFromSource` fica em checklists/customFields e NÃO
 * inclui attachments nem comments: o template de captação existe pra trazer o
 * checklist — anexo e comentário vêm do uso real, não da fôrma.
 *
 * `labels` TAMBÉM ficou de fora, e não por gosto: com `labels` no
 * keepFromSource, a cópia das labels do template SOBRESCREVE o `idLabels`
 * mandado junto. Como o template não tem label nenhuma, o card saía sem a tag
 * de cidade (testado contra a API: mesmo request com e sem `labels` no
 * keepFromSource dá NENHUMA vs ['Muriaé']). O template não tem label pra
 * perder, então a troca não custa nada.
 * `desc` continua sendo mandado explicitamente e sobrepõe o do template, que
 * é o que o painel já mostrou (e deixou editar) na hora de escolher.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const TAMANHO_MAX_NOME = 16384;

interface TrelloCardCriado {
    id: string;
    name: string;
    shortUrl: string;
    idList: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let body: { listaId?: unknown; nome?: unknown; descricao?: unknown; modeloId?: unknown; labelIds?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const listaId = typeof body.listaId === 'string' ? body.listaId.trim() : '';
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
    const modeloId = typeof body.modeloId === 'string' ? body.modeloId.trim() : '';
    const labelIds = Array.isArray(body.labelIds)
        ? body.labelIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        : [];

    if (!listaId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'listaId é obrigatório' }) };
    }
    if (!nome) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'nome é obrigatório' }) };
    }
    if (nome.length > TAMANHO_MAX_NOME) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'nome muito longo' }) };
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
        const criado = await trelloFetch<TrelloCardCriado>(
            '/cards',
            key!,
            token!,
            {
                idList: listaId,
                name: nome,
                desc: descricao,
                pos: 'top',
                ...(modeloId ? { idCardSource: modeloId, keepFromSource: 'checklists,customFields' } : {}),
                ...(labelIds.length ? { idLabels: labelIds.join(',') } : {}),
            },
            'POST',
        );

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                card: {
                    id: criado.id,
                    nome: criado.name,
                    shortUrl: criado.shortUrl,
                    listaId: criado.idList,
                },
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};
