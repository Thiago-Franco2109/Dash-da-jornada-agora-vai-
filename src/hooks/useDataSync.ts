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

interface UseDataSyncOptions {
    sheetType: string;
    range?: string;
    autoRefreshIntervalMs?: number; // fallback interval, e.g., 60 * 60 * 1000 for 1 hour
}

export function useDataSync({ sheetType, range = 'NOVOS!A6:Z100', autoRefreshIntervalMs = 3600000 }: UseDataSyncOptions) {
    const [data, setData] = useState<PerformanceRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!sheetType) {
            setError("Sheet type is missing.");
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);
            setIsUsingCache(false);

            const [fetchedData, logoMap] = await Promise.all([
                fetchGoogleSheetsData(sheetType, range),
                fetchPartnerLogoMap(LOGO_SHEET_SOURCE.type, LOGO_SHEET_SOURCE.range).catch((err) => {

                    console.warn('[useDataSync] Planilha de logos indisponível; usando só logos da planilha principal.', err);
                    return {} as Record<string, string>;
                }),
            ]);

            const mergedData = mergeLogoMapIntoRows(fetchedData, logoMap);

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
    }, [sheetType, range]);


    // Initial load
    useEffect(() => {
        performSync();
    }, [performSync]);

    // Setup interval for fallback refresh
    useEffect(() => {
        if (!autoRefreshIntervalMs) return;
        const intervalId = setInterval(() => {
            performSync();
        }, autoRefreshIntervalMs);

        return () => clearInterval(intervalId);
    }, [performSync, autoRefreshIntervalMs]);

    // Setup scheduled daily refresh at 08:05 AM America/Sao_Paulo
    useEffect(() => {
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
    }, [performSync]);

    return {
        data,
        isLoading,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: () => performSync()
    };
}
