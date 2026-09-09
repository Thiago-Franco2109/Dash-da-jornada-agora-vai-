import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch, mapLabels, type TrelloLabelBruto, type TrelloMemberBruto } from './_shared/trello';

/**
 * Detalhe completo de UM card do Trello — descrição, checklists com itens,
 * anexos e comentários (via `actions=commentCard`), tudo numa chamada só
 * (a API do Trello faz sideload de tudo isso no GET /cards/{id}, testado
 * direto contra a API real antes de escrever esse código).
 *
 * Alimenta o modal "abrir card sem sair do dashboard" — ver
 * src/components/trello/CardDetalheModal.tsx.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=10' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface TrelloChecklistItem {
    id: string;
    name: string;
    state: 'complete' | 'incomplete';
    idMember: string | null;
}

interface TrelloChecklist {
    id: string;
    name: string;
    pos: number;
    checkItems: TrelloChecklistItem[];
}

interface TrelloAttachment {
    id: string;
    name: string;
    url: string;
    date: string;
    bytes: number | null;
    mimeType: string;
}

interface TrelloCommentAction {
    id: string;
    date: string;
    type: string;
    data: { text: string };
    memberCreator: TrelloMemberBruto;
}

interface TrelloCardDetalheBruto {
    id: string;
    name: string;
    desc: string;
    due: string | null;
    dueComplete: boolean;
    closed: boolean;
    shortUrl: string;
    idList: string;
    idBoard: string;
    labels: TrelloLabelBruto[];
    members: TrelloMemberBruto[];
    checklists: TrelloChecklist[];
    attachments: TrelloAttachment[];
    actions: TrelloCommentAction[];
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const cardId = event.queryStringParameters?.cardId?.trim();
    if (!cardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro cardId é obrigatório' }) };
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
        const card = await trelloFetch<TrelloCardDetalheBruto>(`/cards/${cardId}`, key!, token!, {
            fields: 'name,desc,due,dueComplete,closed,shortUrl,idList,idBoard,labels',
            members: 'true',
            member_fields: 'fullName,initials,avatarUrl',
            checklists: 'all',
            checklist_fields: 'name,pos',
            checkItem_fields: 'name,state,idMember',
            attachments: 'true',
            attachment_fields: 'name,url,date,bytes,mimeType',
            actions: 'commentCard',
            actions_limit: '200',
            action_fields: 'data,date,type',
            action_memberCreator_fields: 'fullName,initials,avatarUrl',
        });

        const detalhe = {
            id: card.id,
            nome: card.name,
            descricao: card.desc,
            due: card.due,
            dueComplete: card.dueComplete,
            closed: card.closed,
            cardUrl: card.shortUrl,
            labels: mapLabels(card.labels),
            membros: card.members.map(m => ({ id: m.id, nome: m.fullName, iniciais: m.initials, avatarUrl: m.avatarUrl })),
            checklists: card.checklists
                .sort((a, b) => a.pos - b.pos)
                .map(cl => ({
                    id: cl.id,
                    nome: cl.name,
                    itens: cl.checkItems.map(it => ({ id: it.id, nome: it.name, feito: it.state === 'complete' })),
                })),
            anexos: card.attachments.map(a => ({
                id: a.id,
                nome: a.name,
                url: a.url,
                data: a.date,
                bytes: a.bytes,
                tipo: a.mimeType,
            })),
            comentarios: card.actions
                .filter(a => a.type === 'commentCard')
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map(a => ({
                    id: a.id,
                    texto: a.data.text,
                    data: a.date,
                    autor: { nome: a.memberCreator.fullName, iniciais: a.memberCreator.initials, avatarUrl: a.memberCreator.avatarUrl },
                })),
        };

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, card: detalhe, elapsedMs: Date.now() - started }),
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
