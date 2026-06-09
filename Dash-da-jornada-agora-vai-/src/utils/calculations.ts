import type { PerformanceRow } from '../components/PerformanceTable';
import { calcularPedidosPorDia, findContractForPartner, isMrrEmRisco, type ContractPayment, type ContractStatus } from '../config/cdContracts';
import { getManagerForPartner, type ProductModeKey } from '../config/managerMapping';
import { getPartnerState, type PartnerState } from '../config/partnerState';

export type CalculatedMetrics = {
    dias_desde_lancamento: number;
    total_pedidos: number;
    pedidos_esperados: number;
    indice_desempenho: number;
    city_weight: number;
    priority_stars: number;
    logo_url?: string;
    /** Métricas específicas da aba Todas as Lojas (CD desempenho) */
    tendencia_pedidos?: 'queda' | 'estavel' | 'alta';
    semanas_zeradas?: number;
    media_semanal?: number;
    risco_churn?: number;
    /** Contrato CD */
    valor_contrato?: number;
    contrato_status?: ContractStatus;
    contrato_pagamento?: ContractPayment;
    contrato_vencimento?: string;
    pedidos_por_dia?: number;
    mrr_em_risco?: boolean;
} & PartnerState;

export type EnrichedPerformanceRow = PerformanceRow & CalculatedMetrics;

export const DESEMPENHO_WEEKS_COUNT = 12;

export function getWeekValue(partner: PerformanceRow, weekNum: number): number {
    const key = `week_${weekNum}` as keyof PerformanceRow;
    const val = partner[key];
    return typeof val === 'number' ? val : 0;
}

// 1) Total_Pedidos (onboarding — primeiras 4 semanas)
export const calculateTotalPedidos = (partner: PerformanceRow): number => {
    return (partner.week_1 || 0) + (partner.week_2 || 0) + (partner.week_3 || 0) + (partner.week_4 || 0);
};

/** Soma das 12 semanas na aba Todas as Lojas (S1 = semana atual) */
export const calculateTotalPedidosDesempenho = (partner: PerformanceRow): number => {
    let total = 0;
    for (let w = 1; w <= DESEMPENHO_WEEKS_COUNT; w++) {
        total += getWeekValue(partner, w);
    }
    return total;
};

// 2) Dias_Desde_Lancamento (Assuming 'today' is the current date when this runs, 
// for testing consistency we can use a fixed 'today' or `new Date()`. Given the mock data is around Feb 2026, 
// let's use the actual current date or for now, calculate relative to real `new Date()`.
// Warning: If the mock data is in the future relative to today, this will be negative.
// To ensure it works with the mock data, let's assume 'today' is 28/03/2026 to see 30 days of data, 
// OR just use `new Date()`. I will use new Date() and we will see.
export const calculateDiasDesdeLancamento = (lancamentoStr: string): number => {
    const [d, m, y] = lancamentoStr.split('/');
    const lancamentoDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const today = new Date();

    // Calculate difference in time
    const timeDiff = today.getTime() - lancamentoDate.getTime();

    // Calculate difference in days
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

    // If it's a future date, return 0 for now
    return Math.max(0, daysDiff);
};

// 3) Meta proporcional ao tempo
export const calculatePedidosEsperados = (dias: number): number => {
    if (dias === 0) return 0;
    // Freeze expected orders at max 30 if > 28 days
    const cappedDays = Math.min(dias, 28);
    return Math.round((cappedDays / 28) * 30); // Round to integer
};

// 4) Índice de desempenho
export const calculateIndiceDesempenho = (totalPedidos: number, pedidosEsperados: number): number => {
    if (pedidosEsperados === 0) return totalPedidos > 0 ? 1 : 0;
    return totalPedidos / pedidosEsperados;
};

// City Priority Weight
export const getCityWeight = (city: string): number => {
    const weights: Record<number, string[]> = {
        5: ['Natividade', 'Ubá'],
        4: ['Cláudio', 'Bom Jesus do Itabapoana', 'Bom Jesus do Norte', 'Barroso'],
        3: ['Silva Jardim', 'Paraopeba', 'Caetanópolis', 'Carandaí', 'Espera Feliz', 'Guaçuí', 'Cordeiro', 'Cantagalo'],
        2: ['Bicas', 'Ervália'],
        1: ['Santos Dumont', 'Além Paraíba', 'Muriaé']
    };

    for (let weight = 5; weight >= 1; weight--) {
        if (weights[weight].includes(city)) return weight;
    }
    return 1; // Default
};

