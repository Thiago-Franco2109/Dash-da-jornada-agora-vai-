import type { PromoStatus } from '../hooks/useStatusOverride';

export interface CrmPartnerNote {
    partnerId: string;
    notes: string;
    lastContact: string | null;
    nextFollowUp: string | null;
    updatedAt: string;
}

export type CrmPipelineStage = 'all' | 'aguardando' | 'ofertei' | 'negado' | 'inativo' | 'ativo';

export interface CrmPartner {
    partnerId: string;
    cidade: string;
    estabId: string;
    estabelecimento: string;
    statusParceiro: string;
    /** GMV do mês mais recente (ex.: jun./26) em R$ */
    indiceGmv: number | null;
    indiceGmvRaw: string;
    gmvMesLabel: string;
    /** Resumo INDICADOR col. PROMOÇÃO — ex. "APROV: 1 · AGUAR: 1" */
    promoResumo: string;
    /** Resumo INDICADOR col. CUPOM PARC. */
    cupomResumo: string;
    /** Linhas na aba PROMO-ESPECIAL */
    promoItensAtivos: number;
    /** Linhas na aba CUPOM-PARCEIRO */
    cupomCount: number;
    promoStatus: PromoStatus;
    cupomStatus: PromoStatus;
    hasPromoAtiva: boolean;
    hasCupomAtivo: boolean;
    analista?: string;
    logoUrl?: string;
}

export interface CrmParseInfo {
    indicadorRows: number;
    promoEspecialRows: number;
    cupomParceiroRows: number;
    parceirosRows: number;
    parceirosMatched: number;
    indicadorHeaders: string[];
    gmvColumn: string | null;
    parsedPartners: number;
    skippedRows: number;
}

export type CrmViewMode = 'dashboard' | 'kanban' | 'list' | 'table' | 'calendar';

export type CrmGoalMetric = 'promo_ativa_rate' | 'promo_ativa_count' | 'pending_max' | 'offered_max';

export interface CrmGoal {
    id: string;
    scope: 'manager' | 'city';
    scopeKey: string;
    metric: CrmGoalMetric;
    target: number;
    updatedAt: string;
}

export interface CrmPipelineAggregate {
    key: string;
    label: string;
    total: number;
    aguardando: number;
    ofertei: number;
    negado: number;
    ativo: number;
    inativo: number;
    semCupom: number;
    overdueFollowUps: number;
}

export type CrmFollowUpAlertLevel = 'overdue' | 'today' | 'upcoming';

export interface CrmFollowUpAlert {
    partnerId: string;
    partner: CrmPartner;
    nextFollowUp: string;
    level: CrmFollowUpAlertLevel;
    daysOffset: number;
    notes?: string;
}
