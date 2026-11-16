import { useState, useCallback, useEffect } from 'react';
import { ACCESS_DATA_SOURCE } from '../config/dataSource';
import { encodeSheetTabForGateway } from '../utils/dataSync';
import { findCellByNames } from '../utils/sheetColumnMatch';

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? 'https://sheets-api-production-0097.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem("auth_token");
    const options: RequestInit = { credentials: "include" as RequestCredentials };
    if (token) {
        options.headers = {
            ...options.headers,
            "Authorization": `Bearer ${token}`
        };
    }
    return options;
}


// Detecta se uma string é uma coluna de data no formato "YYYY-M-D" ou "YYYY-MM-DD"
function isDateColumn(key: string): boolean {
    return /^\d{4}-\d{1,2}-\d{1,2}$/.test(key.trim());
}

export interface StoreAccessData {
    estabelecimento: string;
    estabId: string;           // id da planilha ('' quando a linha não traz)
    acessosUnicos: number;    // soma total de todos os dias disponíveis
    mediaDiaria: number;       // média de acessos por dia
    lastDayAcessos: number;    // valor do último dia disponível
    totalDias: number;         // quantos dias têm dados
    /** nome repetido na planilha: a linha não identifica uma loja só */
    ambiguo?: boolean;
    raw: Record<string, any>;  // linha completa da planilha
}

const ACCESS_ID_COLUMNS = ['ESTAB_ID', 'ESTABELECIMENTO_ID', 'ID_ESTABELECIMENTO', 'ID LOJA', 'ID'];

/** Chaves do mapa: id é autoritativo, nome é fallback (ver memória: identidade é o ID) */
const byId = (id: string) => `id:${id.trim()}`;
const byName = (nome: string) => `nome:${nome.trim().toLowerCase()}`;

/**
 * Resolve os acessos de um parceiro. Tenta o estab_id primeiro; só cai no nome
 * quando a planilha não traz id. Nome repetido devolve null — a planilha tem
 * duas lojas com aquele nome e qualquer número escolhido seria chute.
 */
export function lookupAccess(
    accessData: Record<string, StoreAccessData>,
    partner: { estab_id?: string | number | null; estabelecimento?: string | null },
): StoreAccessData | null {
    const id = partner.estab_id == null ? '' : String(partner.estab_id).trim();
    if (id) {
        const hit = accessData[byId(id)];
        if (hit) return hit;
    }

    const nome = (partner.estabelecimento ?? '').trim();
    if (!nome) return null;

    const hit = accessData[byName(nome)];
    if (!hit || hit.ambiguo) return null;
    return hit;
}

export function useDailyAccessSync({ enabled = true }: { enabled?: boolean } = {}) {
    const [accessData, setAccessData] = useState<Record<string, StoreAccessData>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const performSync = useCallback(async () => {
        if (!enabled) return;
        if (!ACCESS_DATA_SOURCE.sheetId) {
            setError("Access Sheet ID is missing.");
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const url = apiUrl(`/api/sheets/${ACCESS_DATA_SOURCE.sheetId}/${encodeSheetTabForGateway(ACCESS_DATA_SOURCE.range)}`);
            const res = await fetch(url, getFetchOptions());


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

                const estabId = findCellByNames(row, ACCESS_ID_COLUMNS).replace(/\D/g, '');

                const entry: StoreAccessData = {
                    estabelecimento: storeName.trim(),
                    estabId,
                    acessosUnicos: totalAcessos,
                    mediaDiaria,
                    lastDayAcessos,
                    totalDias: diasComDados,
                    raw: row,
                };

                // O id identifica a loja sozinho; o nome não (se repete entre cidades).
                if (estabId) parsedData[byId(estabId)] = entry;

                // Antes a linha seguinte de mesmo nome sobrescrevia a anterior em
                // silêncio e o painel mostrava o acesso da loja errada. Agora a
                // colisão fica marcada e o número é omitido.
                const nameKey = byName(storeName);
                const prev = parsedData[nameKey];
                if (prev && prev.estabId !== estabId) {
                    parsedData[nameKey] = { ...prev, ambiguo: true };
                } else if (!prev) {
                    parsedData[nameKey] = entry;
                }
            });

            setAccessData(parsedData);
            setLastSyncTime(new Date());

        } catch (err: any) {
            console.error("Access data sync failed:", err);
            setError(err.message || "Failed to synchronize access data.");
        } finally {
            setIsLoading(false);
        }
    }, [enabled]);

    // Initial load — só executa quando enabled for true
    useEffect(() => {
        if (enabled) performSync();
        else setIsLoading(false);
    }, [performSync, enabled]);

    return {
        accessData,
        loadingAccess: isLoading,
        accessError: error,
        lastAccessSync: lastSyncTime,
        refreshAccessData: performSync
    };
}
