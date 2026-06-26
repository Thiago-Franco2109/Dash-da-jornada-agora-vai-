import type { CrmPartner } from '../types/crm';
import type { OfertasDaCasaStatus } from '../types/crmCampaigns';
import { getCampaignConfig } from './campaignTypes';
import { normalizeCrmCity } from '../utils/crmData';
import { isParceiroContratoAtivo } from '../utils/parceirosSheet';

export const OFERTAS_DA_CASA_CAMPAIGN = {
    id: getCampaignConfig('ofertas_da_casa').id,
    name: getCampaignConfig('ofertas_da_casa').label,
    description: 'Campanha promocional principal — prioridade nas 5 cidades de maior GMV.',
    cmsCadastroId: getCampaignConfig('ofertas_da_casa').cmsCadastroId!,
    cmsBaseUrl: getCampaignConfig('ofertas_da_casa').cmsBaseUrl!,
} as const;

export const OFERTAS_DA_CASA_STATUS_OPTIONS: {
    value: OfertasDaCasaStatus;
    label: string;
    icon: string;
    badge: string;
}[] = [
    { value: 'desconhecido', label: 'A definir', icon: 'help', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    { value: 'nao_ofertado', label: 'Não ofertado', icon: 'campaign', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { value: 'aguardando_retorno', label: 'Aguardando retorno', icon: 'hourglass_top', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    { value: 'participando', label: 'Participando', icon: 'check_circle', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { value: 'nao_participando', label: 'Não participa', icon: 'block', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
];

/** Top N cidades por GMV agregado (parceiros ativos com índice GMV) */
export function computeTopCitiesByGmv(partners: CrmPartner[], limit = 5): string[] {
    const totals = new Map<string, number>();

    for (const partner of partners) {
        const city = normalizeCrmCity(partner.cidade);
        if (!city) continue;
        if (!isParceiroContratoAtivo(partner.statusParceiro)) continue;
        totals.set(city, (totals.get(city) ?? 0) + (partner.indiceGmv ?? 0));
    }

    return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([city]) => city);
}

export function isTopPriorityCity(city: string, topCities: string[]): boolean {
    const norm = normalizeCrmCity(city).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return topCities.some(c =>
        normalizeCrmCity(c).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === norm,
    );
}

export function getOfertasDaCasaStatusMeta(status: OfertasDaCasaStatus) {
    return OFERTAS_DA_CASA_STATUS_OPTIONS.find(o => o.value === status) ?? OFERTAS_DA_CASA_STATUS_OPTIONS[0];
}
