import { useState, useEffect, useCallback } from 'react';
import { type PerformanceRow } from '../components/PerformanceTable';
import { LOGO_SHEET_SOURCE } from '../config/dataSource';
import {
    fetchGoogleSheetsData,
    fetchPartnerLogoMap,
    mergeLogoMapIntoRows,
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
    autoRefreshIntervalMs?: number; // fallback interval, e.g., 60 * 60 * 1000 for 1 hour
    enabled?: boolean; // se false, nenhum fetch será disparado (usar quando não autenticado)
}

export function useDataSync({ sources, autoRefreshIntervalMs = 3600000, enabled = true }: UseDataSyncOptions) {
    const [data, setData] = useState<PerformanceRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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

        try {
            setIsLoading(true);
            setError(null);
            setIsUsingCache(false);

            // Fetch from all sources in parallel
            const fetchPromises = sources.map(source => 
                fetchGoogleSheetsData(source.sheetId, source.range || 'NOVOS!A6:Z100')
            );

            const [allFetchedDataResults, logoMap] = await Promise.all([
                Promise.all(fetchPromises),
                fetchPartnerLogoMap(LOGO_SHEET_SOURCE.sheetId, LOGO_SHEET_SOURCE.range).catch((err) => {
                    console.warn('[useDataSync] Planilha de logos indisponível; usando só logos da planilha principal.', err);
                    return {} as Record<string, string>;
                })
            ]);

            // Flatten all fetched data into a single array
            const flatFetchedData = allFetchedDataResults.flat();

            const mergedData = mergeLogoMapIntoRows(flatFetchedData, logoMap);

            const syncResult: SyncResult = {
                data: mergedData,
                lastSyncTime: new Date(),
            };

            setData(syncResult.data);
            setLastSyncTime(syncResult.lastSyncTime);
            saveToCache(syncResult);

        } catch (err: any) {
            console.error("Data sync failed:", err);
            setError(err.message || "Failed to synchronize data.");

            // Load from cache on failure if available and not already loaded
            const cached = loadFromCache();
            if (cached) {
                setData(cached.data);
                setLastSyncTime(cached.lastSyncTime);
                setIsUsingCache(true);
            }
        } finally {
            setIsLoading(false);
        }
    }, [sources, enabled]);



    // Initial load — só executa quando enabled for true
    useEffect(() => {
        if (enabled) performSync();
        else { setIsLoading(false); }
    }, [performSync, enabled]);

    // Setup interval for fallback refresh
    useEffect(() => {
        if (!autoRefreshIntervalMs || !enabled) return;
        const intervalId = setInterval(() => {
            performSync();
        }, autoRefreshIntervalMs);

        return () => clearInterval(intervalId);
    }, [performSync, autoRefreshIntervalMs, enabled]);

    // Setup scheduled daily refresh at 08:05 AM America/Sao_Paulo
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
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: () => performSync()
    };
}
