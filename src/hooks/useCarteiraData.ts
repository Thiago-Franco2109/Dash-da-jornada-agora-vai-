import { useState, useEffect, useCallback } from 'react';
import { CARTEIRA_DATA_SOURCE } from '../config/dataSource';
import type { CarteiraRow } from '../types/carteira';
import {
    fetchCarteiraSheetData,
    saveCarteiraCache,
    loadCarteiraCache,
} from '../utils/dataSync';

interface UseCarteiraDataOptions {
    enabled?: boolean;
}

export function useCarteiraData({ enabled = true }: UseCarteiraDataOptions = {}) {
    const [rows, setRows] = useState<CarteiraRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        const cached = loadCarteiraCache();
        const hasCache = !!(cached?.data?.length);

        if (hasCache) {
            setRows(cached!.data);
            setLastSyncTime(cached!.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            setError(null);
            const data = await fetchCarteiraSheetData(
                CARTEIRA_DATA_SOURCE.sheetId,
                CARTEIRA_DATA_SOURCE.range,
            );
            const syncTime = new Date();
            setRows(data);
            setLastSyncTime(syncTime);
            setIsUsingCache(false);
            saveCarteiraCache({ data, lastSyncTime: syncTime });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar carteira';
            setError(message);
            if (hasCache && cached) {
                setRows(cached.data);
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
        const cached = loadCarteiraCache();
        if (cached?.data?.length) {
            setRows(cached.data);
            setLastSyncTime(cached.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
        }
        performSync();
    }, [performSync, enabled]);

    return {
        rows,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: performSync,
    };
}
