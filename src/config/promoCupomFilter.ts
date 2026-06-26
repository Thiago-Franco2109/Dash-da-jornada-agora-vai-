import type { PromoStatus } from '../hooks/useStatusOverride';
import {
    CAMPAIGN_TYPES,
    type CampaignStatuses,
    type CampaignTypeId,
    getCampaignStatus,
    withDefaultCampaignStatus,
} from './campaignTypes';

export type CampaignFieldFilter = 'any' | CampaignTypeId;

/** Valor composto: "super_promos:ofertei", "any:aguardando" ou "" */
export type CampaignFilterValue = '' | `${CampaignFieldFilter}:${PromoStatus}`;

/** @deprecated use CampaignFilterValue */
export type PromoCupomFilterValue = CampaignFilterValue;

export const CAMPAIGN_FIELD_OPTIONS: { value: CampaignFieldFilter; label: string }[] = [
    { value: 'any', label: 'Qualquer campanha' },
    ...CAMPAIGN_TYPES.map(c => ({ value: c.id as CampaignFieldFilter, label: c.label })),
];

/** @deprecated use CAMPAIGN_FIELD_OPTIONS */
export const PROMO_CUPOM_FIELD_OPTIONS = CAMPAIGN_FIELD_OPTIONS;

export const CAMPAIGN_STATUS_OPTIONS: { value: PromoStatus; label: string; icon: string; color: string }[] = [
    { value: 'ativo', label: 'Ativo', icon: 'check_circle', color: 'text-emerald-600' },
    { value: 'aguardando', label: 'Não ofertado', icon: 'priority_high', color: 'text-red-500' },
    { value: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top', color: 'text-orange-500' },
    { value: 'negado', label: 'Negado', icon: 'block', color: 'text-slate-500' },
    { value: 'inativo', label: 'Inativo ou sem status', icon: 'remove', color: 'text-slate-400' },
];

/** @deprecated use CAMPAIGN_STATUS_OPTIONS */
export const PROMO_CUPOM_STATUS_OPTIONS = CAMPAIGN_STATUS_OPTIONS;

export function buildCampaignFilterValue(
    field: CampaignFieldFilter,
    status: PromoStatus,
): CampaignFilterValue {
    return `${field}:${status}`;
}

/** @deprecated use buildCampaignFilterValue */
export const buildPromoCupomFilterValue = buildCampaignFilterValue;

export function parseCampaignFilterValue(value: string): {
    field: CampaignFieldFilter;
    status: PromoStatus;
} | null {
    if (!value) return null;
    const [field, status] = value.split(':') as [CampaignFieldFilter, PromoStatus];
    const validFields: CampaignFieldFilter[] = ['any', ...CAMPAIGN_TYPES.map(c => c.id)];
    const validStatuses: PromoStatus[] = ['ativo', 'aguardando', 'ofertei', 'negado', 'inativo'];
    if (!validFields.includes(field) || !validStatuses.includes(status)) return null;
    return { field, status };
}

/** @deprecated use parseCampaignFilterValue */
export const parsePromoCupomFilterValue = parseCampaignFilterValue;

function isInactive(status?: PromoStatus): boolean {
    return !status || status === 'inativo';
}

function fieldMatches(status: PromoStatus | undefined, target: PromoStatus): boolean {
    if (target === 'inativo') return isInactive(status);
    return status === target;
}

function rowCampaignStatuses(row: { campaign_statuses?: CampaignStatuses; promo_status?: PromoStatus; cupom_status?: PromoStatus }): CampaignStatuses {
    if (row.campaign_statuses) return row.campaign_statuses;
    const statuses: CampaignStatuses = {};
    if (row.promo_status) statuses.super_promos = row.promo_status;
    if (row.cupom_status) statuses.cupons_destaque = row.cupom_status;
    return statuses;
}

export function matchesCampaignFilter(
    row: { campaign_statuses?: CampaignStatuses; promo_status?: PromoStatus; cupom_status?: PromoStatus },
    filterValue: CampaignFilterValue | string,
): boolean {
    const parsed = parseCampaignFilterValue(filterValue);
    if (!parsed) return true;

    const { field, status } = parsed;
    const statuses = rowCampaignStatuses(row);

    if (field !== 'any') {
        return fieldMatches(withDefaultCampaignStatus(getCampaignStatus(statuses, field)), status);
    }

    if (status === 'inativo') {
        return CAMPAIGN_TYPES.every(c => isInactive(getCampaignStatus(statuses, c.id)));
    }

    return CAMPAIGN_TYPES.some(c => fieldMatches(getCampaignStatus(statuses, c.id), status));
}

/** @deprecated use matchesCampaignFilter */
export const matchesPromoCupomFilter = matchesCampaignFilter;

export function countCampaignFilter(
    rows: { campaign_statuses?: CampaignStatuses; promo_status?: PromoStatus; cupom_status?: PromoStatus }[],
    filterValue: CampaignFilterValue,
): number {
    return rows.filter(row => matchesCampaignFilter(row, filterValue)).length;
}

/** @deprecated use countCampaignFilter */
export const countPromoCupomFilter = countCampaignFilter;

export function buildAllCampaignFilterOptions(): {
    value: CampaignFilterValue;
    label: string;
    group: string;
    icon: string;
    color: string;
}[] {
    const options: { value: CampaignFilterValue; label: string; group: string; icon: string; color: string }[] = [];
    for (const field of CAMPAIGN_FIELD_OPTIONS) {
        for (const status of CAMPAIGN_STATUS_OPTIONS) {
            options.push({
                value: buildCampaignFilterValue(field.value, status.value),
                label: status.label,
                group: field.label,
                icon: status.icon,
                color: status.color,
            });
        }
    }
    return options;
}

/** @deprecated use buildAllCampaignFilterOptions */
export const buildAllPromoCupomFilterOptions = buildAllCampaignFilterOptions;

export function getCampaignFilterLabel(value: CampaignFilterValue | ''): string {
    if (!value) return 'Campanhas: Todas';
    const opt = buildAllCampaignFilterOptions().find(o => o.value === value);
    return opt ? `${opt.group} — ${opt.label}` : 'Campanhas';
}

/** @deprecated use getCampaignFilterLabel */
export const getPromoCupomFilterLabel = getCampaignFilterLabel;
