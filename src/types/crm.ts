import type { PromoStatus } from '../hooks/useStatusOverride';
import type { CampaignSheetInfo, CampaignStatuses, CampaignTypeId } from '../config/campaignTypes';

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
    /** Histórico de GMV mês a mês, em ordem cronológica (mais antigo → mais recente) */
    gmvMensal?: { label: string; value: number }[];
    /**
     * Status e métricas por campanha. Sempre tem entradas pros 3 tipos conhecidos
     * (ver KNOWN_CAMPAIGN_TYPE_IDS); pode ter entradas extras pra campanhas
     * descobertas dinamicamente no banco (somente-leitura).
     */
    campaigns: Record<CampaignTypeId, {
        status: PromoStatus;
        resumo: string;
        itemCount: number;
        hasActive: boolean;
        sheetInfo?: CampaignSheetInfo;
    }>;
    /** @deprecated use campaigns.super_promos */
    promoResumo: string;
    /** @deprecated use campaigns.cupons_destaque */
    cupomResumo: string;
    /** @deprecated use campaigns.super_promos.itemCount */
    promoItensAtivos: number;
    /** @deprecated use campaigns.cupons_destaque.itemCount */
    cupomCount: number;
    /** @deprecated use campaigns.super_promos.status */
    promoStatus: PromoStatus;
    /** @deprecated use campaigns.cupons_destaque.status */
    cupomStatus: PromoStatus;
    /** @deprecated use campaigns.super_promos.hasActive */
    hasPromoAtiva: boolean;
    /** @deprecated use campaigns.cupons_destaque.hasActive */
    hasCupomAtivo: boolean;
    campaignStatuses: CampaignStatuses;
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
    /** Campanhas vistas na aba PROMO-ESPECIAL que não são nenhum dos 3 tipos conhecidos — somente-leitura no CRM. */
    dynamicCampaigns: { id: string; label: string }[];
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
