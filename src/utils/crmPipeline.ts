import { differenceInCalendarDays, isPast, isToday, parseISO, startOfDay } from 'date-fns';
import type { CrmPartner, CrmPartnerNote, CrmPipelineStage } from '../types/crm';
import type { CrmFollowUpAlert, CrmGoal, CrmGoalMetric, CrmPipelineAggregate, CrmViewMode } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import type { CampaignTypeId } from '../config/campaignTypes';
import { normalizeCrmCity } from './crmData';
import { isParceiroContratoAtivo } from './parceirosSheet';

export const CRM_VIEW_MODES: { id: CrmViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'kanban', label: 'Kanban', icon: 'view_kanban' },
    { id: 'list', label: 'Lista', icon: 'format_list_bulleted' },
    { id: 'table', label: 'Tabela', icon: 'table_rows' },
    { id: 'calendar', label: 'Calendário', icon: 'calendar_month' },
];

export const KANBAN_STAGES: { id: PromoStatus; label: string; icon: string; color: string }[] = [
    { id: 'aguardando', label: 'Não ofertado', icon: 'campaign', color: 'border-red-300 bg-red-50 dark:bg-red-950/30' },
    { id: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top', color: 'border-orange-300 bg-orange-50 dark:bg-orange-950/30' },
    { id: 'negado', label: 'Negado', icon: 'block', color: 'border-slate-300 bg-slate-50 dark:bg-slate-800/50' },
    { id: 'ativo', label: 'Promo ativa', icon: 'check_circle', color: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' },
];

export function getPromoStatusForPartner(
    row: CrmPartner,
    localStatus: Record<string, PromoStatus>,
    campaign: CampaignTypeId = 'super_promos',
): PromoStatus {
    const local = localStatus[row.partnerId];
    if (local) return local;

    const campaignStatus = row.campaigns?.[campaign]?.status;
    if (campaignStatus) return campaignStatus;

    // Fallback para dados legados/cache sem o campo `campaigns`.
    // NUNCA cruzar campanhas: cada uma usa seu próprio status (ou default neutro).
    if (campaign === 'super_promos') return row.promoStatus ?? 'aguardando';
    if (campaign === 'cupons_destaque') return row.cupomStatus ?? 'aguardando';
    return 'aguardando';
}

export function filterActiveCrmPartners(partners: CrmPartner[]): CrmPartner[] {
    return partners.filter(row => isParceiroContratoAtivo(row.statusParceiro));
}

export function filterCrmPartners(
    partners: CrmPartner[],
    opts: {
        cityFilter?: string;
        managerFilter?: string;
        searchQuery?: string;
        stageFilter?: CrmPipelineStage;
        localStatus?: Record<string, PromoStatus>;
        campaign?: CampaignTypeId;
        crmCitiesMatch?: (a: string, b: string) => boolean;
    },
): CrmPartner[] {
    const { cityFilter, managerFilter, searchQuery, stageFilter, localStatus = {}, campaign = 'super_promos', crmCitiesMatch: matchCity } = opts;

    return partners.filter(row => {
        if (cityFilter && matchCity && !matchCity(row.cidade, cityFilter)) return false;
        if (managerFilter && row.analista !== managerFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!row.estabelecimento.toLowerCase().includes(q) && !row.cidade.toLowerCase().includes(q)) return false;
        }
        const promoStatus = getPromoStatusForPartner(row, localStatus, campaign);
        if (stageFilter && stageFilter !== 'all' && promoStatus !== stageFilter) return false;
        return true;
    });
}

export function computeFollowUpAlerts(
    partners: CrmPartner[],
    getNote: (id: string) => CrmPartnerNote | undefined,
    upcomingDays = 3,
): CrmFollowUpAlert[] {
    const today = startOfDay(new Date());
    const alerts: CrmFollowUpAlert[] = [];

    for (const partner of partners) {
        const note = getNote(partner.partnerId);
        if (!note?.nextFollowUp) continue;

        let date: Date;
        try {
            date = startOfDay(parseISO(note.nextFollowUp));
        } catch {
            continue;
        }

        const daysOffset = differenceInCalendarDays(date, today);
        let level: CrmFollowUpAlert['level'] | null = null;

        if (isPast(date) && !isToday(date)) level = 'overdue';
        else if (isToday(date)) level = 'today';
        else if (daysOffset <= upcomingDays) level = 'upcoming';

        if (!level) continue;

        alerts.push({
            partnerId: partner.partnerId,
            partner,
            nextFollowUp: note.nextFollowUp,
            level,
            daysOffset,
            notes: note.notes,
        });
    }

    const order = { overdue: 0, today: 1, upcoming: 2 };
    return alerts.sort((a, b) => {
        if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
        return a.daysOffset - b.daysOffset;
    });
}

export function aggregatePipeline(
    partners: CrmPartner[],
    groupBy: 'manager' | 'city',
    localStatus: Record<string, PromoStatus> = {},
    campaign: CampaignTypeId = 'super_promos',
): CrmPipelineAggregate[] {
    const map = new Map<string, CrmPipelineAggregate>();

    for (const row of partners) {
        const key =
            groupBy === 'manager'
                ? (row.analista || 'Sem gestor')
                : normalizeCrmCity(row.cidade) || 'Sem cidade';

        if (!map.has(key)) {
            map.set(key, {
                key,
                label: key,
                total: 0,
                aguardando: 0,
                ofertei: 0,
                negado: 0,
                ativo: 0,
                inativo: 0,
                semCupom: 0,
                overdueFollowUps: 0,
            });
        }

        const agg = map.get(key)!;
        agg.total++;

        const status = getPromoStatusForPartner(row, localStatus, campaign);
        if (status in agg) agg[status as keyof Pick<CrmPipelineAggregate, 'aguardando' | 'ofertei' | 'negado' | 'ativo' | 'inativo'>]++;
        if (!row.hasCupomAtivo) agg.semCupom++;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function computeGoalProgress(
    agg: CrmPipelineAggregate,
    goal: CrmGoal,
): { current: number; target: number; percent: number; met: boolean } {
    let current = 0;
    const target = goal.target;

    switch (goal.metric) {
        case 'promo_ativa_rate':
            current = agg.total > 0 ? Math.round((agg.ativo / agg.total) * 100) : 0;
            break;
        case 'promo_ativa_count':
            current = agg.ativo;
            break;
        case 'pending_max':
            current = agg.aguardando;
            break;
        case 'offered_max':
            current = agg.ofertei;
            break;
    }

    const isRate = goal.metric === 'promo_ativa_rate';
    const isMax = goal.metric === 'pending_max' || goal.metric === 'offered_max';
    const percent = isRate
        ? Math.min(100, Math.round((current / Math.max(target, 1)) * 100))
        : isMax
            ? (current <= target ? 100 : Math.round((target / Math.max(current, 1)) * 100))
            : Math.min(100, Math.round((current / Math.max(target, 1)) * 100));

    const met = isMax ? current <= target : current >= target;

    return { current, target, percent, met };
}

export function getGoalMetricLabel(metric: CrmGoalMetric): string {
    switch (metric) {
        case 'promo_ativa_rate': return '% promo ativa';
        case 'promo_ativa_count': return 'promos ativas';
        case 'pending_max': return 'máx. não ofertados';
        case 'offered_max': return 'máx. aguardando retorno';
    }
}

export function findGoalForScope(
    goals: CrmGoal[],
    scope: CrmGoal['scope'],
    scopeKey: string,
    metric: CrmGoalMetric,
): CrmGoal | undefined {
    return goals.find(g => g.scope === scope && g.scopeKey === scopeKey && g.metric === metric);
}
