import type { GatewaySheetTable } from '../types/gatewaySheet';
import type { CrmPartner, CrmParseInfo } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import {
    CAMPAIGN_TYPE_IDS,
    CAMPAIGN_TYPES,
    KNOWN_CAMPAIGN_TYPE_IDS,
    type CampaignSheetInfo,
    type CampaignTypeId,
    emptyCampaignSheetInfo,
    resolveCampaignStatusFromSheet,
    resolveCampaignTypeId,
} from '../config/campaignTypes';
import {
    cellText,
    cellByPosition,
    findCellByNames,
    resolveSheetColumn,
} from './sheetColumnMatch';
import { normalizeEstabId, normalizeIndicadorGatewayPayload } from './indicadorSheet';
import { buildParceirosStatusMap, resolveParceiroStatusFromMap, type ParceirosStatusEntry } from './parceirosSheet';
import { getManagerForPartner } from '../config/managerMapping';
import { agentDebugLog } from './agentDebugLog';

/** Incrementar quando a lógica de parse/status mudar — invalida cache CRM pré-parseado */
export const CRM_PARSER_VERSION = 7;

/**
 * Layout fixo da aba INDICADOR (1 linha = 1 parceiro):
 * A=CIDADE B=ESTAB_ID C=ESTABELECIMENTO D=CONTRATO E=OFERTAS DA CASA F=SUPER PROMOS G=CUPOM PARC. H+=GMV mensal
 */
const INDICADOR_IDX = {
    cidade: 0,
    estabId: 1,
    estabelecimento: 2,
    contrato: 3,
    ofertas_da_casa: 4,
    promo: 5,
    cupom: 6,
    gmv: 7,
} as const;

const INDICADOR_NAMES = {
    cidade: ['CIDADE'],
    estabId: ['ESTAB_ID', 'ESTAB ID'],
    estabelecimento: ['ESTABELECIMENTO'],
    contrato: ['CONTRATO'],
    ofertas_da_casa: ['OFERTAS DA CASA', 'Ofertas da Casa'],
    promo: ['SUPER PROMOS', 'Super Promos', 'PROMOÇÃO', 'PROMOCAO', 'Promoção'],
    cupom: ['CUPOM PARC.', 'CUPOM PARC', 'CUPOM_PARC'],
} as const;

export interface AprovAguarCounts {
    aprov: number;
    aguar: number;
}

interface CupomSheetInfo {
    cupomCount: number;
    hasAtivo: boolean;
}

interface ParsedIndicadorRow {
    cidade: string;
    estabId: string;
    estabelecimento: string;
    contrato: string;
    promoRaw: string;
    cupomRaw: string;
    gmvRaw: string;
    gmvCol: string | null;
    /** Série mês a mês em ordem cronológica (mais antigo → mais recente) */
    gmvSeries: { label: string; value: number }[];
}

function orderedHeadersOf(table: GatewaySheetTable): string[] {
    if (table.orderedHeaders?.length) return table.orderedHeaders;
    if (table.headers.length > 0) return table.headers;
    const first = table.rows[0];
    return first ? Object.keys(first) : [];
}

function normalizeKey(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function buildPartnerLookupKey(estabId: string): string {
    return `id:${normalizeKey(estabId)}`;
}

export function normalizeCrmCity(city: string): string {
    return city.trim();
}

export function crmCitiesMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    return normalizeCrmCity(a) === normalizeCrmCity(b);
}

export function parseAprovAguarCell(raw: unknown): AprovAguarCounts {
    const text = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\n/g, ' ');
    const aprov = parseInt(text.match(/APROV:\s*(\d+)/i)?.[1] ?? '0', 10);
    const aguar = parseInt(text.match(/AGUAR:\s*(\d+)/i)?.[1] ?? '0', 10);
    return {
        aprov: Number.isNaN(aprov) ? 0 : aprov,
        aguar: Number.isNaN(aguar) ? 0 : aguar,
    };
}

