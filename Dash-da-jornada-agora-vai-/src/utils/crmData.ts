import type { GatewaySheetTable } from '../types/gatewaySheet';
import type { CrmPartner, CrmParseInfo } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import {
    cellText,
    cellByPosition,
    resolveSheetColumn,
} from './sheetColumnMatch';
import { normalizeEstabId } from './indicadorSheet';
import { getManagerForPartner } from '../config/managerMapping';

/**
 * Layout fixo da aba INDICADOR (1 linha = 1 parceiro):
 * A=CIDADE B=ESTAB_ID C=ESTABELECIMENTO D=CONTRATO E=PROMOÇÃO F=CUPOM PARC. G+=GMV mensal
 */
const INDICADOR_IDX = {
    cidade: 0,
    estabId: 1,
    estabelecimento: 2,
    contrato: 3,
    promo: 4,
    cupom: 5,
    gmv: 6,
} as const;

const INDICADOR_NAMES = {
    cidade: ['CIDADE'],
    estabId: ['ESTAB_ID', 'ESTAB ID'],
    estabelecimento: ['ESTABELECIMENTO'],
    contrato: ['CONTRATO'],
    promo: ['PROMOÇÃO', 'PROMOCAO', 'Promoção'],
    cupom: ['CUPOM PARC.', 'CUPOM PARC', 'CUPOM PARC.', 'CUPOM_PARC'],
} as const;

export interface AprovAguarCounts {
    aprov: number;
    aguar: number;
}

interface PromoSheetInfo {
    hasAprovadoAtivo: boolean;
    hasAguardando: boolean;
    itemCount: number;
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

    return {
        cidade,
        estabId,
        estabelecimento: estabelecimento.trim(),
        contrato: cellByPosition(row, orderedHeaders, INDICADOR_IDX.contrato, [...INDICADOR_NAMES.contrato]) || 'ativo',
        promoRaw: cellByPosition(row, orderedHeaders, INDICADOR_IDX.promo, [...INDICADOR_NAMES.promo]),
        cupomRaw: cellByPosition(row, orderedHeaders, INDICADOR_IDX.cupom, [...INDICADOR_NAMES.cupom]),
        gmvRaw,
        gmvCol,
    };
}

function sheetIdentityFromEstabId(row: Record<string, unknown>, orderedHeaders: string[]): { estabId: string; key: string } | null {
    const estabId = normalizeEstabId(cellByPosition(row, orderedHeaders, 1, ['ESTAB_ID', 'ESTAB ID']));
    if (!estabId) return null;
    return { estabId, key: buildPartnerLookupKey(estabId) };
}

