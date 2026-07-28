import type { EnrichedPerformanceRow } from './calculations';
import type { CampanhasMap } from '../hooks/useCampanhas';
import type { PromoStatusValue } from '../components/PerformanceTable';
import type { CampaignStatuses } from '../config/campaignTypes';

/**
 * Aplica o estado REAL de campanhas (do banco) sobre as linhas, respeitando o
 * status de trabalho do CS:
 *   - se o status atual é uma decisão do CS (ofertei/aguardando/negado) → mantém
 *   - senão (ativo/inativo/vazio = estado base) → usa o estado real do banco
 *
 * Cobre as 3 colunas: super_promos, ofertas_da_casa, cupons_destaque.
 */
function resolve(current: PromoStatusValue | undefined, dbActive: boolean): PromoStatusValue {
    if (current && current !== 'ativo' && current !== 'inativo') return current; // decisão do CS
    return dbActive ? 'ativo' : 'inativo';
}

export function overlayCampanhas(row: EnrichedPerformanceRow, map: CampanhasMap): EnrichedPerformanceRow {
    // enquanto o mapa não carregou, não mexe (evita "Não ofertado" falso)
    if (!map || Object.keys(map).length === 0) return row;

    const id = String(row.estab_id ?? '');
    const db = map[id];
    const cs = { ...(row.campaign_statuses ?? {}) } as CampaignStatuses;
    const campanhas = db?.campanhas ?? [];

    // "Promoções" = CONSOLIDADO de qualquer campanha de promoção (Super Promos,
    // Ofertas da Casa, Super Bigou, etc.). Usa a coluna super_promos como base.
    const temPromo = campanhas.length > 0;
    const csPromo = [cs.super_promos, cs.ofertas_da_casa, row.promo_status]
        .find((s): s is PromoStatusValue => Boolean(s) && s !== 'ativo' && s !== 'inativo');
    cs.super_promos = csPromo ?? (temPromo ? 'ativo' : 'inativo');
    cs.ofertas_da_casa = resolve(cs.ofertas_da_casa, Boolean(db?.ofertasDaCasa));
    cs.cupons_destaque = resolve(cs.cupons_destaque ?? row.cupom_status, Boolean(db?.cupons));

    return {
        ...row,
        campaign_statuses: cs,
        promo_status: cs.super_promos,
        cupom_status: cs.cupons_destaque,
        promo_campanhas: campanhas,
    };
}
