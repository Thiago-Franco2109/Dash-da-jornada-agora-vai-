import type { EnrichedPerformanceRow } from './calculations';
import type { CampanhasMap } from '../hooks/useCampanhas';
import type { PromoStatusValue } from '../components/PerformanceTable';
import type { CampaignStatuses } from '../config/campaignTypes';
import { computePromoResumo, type PromoStatusData } from '../hooks/usePromoStatus';

/**
 * Aplica o estado REAL de campanhas (do banco) sobre as linhas, respeitando o
 * status de trabalho do CS:
 *   - se o status atual é uma decisão do CS (ofertei/aguardando/negado) → mantém
 *   - senão (ativo/inativo/vazio = estado base) → usa o estado real do banco
 *
 * Cobre as 3 colunas: super_promos, ofertas_da_casa, cupons_destaque.
 */
/** Decisão de PROCESSO do CS que ganha do banco: ofertei / negado.
 *  (aguardando="Não ofertado" e ativo/inativo NÃO sobrescrevem o estado real.) */
function csDecision(s: string | undefined): PromoStatusValue | undefined {
    return s === 'ofertei' || s === 'negado' ? (s as PromoStatusValue) : undefined;
}

/** Normaliza nome p/ casar (minúsculo, sem acento, sem espaços extras). */
export function normalizeNome(nome: string): string {
    return (nome || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // acentos
        .replace(/[^a-z0-9\s]/g, '')       // ap\u00f3strofo/h\u00edfen/pontua\u00e7\u00e3o (' vs ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function overlayCampanhas(
    row: EnrichedPerformanceRow,
    map: CampanhasMap,
    nomeToId?: Map<string, string>,
    overridesMap?: Record<string, { promo: string; cupom: string }>,
    promoData?: PromoStatusData,
    estabIdToLoc?: Map<string, string>,
): EnrichedPerformanceRow {
    // enquanto o mapa não carregou, não mexe (evita "Não ofertado" falso)
    if (!map || Object.keys(map).length === 0) return row;

    // resolve o id do banco: 1) estab_id; 2) fallback por nome (dashboard)
    let id = String(row.estab_id ?? '');
    let db = map[id];
    if (!db && nomeToId) {
        const byName = nomeToId.get(normalizeNome(row.estabelecimento));
        if (byName) { id = byName; db = map[byName]; }
    }
    const campanhas = db?.campanhas ?? [];
    const ov = overridesMap?.[id];
    // resumo de status dos itens promocionais (coluna Promoções)
    const promo_resumo = promoData
        ? computePromoResumo(id, estabIdToLoc?.get(id), promoData)
        : undefined;

    // Fonte da verdade = BANCO. A planilha (campaign_statuses) é IGNORADA aqui —
    // ela é export estático e polui (ex: ofertas_da_casa hardcoded 'aguardando').
    // Só a decisão real do CS (Supabase) ganha do estado do banco.
    const cs = { ...(row.campaign_statuses ?? {}) } as CampaignStatuses;

    // Promoções (consolidado): qualquer campanha ativa no banco.
    // 'aguardando' = "Não ofertado" (base); 'ativo' = "Ativo".
    cs.super_promos = csDecision(ov?.promo) ?? (campanhas.length > 0 ? 'ativo' : 'aguardando');
    // Cupons de destaque
    cs.cupons_destaque = csDecision(ov?.cupom) ?? (db?.cupons ? 'ativo' : 'aguardando');
    // Ofertas (não exibida como coluna; mantém coerente)
    cs.ofertas_da_casa = db?.ofertasDaCasa ? 'ativo' : 'aguardando';

    return {
        ...row,
        campaign_statuses: cs,
        promo_status: cs.super_promos,
        cupom_status: cs.cupons_destaque,
        promo_campanhas: campanhas,
        promo_resumo,
    };
}
