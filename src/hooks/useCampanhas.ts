import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Estado REAL de campanhas por parceiro (Netlify Function cs → banco).
// Fonte única app-wide (leve, cacheada), pra todas as telas.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/campanhas';

export interface CampanhaPartner {
    superPromos: boolean;
    ofertasDaCasa: boolean;
    cupons: boolean;
    campanhas: string[];
}

export type CampanhasMap = Record<string, CampanhaPartner>;

let _cache: CampanhasMap | null = null;

async function fetchCampanhas(): Promise<CampanhasMap> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar campanhas.`);
    }
    return (json.data ?? {}) as CampanhasMap;
}

/**
 * Mapa de campanhas ativas por estabelecimento_id (estado real da plataforma).
 * Vazio enquanto carrega ou se falhar (o app segue funcionando).
 */
export function useCampanhas() {
    const [campanhasMap, setCampanhasMap] = useState<CampanhasMap>(_cache ?? {});
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchCampanhas()
            .then(map => { _cache = map; setCampanhasMap(map); setLoading(false); })
            .catch(err => {
                console.warn('[useCampanhas] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (_cache) return;
        load();
    }, [load]);

    return { campanhasMap, loading, error, refetch: load };
}
