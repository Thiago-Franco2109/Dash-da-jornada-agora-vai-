import type { PromoStatus } from '../hooks/useStatusOverride';

export type PromoCupomFieldFilter = 'any' | 'promo' | 'cupom';

/** Valor composto: "promo:ofertei", "cupom:ativo", "any:aguardando" ou "" */
export type PromoCupomFilterValue = '' | `${PromoCupomFieldFilter}:${PromoStatus}`;

export const PROMO_CUPOM_FIELD_OPTIONS: { value: PromoCupomFieldFilter; label: string }[] = [
    { value: 'any', label: 'Promo ou Cupom' },
    { value: 'promo', label: 'Somente Promo' },
    { value: 'cupom', label: 'Somente Cupom' },
];

export const PROMO_CUPOM_STATUS_OPTIONS: { value: PromoStatus; label: string; icon: string; color: string }[] = [
    { value: 'ativo', label: 'Ativo', icon: 'check_circle', color: 'text-emerald-600' },
    { value: 'aguardando', label: 'Não ofertado', icon: 'priority_high', color: 'text-red-500' },
    { value: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top', color: 'text-orange-500' },
    { value: 'negado', label: 'Negado', icon: 'block', color: 'text-slate-500' },
    { value: 'inativo', label: 'Inativo ou sem status', icon: 'remove', color: 'text-slate-400' },
];

export function buildPromoCupomFilterValue(
    field: PromoCupomFieldFilter,
    status: PromoStatus,
): PromoCupomFilterValue {
    return `${field}:${status}`;
}

export function parsePromoCupomFilterValue(value: string): {
    field: PromoCupomFieldFilter;
    status: PromoStatus;
} | null {
    if (!value) return null;
    const [field, status] = value.split(':') as [PromoCupomFieldFilter, PromoStatus];
    const validFields: PromoCupomFieldFilter[] = ['any', 'promo', 'cupom'];
    const validStatuses: PromoStatus[] = ['ativo', 'aguardando', 'ofertei', 'negado', 'inativo'];
    if (!validFields.includes(field) || !validStatuses.includes(status)) return null;
    return { field, status };
}

function isInactive(status?: PromoStatus): boolean {
    return !status || status === 'inativo';
}

function fieldMatches(status: PromoStatus | undefined, target: PromoStatus): boolean {
    if (target === 'inativo') return isInactive(status);
    return status === target;
}

export function matchesPromoCupomFilter(
    row: { promo_status?: PromoStatus; cupom_status?: PromoStatus },
    filterValue: PromoCupomFilterValue | string,
): boolean {
    const parsed = parsePromoCupomFilterValue(filterValue);
    if (!parsed) return true;

    const { field, status } = parsed;
    const promo = row.promo_status;
    const cupom = row.cupom_status;

    if (field === 'promo') return fieldMatches(promo, status);
    if (field === 'cupom') return fieldMatches(cupom, status);

    // any
    if (status === 'inativo') {
        return isInactive(promo) && isInactive(cupom);
    }
    return fieldMatches(promo, status) || fieldMatches(cupom, status);
}

export function countPromoCupomFilter(
    rows: { promo_status?: PromoStatus; cupom_status?: PromoStatus }[],
    filterValue: PromoCupomFilterValue,
): number {
    return rows.filter(row => matchesPromoCupomFilter(row, filterValue)).length;
}

export function buildAllPromoCupomFilterOptions(): {
    value: PromoCupomFilterValue;
    label: string;
    group: string;
    icon: string;
    color: string;
}[] {
    const options: { value: PromoCupomFilterValue; label: string; group: string; icon: string; color: string }[] = [];
    for (const field of PROMO_CUPOM_FIELD_OPTIONS) {
        for (const status of PROMO_CUPOM_STATUS_OPTIONS) {
            options.push({
                value: buildPromoCupomFilterValue(field.value, status.value),
                label: status.label,
                group: field.label,
                icon: status.icon,
                color: status.color,
            });
        }
    }
    return options;
}

export function getPromoCupomFilterLabel(value: PromoCupomFilterValue | ''): string {
    if (!value) return 'Promo/Cupom: Todos';
    const opt = buildAllPromoCupomFilterOptions().find(o => o.value === value);
    return opt ? `${opt.group} — ${opt.label}` : 'Promo/Cupom';
}
