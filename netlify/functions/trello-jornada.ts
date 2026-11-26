import type { Handler } from '@netlify/functions';
import { trelloFetch } from './_shared/trello';
import { checkOrigin } from './_shared/auth';

/**
 * Cards do quadro "[SC] Onboarding e Jornada", indexados por estabelecimento.
 *
 * POR QUE EXISTE
 * O painel já linkava o card do Trello para quem está em PRÉ-lançamento (vem
 * do `onboarding-trello`, outro quadro). Quem já abriu — que é a lista da
 * jornada 28D inteira — não tinha link nenhum, apesar de ter card aqui.
 *
 * Também devolve os CAMPOS PERSONALIZADOS do card. Eles já são a fonte real do
 * status de campanha por parceiro: medido em 25/11/2026, "Super promos" estava
 * preenchido em 17 dos 33 cards (15 "Ativou", 2 "Não ofertado"), "Cupom" em 10
 * e "Tudo por 9,99" em 3. É trabalho que o CS já faz à mão no card.
 *
 * Casamento é por ID, nunca por nome (nome de loja se repete entre cidades):
 * o título do card segue "{estabelecimento_id} - {nome}". Medido: 32 dos 33
 * cards abertos seguem o padrão — o único fora é o "Modelo".
 *
 * Credenciais só em env de servidor (TRELLO_API_KEY/TRELLO_TOKEN), nunca VITE_.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/**
 * O quadro da jornada. Fica com default no código de propósito: é id estável e
 * sem ele a função só passaria a responder depois de alguém lembrar de criar a
 * env na Netlify. `TRELLO_BOARD_JORNADA` sobrescreve quando o quadro mudar.
 *
 * NÃO é o `TRELLO_BOARD_ID` — aquele é o quadro de onboarding (pré-lançamento),
 * outro quadro, com listas de nome parecido.
 */
const BOARD_JORNADA_PADRAO = '6ae0afc51c9174f764309711';

interface CampoTrello {
    id: string;
    name: string;
    type: string;
    options?: Array<{ id: string; value: { text: string } }>;
}

interface CardTrello {
    id: string;
    name: string;
    idList: string;
    shortUrl: string;
    customFieldItems?: Array<{
        idCustomField: string;
        idValue?: string;
        value?: { number?: string; text?: string; date?: string; checked?: string };
    }>;
}

export interface CardJornada {
    cardId: string;
    nome: string;
    url: string;
    lista: string;
    /** Campos personalizados do card: nome do campo → valor já legível. */
    campos: Record<string, string>;
}

/** Campos personalizados do card como dicionário nome → texto. */
function lerCampos(card: CardTrello, campos: Map<string, CampoTrello>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of card.customFieldItems ?? []) {
        const campo = campos.get(item.idCustomField);
        if (!campo) continue;
        if (item.idValue) {
            const opcao = campo.options?.find(o => o.id === item.idValue);
            if (opcao) out[campo.name] = opcao.value.text;
            continue;
        }
        const bruto = item.value?.number ?? item.value?.text ?? item.value?.date ?? item.value?.checked;
        if (bruto != null && bruto !== '') out[campo.name] = String(bruto);
    }
    return out;
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
    const boardId = process.env.TRELLO_BOARD_JORNADA || BOARD_JORNADA_PADRAO;
    if (!key || !token) {
        return {
            statusCode: 500,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: 'Faltam TRELLO_API_KEY/TRELLO_TOKEN no ambiente.' }),
        };
    }

    const started = Date.now();
    try {
        const [campos, listas, cards] = await Promise.all([
            trelloFetch<CampoTrello[]>(`/boards/${boardId}/customFields`, key, token),
            trelloFetch<Array<{ id: string; name: string }>>(`/boards/${boardId}/lists`, key, token, { fields: 'name' }),
            trelloFetch<CardTrello[]>(`/boards/${boardId}/cards`, key, token, {
                fields: 'name,idList,shortUrl',
                customFieldItems: 'true',
            }),
        ]);

        const porId = new Map(campos.map(c => [c.id, c]));
        const nomeDaLista = new Map(listas.map(l => [l.id, l.name]));

        const porEstab: Record<string, CardJornada> = {};
        let semId = 0;
        // Um mesmo parceiro pode ter mais de um card (medido em 25/11/2026: o
        // 20640 tinha 3 cards idênticos). Fica no diagnóstico em vez de sumir
        // calado: o painel mostra um card só, e saber qual é o id repetido é o
        // que permite limpar o quadro.
        const vistos = new Map<string, number>();
        for (const card of cards) {
            const titulo = card.name.match(/^\s*(\d{3,6})\s*[-–]\s*(.+)$/);
            if (!titulo) { semId++; continue; }   // "Modelo" e afins
            vistos.set(titulo[1], (vistos.get(titulo[1]) ?? 0) + 1);
            porEstab[titulo[1]] = {
                cardId: card.id,
                nome: titulo[2].trim(),
                url: card.shortUrl,
                lista: nomeDaLista.get(card.idList) ?? '',
                campos: lerCampos(card, porId),
            };
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                porEstab,
                /** Definição dos campos do quadro — é ela que diz quais campanhas
                 *  têm onde ser marcadas, e com que opções. */
                camposDoQuadro: campos.map(c => ({
                    id: c.id,
                    nome: c.name,
                    tipo: c.type,
                    opcoes: (c.options ?? []).map(o => ({ id: o.id, texto: o.value.text })),
                })),
                boardId,
                diagnostico: {
                    cards: cards.length,
                    comEstabId: Object.keys(porEstab).length,
                    semEstabId: semId,
                    duplicados: Object.fromEntries([...vistos].filter(([, n]) => n > 1)),
                },
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message, elapsedMs: Date.now() - started }) };
    }
};
