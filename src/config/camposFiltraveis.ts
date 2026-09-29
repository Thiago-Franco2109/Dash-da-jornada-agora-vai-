import type { EnrichedPerformanceRow } from '../utils/calculations';
import type { ContextoAvaliacao } from '../utils/avaliarFiltro';
import { getRowCampaignStatus } from '../components/PerformanceTable';
import { CAMPAIGN_TYPES } from './campaignTypes';
import { CAMPAIGN_STATUS_OPTIONS } from './promoCupomFilter';
import {
    OPERADORES_POR_TIPO,
    novoId,
    type CondicaoFiltro,
    type Operador,
    type TipoCampo,
    type ValorFiltro,
} from './filtrosJornada';

/**
 * Catálogo do que dá pra filtrar na Lista jornada 28D.
 *
 * O ponto mais importante aqui: "0 promoções" não existe como campo. Existem
 * QUATRO campos com nome próprio, porque são quatro perguntas com ações
 * diferentes — e um rótulo genérico é justamente o que escondia a diferença.
 */

/** `null` = não se aplica a esta linha. `undefined` = a fonte não sabe (ainda). */
export type ValorExtraido = string | number | boolean | null | undefined;

export interface OpcaoCampo {
    valor: string;
    rotulo: string;
}

export interface CampoFiltravel {
    id: string;
    rotulo: string;
    grupo: string;
    tipo: TipoCampo;
    operadores: Operador[];
    valor: (row: EnrichedPerformanceRow, ctx: ContextoAvaliacao) => ValorExtraido;
    opcoes?: OpcaoCampo[] | ((pool: EnrichedPerformanceRow[]) => OpcaoCampo[]);
    /** Métrica da jornada: quem não lançou responde "não se aplica", nunca 0. */
    soLancados?: boolean;
    /** Fonte externa: enquanto false, o campo aparece desabilitado com o motivo. */
    disponivel?: (ctx: ContextoAvaliacao) => boolean;
    indisponivelMsg?: string;
    /** Linha de ajuda sob o rótulo — é o que desambigua os campos de promoção. */
    ajuda?: string;
    /** Valor inicial ao criar a condição (condição nasce sempre completa). */
    valorPadrao?: ValorFiltro;
    /** Gênero do substantivo do rótulo, pro chip dizer "nenhuma" e não "nenhum". */
    genero?: 'm' | 'f';
}

export const GRUPO = {
    identificacao: 'Identificação',
    carteira: 'Carteira',
    promocoes: 'Promoções (itens do painel)',
    campanhas: 'Campanhas',
    jornada: 'Jornada',
    preLancamento: 'Pré-lançamento',
    contato: 'Contato (CRM)',
} as const;

