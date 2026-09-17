import type { EnrichedPerformanceRow } from './calculations';
import type { CrmPartner } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import { KNOWN_CAMPAIGN_TYPE_IDS, campaignIdFromNome, type CampaignTypeId } from '../config/campaignTypes';
import { getRowCampaignStatus } from '../components/PerformanceTable';

/**
 * Converte linhas da jornada (28 dias) no formato que os componentes do CRM
 * esperam, pro CRM Jornada reaproveitar o Kanban sem forkar nada.
 *
 * É o caminho inverso de `indicadorPerformance.ts` (CrmPartner → linha de
 * performance). Aqui a fonte é `enrichedData`, que já tem tudo — inclusive
 * `dias_desde_lancamento`, que o CrmPartner do CRM Promoções não tem.
 */

type ItemState = NonNullable<CrmPartner['campaigns'][CampaignTypeId]['itemState']>;

/**
 * Estado do item daquela campanha, direto do banco (promo_resumo), por campanha.
 *
 * Tem que ser por campanha: `promo_resumo.aprovado` é a soma de TODAS as
 * campanhas, então usá-lo pra decidir Super Promos fazia um parceiro com item
 * aprovado só em "Promo do Dia" aparecer com Super Promos ativa.
 */
function estadoDoItem(row: EnrichedPerformanceRow, campaignId: CampaignTypeId): { itemState: ItemState; pendenteDias: number | null } {
    const entry = row.promo_resumo?.detalhe?.find(d => campaignIdFromNome(d.campanha) === campaignId);
    if (!entry) return { itemState: 'sem_item', pendenteDias: null };
    if (entry.status === 'aprovado') return { itemState: 'aprovado', pendenteDias: null };
    if (entry.status === 'pendente') return { itemState: 'pendente', pendenteDias: entry.dias ?? null };
    if (entry.status === 'rascunho') return { itemState: 'rascunho', pendenteDias: null };
    return { itemState: 'sem_item', pendenteDias: null };
}

/**
 * Em que coluna do kanban o parceiro cai, naquela campanha.
 *
 * A marcação do CS ganha do fato do banco (menos quando já está aprovado):
 * `ofertei` significa que a conversa aconteceu, e o banco não tem como saber
 * disso — o item continua pendente até alguém aprovar. Quem tem item pendente e
 * nenhuma marcação cai em "Não ofertado", que é literalmente verdade: a oferta
 * existe mas nunca foi ofertada ao parceiro.
 */
function statusDaColuna(row: EnrichedPerformanceRow, campaignId: CampaignTypeId, itemState: ItemState): PromoStatus {
    if (itemState === 'aprovado') return 'ativo';
    const marcado = getRowCampaignStatus(row, campaignId);
    if (marcado === 'negado' || marcado === 'ofertei') return marcado;
    return marcado === 'ativo' ? 'aguardando' : marcado;
}

export function enrichedRowToCrmPartner(row: EnrichedPerformanceRow): CrmPartner {
    const id = String(row.estab_id ?? '');

    const campaigns = Object.fromEntries(
        KNOWN_CAMPAIGN_TYPE_IDS.map(campaignId => {
            // Cupom não tem item promocional: o estado dele vem do próprio status.
            if (campaignId === 'cupons_destaque') {
                const status = getRowCampaignStatus(row, campaignId);
                return [campaignId, { status, resumo: '', itemCount: 0, hasActive: status === 'ativo' }];
            }
            const { itemState, pendenteDias } = estadoDoItem(row, campaignId);
            const status = statusDaColuna(row, campaignId, itemState);
            return [campaignId, {
                status,
                resumo: '',
                itemCount: 0,
                hasActive: status === 'ativo',
                itemState,
                pendenteDias,
            }];
        }),
    ) as CrmPartner['campaigns'];

    const promoStatus = campaigns.super_promos.status;
    const cupomStatus = campaigns.cupons_destaque.status;

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
        promoItensAtivos: 0,
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
