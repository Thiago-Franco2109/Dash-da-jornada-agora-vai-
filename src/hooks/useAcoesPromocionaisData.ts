import { useCallback, useEffect, useState } from 'react';
import type {
    AcaoPromocionalCidade,
    AcaoPromocionalDrillDown,
    AcaoPromocionalMetrica,
    AcoesPromocionaisTotais,
} from '../types/acoesPromocionais';

// ─────────────────────────────────────────────────────────────────────────
// Integração com a Netlify Function `acoes-promocionais` (banco MySQL).
// Mesma convenção de auth de `useEstabelecimentos.ts`.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/acoes-promocionais';

function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '';
    const options: RequestInit = { credentials: 'include' as RequestCredentials };
    if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
    }
    return options;
}

async function fetchFn<T>(query: string): Promise<T> {
    const res = await fetch(`${FN_URL}${query}`, getFetchOptions());
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
        if (res.status === 401) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        throw new Error(json?.error || `Erro ${res.status} ao consultar ações promocionais.`);
    }
    return json as T;
}

interface AcoesPromocionaisResponse {
    cidades: AcaoPromocionalCidade[];
    totais: AcoesPromocionaisTotais;
}

interface UseAcoesPromocionaisDataOptions {
    enabled?: boolean;
}

export function useAcoesPromocionaisData({ enabled = true }: UseAcoesPromocionaisDataOptions = {}) {
    const [cidades, setCidades] = useState<AcaoPromocionalCidade[]>([]);
    const [totais, setTotais] = useState<AcoesPromocionaisTotais | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const load = useCallback((isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true); else setIsLoading(true);
        setError(null);
        fetchFn<AcoesPromocionaisResponse>('')
            .then(res => {
                setCidades(res.cidades);
                setTotais(res.totais);
                setLastSyncTime(new Date());
            })
            .catch(err => {
                console.warn('[useAcoesPromocionaisData] falha:', err);
                setError(err.message);
            })
            .finally(() => {
                setIsLoading(false);
                setIsRefreshing(false);
            });
    }, []);

    useEffect(() => {
        if (!enabled) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return {
        cidades,
        totais,
        isLoading,
        isRefreshing,
        error,
        lastSyncTime,
        refresh: () => load(true),
    };
}

/** Busca lazy da lista de estabelecimentos de uma cidade+métrica (drill-down). */
export function fetchAcaoPromocionalDrillDown(
    cidade: string,
    metrica: AcaoPromocionalMetrica,
): Promise<AcaoPromocionalDrillDown> {
    const params = new URLSearchParams({ cidade, metrica });
    return fetchFn<AcaoPromocionalDrillDown>(`?${params.toString()}`);
}
