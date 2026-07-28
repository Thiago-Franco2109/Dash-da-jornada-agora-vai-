import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Lista de parceiros ativos direto do banco (delivery=1), app-wide/cacheada.
// Usada para SUPLEMENTAR a carteira com parceiros que ainda não estão na
// planilha de pedidos (ex: recém-ativados sem venda).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/parceiros-ativos';

export interface ParceiroAtivo {
    id: number;
    nome: string;
    uid: string | null;
    cidade: string | null;
    localidadeId: number | null;
}

let _cache: ParceiroAtivo[] | null = null;

async function fetchParceirosAtivos(): Promise<ParceiroAtivo[]> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar parceiros do banco.`);
    }
    return (json.data ?? []) as ParceiroAtivo[];
}

export function useParceirosAtivos() {
    const [parceiros, setParceiros] = useState<ParceiroAtivo[]>(_cache ?? []);
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchParceirosAtivos()
            .then(list => { _cache = list; setParceiros(list); setLoading(false); })
            .catch(err => {
                console.warn('[useParceirosAtivos] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (_cache) return;
        load();
    }, [load]);

    return { parceiros, loading, error, refetch: load };
}