// Priority Score Calculation
export const calculatePriorityStars = (
    partner: PerformanceRow,
    dias: number,
    totalPedidos: number,
    indiceDesempenho: number,
    cityWeight: number
): number => {
    // Edge Cases
    if (partner.status === 'suspenso') return 5;
    if (totalPedidos === 0 && dias > 7) return 5;
    if (dias < 3) return 1; // Grace period: do not classify as critical yet

    // Base score by performance index
    let baseScore = 1;
    if (indiceDesempenho < 0.2) baseScore = 5;
    else if (indiceDesempenho < 0.4) baseScore = 4;
    else if (indiceDesempenho < 0.7) baseScore = 3;
    else if (indiceDesempenho < 1.0) baseScore = 2;

    // Final Score adjustment by city weight
    // Only apply strategic city weight urgency if the partner is NOT meeting the goal (baseScore > 1)
    let finalScore = baseScore;
    if (baseScore > 1) {
        finalScore = baseScore + (cityWeight - 1);
    }

    // Limit between 1 and 5
    return Math.max(1, Math.min(5, finalScore));
};

export type TendenciaPedidos = 'queda' | 'estavel' | 'alta';

/** Onboarding: semana 1 = primeira semana após lançamento */
export const calculateTendenciaPedidos = (partner: PerformanceRow): TendenciaPedidos => {
    const { week_1: w1, week_2: w2, week_3: w3, week_4: w4 } = partner;
    const recentAvg = (w3 + w4) / 2;
    const olderAvg = (w1 + w2) / 2;

    if (w4 === 0 && w3 === 0 && (w1 + w2) > 0) return 'queda';
    if (w4 === 0 && w3 > 0) return 'queda';
    if (recentAvg < olderAvg * 0.7 && olderAvg > 0) return 'queda';
    if (recentAvg > olderAvg * 1.2 && recentAvg > 0) return 'alta';
    return 'estavel';
};

/** Desempenho CD: semana 1 = últimos 7 dias (mais recente) */
export const calculateTendenciaPedidosDesempenho = (partner: PerformanceRow): TendenciaPedidos => {
    const w1 = partner.week_1;
    const w2 = partner.week_2;
    const w3 = partner.week_3;
    const w4 = partner.week_4;
    const recentAvg = (w1 + w2) / 2;
    const olderAvg = (w3 + w4) / 2;

    if (w1 === 0 && w2 === 0 && (w3 + w4) > 0) return 'queda';
    if (w1 === 0 && w2 > 0) return 'queda';
    if (recentAvg < olderAvg * 0.7 && olderAvg > 0) return 'queda';
    if (recentAvg > olderAvg * 1.2 && recentAvg > 0) return 'alta';
    return 'estavel';
};

export const calculateSemanasZeradas = (partner: PerformanceRow): number => {
    let count = 0;
    for (const w of [partner.week_4, partner.week_3, partner.week_2, partner.week_1]) {
        if (w === 0) count++;
        else break;
    }
    return count;
};

/** Conta semanas consecutivas zeradas a partir da semana atual (S1) */
export const calculateSemanasZeradasDesempenho = (partner: PerformanceRow): number => {
    let count = 0;
    for (let w = 1; w <= DESEMPENHO_WEEKS_COUNT; w++) {
        if (getWeekValue(partner, w) === 0) count++;
        else break;
    }
    return count;
};

export const calculateMediaSemanal = (partner: PerformanceRow): number => {
    return (partner.week_1 + partner.week_2 + partner.week_3 + partner.week_4) / 4;
};

export const calculateMediaSemanalDesempenho = (partner: PerformanceRow): number => {
    return calculateTotalPedidosDesempenho(partner) / DESEMPENHO_WEEKS_COUNT;
};

export const parseDesempenhoPercentual = (raw: string): number | null => {
    if (!raw?.trim()) return null;
    const num = parseFloat(raw.replace('%', '').replace(',', '.').trim());
    return isNaN(num) ? null : num;
};

const CHURN_WEEKLY_ORDERS_THRESHOLD = 7;

