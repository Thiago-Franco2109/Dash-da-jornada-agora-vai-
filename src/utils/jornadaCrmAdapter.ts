import type { EnrichedPerformanceRow } from './calculations';
import type { CrmPartner } from '../types/crm';
import { KNOWN_CAMPAIGN_TYPE_IDS, type CampaignTypeId } from '../config/campaignTypes';
import { getRowCampaignStatus } from '../components/PerformanceTable';

/**
 * Converte linhas da jornada (28 dias) no formato que os componentes do CRM
 * esperam, pro CRM Jornada reaproveitar o Kanban sem forkar nada.
 *
 * É o caminho inverso de `indicadorPerformance.ts` (CrmPartner → linha de
 * performance). Aqui a fonte é `enrichedData`, que já tem tudo que precisamos
 * — inclusive `dias_desde_lancamento`, que o CrmPartner do CRM Promoções não
 * tem (aquele vem do INDICADOR, sem data de lançamento).
 *
 * Status por campanha sai de `getRowCampaignStatus` — a MESMA resolução que a
 * tabela da jornada usa nos dropdowns, então kanban e tabela nunca divergem.
 */
export function enrichedRowToCrmPartner(row: EnrichedPerformanceRow): CrmPartner {
    const id = String(row.estab_id ?? '');

    /**
     * Promoção tem duas fontes que discordam: `campaign_statuses.super_promos` sai
     * do mapa `campanhas` (function campanhas), que fica vazio pra quase todo
     * parceiro novo, enquanto `promo_resumo.aprovado` sai do `promo-status`, item a
     * item — é esse que a coluna "Promoções" da tabela mostra e que o KPI de
     * captação usa. Sem isso o kanban jogava todo mundo em "Não ofertado".
     *
     * Decisão do CS (ofertei/negado) continua ganhando do estado do banco, igual
     * campanhasOverlay.ts faz.
     */
    const statusDe = (campaignId: CampaignTypeId) => {
        const base = getRowCampaignStatus(row, campaignId);
        if (campaignId !== 'super_promos') return base;
        if (base === 'ofertei' || base === 'negado') return base;
        return (row.promo_resumo?.aprovado ?? 0) > 0 ? 'ativo' : base;
    };

    const campaigns = Object.fromEntries(
        KNOWN_CAMPAIGN_TYPE_IDS.map(campaignId => {
            const status = statusDe(campaignId);
            return [campaignId, {
                status,
                resumo: '',
                itemCount: campaignId === 'super_promos' ? (row.promo_resumo?.aprovado ?? 0) : 0,
                hasActive: status === 'ativo',
            }];
        }),
    ) as CrmPartner['campaigns'];

    const promoStatus = statusDe('super_promos');
    const cupomStatus = statusDe('cupons_destaque');

    return {
        partnerId: id,
        estabId: id,
        cidade: row.cidade,
        estabelecimento: row.estabelecimento,
        statusParceiro: row.status ?? '',
        // GMV é conceito do INDICADOR, não da jornada — o CRM Jornada esconde
        // essa coluna (ver `showGmv` no CrmKanbanBoard).
        indiceGmv: null,
        indiceGmvRaw: '—',
        gmvMesLabel: '',
        campaigns,
        promoResumo: '',
        cupomResumo: '',
        promoItensAtivos: row.promo_resumo?.aprovado ?? 0,
        cupomCount: 0,
        promoStatus,
        cupomStatus,
        hasPromoAtiva: promoStatus === 'ativo',
        hasCupomAtivo: cupomStatus === 'ativo',
        campaignStatuses: row.campaign_statuses ?? {},
        analista: row.analista,
        logoUrl: row.logo_url,
        diasDesdeLancamento: row.dias_desde_lancamento,
    };
}

/** Mais perto do dia 28 primeiro — quem tá acabando o prazo aparece no topo. */
export function jornadaRowsToCrmPartners(rows: EnrichedPerformanceRow[]): CrmPartner[] {
    return rows
        .map(enrichedRowToCrmPartner)
        .sort((a, b) => (b.diasDesdeLancamento ?? 0) - (a.diasDesdeLancamento ?? 0));
}
