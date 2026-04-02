import { useState, useCallback, useEffect } from 'react';
import { ACCESS_DATA_SOURCE } from '../config/dataSource';

function apiUrl(path: string) {
    return `/.netlify/functions/sheets-proxy${path}`;
}


// Detecta se uma string é uma coluna de data no formato "YYYY-M-D" ou "YYYY-MM-DD"
function isDateColumn(key: string): boolean {
    return /^\d{4}-\d{1,2}-\d{1,2}$/.test(key.trim());
}

export interface StoreAccessData {
    estabelecimento: string;
    acessosUnicos: number;    // soma total de todos os dias disponíveis
    mediaDiaria: number;       // média de acessos por dia
    lastDayAcessos: number;    // valor do último dia disponível
    totalDias: number;         // quantos dias têm dados
    raw: Record<string, any>;  // linha completa da planilha
}

export function useDailyAccessSync() {
    const [accessData, setAccessData] = useState<Record<string, StoreAccessData>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const performSync = useCallback(async () => {
        if (!ACCESS_DATA_SOURCE.type) {
            setError("Access Sheet type is missing.");
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const url = apiUrl(`?type=${ACCESS_DATA_SOURCE.type}&tab=${encodeURIComponent(ACCESS_DATA_SOURCE.range)}`);
            const res = await fetch(url, { credentials: "include" });


            if (!res.ok) {
                throw new Error(`Failed to fetch access data: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();
            const rows: Record<string, any>[] = json.data?.rows || (Array.isArray(json) ? json : json.values || []);
            const parsedData: Record<string, StoreAccessData> = {};

            rows.forEach((row: any) => {
                if (!row) return;

                const keys = Object.keys(row);

                // A coluna "Loja" (ou similar) identifica o estabelecimento
                const storeNameKey = keys.find(k => /^loja$|^estabelecimento$|^parceiro$|^nome$/i.test(k.trim())) || keys[0];
                const storeName = row[storeNameKey];

                if (typeof storeName !== 'string' || !storeName.trim()) return;

                // Todas as outras colunas com formato YYYY-M-D ou YYYY-MM-DD são acessos diários
                const dateKeys = keys.filter(k => k !== storeNameKey && isDateColumn(k));

                // Ordena as datas para pegar o dia mais recente
                const sortedDates = [...dateKeys].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                let totalAcessos = 0;
                let diasComDados = 0;
                let lastDayAcessos = 0;

                for (const dateKey of dateKeys) {
                    const val = parseInt(String(row[dateKey] ?? '').replace(/\D/g, ''), 10);
                    if (!isNaN(val) && val > 0) {
                        totalAcessos += val;
                        diasComDados++;
                    }
                }

                if (sortedDates.length > 0) {
                    const lastKey = sortedDates[sortedDates.length - 1];
                    lastDayAcessos = parseInt(String(row[lastKey] ?? '').replace(/\D/g, ''), 10) || 0;
                }

                const mediaDiaria = diasComDados > 0 ? Math.round(totalAcessos / diasComDados) : 0;

                // Indexa pela chave em lowercase para matching case-insensitive
                parsedData[storeName.trim().toLowerCase()] = {
                    estabelecimento: storeName.trim(),
                    acessosUnicos: totalAcessos,
                    mediaDiaria,
                    lastDayAcessos,
                    totalDias: diasComDados,
                    raw: row,
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
