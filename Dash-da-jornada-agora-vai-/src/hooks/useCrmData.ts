import { useState, useEffect, useCallback } from 'react';
import {
    INDICADOR_DATA_SOURCE,
    PROMO_ESPECIAL_DATA_SOURCE,
    CUPOM_PARCEIRO_DATA_SOURCE,
    PARCEIROS_DATA_SOURCE,
    LOGO_SHEET_SOURCE,
} from '../config/dataSource';
import type { CrmPartner, CrmParseInfo } from '../types/crm';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import { parseCrmPartners } from '../utils/crmData';
import {
    fetchGatewaySheetTable,
    fetchPartnerLogoMap,
    fetchStatusOverridesMap,
    saveGatewaySheetCache,
    loadGatewaySheetCache,
    CACHE_KEYS,
} from '../utils/dataSync';

interface CrmCachePayload {
    partners: CrmPartner[];
    parseInfo: CrmParseInfo;
    lastSyncTime: Date;
}

const EMPTY_TABLE: GatewaySheetTable = { headers: [], rows: [] };

function loadCrmCache(): CrmCachePayload | null {
    try {
        const raw = localStorage.getItem(CACHE_KEYS.crm);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.partners)) return null;
        return {
            partners: parsed.partners,
            parseInfo: parsed.parseInfo,
            lastSyncTime: new Date(parsed.lastSyncTime),
        };
    } catch {
        return null;
    }
}

function saveCrmCache(payload: CrmCachePayload): void {
    try {
        localStorage.setItem(CACHE_KEYS.crm, JSON.stringify({
            partners: payload.partners,
            parseInfo: payload.parseInfo,
            lastSyncTime: payload.lastSyncTime.toISOString(),
        }));
    } catch {
        /* ignore */
    }
}

async function fetchOptionalCrmSheet(
    sheetId: string,
    tab: string,
    variants: string[],
    cacheKey: string,
): Promise<GatewaySheetTable> {
    const cached = loadGatewaySheetCache(cacheKey);
    try {
        const table = await fetchGatewaySheetTable(sheetId, tab, {
            tabVariants: variants,
            allowEmpty: true,
        });
        saveGatewaySheetCache(cacheKey, { data: table, lastSyncTime: new Date() });
        return table;
    } catch (err) {
        console.warn(`[useCrmData] Aba opcional "${tab}" falhou:`, err);
        return cached?.data ?? EMPTY_TABLE;
    }
}

interface UseCrmDataOptions {
    enabled?: boolean;
}

