import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloFetch } from './_shared/trello';
import { getConnection } from './_shared/db';
import type { RowDataPacket } from 'mysql2';

/**
 * Contratos do Cardápio Digital — valor mensal por estabelecimento.
 *
 * A fonte do VALOR é o Trello: os campos personalizados dos quadros de
 * financeiro/onboarding/retenção. O banco entra só como resolvedor de
 * identidade (ver "Aliases" abaixo) — nenhum valor sai dele.
 *
 * Substitui a lista fixa que vivia em src/config/cdContracts.ts, que casava
 * parceiro por NOME e estava congelada em jun/2026.
 *
 * ---- Como o valor é derivado ----
 *
 * O campo "Valor total contrato:" guarda duas coisas diferentes: no plano
 * mensal é a mensalidade, no plano anual é o contrato inteiro (719,10 =
 * 12 × 59,93). Quem diz qual é são "Plano / Financeiro" e "Tempo de
 * contrato" — um ou outro está preenchido em 84 dos 86 cards com valor.
 * Quando existe o campo "Mensalidade" (mais novo), ele ganha de todos.
 *
 * ---- Aliases ----
 *
 * A mesma loja costuma ter dois cadastros: o do marketplace e o do CD. O
 * card do Trello aponta pra um, a planilha de desempenho pode trazer o
 * outro (Massas D'Ouro é card 28326 e cobrança 28311). O que liga os dois é
 * o CPF/CNPJ do pagador em `dados_faturamento`, então montamos um mapa
 * estabelecimento_id → todos os ids do mesmo documento e devolvemos o
 * contrato sob todos eles.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=600' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** Quadros que carregam os campos de contrato do CD, em ordem de precedência. */
const BOARDS = [
    '68f28966feff4baa7c15e86b', // [FINANCEIRO] Cardápio Digital - Treinamento e Verificar pagamentos
    '68e578eb64460abeb1594caa', // [ONBOARDING] Cardápio Digital
    '6a0e26e9d9179fabead70f67', // [RETENÇÃO] Serviços Bigou
];

/**
 * Listas onde um card significa contrato vigente.
 *
 * Medido contra as cobranças de CD de out/2026: "Treinado: Acompanhar
 * Pagamento" tem 39 cobranças em 64 cards (61%), e nenhuma outra lista passa
 * de 17% — "Conculído: Cancelados" tem 1/21, "Demanda Concluída" 1/31,
 * "Treinado: Teste Grátis" 0/13. "Enviado ao SC" entra porque é contrato
 * assinado que só não vendeu: a mensalidade corre do mesmo jeito.
 *
 * Fora ficam também "Conferir Saldo em Aberto" e "Em Recesso / Aguardando",
 * por decisão de contar inadimplente/suspenso como cancelado.
 */
const LISTAS_ATIVAS = new Set([
    'Treinado: Acompanhar Pagamento',
    'Enviado ao SC (Não Houveram Vendas)',
]);

/** Quantas mensalidades cabem em "Valor total contrato:", por rótulo de plano. */
const PARCELAS_POR_PLANO: Record<string, number> = {
    // campo "Plano / Financeiro"
    'Mensalidade': 1,
    'Assinatura': 1,
    '3 meses': 3,
    '6 meses': 6,
    '12 meses': 12,
    'Teste Grátis (30 Dias)': 0,
    // campo "Tempo de contrato"
    'Assinatura Mensal': 1,
    '3x 89,90': 3,
    '6x 84,90': 6,
    '12x 79,90': 12,
};

/** Nenhum plano de CD passa disso por mês — acima, o campo só pode ser total. */
const TETO_MENSALIDADE = 200;

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

export interface ContratoCD {
    estabelecimento_id: number;
    estabelecimento: string;
    /** Mensalidade em reais, já normalizada a partir do plano. */
    valor_mensal: number;
    /** Rótulo do plano como está no card ("Mensalidade", "12 meses", ...). */
    plano?: string;
    forma_pagamento?: string;
    link_contrato?: string;
    /** Lista do Trello onde o card está — o que define `ativo`. */
    lista: string;
    ativo: boolean;
    card_url: string;
    /** true quando o valor veio de "Valor total contrato:" dividido pelo plano. */
    derivado_do_total: boolean;
}

