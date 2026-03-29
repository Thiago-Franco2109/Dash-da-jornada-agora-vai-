import { useState, useCallback, useEffect } from 'react';
import { ACCESS_DATA_SOURCE } from '../config/dataSource';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://bigou-sheets-api.netlify.app";

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

export interface StoreAccessData {
    estabelecimento: string;
    acessosUnicos: number; // fallback numeric representation of total visits
    raw: Record<string, any>; // other columns
}

export function useDailyAccessSync() {
    const [accessData, setAccessData] = useState<Record<string, StoreAccessData>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const performSync = useCallback(async () => {
        if (!ACCESS_DATA_SOURCE.sheetId) {
            setError("Access Sheet ID is missing.");
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            // Fetch exactly as requested by user
            const url = apiUrl(`/api/sheets/${ACCESS_DATA_SOURCE.sheetId}/${encodeURIComponent(ACCESS_DATA_SOURCE.range)}`);
            const res = await fetch(url, {
                credentials: "include"
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch access data: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();
            
            const rows = json.data?.rows || (Array.isArray(json) ? json : json.values || []);
            const parsedData: Record<string, StoreAccessData> = {};

            rows.forEach((row: any) => {
                if (!row) return;

                // Attempt to auto-detect the store identifier column
                const keys = Object.keys(row);
                let storeNameKey = keys.find(k => /estabelecimento|loja|parceiro|nome/i.test(k)) || keys[0];
                let storeName = row[storeNameKey];
                
                if (typeof storeName !== 'string' || !storeName.trim()) return;

                // Try to find the "accesses" column
                let accessCount = 0;
                let accessesKey = keys.find(k => /acesso|sessão|sessoes|visita|unico|único/i.test(k));
                if (accessesKey && row[accessesKey] != null) {
                    const parsed = parseInt(String(row[accessesKey]).replace(/\D/g, ''), 10);
                    if (!isNaN(parsed)) accessCount = parsed;
                } else {
                    // Try to guess by finding the largest numeric column that could be visits
                    for (const k of keys) {
                        if (k === storeNameKey) continue;
                        const parsed = parseInt(String(row[k]).replace(/\D/g, ''), 10);
                        if (!isNaN(parsed) && parsed > accessCount) {
                            accessCount = parsed;
                        }
                    }
                }

                parsedData[storeName.trim()] = {
                    estabelecimento: storeName.trim(),
                    acessosUnicos: accessCount,
                    raw: row
                };
            });

            setAccessData(parsedData);
            setLastSyncTime(new Date());

        } catch (err: any) {
            console.error("Access data sync failed:", err);
            setError(err.message || "Failed to synchronize access data.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        performSync();
    }, [performSync]);

    return {
        accessData,
        loadingAccess: isLoading,
        accessError: error,
        lastAccessSync: lastSyncTime,
        refreshAccessData: performSync
    };
}
