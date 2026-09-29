import {
    calculateIndiceDesempenho,
    calculatePedidosEsperados,
    calculatePriorityStars,
    type EnrichedPerformanceRow,
} from './calculations';
import { diasPausados, estaPausado, type PausaMap } from '../config/pausaOnboarding';

/**
 * Desconta da jornada os dias em que o parceiro esteve pausado.
 *
 * `dias_desde_lancamento` é "Dias Ativo" na tela — dia em que a loja estava de
 * pé, não idade do contrato. Quem parou de operar não deve continuar sendo
 * medido contra a meta de 30 pedidos em 28 dias, então os dias de pausa saem
 * dessa conta e tudo que deriva dela (pedidos esperados, índice, estrelas) é
 * recalculado com o número menor.
 *
 * O que NÃO é mexido de propósito: as estrelas continuam saindo do mesmo
 * cálculo, só que sobre o dia congelado. Um parceiro pausado no dia 10 com zero
 * pedido segue em prioridade 5 — o correto, ele está mesmo parado. Quem precisa
 * tirá-lo da fila de cobrança usa `onboarding_pausado`, que diz o motivo; zerar
 * a estrela esconderia o problema em vez de explicá-lo.
 *
 * Aplique DEPOIS de enrichPartnerData, como overlayCampanhas.
 */
export function aplicarPausaOnboarding(
    row: EnrichedPerformanceRow,
    map: PausaMap,
    hoje = new Date(),
): EnrichedPerformanceRow {
    const id = String(row.estab_id ?? '').trim();
    const pausa = id ? map[id] : undefined;
    if (!pausa) return row;

    const dias_pausados = diasPausados(pausa, hoje);
    const base: EnrichedPerformanceRow = {
        ...row,
        pausa,
        onboarding_pausado: estaPausado(pausa),
        dias_pausados,
    };

    // Pausa aberta hoje ainda não descontou nada — nada a recalcular.
    if (dias_pausados <= 0 || !row.lancamento) return base;

    const dias_desde_lancamento = Math.max(0, row.dias_desde_lancamento - dias_pausados);
    const pedidos_esperados = calculatePedidosEsperados(dias_desde_lancamento);
    const indice_desempenho = calculateIndiceDesempenho(row.total_pedidos, pedidos_esperados);
    const priority_stars = calculatePriorityStars(
        row,
        dias_desde_lancamento,
        row.total_pedidos,
        indice_desempenho,
        row.city_weight,
    );

    return { ...base, dias_desde_lancamento, pedidos_esperados, indice_desempenho, priority_stars };
}