export function formatAprovAguarSummary(counts: AprovAguarCounts): string {
    const parts: string[] = [];
    if (counts.aprov > 0) parts.push(`APROV: ${counts.aprov}`);
    if (counts.aguar > 0) parts.push(`AGUAR: ${counts.aguar}`);
    return parts.join(' · ') || '—';
}

export function parseBRL(val: unknown): number {
    if (val == null || val === '') return 0;
    let raw = String(val).replace(/R\$/gi, '').replace(/\s/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(raw);
    return Number.isNaN(n) ? 0 : n;
}

export function formatBRL(value: number): string {
    if (value <= 0) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function findGmvMonthColumns(headers: string[]): string[] {
    return headers.filter(h => /^[a-záàâãéêíóôõúç]{3,4}\.\/\d{2,4}$/i.test(h.trim()));
}

function looksLikeMoney(val: string): boolean {
    return /R\$\s*[\d.,]+/i.test(val);
}

function looksLikePartnerName(val: string): boolean {
    if (!val || looksLikeMoney(val)) return false;
    if (/^\d+$/.test(val)) return false;
    if (/^(ativo|suspenso|cancelado|estabelecimento|cidade|estab_id)$/i.test(val)) return false;
    if (/APROV:|AGUAR:/i.test(val)) return false;
    return val.length >= 2;
}

function isHeaderDuplicateRow(estabelecimento: string, estabId: string): boolean {
    const e = estabelecimento.toLowerCase();
    return e === 'estabelecimento' || e === 'parceiro' || estabId.toLowerCase() === 'estab_id';
}

function readIndicadorCampaignCell(
    row: Record<string, unknown>,
    orderedHeaders: string[],
    index: number,
    names: readonly string[],
    legacyKeys: string[],
): string {
    const primary = cellByPosition(row, orderedHeaders, index, [...names]);
    if (primary) return primary;
    for (const key of legacyKeys) {
        const byKey = cellText(row, key) || findCellByNames(row, [key]);
        if (byKey) return byKey;
    }
    return '';
}

/**
 * Lê uma linha do INDICADOR — fonte mestra, 1 linha = 1 parceiro.
 * O nome exibido no CRM vem sempre de ESTABELECIMENTO (coluna C).
 */
export function parseIndicadorRow(
    row: Record<string, unknown>,
    orderedHeaders: string[],
): ParsedIndicadorRow | null {
    const cidade = cellByPosition(row, orderedHeaders, INDICADOR_IDX.cidade, [...INDICADOR_NAMES.cidade]);
    const estabIdRaw = cellByPosition(row, orderedHeaders, INDICADOR_IDX.estabId, [...INDICADOR_NAMES.estabId]);
    const estabId = normalizeEstabId(estabIdRaw);
    const estabelecimento = cellByPosition(
        row,
        orderedHeaders,
        INDICADOR_IDX.estabelecimento,
        [...INDICADOR_NAMES.estabelecimento],
    );

    if (isHeaderDuplicateRow(estabelecimento, estabIdRaw)) return null;
    if (!looksLikePartnerName(estabelecimento)) return null;
    if (!estabId) return null;

    const gmvCols = findGmvMonthColumns(orderedHeaders);
    const gmvCol = gmvCols[0] ?? orderedHeaders[INDICADOR_IDX.gmv] ?? null;
    const gmvRaw = gmvCol ? cellText(row, gmvCol) : cellByPosition(row, orderedHeaders, INDICADOR_IDX.gmv);

    // Série histórica: as colunas vêm do mês mais recente para o mais antigo
    // na planilha; invertemos para ordem cronológica (antigo → recente).
    const gmvSeries = gmvCols
        .map(col => ({ label: col.trim(), value: parseBRL(cellText(row, col)) }))
        .reverse();

    return {
        cidade,
        estabId,
        estabelecimento: estabelecimento.trim(),
        contrato: cellByPosition(row, orderedHeaders, INDICADOR_IDX.contrato, [...INDICADOR_NAMES.contrato]) || 'ativo',
        promoRaw: readIndicadorCampaignCell(row, orderedHeaders, INDICADOR_IDX.promo, INDICADOR_NAMES.promo, ['PROMOÇÃO', 'PROMOCAO', 'Promoção']),
        cupomRaw: readIndicadorCampaignCell(row, orderedHeaders, INDICADOR_IDX.cupom, INDICADOR_NAMES.cupom, ['CUPOM PARC', 'CUPOM_PARC']),
        gmvRaw,
        gmvCol,
        gmvSeries,
    };
}

function sheetIdentityFromEstabId(row: Record<string, unknown>, orderedHeaders: string[]): { estabId: string; key: string } | null {
    const estabId = normalizeEstabId(cellByPosition(row, orderedHeaders, 1, ['ESTAB_ID', 'ESTAB ID']));
    if (!estabId) return null;
    return { estabId, key: buildPartnerLookupKey(estabId) };
}

/**
 * Campanhas vistas na aba PROMO-ESPECIAL que não batem com nenhum dos 3 tipos
 * conhecidos — nome bruto (trimado) usado como id dinâmico. Preenchido como
 * efeito colateral de buildPromoEspecialCampaignMap; consumido por
 * parseCrmPartners pra montar CrmParseInfo.dynamicCampaigns.
 */
const discoveredDynamicCampaigns = new Map<string, string>();

function buildPromoEspecialCampaignMap(table: GatewaySheetTable): Map<string, Map<CampaignTypeId, CampaignSheetInfo>> {
    const ordered = orderedHeadersOf(table);
    const statusCol = resolveSheetColumn(ordered, ['STATUS']);
    const ativoCol = resolveSheetColumn(ordered, ['ATIVO']);
    const campanhaCol = resolveSheetColumn(ordered, ['CAMPANHA', 'Campanha']);
    const map = new Map<string, Map<CampaignTypeId, CampaignSheetInfo>>();
    discoveredDynamicCampaigns.clear();

    for (const row of table.rows) {
        const id = sheetIdentityFromEstabId(row, ordered);
        if (!id) continue;

        const campaignRaw = cellText(row, campanhaCol).trim();
        if (!campaignRaw) continue;
        // Tipo conhecido (Super Promos/Ofertas da Casa/Cupons) vira o id canônico;
        // qualquer outro nome vira id dinâmico somente-leitura (o próprio nome bruto).
        const campaignId = resolveCampaignTypeId(campaignRaw) ?? campaignRaw;
        if (!KNOWN_CAMPAIGN_TYPE_IDS.includes(campaignId as typeof KNOWN_CAMPAIGN_TYPE_IDS[number])) {
            discoveredDynamicCampaigns.set(campaignId, campaignRaw);
        }

        let partnerCampaigns = map.get(id.key);
        if (!partnerCampaigns) {
            partnerCampaigns = new Map();
            map.set(id.key, partnerCampaigns);
        }

        const cur = partnerCampaigns.get(campaignId) ?? emptyCampaignSheetInfo();
        const status = cellText(row, statusCol).toLowerCase();
        const ativo = cellText(row, ativoCol).toLowerCase();

        cur.itemCount += 1;
        if (status.includes('aprov') && ativo.includes('ativ')) cur.hasAprovadoAtivo = true;
        if (status.includes('aguar')) cur.hasAguardando = true;
        partnerCampaigns.set(campaignId, cur);
    }

    return map;
}

function cupomSheetToCampaignInfo(info: CupomSheetInfo | undefined): CampaignSheetInfo | undefined {
    if (!info) return undefined;
    return {
        itemCount: info.cupomCount,
        hasAprovadoAtivo: info.hasAtivo,
        hasAguardando: false,
    };
}

function buildCupomParceiroMap(table: GatewaySheetTable): Map<string, CupomSheetInfo> {
    const ordered = orderedHeadersOf(table);
    const fimCol = resolveSheetColumn(ordered, ['DATA_FIM', 'DATA FIM']);
    const inicioCol = resolveSheetColumn(ordered, ['DATA_INICIO', 'DATA INICIO']);
    const map = new Map<string, CupomSheetInfo>();
    const now = Date.now();

    for (const row of table.rows) {
        const id = sheetIdentityFromEstabId(row, ordered);
        if (!id) continue;

        const cur = map.get(id.key) ?? { cupomCount: 0, hasAtivo: false };
        const fimRaw = cellText(row, fimCol);
        const inicioRaw = cellText(row, inicioCol);
        let vigente = true;
        if (fimRaw) {
            const fim = Date.parse(fimRaw);
            if (!Number.isNaN(fim) && fim < now) vigente = false;
        }
        if (inicioRaw) {
            const ini = Date.parse(inicioRaw);
            if (!Number.isNaN(ini) && ini > now) vigente = false;
        }

        cur.cupomCount += 1;
        if (vigente) cur.hasAtivo = true;
        map.set(id.key, cur);
    }

    return map;
}

function mergeCampaignSheetInfo(
    promoMap: Map<string, Map<CampaignTypeId, CampaignSheetInfo>>,
    cupomMap: Map<string, CupomSheetInfo>,
    lookupKey: string,
    campaignId: CampaignTypeId,
): CampaignSheetInfo | undefined {
    const fromPromo = promoMap.get(lookupKey)?.get(campaignId);
    if (campaignId === 'cupons_destaque') {
        const fromCupom = cupomSheetToCampaignInfo(cupomMap.get(lookupKey));
        if (fromPromo && fromCupom) {
            return {
                itemCount: fromPromo.itemCount + fromCupom.itemCount,
                hasAprovadoAtivo: fromPromo.hasAprovadoAtivo || fromCupom.hasAprovadoAtivo,
                hasAguardando: fromPromo.hasAguardando || fromCupom.hasAguardando,
            };
        }
        return fromPromo ?? fromCupom;
    }
    return fromPromo;
}

function buildPartnerCampaigns(
    lookupKey: string,
    promoCampaignMap: Map<string, Map<CampaignTypeId, CampaignSheetInfo>>,
    cupomMap: Map<string, CupomSheetInfo>,
    promoCounts: AprovAguarCounts,
    cupomCounts: AprovAguarCounts,
    overrides: { promo?: string; cupom?: string },
): CrmPartner['campaigns'] {
    const campaigns = {} as CrmPartner['campaigns'];

    for (const campaign of CAMPAIGN_TYPES) {
        const sheetInfo = mergeCampaignSheetInfo(promoCampaignMap, cupomMap, lookupKey, campaign.id);
        const indicadorCounts =
            campaign.id === 'super_promos' ? promoCounts
            : campaign.id === 'cupons_destaque' ? cupomCounts
            : undefined;

        let override: PromoStatus | undefined;
        if (campaign.id === 'super_promos' && overrides.promo) override = overrides.promo as PromoStatus;
        if (campaign.id === 'cupons_destaque' && overrides.cupom) override = overrides.cupom as PromoStatus;

        const status = resolveCampaignStatusFromSheet(override, sheetInfo, indicadorCounts);
        const resumo = indicadorCounts ? formatAprovAguarSummary(indicadorCounts) : '—';

        campaigns[campaign.id] = {
            status,
            resumo: campaign.id === 'ofertas_da_casa' && !indicadorCounts
                ? (sheetInfo?.itemCount ? `${sheetInfo.itemCount} item(ns)` : '—')
                : resumo,
            itemCount: sheetInfo?.itemCount ?? 0,
            hasActive: Boolean(sheetInfo?.hasAprovadoAtivo || (indicadorCounts?.aprov ?? 0) > 0),
            sheetInfo,
        };
    }

    // Campanhas descobertas dinamicamente (fora dos 3 tipos conhecidos): status
    // calculado só do dado real da planilha/banco, sem override manual do CS.
    for (const dynamicId of discoveredDynamicCampaigns.keys()) {
        const sheetInfo = mergeCampaignSheetInfo(promoCampaignMap, cupomMap, lookupKey, dynamicId);
        const status = resolveCampaignStatusFromSheet(undefined, sheetInfo, undefined);
        campaigns[dynamicId] = {
            status,
            resumo: sheetInfo?.itemCount ? `${sheetInfo.itemCount} item(ns)` : '—',
            itemCount: sheetInfo?.itemCount ?? 0,
            hasActive: Boolean(sheetInfo?.hasAprovadoAtivo),
            sheetInfo,
        };
    }

    return campaigns;
}

export function parseCrmPartners(
    indicador: GatewaySheetTable,
    promoEspecial: GatewaySheetTable,
    cupomParceiro: GatewaySheetTable,
    parceiros: GatewaySheetTable,
    options?: {
        logoMap?: Record<string, string>;
        statusOverrides?: Record<string, { promo: string; cupom: string }>;
        /** Status vindo do banco (Function `parceiros-status`); a aba PARCEIROS só entra se faltar. */
        parceirosStatusMap?: Map<string, ParceirosStatusEntry>;
    },
): { partners: CrmPartner[]; parseInfo: CrmParseInfo } {
    const ordered = orderedHeadersOf(indicador);
    // Sempre re-normaliza: aplica aliases legados (PROMOÇÃO → SUPER PROMOS) mesmo em cache local
    const normalizedIndicador = normalizeIndicadorGatewayPayload(ordered, indicador.rows);
    const parseHeaders = normalizedIndicador.orderedHeaders ?? ordered;
    const parseRows = normalizedIndicador.rows;

    const promoCampaignMap = buildPromoEspecialCampaignMap(promoEspecial);
    const cupomMap = buildCupomParceiroMap(cupomParceiro);
    const parceirosStatusMap = options?.parceirosStatusMap ?? buildParceirosStatusMap(parceiros);
    const logoMap = options?.logoMap ?? {};
    const overrides = options?.statusOverrides ?? {};

    const partners: CrmPartner[] = [];
    const seenEstabIds = new Set<string>();
    let skipped = 0;
    let duplicates = 0;
    let parceirosMatched = 0;

    for (const row of parseRows) {
        const parsed = parseIndicadorRow(row, parseHeaders);
        if (!parsed) {
            skipped++;
            continue;
        }

        const lookupKey = buildPartnerLookupKey(parsed.estabId);
        const partnerId = parsed.estabId;

        // Deduplica: a planilha INDICADOR às vezes tem linhas repetidas para o
        // mesmo parceiro. Duplicatas geram keys de React iguais (estabelecimento
        // -cidade) e quebram a reconciliação ao filtrar. Mantém a 1ª ocorrência.
        if (seenEstabIds.has(partnerId)) {
            duplicates++;
            continue;
        }
        seenEstabIds.add(partnerId);
        const override = overrides[partnerId] ?? overrides[parsed.estabelecimento];

        const promoCounts = parseAprovAguarCell(parsed.promoRaw);
        const cupomCounts = parseAprovAguarCell(parsed.cupomRaw);

        const campaigns = buildPartnerCampaigns(
            lookupKey,
            promoCampaignMap,
            cupomMap,
            promoCounts,
            cupomCounts,
            { promo: override?.promo, cupom: override?.cupom },
        );

        const campaignStatuses = Object.fromEntries(
            CAMPAIGN_TYPE_IDS.map(id => [id, campaigns[id].status]),
        ) as CrmPartner['campaignStatuses'];

        const gmvValue = parseBRL(parsed.gmvRaw);
        const analista = getManagerForPartner(parsed.cidade, 'Desconhecido', undefined, 'marketplace', parsed.estabId);
        const statusParceiro = resolveParceiroStatusFromMap(parsed.estabId, parceirosStatusMap, parsed.contrato);
        if (parceirosStatusMap.has(lookupKey)) parceirosMatched++;

        const logoUrl =
            logoMap[partnerId] ||
            logoMap[parsed.estabelecimento] ||
            logoMap[normalizeKey(parsed.estabelecimento)] ||
            undefined;

        partners.push({
            partnerId,
            cidade: normalizeCrmCity(parsed.cidade),
            estabId: parsed.estabId,
            estabelecimento: parsed.estabelecimento,
            statusParceiro,
            indiceGmv: gmvValue > 0 ? gmvValue : null,
            indiceGmvRaw: parsed.gmvRaw || '—',
            gmvMesLabel: parsed.gmvCol ?? '',
            gmvMensal: parsed.gmvSeries,
            campaigns,
            campaignStatuses,
            promoResumo: campaigns.super_promos.resumo,
            cupomResumo: campaigns.cupons_destaque.resumo,
            promoItensAtivos: campaigns.super_promos.itemCount,
            cupomCount: campaigns.cupons_destaque.itemCount,
            promoStatus: campaigns.super_promos.status,
            cupomStatus: campaigns.cupons_destaque.status,
            hasPromoAtiva: campaigns.super_promos.hasActive,
            hasCupomAtivo: campaigns.cupons_destaque.hasActive,
            analista: analista !== 'Desconhecido' ? analista : undefined,
            logoUrl,
        });
    }

    if (import.meta.env.DEV) {
        console.info('[crmData] INDICADOR parseado:', {
            linhas: parseRows.length,
            parceiros: partners.length,
            ignoradas: skipped,
            duplicadas: duplicates,
            amostra: partners[0]?.estabelecimento,
            colunas: parseHeaders.slice(0, 8),
        });
    }

    const mega = partners.find(p => p.estabId === '26904' || p.partnerId === '26904');
    // #region agent log
    agentDebugLog({ hypothesisId: 'H3-H4', location: 'crmData.ts:parseCrmPartners', message: 'CRM parse summary', runId: 'post-fix-v6', data: { parserVersion: CRM_PARSER_VERSION, indicadorHeaders: parseHeaders.slice(0, 10), partnerCount: partners.length, promoSheetRows: promoEspecial.rows.length, cupomSheetRows: cupomParceiro.rows.length, mega: mega ? { estabId: mega.estabId, cidade: mega.cidade, promoResumo: mega.campaigns.super_promos.resumo, cupomResumo: mega.campaigns.cupons_destaque.resumo, promoStatus: mega.campaigns.super_promos.status, cupomStatus: mega.campaigns.cupons_destaque.status, override: overrides[mega.estabId] ?? null } : null, statusDistribution: { aguardando: partners.filter(p => p.campaigns.super_promos.status === 'aguardando').length, ativo: partners.filter(p => p.campaigns.super_promos.status === 'ativo').length, ofertei: partners.filter(p => p.campaigns.super_promos.status === 'ofertei').length } } });
    // #endregion

    return {
        partners,
        parseInfo: {
            indicadorRows: indicador.rows.length,
            promoEspecialRows: promoEspecial.rows.length,
            cupomParceiroRows: cupomParceiro.rows.length,
            parceirosRows: parceiros.rows.length,
            parceirosMatched,
            indicadorHeaders: parseHeaders.slice(0, 12).map((h, i) => h.trim() || `col ${i}`),
            gmvColumn: findGmvMonthColumns(parseHeaders)[0] ?? null,
            parsedPartners: partners.length,
            skippedRows: skipped,
            dynamicCampaigns: Array.from(discoveredDynamicCampaigns, ([id, label]) => ({ id, label }))
                .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
        },
    };
}
