import { useState, useEffect, useCallback } from 'react';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import {
    fetchGatewaySheetTable,
    saveGatewaySheetCache,
    loadGatewaySheetCache,
} from '../utils/dataSync';

const EMPTY_TAB_VARIANTS: string[] = [];

interface UseGatewaySheetDataOptions {
    sheetId: string;
    tab: string;
    cacheKey: string;
    enabled?: boolean;
    allowEmpty?: boolean;
    tabVariants?: string[];
}

export function useGatewaySheetData({
    sheetId,
    tab,
    cacheKey,
    enabled = true,
    allowEmpty = false,
    tabVariants,
}: UseGatewaySheetDataOptions) {
    const variants = tabVariants ?? EMPTY_TAB_VARIANTS;
    const variantsKey = variants.join('|');
    const [table, setTable] = useState<GatewaySheetTable>({ headers: [], rows: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        const cached = loadGatewaySheetCache(cacheKey);
        const hasCache = !!(cached?.data?.rows?.length);

        if (hasCache) {
            setTable(cached!.data);
            setLastSyncTime(cached!.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            setError(null);
            const data = await fetchGatewaySheetTable(sheetId, tab, {
                allowEmpty,
                tabVariants: variants,
            });
            const syncTime = new Date();
            setTable(data);
            setLastSyncTime(syncTime);
            setIsUsingCache(false);
            saveGatewaySheetCache(cacheKey, { data, lastSyncTime: syncTime });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : `Falha ao carregar aba ${tab}`;
            setError(message);
            if (hasCache && cached) {
                setTable(cached.data);
                setLastSyncTime(cached.lastSyncTime);
                setIsUsingCache(true);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [enabled, sheetId, tab, cacheKey, allowEmpty, variantsKey]);

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }
        const cached = loadGatewaySheetCache(cacheKey);
        if (cached?.data?.rows?.length) {
            setTable(cached.data);
            setLastSyncTime(cached.lastSyncTime);
            setIsUsingCache(true);
            setIsLoading(false);
        }
        performSync();
    }, [performSync, enabled, cacheKey]);

    return {
        table,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        isUsingCache,
        refreshData: performSync,
    };
}
