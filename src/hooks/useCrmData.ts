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
import { parseCrmPartners, CRM_PARSER_VERSION } from '../utils/crmData';
import { indicadorHasCampaignColumns } from '../utils/indicadorSheet';
import { buildParceirosStatusMapFromDb, type ParceirosStatusEntry } from '../utils/parceirosSheet';
import { agentDebugLog } from '../utils/agentDebugLog';
import {
    fetchGatewaySheetTable,
    fetchPartnerLogoMap,
    fetchStatusOverridesMap,
    fetchRelevanceMap,
    saveRelevanceScore,
    saveGatewaySheetCache,
    loadGatewaySheetCache,
    CACHE_KEYS,
} from '../utils/dataSync';

interface CrmCachePayload {
    partners: CrmPartner[];
    parseInfo: CrmParseInfo;
    relevanceMap: Record<string, number>;
    lastSyncTime: Date;
    parserVersion?: number;
}

const EMPTY_TABLE: GatewaySheetTable = { headers: [], rows: [] };

const PARCEIROS_STATUS_FN_URL = '/.netlify/functions/parceiros-status';

/**
 * Status do contrato direto do banco — substitui a aba PARCEIROS.
 * Retorna null se a Function falhar, e aí o parser volta a ler a aba.
 */
async function fetchParceirosStatusMap(): Promise<Map<string, ParceirosStatusEntry> | null> {
    try {
        const res = await fetch(PARCEIROS_STATUS_FN_URL, {
            credentials: 'include' as RequestCredentials,
            cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false || !json?.porEstab) {
            throw new Error(json?.error || `Erro ${res.status} ao carregar status de contrato.`);
        }
        return buildParceirosStatusMapFromDb(json.porEstab);
    } catch (err) {
        console.warn('[useCrmData] parceiros-status indisponível; usando a aba PARCEIROS:', err);
        return null;
    }
}

function reparseFromGatewayCaches(
    options?: { logoMap?: Record<string, string>; statusOverrides?: Record<string, { promo: string; cupom: string }> },
): CrmCachePayload | null {
    const indicadorCache = loadGatewaySheetCache(CACHE_KEYS.crm_indicador);
    if (!indicadorCache?.data?.rows?.length) return null;

    const promoCache = loadGatewaySheetCache(CACHE_KEYS.crm_promo);
    const cupomCache = loadGatewaySheetCache(CACHE_KEYS.crm_cupom);
    const parceirosCache = loadGatewaySheetCache(CACHE_KEYS.crm_parceiros);

    const { partners, parseInfo } = parseCrmPartners(
        indicadorCache.data,
        promoCache?.data ?? EMPTY_TABLE,
        cupomCache?.data ?? EMPTY_TABLE,
        parceirosCache?.data ?? EMPTY_TABLE,
        options,
    );
    if (partners.length === 0) return null;

    return {
        partners,
        parseInfo,
        relevanceMap: {},
        lastSyncTime: indicadorCache.lastSyncTime,
        parserVersion: CRM_PARSER_VERSION,
    };
}

function loadCrmCache(): CrmCachePayload | null {
    try {
        const raw = localStorage.getItem(CACHE_KEYS.crm);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.partners)) return null;
        if (parsed.parserVersion !== CRM_PARSER_VERSION) return null;
        return {
            partners: parsed.partners,
            parseInfo: parsed.parseInfo,
            relevanceMap: parsed.relevanceMap ?? {},
            lastSyncTime: new Date(parsed.lastSyncTime),
            parserVersion: parsed.parserVersion,
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
            relevanceMap: payload.relevanceMap,
            lastSyncTime: payload.lastSyncTime.toISOString(),
            parserVersion: CRM_PARSER_VERSION,
        }));
    } catch {
        /* ignore */
    }
}