/** Risco de churn (1=saudável, 5=crítico) baseado em tendência semanal */
export const calculateRiscoChurn = (
    partner: PerformanceRow,
    tendencia: TendenciaPedidos,
    semanasZeradas: number,
    totalPedidos: number,
    cityWeight: number,
): number => {
    if (partner.status === 'suspenso') return 5;
    if (semanasZeradas >= 2 && totalPedidos > 0) return 5;
    if (totalPedidos === 0) return 4;

    const pedidosSemanaAtual = partner.week_1;
    if (pedidosSemanaAtual < CHURN_WEEKLY_ORDERS_THRESHOLD) {
        return pedidosSemanaAtual === 0 ? 5 : 4;
    }

    if (tendencia === 'queda' && semanasZeradas >= 1) return 4;
    if (tendencia === 'queda') return 4;

    const desempPct = parseDesempenhoPercentual(partner.desempenho);
    if (desempPct != null && desempPct < 30) return 4;
    if (desempPct != null && desempPct < 50) return 3;

    let score = tendencia === 'alta' ? 1 : 2;
    if (score > 1 && cityWeight >= 4) score = Math.min(5, score + 1);
    return score;
};

export const enrichPartnerData = (
    partner: PerformanceRow,
    logoUrl?: string,
    noCityIndex?: number,
    productMode: ProductModeKey = 'marketplace',
): EnrichedPerformanceRow => {
    const total_pedidos = calculateTotalPedidos(partner);
    const dias_desde_lancamento = calculateDiasDesdeLancamento(partner.lancamento);
    const pedidos_esperados = calculatePedidosEsperados(dias_desde_lancamento);
    const indice_desempenho = calculateIndiceDesempenho(total_pedidos, pedidos_esperados);
    const city_weight = getCityWeight(partner.cidade);
    const priority_stars = calculatePriorityStars(partner, dias_desde_lancamento, total_pedidos, indice_desempenho, city_weight);

    const analista = getManagerForPartner(partner.cidade, partner.analista || '', noCityIndex, productMode);
    const state = getPartnerState(partner.estab_id || partner.estabelecimento);
    
    return {
        ...partner,
        ...state,
        total_pedidos,
        dias_desde_lancamento,
        pedidos_esperados,
        indice_desempenho,
        city_weight,
        priority_stars,
        analista,
        logo_url: logoUrl || partner.logo_url
    };
};

/** Enriquecimento para aba Todas as Lojas — sem jornada de lançamento, foco em churn */
export const enrichDesempenhoPartnerData = (
    partner: PerformanceRow,
    logoUrl?: string,
    noCityIndex?: number,
    productMode: ProductModeKey = 'cardapio_digital',
): EnrichedPerformanceRow => {
    const total_pedidos = calculateTotalPedidosDesempenho(partner);
    const tendencia_pedidos = calculateTendenciaPedidosDesempenho(partner);
    const semanas_zeradas = calculateSemanasZeradasDesempenho(partner);
    const media_semanal = calculateMediaSemanalDesempenho(partner);
    const city_weight = getCityWeight(partner.cidade);
    const risco_churn = calculateRiscoChurn(partner, tendencia_pedidos, semanas_zeradas, total_pedidos, city_weight);

    const desempPct = parseDesempenhoPercentual(partner.desempenho);
    const indice_desempenho = desempPct != null
        ? desempPct / 100
        : media_semanal > 0
            ? Math.min(1, total_pedidos / (media_semanal * DESEMPENHO_WEEKS_COUNT))
            : 0;

    const analista = getManagerForPartner(partner.cidade, partner.analista || '', noCityIndex, productMode);
    const state = getPartnerState(partner.estab_id || partner.estabelecimento);
    const contrato = findContractForPartner(partner.estabelecimento);
    const pedidos_por_dia = calcularPedidosPorDia(partner.week_1);

    return {
        ...partner,
        ...state,
        total_pedidos,
        dias_desde_lancamento: 0,
        pedidos_esperados: 0,
        indice_desempenho,
        city_weight,
        priority_stars: risco_churn,
        risco_churn,
        tendencia_pedidos,
        semanas_zeradas,
        media_semanal,
        analista,
        logo_url: logoUrl || partner.logo_url,
        valor_contrato: contrato?.valorMensal,
        contrato_status: contrato?.status,
        contrato_pagamento: contrato?.formaPagamento,
        contrato_vencimento: contrato?.vencimento,
        pedidos_por_dia,
        mrr_em_risco: isMrrEmRisco(pedidos_por_dia, contrato),
    };
};