function buildPromoEspecialMap(table: GatewaySheetTable): Map<string, PromoSheetInfo> {
    const ordered = orderedHeadersOf(table);
    const statusCol = resolveSheetColumn(ordered, ['STATUS']);
    const ativoCol = resolveSheetColumn(ordered, ['ATIVO']);
    const map = new Map<string, PromoSheetInfo>();

    for (const row of table.rows) {
        const id = sheetIdentityFromEstabId(row, ordered);
        if (!id) continue;

        const cur = map.get(id.key) ?? { hasAprovadoAtivo: false, hasAguardando: false, itemCount: 0 };
        const status = cellText(row, statusCol).toLowerCase();
        const ativo = cellText(row, ativoCol).toLowerCase();

        cur.itemCount += 1;
        if (status.includes('aprov') && ativo.includes('ativ')) cur.hasAprovadoAtivo = true;
        if (status.includes('aguar')) cur.hasAguardando = true;
        map.set(id.key, cur);
    }

    return map;
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

function resolvePromoStatus(
    override: PromoStatus | undefined,
    promoSheet: PromoSheetInfo | undefined,
    indicador: AprovAguarCounts,
): PromoStatus {
    if (override) return override;
    if (promoSheet?.hasAprovadoAtivo) return 'ativo';
    if (indicador.aprov > 0) return 'ativo';
    if (promoSheet?.hasAguardando || indicador.aguar > 0) return 'aguardando';
    return 'aguardando';
}

function resolveCupomStatus(
    override: PromoStatus | undefined,
    cupomSheet: CupomSheetInfo | undefined,
    indicador: AprovAguarCounts,
): PromoStatus {
    if (override) return override;
    if (cupomSheet?.hasAtivo) return 'ativo';
    if (indicador.aprov > 0) return 'ativo';
    if (indicador.aguar > 0) return 'aguardando';
    return 'aguardando';
}

export function parseCrmPartners(
    indicador: GatewaySheetTable,
    promoEspecial: GatewaySheetTable,
    cupomParceiro: GatewaySheetTable,
    options?: {
        logoMap?: Record<string, string>;
        statusOverrides?: Record<string, { promo: string; cupom: string }>;
    },
): { partners: CrmPartner[]; parseInfo: CrmParseInfo } {
    const ordered = orderedHeadersOf(indicador);
    const promoMap = buildPromoEspecialMap(promoEspecial);
    const cupomMap = buildCupomParceiroMap(cupomParceiro);
    const logoMap = options?.logoMap ?? {};
    const overrides = options?.statusOverrides ?? {};

    const partners: CrmPartner[] = [];
    let skipped = 0;

    for (const row of indicador.rows) {
        const parsed = parseIndicadorRow(row, ordered);
        if (!parsed) {
            skipped++;
            continue;
        }

        const lookupKey = buildPartnerLookupKey(parsed.estabId);
        const partnerId = parsed.estabId;
        const override = overrides[partnerId] ?? overrides[parsed.estabelecimento];

        const promoSheet = promoMap.get(lookupKey);
        const cupomSheet = cupomMap.get(lookupKey);

        const promoCounts = parseAprovAguarCell(parsed.promoRaw);
        const cupomCounts = parseAprovAguarCell(parsed.cupomRaw);

        const promoStatus = resolvePromoStatus(
            override?.promo as PromoStatus | undefined,
            promoSheet,
            promoCounts,
        );
        const cupomStatus = resolveCupomStatus(
            override?.cupom as PromoStatus | undefined,
            cupomSheet,
            cupomCounts,
        );

        const gmvValue = parseBRL(parsed.gmvRaw);
        const analista = getManagerForPartner(parsed.cidade, 'Desconhecido', undefined, 'marketplace');

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
            statusParceiro: parsed.contrato,
            indiceGmv: gmvValue > 0 ? gmvValue : null,
            indiceGmvRaw: parsed.gmvRaw || '—',
            gmvMesLabel: parsed.gmvCol ?? '',
            promoResumo: formatAprovAguarSummary(promoCounts),
            cupomResumo: formatAprovAguarSummary(cupomCounts),
            promoItensAtivos: promoSheet?.itemCount ?? 0,
            cupomCount: cupomSheet?.cupomCount ?? 0,
            promoStatus,
            cupomStatus,
            hasPromoAtiva: Boolean(promoSheet?.hasAprovadoAtivo || promoCounts.aprov > 0),
            hasCupomAtivo: Boolean(cupomSheet?.hasAtivo || cupomCounts.aprov > 0),
            analista: analista !== 'Desconhecido' ? analista : undefined,
            logoUrl,
        });
    }

    if (import.meta.env.DEV) {
        console.info('[crmData] INDICADOR parseado:', {
            linhas: indicador.rows.length,
            parceiros: partners.length,
            ignoradas: skipped,
            amostra: partners[0]?.estabelecimento,
            colunas: ordered.slice(0, 8),
        });
    }

    return {
        partners,
        parseInfo: {
            indicadorRows: indicador.rows.length,
            promoEspecialRows: promoEspecial.rows.length,
            cupomParceiroRows: cupomParceiro.rows.length,
            indicadorHeaders: ordered.slice(0, 12).map((h, i) => h.trim() || `col ${i}`),
            gmvColumn: findGmvMonthColumns(ordered)[0] ?? null,
            parsedPartners: partners.length,
            skippedRows: skipped,
        },
    };
}
