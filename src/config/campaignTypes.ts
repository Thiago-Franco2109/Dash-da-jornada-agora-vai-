import type { PromoStatus } from '../hooks/useStatusOverride';

/** Tipos de campanha reconhecidos pelo sistema */
export type CampaignTypeId = 'ofertas_da_casa' | 'super_promos' | 'cupons_destaque';

export type CampaignStatusOverrideField = 'promo_status_override' | 'cupom_status_override';

export interface CampaignTypeConfig {
    id: CampaignTypeId;
    label: string;
    shortLabel: string;
    icon: string;
    /** Nomes na coluna CAMPANHA da aba PROMO-ESPECIAL */
    sheetNames: string[];
    /** Campo de override manual no Supabase (null = só localStorage para ofertas) */
    overrideField: CampaignStatusOverrideField | null;
    cmsBaseUrl?: string;
    cmsCadastroId?: number;
    accent: 'amber' | 'violet' | 'indigo';
}

export const CAMPAIGN_TYPES: CampaignTypeConfig[] = [
    {
        id: 'ofertas_da_casa',
        label: 'Ofertas da Casa',
        shortLabel: 'Ofertas',
        icon: 'home_work',
        sheetNames: ['ofertas da casa'],
        overrideField: null,
        cmsCadastroId: 31,
        cmsBaseUrl: 'https://admin.bigou.com.br/campanha/promocao/cadastro/31',
        accent: 'amber',
    },
    {
        id: 'super_promos',
        label: 'Super Promos',
        shortLabel: 'Super Promos',
        icon: 'percent',
        sheetNames: ['super promos', 'super promos!'],
        overrideField: 'promo_status_override',
        cmsCadastroId: 26,
        cmsBaseUrl: 'https://admin.bigou.com.br/campanha/promocao/cadastro/26',
        accent: 'violet',
    },
    {
        id: 'cupons_destaque',
        label: 'Cupons de destaque',
        shortLabel: 'Cupons',
        icon: 'confirmation_number',
        sheetNames: ['cupons de destaque', 'cupom de destaque', 'cupons destaque'],
        overrideField: 'cupom_status_override',
        accent: 'indigo',
    },
];

export const CAMPAIGN_TYPE_IDS = CAMPAIGN_TYPES.map(c => c.id);

export function getCampaignConfig(id: CampaignTypeId): CampaignTypeConfig {
    return CAMPAIGN_TYPES.find(c => c.id === id)!;
}

function normalizeCampaignText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[!?.]+$/g, '')
        .trim();
}

/** Resolve o nome da coluna CAMPANHA para um tipo canônico */
export function resolveCampaignTypeId(raw: string): CampaignTypeId | null {
    const norm = normalizeCampaignText(raw);
    if (!norm) return null;

    for (const campaign of CAMPAIGN_TYPES) {
        if (campaign.sheetNames.some(name => norm === normalizeCampaignText(name) || norm.includes(normalizeCampaignText(name)))) {
            return campaign.id;
        }
    }
    return null;
}

export function getCampaignOverrideField(id: CampaignTypeId): CampaignStatusOverrideField | null {
    return getCampaignConfig(id).overrideField;
}

/** Status por campanha em linhas de performance / CRM */
export type CampaignStatuses = Partial<Record<CampaignTypeId, PromoStatus>>;

export function getCampaignStatus(
    statuses: CampaignStatuses | undefined,
    id: CampaignTypeId,
): PromoStatus | undefined {
    return statuses?.[id];
}

export function withDefaultCampaignStatus(status?: PromoStatus): PromoStatus {
    return status ?? 'aguardando';
}

/** @deprecated use super_promos_status */
export function getLegacyPromoStatus(statuses: CampaignStatuses | undefined): PromoStatus | undefined {
    return statuses?.super_promos;
}

/** @deprecated use cupons_destaque_status */
export function getLegacyCupomStatus(statuses: CampaignStatuses | undefined): PromoStatus | undefined {
    return statuses?.cupons_destaque;
}

export interface CampaignSheetInfo {
    hasAprovadoAtivo: boolean;
    hasAguardando: boolean;
    itemCount: number;
}

export function emptyCampaignSheetInfo(): CampaignSheetInfo {
    return { hasAprovadoAtivo: false, hasAguardando: false, itemCount: 0 };
}

export function resolveCampaignStatusFromSheet(
    override: PromoStatus | undefined,
    sheetInfo: CampaignSheetInfo | undefined,
    indicadorCounts?: { aprov: number; aguar: number },
): PromoStatus {
    if (override) return override;
    if (indicadorCounts && indicadorCounts.aprov > 0) return 'ativo';
    if (indicadorCounts && indicadorCounts.aguar > 0) return 'ofertei';
    if (sheetInfo?.hasAprovadoAtivo) return 'ativo';
    if (sheetInfo?.hasAguardando) return 'ofertei';
    return 'aguardando';
}
