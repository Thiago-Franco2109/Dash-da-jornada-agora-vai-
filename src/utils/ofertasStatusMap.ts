import type { PromoStatus } from '../hooks/useStatusOverride';
import type { OfertasDaCasaStatus } from '../types/crmCampaigns';
import type { CampaignStatuses } from '../config/campaignTypes';
import type { OfertasDaCasaRecord } from '../types/crmCampaigns';

const PROMO_TO_OFERTAS: Record<PromoStatus, OfertasDaCasaStatus> = {
    ativo: 'participando',
    aguardando: 'nao_ofertado',
    ofertei: 'aguardando_retorno',
    negado: 'nao_participando',
    inativo: 'desconhecido',
};

const OFERTAS_TO_PROMO: Record<OfertasDaCasaStatus, PromoStatus> = {
    participando: 'ativo',
    nao_ofertado: 'aguardando',
    aguardando_retorno: 'ofertei',
    nao_participando: 'negado',
    desconhecido: 'aguardando',
};

export function promoStatusToOfertasStatus(status: PromoStatus): OfertasDaCasaStatus {
    return PROMO_TO_OFERTAS[status] ?? 'desconhecido';
}

export function ofertasStatusToPromoStatus(status: OfertasDaCasaStatus): PromoStatus {
    return OFERTAS_TO_PROMO[status] ?? 'aguardando';
}

/** Aplica overrides manuais de Ofertas da Casa (localStorage) sobre as linhas exibidas */
export function mergeOfertasManualStatus<T extends {
    estab_id?: string;
    estabelecimento: string;
    campaign_statuses?: CampaignStatuses;
}>(rows: T[], records: Record<string, OfertasDaCasaRecord>): T[] {
    if (Object.keys(records).length === 0) return rows;

    return rows.map(row => {
        const id = String(row.estab_id || row.estabelecimento);
        const record = records[id];
        if (!record || record.source !== 'manual' || record.status === 'desconhecido') {
            return row;
        }
        return {
            ...row,
            campaign_statuses: {
                ...row.campaign_statuses,
                ofertas_da_casa: ofertasStatusToPromoStatus(record.status),
            },
        };
    });
}