/** Lê os campos personalizados de um card como um dicionário nome → valor. */
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
        if (bruto !== undefined) out[campo.name] = bruto;
    }
    return out;
}

function numero(valor: string | undefined): number | undefined {
    if (valor === undefined || valor.trim() === '') return undefined;
    const n = Number(valor.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Mensalidade a partir dos campos do card.
 *
 * Devolve `undefined` quando o card não diz nada sobre dinheiro (teste
 * grátis, card de instrução, campo em branco) — esses não viram contrato.
 */
function derivarMensalidade(
    campos: Record<string, string>,
): { valor: number; derivado: boolean } | undefined {
    const mensalidade = numero(campos['Mensalidade']);
    if (mensalidade !== undefined && mensalidade > 0) {
        return { valor: mensalidade, derivado: false };
    }

    const total = numero(campos['Valor total contrato:']);
    if (total === undefined || total <= 0) return undefined;

    const rotulo = campos['Plano / Financeiro'] ?? campos['Tempo de contrato'];
    const parcelas = rotulo ? PARCELAS_POR_PLANO[rotulo] : undefined;

    // Teste grátis: contrato existe, mensalidade não.
    if (parcelas === 0) return undefined;

    if (parcelas !== undefined && parcelas > 0) {
        const mensal = total / parcelas;
        // Guarda contra card com rótulo errado: há "Assinatura Mensal" com
        // 719,10 no valor, que é contrato anual rotulado errado.
        if (mensal <= TETO_MENSALIDADE) {
            return { valor: arredondar(mensal), derivado: parcelas > 1 };
        }
        return { valor: arredondar(total / 12), derivado: true };
    }

    // Sem rótulo nenhum: só dá pra confiar quando o número já é uma
    // mensalidade plausível. Acima do teto seria chute sobre o prazo.
    if (total <= TETO_MENSALIDADE) return { valor: arredondar(total), derivado: false };
    return { valor: arredondar(total / 12), derivado: true };
}

function arredondar(valor: number): number {
    return Math.round(valor * 100) / 100;
}

/** Lê os contratos de um quadro. Cards sem `<id> - <nome>` no título são ignorados. */
async function lerQuadro(boardId: string, key: string, token: string): Promise<ContratoCD[]> {
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

    const contratos: ContratoCD[] = [];
    for (const card of cards) {
        const titulo = card.name.match(/^\s*(\d{3,6})\s*[-–]\s*(.+)$/);
        if (!titulo) continue; // card de modelo/instrução

        const valores = lerCampos(card, porId);
        const mensal = derivarMensalidade(valores);
        if (!mensal) continue;

        const lista = nomeDaLista.get(card.idList) ?? '';
        contratos.push({
            estabelecimento_id: Number(titulo[1]),
            estabelecimento: titulo[2].trim(),
            valor_mensal: mensal.valor,
            plano: valores['Plano / Financeiro'] ?? valores['Tempo de contrato'],
            forma_pagamento: valores['Forma de Pagamento'],
            link_contrato: valores['Link do Contrato'],
            lista,
            ativo: LISTAS_ATIVAS.has(lista),
            card_url: card.shortUrl,
            derivado_do_total: mensal.derivado,
        });
    }
    return contratos;
}

/**
 * Mapa estabelecimento_id → ids irmãos (cadastros da mesma loja).
 *
 * Dois critérios, nessa ordem:
 *
 * 1. Mesmo CPF/CNPJ de pagador em `dados_faturamento`. É o mais forte, e
 *    pega a maioria (Rosestolato 28170/28204, Massas D'Ouro 28311/28326).
 *
 * 2. Mesmo nome DENTRO da mesma localidade, em grupo de exatamente dois
 *    cadastros, sendo um deles o do cardápio digital. Existe porque muita
 *    loja fez um cadastro com CPF e outro com CNPJ do mesmo dono — Like Açaí
 *    é CNPJ "IGOR PEREIRA DE SA" num e CPF "Igor Pereira de Sa" no outro, e
 *    o critério 1 não liga os dois.
 *
 *    Isto NÃO é o casamento por nome que foi removido daqui: aquele comparava
 *    nome contra nome em toda a base, e há 1.013 nomes de loja repetidos entre
 *    localidades diferentes. Este é restrito a um par na mesma localidade com
 *    o formato "cadastro do marketplace + cadastro do CD" — 89 pares no banco
 *    inteiro —, e só decide QUAL cadastro da mesma loja, nunca qual loja.
 *
 * Se o banco não responder devolvemos um mapa vazio: perde-se o alcance extra
 * do alias, mas o casamento direto por id continua funcionando.
 */
async function carregarAliases(): Promise<Map<number, number[]>> {
    let conn;
    try {
        conn = await getConnection();

        const [porDoc] = await conn.query<RowDataPacket[]>(
            `SELECT DISTINCT ve.estabelecimento_id AS eid, df.cpf_cnpj AS doc
               FROM venda v
               JOIN venda_estabelecimento ve ON ve.venda_id = v.id
               JOIN dados_faturamento df ON df.id = v.dados_faturamento_id
              WHERE df.cpf_cnpj IS NOT NULL AND df.cpf_cnpj <> ''`,
        );

        const [porNome] = await conn.query<RowDataPacket[]>(
            `SELECT GROUP_CONCAT(id) AS ids
               FROM estabelecimento
              GROUP BY LOWER(TRIM(nome)), localidade_id
             HAVING COUNT(*) = 2 AND SUM(cardapio_digital = 1) = 1`,
        );

        const grupos: number[][] = [];

        const porDocumento = new Map<string, number[]>();
        for (const l of porDoc) {
            const doc = String(l.doc).replace(/\D/g, '');
            const eid = Number(l.eid);
            if (!doc || !Number.isFinite(eid)) continue;
            const atual = porDocumento.get(doc) ?? [];
            if (!atual.includes(eid)) atual.push(eid);
            porDocumento.set(doc, atual);
        }
        grupos.push(...[...porDocumento.values()].filter(ids => ids.length > 1));

        for (const l of porNome) {
            const ids = String(l.ids).split(',').map(Number).filter(Number.isFinite);
            if (ids.length === 2) grupos.push(ids);
        }

        const porEstabelecimento = new Map<number, number[]>();
        for (const ids of grupos) {
            for (const id of ids) {
                const atual = porEstabelecimento.get(id) ?? [];
                for (const irmao of ids) {
                    if (irmao !== id && !atual.includes(irmao)) atual.push(irmao);
                }
                porEstabelecimento.set(id, atual);
            }
        }
        return porEstabelecimento;
    } catch {
        return new Map();
    } finally {
        await conn?.end().catch(() => undefined);
    }
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
    if (!key || !token) {
        return {
            statusCode: 500,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: 'Variáveis de ambiente ausentes: TRELLO_API_KEY, TRELLO_TOKEN' }),
        };
    }

    try {
        const [quadros, aliases] = await Promise.all([
            Promise.all(BOARDS.map(id => lerQuadro(id, key, token))),
            carregarAliases(),
        ]);

        // Precedência: o primeiro quadro da lista ganha, e dentro do mesmo
        // quadro um card ativo ganha de um arquivado em lista de cancelado.
        const porEstabelecimento = new Map<number, ContratoCD>();
        for (const contratos of quadros) {
            for (const c of contratos) {
                const atual = porEstabelecimento.get(c.estabelecimento_id);
                if (!atual || (!atual.ativo && c.ativo)) {
                    porEstabelecimento.set(c.estabelecimento_id, c);
                }
            }
        }

        // Cada contrato vale UMA vez, no id do card que o originou. Os ids
        // irmãos entram só como atalho de busca em `aliases` — espelhar o
        // contrato neles contaria a mesma loja várias vezes no MRR (Ana
        // Açaiteria tem 4 cadastros, Ebenézer 3).
        const atalhos: Record<number, number> = {};
        for (const id of porEstabelecimento.keys()) {
            for (const irmao of aliases.get(id) ?? []) {
                if (!porEstabelecimento.has(irmao)) atalhos[irmao] = id;
            }
        }

        const contratos = [...porEstabelecimento.values()];
        const ativos = contratos.filter(c => c.ativo);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                atualizado_em: new Date().toISOString(),
                mrr_total: arredondar(ativos.reduce((s, c) => s + c.valor_mensal, 0)),
                contratos_ativos: ativos.length,
                contratos,
                /** estabelecimento_id sem card → id do card da mesma loja. */
                aliases: atalhos,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};