function loadInitialCrmPayload(): CrmCachePayload | null {
    const cached = loadCrmCache();
    if (cached) return cached;
    return reparseFromGatewayCaches();
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
    const [relevanceMap, setRelevanceMap] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        const cached = loadInitialCrmPayload();
        const hasCache = !!(cached?.partners?.length);

        if (hasCache) {
            setPartners(cached!.partners);
            setParseInfo(cached!.parseInfo);
            setRelevanceMap(cached!.relevanceMap ?? {});
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

            const [promoEspecial, cupomParceiro, parceiros, parceirosStatusMap, logoMap, statusOverrides, relevance] = await Promise.all([
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
                fetchParceirosStatusMap(),
                fetchPartnerLogoMap(LOGO_SHEET_SOURCE.sheetId, LOGO_SHEET_SOURCE.range).catch(() => ({} as Record<string, string>)),
                fetchStatusOverridesMap().catch(() => ({})),
                fetchRelevanceMap().catch(() => ({})),
            ]);

            const { partners: parsed, parseInfo: info } = parseCrmPartners(
                indicador,
                promoEspecial,
                cupomParceiro,
                parceiros,
                { logoMap, statusOverrides, parceirosStatusMap: parceirosStatusMap ?? undefined },
            );

            const mega = parsed.find(p => p.estabId === '26904');
            // #region agent log
            agentDebugLog({ hypothesisId: 'H2-H5', location: 'useCrmData.ts:performSync', message: 'CRM sync completed', runId: 'post-fix-v6', data: { hadInitialCache: hasCache, parserVersion: CRM_PARSER_VERSION, cacheKeyIndicador: CACHE_KEYS.crm_indicador, indicadorRowCount: indicador.rows.length, indicadorHeaders: (indicador.orderedHeaders ?? indicador.headers).slice(0, 10), hasCampaignCols: indicadorHasCampaignColumns(indicador.orderedHeaders ?? indicador.headers ?? []), parsedCount: parsed.length, mega: mega ? { promoStatus: mega.campaigns.super_promos.status, cupomStatus: mega.campaigns.cupons_destaque.status, promoResumo: mega.campaigns.super_promos.resumo, cupomResumo: mega.campaigns.cupons_destaque.resumo } : null, carandaiSuperPromos: parsed.filter(p => p.cidade === 'Carandaí').reduce((a, p) => { a[p.campaigns.super_promos.status] = (a[p.campaigns.super_promos.status] ?? 0) + 1; return a; }, {} as Record<string, number>) } });
            // #endregion

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
            setRelevanceMap(relevance);
            setLastSyncTime(syncTime);
            setIsUsingCache(false);
            saveCrmCache({ partners: parsed, parseInfo: info, relevanceMap: relevance, lastSyncTime: syncTime });

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

            const reparsed = reparseFromGatewayCaches();
            if (reparsed) {
                setPartners(reparsed.partners);
                setParseInfo(reparsed.parseInfo);
                setLastSyncTime(reparsed.lastSyncTime);
                setIsUsingCache(true);
                saveCrmCache(reparsed);
            } else if (hasCache && cached) {
                setPartners(cached.partners);
                setParseInfo(cached.parseInfo);
                setRelevanceMap(cached.relevanceMap ?? {});
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
        const initial = loadInitialCrmPayload();
        if (initial?.partners?.length) {
            setPartners(initial.partners);
            setParseInfo(initial.parseInfo);
            setRelevanceMap(initial.relevanceMap ?? {});
            setLastSyncTime(initial.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
        }
        performSync();
    }, [performSync, enabled]);

    const updateRelevance = useCallback(async (partnerId: string | number, score: number) => {
        const id = String(partnerId);
        const previous = relevanceMap[id];
        // atualização otimista
        setRelevanceMap(prev => {
            const next = { ...prev };
            if (score <= 0) delete next[id];
            else next[id] = score;
            return next;
        });
        const res = await saveRelevanceScore(id, score);
        if (!res.success) {
            // reverte em caso de falha
            setRelevanceMap(prev => {
                const next = { ...prev };
                if (previous == null) delete next[id];
                else next[id] = previous;
                return next;
            });
        }
        return res;
    }, [relevanceMap]);

    return {
        partners,
        parseInfo,
        relevanceMap,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: performSync,
        updateRelevance,
    };
}