export const getTendenciaLabel = (tendencia: TendenciaPedidos): string => {
    switch (tendencia) {
        case 'queda': return 'Queda';
        case 'alta': return 'Alta';
        default: return 'Estável';
    }
};

export const getTendenciaColor = (tendencia: TendenciaPedidos): string => {
    switch (tendencia) {
        case 'queda': return 'text-red-600 dark:text-red-400';
        case 'alta': return 'text-emerald-600 dark:text-emerald-400';
        default: return 'text-slate-500 dark:text-slate-400';
    }
};

export const getChurnInterpretationBox = (risco: number): { text: string; bg: string; border: string; icon: string; textClass: string } => {
    switch (risco) {
        case 5: return {
            text: 'Risco crítico de churn. Intervenção imediata para reverter queda ou inatividade.',
            bg: 'bg-red-50 dark:bg-red-900/10',
            border: 'border-red-200 dark:border-red-800/30',
            icon: 'error',
            textClass: 'text-red-800 dark:text-red-400',
        };
        case 4: return {
            text: 'Tendência de queda nos pedidos. Ação proativa recomendada antes de perder o parceiro.',
            bg: 'bg-orange-50 dark:bg-orange-900/10',
            border: 'border-orange-200 dark:border-orange-800/30',
            icon: 'warning',
            textClass: 'text-orange-800 dark:text-orange-400',
        };
        case 3: return {
            text: 'Desempenho abaixo do ideal. Monitorar de perto e buscar melhorias nas próximas semanas.',
            bg: 'bg-yellow-50 dark:bg-yellow-900/10',
            border: 'border-yellow-200 dark:border-yellow-800/30',
            icon: 'visibility',
            textClass: 'text-yellow-800 dark:text-yellow-400',
        };
        default: return {
            text: 'Parceiro com desempenho estável ou em crescimento. Manter acompanhamento regular.',
            bg: 'bg-green-50 dark:bg-green-900/10',
            border: 'border-green-200 dark:border-green-800/30',
            icon: 'check_circle',
            textClass: 'text-green-800 dark:text-green-400',
        };
    }
};

// UI Helpers
export const getStarColor = (stars: number): string => {
    switch (stars) {
        case 5: return 'text-red-500';
        case 4: return 'text-orange-500';
        case 3: return 'text-yellow-500';
        case 2: return 'text-yellow-200';
        case 1: return 'text-green-500';
        default: return 'text-slate-300';
    }
};

export const getInterpretationBox = (stars: number): { text: string; bg: string; border: string; icon: string; textClass: string } => {
    switch (stars) {
        case 5: return {
            text: 'Este parceiro está significativamente abaixo do desempenho esperado no onboarding e requer intervenção imediata.',
            bg: 'bg-red-50 dark:bg-red-900/10',
            border: 'border-red-200 dark:border-red-800/30',
            icon: 'error',
            textClass: 'text-red-800 dark:text-red-400'
        };
        case 4: return {
            text: 'Alto risco de baixo desempenho. Ação recomendada para correção de rota.',
            bg: 'bg-orange-50 dark:bg-orange-900/10',
            border: 'border-orange-200 dark:border-orange-800/30',
            icon: 'warning',
            textClass: 'text-orange-800 dark:text-orange-400'
        };
        case 3: return {
            text: 'Desvio moderado de desempenho. Monitore de perto os próximos dias.',
            bg: 'bg-yellow-50 dark:bg-yellow-900/10',
            border: 'border-yellow-200 dark:border-yellow-800/30',
            icon: 'visibility',
            textClass: 'text-yellow-800 dark:text-yellow-400'
        };
        default: return {
            text: 'O parceiro está com desempenho dentro do esperado e seguindo a meta.',
            bg: 'bg-green-50 dark:bg-green-900/10',
            border: 'border-green-200 dark:border-green-800/30',
            icon: 'check_circle',
            textClass: 'text-green-800 dark:text-green-400'
        };
    }
};