export function useCrmData({ enabled = true }: UseCrmDataOptions = {}) {
    const [partners, setPartners] = useState<CrmPartner[]>([]);
    const [parseInfo, setParseInfo] = useState<CrmParseInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        const cached = loadCrmCache();
        const hasCache = !!(cached?.partners?.length);

        if (hasCache) {
            setPartners(cached!.partners);
            setParseInfo(cached!.parseInfo);
            setLastSyncTime(cached!.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            setError(null);

            const indicador = await fetchGatewaySheetTable(
                INDICADOR_DATA_SOURCE.sheetId,
                INDICADOR_DATA_SOURCE.range,
                {
                    tabVariants: [
                        'INDICADOR_FORMATADO',
                        'INDICADOR Formatado',
                        'indicador_formatado',
                        'INDICADOR',
                    ],
                    layout: 'indicador',
                },
            );
            saveGatewaySheetCache(CACHE_KEYS.crm_indicador, { data: indicador, lastSyncTime: new Date() });

            const [promoEspecial, cupomParceiro, parceiros, logoMap, statusOverrides] = await Promise.all([
                fetchOptionalCrmSheet(
                    PROMO_ESPECIAL_DATA_SOURCE.sheetId,
                    PROMO_ESPECIAL_DATA_SOURCE.range,
                    ['PROMO-ESPECIAL', 'PROMO_ESPECIAL', 'PROMO ESPECIAL'],
                    CACHE_KEYS.crm_promo,
                ),
                fetchOptionalCrmSheet(
                    CUPOM_PARCEIRO_DATA_SOURCE.sheetId,
                    CUPOM_PARCEIRO_DATA_SOURCE.range,
                    ['CUPOM-PARCEIRO', 'CUPOM_PARCEIRO', 'CUPOM PARCEIRO', 'CUPOM-PARC'],
                    CACHE_KEYS.crm_cupom,
                ),
                fetchOptionalCrmSheet(
                    PARCEIROS_DATA_SOURCE.sheetId,
                    PARCEIROS_DATA_SOURCE.range,
                    ['PARCEIROS', 'Parceiros'],
                    CACHE_KEYS.crm_parceiros,
                ),
                fetchPartnerLogoMap(LOGO_SHEET_SOURCE.sheetId, LOGO_SHEET_SOURCE.range).catch(() => ({} as Record<string, string>)),
                fetchStatusOverridesMap().catch(() => ({})),
            ]);

            const { partners: parsed, parseInfo: info } = parseCrmPartners(
                indicador,
                promoEspecial,
                cupomParceiro,
                parceiros,
                { logoMap, statusOverrides },
            );

            if (parsed.length === 0 && indicador.rows.length > 0) {
                console.warn('[useCrmData] Parser retornou 0 parceiros.', {
                    indicadorRows: indicador.rows.length,
                    headers: indicador.headers,
                    sample: indicador.rows[0],
                });
            }

            const syncTime = new Date();
            setPartners(parsed);
            setParseInfo(info);
            setLastSyncTime(syncTime);
            setIsUsingCache(false);
            saveCrmCache({ partners: parsed, parseInfo: info, lastSyncTime: syncTime });

            if (parsed.length === 0) {
                setError(
                    indicador.rows.length > 0
                        ? `INDICADOR_FORMATADO carregou ${indicador.rows.length} linhas, mas nenhum parceiro foi reconhecido. Cabeçalhos: ${info.indicadorHeaders.slice(0, 8).join(', ') || '(vazio)'}`
                        : 'A aba INDICADOR_FORMATADO retornou vazia. Verifique login no Gateway e o nome da aba.',
                );
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar dados do CRM';
            setError(message);

            const indicadorCache = loadGatewaySheetCache(CACHE_KEYS.crm_indicador);
            if (indicadorCache?.data?.rows?.length) {
                const promoCache = loadGatewaySheetCache(CACHE_KEYS.crm_promo);
                const cupomCache = loadGatewaySheetCache(CACHE_KEYS.crm_cupom);
                const parceirosCache = loadGatewaySheetCache(CACHE_KEYS.crm_parceiros);
                const { partners: parsed, parseInfo: info } = parseCrmPartners(
                    indicadorCache.data,
                    promoCache?.data ?? EMPTY_TABLE,
                    cupomCache?.data ?? EMPTY_TABLE,
                    parceirosCache?.data ?? EMPTY_TABLE,
                );
                if (parsed.length > 0) {
                    setPartners(parsed);
                    setParseInfo(info);
                    setIsUsingCache(true);
                } else if (hasCache && cached) {
                    setPartners(cached.partners);
                    setParseInfo(cached.parseInfo);
                    setLastSyncTime(cached.lastSyncTime);
                    setIsUsingCache(true);
                }
            } else if (hasCache && cached) {
                setPartners(cached.partners);
                setParseInfo(cached.parseInfo);
                setLastSyncTime(cached.lastSyncTime);
                setIsUsingCache(true);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }
        const cached = loadCrmCache();
        if (cached?.partners?.length) {
            setPartners(cached.partners);
            setParseInfo(cached.parseInfo);
            setLastSyncTime(cached.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
        }
        performSync();
    }, [performSync, enabled]);

    return {
        partners,
        parseInfo,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: performSync,
    };
}