const idDe = (row: EnrichedPerformanceRow) => String(row.estab_id ?? '');
const unicos = (vs: (string | undefined)[]) =>
    [...new Set(vs.filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

function campoContagemPromo(
    id: string,
    rotulo: string,
    ajuda: string,
    extrair: (r: NonNullable<EnrichedPerformanceRow['promo_resumo']>) => number,
    genero: 'm' | 'f' = 'm',
): CampoFiltravel {
    return {
        id, rotulo, ajuda, genero,
        grupo: GRUPO.promocoes,
        tipo: 'contagem',
        operadores: OPERADORES_POR_TIPO.contagem,
        disponivel: ctx => ctx.promoPronto,
        indisponivelMsg: 'Carregando o status de promoções…',
        // undefined, JAMAIS 0 — zero fabricado é o que faria "= 0" devolver a base inteira.
        valor: row => (row.promo_resumo ? extrair(row.promo_resumo) : undefined),
        valorPadrao: { tipo: 'numero', numero: 0 },
    };
}

export function camposFiltraveisJornada(opts: { isCD: boolean }): CampoFiltravel[] {
    const campos: CampoFiltravel[] = [];

    // ── Carteira ──────────────────────────────────────────────────────────
    campos.push({
        id: 'cidade',
        rotulo: 'Cidade',
        grupo: GRUPO.carteira,
        tipo: 'selecao',
        operadores: OPERADORES_POR_TIPO.selecao,
        // '' não é uma cidade: é ausência de informação (card do Trello).
        valor: row => row.cidade?.trim() || null,
        opcoes: pool => unicos(pool.map(r => r.cidade)).map(c => ({ valor: c, rotulo: c })),
    });

    campos.push({
        id: 'analista',
        rotulo: 'Gestor',
        grupo: GRUPO.carteira,
        tipo: 'selecao',
        operadores: OPERADORES_POR_TIPO.selecao,
        ajuda: 'Cards do Trello ainda sem cidade não têm gestor definido.',
        // Sem cidade, getManagerForPartner devolve 'LAÍS' por default — isso é
        // chute, não dado, e não pode casar com "Gestor é LAÍS".
        valor: row => (row.pre_lancamento?.origem === 'trello' ? null : row.analista || null),
        opcoes: pool => unicos(pool.map(r => r.analista)).map(m => ({ valor: m, rotulo: m })),
    });

    campos.push({
        id: 'carteira_indefinida',
        rotulo: 'Sem cidade/gestor definidos (card do Trello)',
        grupo: GRUPO.carteira,
        tipo: 'booleano',
        operadores: OPERADORES_POR_TIPO.booleano,
        ajuda: 'Parceiro que entrou pelo Trello e o banco ainda não conhece.',
        valor: row => row.pre_lancamento?.origem === 'trello',
        valorPadrao: { tipo: 'nenhum' },
    });

    // ── Identificação ─────────────────────────────────────────────────────
    campos.push({
        id: 'status_parceiro',
        rotulo: 'Status do parceiro',
        grupo: GRUPO.identificacao,
        tipo: 'selecao',
        operadores: OPERADORES_POR_TIPO.selecao,
        valor: row => row.status?.toLowerCase().trim() || null,
        opcoes: pool => unicos(pool.map(r => r.status?.toLowerCase().trim())).map(s => ({ valor: s, rotulo: s })),
    });

    // ── Promoções (itens do painel) — as 4 leituras de "0 promoções" ──────
    if (!opts.isCD) {
        campos.push(campoContagemPromo(
            'promo_aprovados', 'Promoções aprovadas',
            'Itens já aprovados — ativos no painel do cliente. "nenhuma" = não tem promoção no ar.',
            r => r.aprovado, 'f',
        ));
        campos.push(campoContagemPromo(
            'promo_pendentes', 'Itens pendentes',
            'A oferta está pronta no painel — falta o parceiro aceitar. "pelo menos 1" = hora de ligar.',
            r => r.pendente,
        ));
        campos.push(campoContagemPromo(
            'promo_rascunhos', 'Rascunhos no CMS',
            'Item começado e não publicado — trabalho do CS pra terminar.',
            r => r.rascunho,
        ));
        campos.push(campoContagemPromo(
            'promo_itens_criados', 'Itens criados (qualquer status)',
            'Pendente + aprovado + rascunho. "nenhum" = ninguém montou oferta pra ele.',
            r => r.pendente + r.aprovado + r.rascunho,
        ));
        campos.push({
            ...campoContagemPromo(
                'promo_campanhas_sem_item', 'Campanhas da cidade sem item pro parceiro',
                'Campanha rodando na cidade dele em que ele ficou de fora.',
                r => r.semItem, 'f',
            ),
            // Sem localidade mapeada, computePromoResumo não conhece as campanhas
            // da cidade e devolve semItem = 0 — um zero que quer dizer "não sei".
            valor: (row, ctx) => {
                const id = idDe(row);
                if (!id || !ctx.localidadePorEstab.has(id)) return undefined;
                return row.promo_resumo?.semItem;
            },
        });
        campos.push({
            id: 'promo_dias_espera',
            rotulo: 'Dias parado esperando',
            grupo: GRUPO.promocoes,
            tipo: 'contagem',
            operadores: OPERADORES_POR_TIPO.contagem,
            ajuda: 'Há quantos dias a oferta mais antiga está pendente no painel.',
            disponivel: ctx => ctx.promoPronto,
            indisponivelMsg: 'Carregando o status de promoções…',
            // null (e não 0) quando não há data — o próprio dado distingue.
            valor: row => (row.promo_resumo ? row.promo_resumo.pendenteDiasMax : undefined),
            valorPadrao: { tipo: 'numero', numero: 7 },
        });

        // ── Campanhas (status de trabalho do CS) ──────────────────────────
        for (const c of CAMPAIGN_TYPES) {
            campos.push({
                id: `campanha_${c.id}`,
                rotulo: c.label,
                grupo: GRUPO.campanhas,
                tipo: 'selecao',
                operadores: OPERADORES_POR_TIPO.selecao,
                valor: row => getRowCampaignStatus(row, c.id),
                opcoes: OPCOES_STATUS_CAMPANHA,
                valorPadrao: { tipo: 'texto', texto: 'aguardando' },
            });
        }
    }

    // ── Jornada (só pra quem lançou) ──────────────────────────────────────
    const jornada: [string, string, (r: EnrichedPerformanceRow) => ValorExtraido, number][] = [
        ['dias_desde_lancamento', 'Dias desde o lançamento', r => r.dias_desde_lancamento, 7],
        ['total_pedidos', 'Pedidos', r => r.total_pedidos, 0],
        ['pedidos_esperados', 'Pedidos esperados', r => r.pedidos_esperados, 0],
        ['indice_desempenho', 'Índice de desempenho', r => r.indice_desempenho, 1],
        ['priority_stars', 'Prioridade (estrelas)', r => r.priority_stars, 5],
        ['total_avaliacoes', 'Avaliações', r => r.total_avaliacoes ?? null, 0],
    ];
    for (const [id, rotulo, valor, padrao] of jornada) {
        campos.push({
            id, rotulo, valor,
            grupo: GRUPO.jornada,
            tipo: 'numero',
            operadores: OPERADORES_POR_TIPO.numero,
            soLancados: true,
            valorPadrao: { tipo: 'numero', numero: padrao },
        });
    }
    campos.push({
        id: 'onboarding_pausado',
        rotulo: 'Onboarding pausado',
        grupo: GRUPO.jornada,
        tipo: 'booleano',
        operadores: OPERADORES_POR_TIPO.booleano,
        ajuda: 'Parceiro que não está operando (problema operacional). Os dias de pausa não contam na jornada.',
        valor: row => !!row.onboarding_pausado,
        valorPadrao: { tipo: 'nenhum' },
    });
    campos.push({
        id: 'city_weight',
        rotulo: 'Peso da cidade',
        grupo: GRUPO.jornada,
        tipo: 'numero',
        operadores: OPERADORES_POR_TIPO.numero,
        valor: r => r.city_weight,
        valorPadrao: { tipo: 'numero', numero: 1 },
    });
    campos.push({
        id: 'commercial_relevance',
        rotulo: 'Relevância comercial',
        grupo: GRUPO.jornada,
        tipo: 'numero',
        operadores: OPERADORES_POR_TIPO.numero,
        valor: r => r.commercial_relevance ?? null,
        valorPadrao: { tipo: 'numero', numero: 3 },
    });

    // ── Pré-lançamento ────────────────────────────────────────────────────
    if (!opts.isCD) {
        campos.push({
            id: 'em_pre_lancamento',
            rotulo: 'É pré-lançamento',
            grupo: GRUPO.preLancamento,
            tipo: 'booleano',
            operadores: OPERADORES_POR_TIPO.booleano,
            ajuda: 'Assinou contrato e ainda não abriu a loja.',
            valor: row => !!row.pre_lancamento,
            valorPadrao: { tipo: 'nenhum' },
        });
        campos.push({
            id: 'dias_em_onboarding',
            rotulo: 'Dias em onboarding',
            grupo: GRUPO.preLancamento,
            tipo: 'numero',
            operadores: OPERADORES_POR_TIPO.numero,
            ajuda: 'Só se aplica a quem ainda não lançou.',
            valor: row => (row.pre_lancamento ? row.pre_lancamento.dias : null),
            valorPadrao: { tipo: 'numero', numero: 7 },
        });
        campos.push({
            id: 'etapa_onboarding',
            rotulo: 'Etapa do Trello',
            grupo: GRUPO.preLancamento,
            tipo: 'selecao',
            operadores: OPERADORES_POR_TIPO.selecao,
            valor: row => row.pre_lancamento?.etapa ?? null,
            opcoes: pool => unicos(pool.map(r => r.pre_lancamento?.etapa ?? undefined)).map(e => ({ valor: e, rotulo: e })),
        });
    }

    // ── Contato (CRM) ─────────────────────────────────────────────────────
    const camposContato: [string, string, 'lastContact' | 'nextFollowUp', string][] = [
        ['ultimo_contato', 'Último contato', 'lastContact', '"Vazio" = nunca registrado no CRM.'],
        ['proximo_follow_up', 'Próximo follow-up', 'nextFollowUp', '"Atrasado" usa a mesma régua do sino de alertas.'],
    ];
    for (const [id, rotulo, chave, ajuda] of camposContato) {
        campos.push({
            id, rotulo, ajuda,
            grupo: GRUPO.contato,
            tipo: 'data',
            operadores: OPERADORES_POR_TIPO.data,
            disponivel: ctx => ctx.crmPronto,
            indisponivelMsg: 'Carregando as notas do CRM…',
            valor: (row, ctx) => {
                const id2 = idDe(row);
                if (!id2) return undefined;                       // sem chave: não dá pra saber
                return ctx.notaPorParceiro[id2]?.[chave] ?? null; // null = nunca registrado
            },
            valorPadrao: { tipo: 'nenhum' },
        });
    }

    return campos;
}

/** Inclui 'confirmado', que existe como PromoStatus mas faltava nas opções antigas. */
export const OPCOES_STATUS_CAMPANHA: OpcaoCampo[] = [
    ...CAMPAIGN_STATUS_OPTIONS.map(o => ({ valor: o.value, rotulo: o.label })),
    { valor: 'confirmado', rotulo: 'Confirmado' },
];

/**
 * Atalhos do topo do seletor. Materializam uma condição VISÍVEL e editável —
 * o oposto de esconder a semântica num rótulo.
 */
export interface SituacaoComum {
    id: string;
    rotulo: string;
    icone: string;
    condicao: () => CondicaoFiltro;
}

const cond = (campoId: string, operador: Operador, valor: ValorFiltro): CondicaoFiltro => ({
    tipo: 'condicao', id: novoId(), campoId, operador, valor,
});

export const SITUACOES_COMUNS: SituacaoComum[] = [
    {
        id: 'sem_promo_aprovada', rotulo: 'Sem promoção aprovada', icone: 'block',
        condicao: () => cond('promo_aprovados', 'igual', { tipo: 'numero', numero: 0 }),
    },
    {
        id: 'esperando_parceiro', rotulo: 'Esperando o parceiro responder', icone: 'hourglass_top',
        condicao: () => cond('promo_pendentes', 'maior_ou_igual', { tipo: 'numero', numero: 1 }),
    },
    {
        id: 'sem_item_criado', rotulo: 'Sem item criado no CMS', icone: 'edit_note',
        condicao: () => cond('promo_itens_criados', 'igual', { tipo: 'numero', numero: 0 }),
    },
    {
        id: 'fora_da_campanha', rotulo: 'Ficou de fora da campanha da cidade', icone: 'domain_disabled',
        condicao: () => cond('promo_campanhas_sem_item', 'maior_ou_igual', { tipo: 'numero', numero: 1 }),
    },
    {
        id: 'follow_up_vencido', rotulo: 'Follow-up vencido', icone: 'event_busy',
        condicao: () => cond('proximo_follow_up', 'atrasado', { tipo: 'nenhum' }),
    },
    {
        id: 'prioridade_critica', rotulo: 'Prioridade crítica (4★ ou 5★)', icone: 'local_fire_department',
        condicao: () => cond('priority_stars', 'maior_ou_igual', { tipo: 'numero', numero: 4 }),
    },
];
