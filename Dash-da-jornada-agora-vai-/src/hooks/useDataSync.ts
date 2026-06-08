import { useState, useEffect, useCallback } from 'react';
import { type PerformanceRow } from '../components/PerformanceTable';
import { LOGO_SHEET_SOURCE } from '../config/dataSource';
import {
    fetchGoogleSheetsData,
    fetchPartnerLogoMap,
    mergeLogoMapIntoRows,
    fetchAvaliacoesMap,
    mergeAvaliacoesMapIntoRows,
    fetchRelevanceMap,
    mergeRelevanceMapIntoRows,
    fetchStatusOverridesMap,
    mergeStatusOverridesIntoRows,
    saveToCache,
    loadFromCache,
    type SyncResult,
} from '../utils/dataSync';

interface DataSourceConfig {
    sheetId: string;
    range?: string;
}

interface UseDataSyncOptions {
    sources: DataSourceConfig[];
    cacheKey?: string;
    /** Pula logos, avaliações, relevância e overrides — reduz chamadas à API */
    skipSideData?: boolean;
    /** Fetch customizado (ex.: desempenho CD com fallback de abas) */
    customFetcher?: () => Promise<PerformanceRow[]>;
    /** Atraso antes do primeiro fetch (evita 429 ao abrir abas em sequência) */
    fetchDelayMs?: number;
    autoRefreshIntervalMs?: number;
    enabled?: boolean;
}

export function useDataSync({
    sources,
    cacheKey,
    skipSideData = false,
    customFetcher,
    fetchDelayMs = 0,
    autoRefreshIntervalMs = 3600000,
    enabled = true,
}: UseDataSyncOptions) {
    const [data, setData] = useState<PerformanceRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;
        if (!sources || sources.length === 0) {
            setError("No data sources provided.");
            setIsLoading(false);
            return;
        }

        const cached = loadFromCache(cacheKey);
        const hasCache = !!(cached?.data?.length);

        if (hasCache) {
            setData(cached!.data);
            setLastSyncTime(cached!.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            setError(null);

            const flatFetchedData = customFetcher
                ? await customFetcher()
                : (await Promise.all(
                    sources.map(source =>
                        fetchGoogleSheetsData(source.sheetId, source.range || 'NOVOS!A6:Z100')
                    )
                )).flat();

            if (skipSideData) {
                const syncResult: SyncResult = {
                    data: flatFetchedData,
                    lastSyncTime: new Date(),
                };
                setData(syncResult.data);
                setLastSyncTime(syncResult.lastSyncTime);
                setIsUsingCache(false);
                saveToCache(syncResult, cacheKey);
            } else {
                const [fetchedLogoMap, fetchedAvaliacoesMap, fetchedRelevanceMap, fetchedStatusOverridesMap] = await Promise.all([
                    fetchPartnerLogoMap(LOGO_SHEET_SOURCE.sheetId, LOGO_SHEET_SOURCE.range).catch((err) => {
                        console.warn('[useDataSync] Planilha de logos indisponível; usando só logos da planilha principal.', err);
                        return {} as Record<string, string>;
                    }),
                    fetchAvaliacoesMap().catch((err) => {
                        console.warn('[useDataSync] Planilha de avaliações indisponível.', err);
                        return {} as Record<string, number>;
                    }),
                    fetchRelevanceMap().catch((err) => {
                        console.warn('[useDataSync] Supabase relevance map indisponível.', err);
                        return {} as Record<string, number>;
                    }),
                    fetchStatusOverridesMap().catch((err) => {
                        console.warn('[useDataSync] Supabase status overrides indisponível.', err);
                        return {} as Record<string, { promo: string; cupom: string }>;
                    }),
                ]);

                let mergedData = mergeLogoMapIntoRows(flatFetchedData, fetchedLogoMap);
                mergedData = mergeAvaliacoesMapIntoRows(mergedData, fetchedAvaliacoesMap);
                mergedData = mergeRelevanceMapIntoRows(mergedData, fetchedRelevanceMap);
                mergedData = mergeStatusOverridesIntoRows(mergedData, fetchedStatusOverridesMap);

                const syncResult: SyncResult = {
                    data: mergedData,
                    lastSyncTime: new Date(),
                };

                setData(syncResult.data);
                setLastSyncTime(syncResult.lastSyncTime);
                setIsUsingCache(false);
                saveToCache(syncResult, cacheKey);
            }

        } catch (err: any) {
            console.error("Data sync failed:", err);
            setError(err.message || "Failed to synchronize data.");

            if (hasCache) {
                setData(cached!.data);
                setLastSyncTime(cached!.lastSyncTime);
                setIsUsingCache(true);
            } else {
                const fallback = loadFromCache(cacheKey);
                if (fallback) {
                    setData(fallback.data);
                    setLastSyncTime(fallback.lastSyncTime);
                    setIsUsingCache(true);
                }
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [sources, cacheKey, enabled, skipSideData, customFetcher]);

    // Initial load — com delay opcional para evitar rajadas de requisição
    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }

        const cached = loadFromCache(cacheKey);
        if (cached?.data?.length) {
            setData(cached.data);
            setLastSyncTime(cached.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
        }

        const timeoutId = setTimeout(() => {
            performSync();
        }, fetchDelayMs);

        return () => clearTimeout(timeoutId);
    }, [performSync, enabled, fetchDelayMs, cacheKey]);

    useEffect(() => {
        if (!autoRefreshIntervalMs || !enabled) return;
        const intervalId = setInterval(() => {
            performSync();
        }, autoRefreshIntervalMs);

        return () => clearInterval(intervalId);
    }, [performSync, autoRefreshIntervalMs, enabled]);

    useEffect(() => {
        if (!enabled) return;
        const scheduleNextRefresh = () => {
            const now = new Date();
            const target = new Date(now);
            target.setHours(8, 5, 0, 0);

            if (now.getTime() > target.getTime()) {
                target.setDate(target.getDate() + 1);
            }

            const msUntilTarget = target.getTime() - now.getTime();

            return setTimeout(() => {
                performSync();
                scheduleNextRefresh();
            }, msUntilTarget);
        };

        const timeoutId = scheduleNextRefresh();

        return () => clearTimeout(timeoutId);
    }, [performSync, enabled]);

    return {
        data,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: () => performSync(),
    };
}
