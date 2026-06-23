import type { CrmPartner } from '../types/crm';
import type { EnrichedPerformanceRow } from './calculations';
import { getCityWeight } from './calculations';
import { getPartnerState } from '../config/partnerState';
import { isParceiroContratoAtivo } from './parceirosSheet';

/** Score de risco (1–5) com base no volume de pedidos do mês mais recente (col. G+) */
export function computeIndicadorChurnScore(pedidosMes: number | null | undefined): number {
    const p = pedidosMes ?? 0;
    if (p <= 0) return 5;
    if (p < 7) return 4;
    if (p < 15) return 3;
    if (p < 30) return 2;
    return 1;
}

export function isIndicadorChurnAtRisk(row: EnrichedPerformanceRow): boolean {
    const pedidos = row.total_pedidos ?? 0;
    if (pedidos <= 0) return true;
    return (row.risco_churn ?? row.priority_stars ?? 0) >= 3;
}

function parsePedidosMesValue(partner: CrmPartner): number {
    if (partner.indiceGmv != null && partner.indiceGmv > 0) {
        return partner.indiceGmv;
    }
    const raw = partner.indiceGmvRaw?.trim();
    if (!raw || raw === '—') return 0;
    const digits = raw.replace(/[^\d.,]/g, '');
    if (!digits) return 0;
    if (digits.includes(',')) {
        const n = parseFloat(digits.replace(/\./g, '').replace(',', '.'));
        return Number.isNaN(n) ? 0 : Math.round(n);
    }
    const n = parseFloat(digits);
    return Number.isNaN(n) ? 0 : Math.round(n);
}

export function crmPartnerToEnrichedRow(
    partner: CrmPartner,
    relevanceMap?: Record<string, number>,
): EnrichedPerformanceRow {
    const pedidosMes = parsePedidosMesValue(partner);
    const risco = computeIndicadorChurnScore(pedidosMes);
    const state = getPartnerState(partner.estabId);
    const relevance = relevanceMap?.[partner.estabId] ?? relevanceMap?.[partner.partnerId];

    return {
        cidade: partner.cidade,
        estabelecimento: partner.estabelecimento,
        estab_id: partner.estabId,
        status: partner.statusParceiro || 'ativo',
        lancamento: '',
        desempenho: partner.indiceGmvRaw && partner.indiceGmvRaw !== '—' ? partner.indiceGmvRaw : String(pedidosMes || '—'),
        week_1: 0,
        week_2: 0,
        week_3: 0,
        week_4: 0,
        logo_url: partner.logoUrl,
        analista: partner.analista,
        promo_status: partner.promoStatus,
        cupom_status: partner.cupomStatus,
        commercial_relevance: relevance,
        pedidos_mes_label: partner.gmvMesLabel,
        pedidos_mes_raw: partner.indiceGmvRaw,
        gmv_mensal: partner.gmvMensal,
        dias_desde_lancamento: 0,
        total_pedidos: pedidosMes,
        pedidos_esperados: 0,
        indice_desempenho: 0,
        city_weight: getCityWeight(partner.cidade),
        priority_stars: risco,
        risco_churn: risco,
        isFinished: true,
        contacts: state.contacts,
        contactDetails: state.contactDetails,
        notes: state.notes,
    };
}

export function crmPartnersToEnrichedRows(
    partners: CrmPartner[],
    relevanceMap?: Record<string, number>,
    options?: { onlyActive?: boolean },
): EnrichedPerformanceRow[] {
    const onlyActive = options?.onlyActive ?? true;
    const source = onlyActive
        ? partners.filter(p => isParceiroContratoAtivo(p.statusParceiro))
        : partners;
    return source.map(p => crmPartnerToEnrichedRow(p, relevanceMap));
}
