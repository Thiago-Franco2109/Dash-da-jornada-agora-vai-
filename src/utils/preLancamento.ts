import { enrichPartnerData, type EnrichedPerformanceRow } from './calculations';
import type { ParceiroPendente } from '../hooks/useOnboardingPendente';
import type { CardTrelloOnboarding, EtapaTrello } from '../hooks/useOnboardingTrello';
import type { ProductModeKey } from '../config/managerMapping';

/**
 * Parceiros que assinaram contrato e ainda NÃO lançaram, prontos pra entrar na
 * Lista jornada 28D e no CRM Jornada.
 *
 * Existe porque o CS já oferece campanha durante o onboarding: se ele só puder
 * trabalhar depois que a loja abre, muitas vezes é tarde. A `jornada.ts` exclui
 * `delivery = 0` de propósito, então essas linhas são montadas aqui, no front.
 *
 * DUAS FONTES, nesta ordem:
 *   1. banco  (`onboarding-pendentes`) — completo, mas a réplica que as
 *      functions leem tem ~1 dia de atraso;
 *   2. Trello (`onboarding-trello`) — ao vivo, mas o card só tem id e nome.
 * O banco sempre ganha; o Trello só antecipa quem ainda não chegou lá. Como a
 * chave é o estabId, no dia seguinte a linha troca de origem sozinha, sem
 * duplicar e sem estado persistido.
 */

/**
 * Listas do board que não são onboarding em andamento (conferido no board).
 * As demais listas fechadas já são ignoradas: a function calcula
 * `closed = card.closed || lista.closed`.
 */
const LISTAS_FORA_DA_JORNADA = new Set(['modelo', 'desistencias | sem retorno']);

function normalizar(texto: string): string {
    return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Faixas de urgência do onboarding — as mesmas da tela "Acompanhar Onboarding". */
export function urgenciaOnboarding(dias: number | null | undefined): 'ok' | 'atencao' | 'critico' {
    if (dias == null) return 'ok';
    if (dias >= 14) return 'critico';
    if (dias >= 7) return 'atencao';
    return 'ok';
}

function montarLinha(args: {
    estabId: string;
    nome: string;
    cidade: string;
    mode: ProductModeKey;
    relMap: Record<string, number>;
    preLancamento: NonNullable<EnrichedPerformanceRow['pre_lancamento']>;
}): EnrichedPerformanceRow {
    const { estabId, nome, cidade, mode, relMap, preLancamento } = args;

    const minimal = {
        cidade,
        estabelecimento: nome,
        estab_id: estabId,
        // Mesmo vocabulário do fallback da jornada.ts para delivery fora de (1,2,4,5).
        status: 'pendente',
        lancamento: '',
        desempenho: '',
        week_1: 0, week_2: 0, week_3: 0, week_4: 0,
    };

    // Chamamos o enrich não pelos números (todos seriam NaN sem lançamento), mas
    // porque é ele que resolve analista, peso da cidade e estado de contato.
    let row = enrichPartnerData(minimal, undefined, undefined, mode);

    row = {
        ...row,
        // `dias_desde_lancamento` não é um número, é um eixo de regras: dirige as
        // abas de período, a cadência D7/D14 e a barra "dia N/28". Escrever aqui
        // os dias de onboarding faria o parceiro cair na aba errada e disparar
        // contato de cadência. O relógio do onboarding vive só em pre_lancamento.
        dias_desde_lancamento: 0,
        pedidos_esperados: 0,
        indice_desempenho: 0,
        priority_stars: 0,
        total_pedidos: 0,
        // 0 aqui pintaria badge âmbar "0" ou vermelho "Crítico" numa loja fechada.
        total_avaliacoes: undefined,
        pre_lancamento: preLancamento,
    };

    const rel = relMap[estabId];
    if (rel != null) row = { ...row, commercial_relevance: rel };

    return row;
}

export function buildPreLancamentoRows(args: {
    pendentes: ParceiroPendente[];
    cards: CardTrelloOnboarding[];
    etapasPorEstabId: Map<string, EtapaTrello>;
    /** estab_ids que já lançaram — card deles duplicaria a loja na tela. */
    jaLancados: Set<string>;
    relMap: Record<string, number>;
    mode: ProductModeKey;
}): EnrichedPerformanceRow[] {
    const { pendentes, cards, etapasPorEstabId, jaLancados, relMap, mode } = args;

    const doBanco = new Set(pendentes.map(p => p.estabId));
    const linhas: EnrichedPerformanceRow[] = [];

    for (const p of pendentes) {
        if (jaLancados.has(p.estabId)) continue;
        const etapa = etapasPorEstabId.get(p.estabId);
        linhas.push(montarLinha({
            estabId: p.estabId,
            nome: p.estabelecimento,
            cidade: p.cidade,
            mode,
            relMap,
            preLancamento: {
                origem: 'banco',
                dias: p.diasPendente,
                etapa: etapa?.etapa ?? null,
                diasNaEtapa: etapa?.diasNaEtapa ?? null,
                cardUrl: etapa?.cardUrl,
                dataAdesao: p.dataAdesao,
            },
        }));
    }

    for (const card of cards) {
        if (!card.estabId) continue;                 // modelo / card fora do padrão "{id} - {nome}"
        if (card.closed) continue;                   // já cobre card e lista arquivados
        if (doBanco.has(card.estabId)) continue;     // banco manda
        if (jaLancados.has(card.estabId)) continue;  // já está na jornada de verdade
        if (LISTAS_FORA_DA_JORNADA.has(normalizar(card.etapa))) continue;

        linhas.push(montarLinha({
            estabId: card.estabId,
            nome: card.nome.replace(/^\s*\d+\s*-\s*/, ''),
            cidade: '',                              // o card não sabe a cidade — não inventar
            mode,
            relMap,
            preLancamento: {
                origem: 'trello',
                dias: null,                          // sem data de assinatura no card
                etapa: card.etapa,
                diasNaEtapa: card.diasNaEtapa,
                cardUrl: card.cardUrl,
            },
        }));
    }

    return linhas;
}
