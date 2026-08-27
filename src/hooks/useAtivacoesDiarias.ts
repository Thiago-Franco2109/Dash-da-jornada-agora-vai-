import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Ativação de campanhas por dia (Netlify function ativacoes-diarias), pro
// widget "meu ritmo de ativações" do perfil. Fonte única, cacheada.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/ativacoes-diarias';

export interface AtivacaoDiariaRow {
    dia: string;
    dow: number;
    cidade: string;
    promo: number;
    cupom: number;
}

let _cache: AtivacaoDiariaRow[] | null = null;

async function fetchAtivacoesDiarias(): Promise<AtivacaoDiariaRow[]> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar ativações diárias.`);
    }
    return (json.rows ?? []) as AtivacaoDiariaRow[];
}

export function useAtivacoesDiarias() {
    const [rows, setRows] = useState<AtivacaoDiariaRow[]>(_cache ?? []);
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchAtivacoesDiarias()
            .then(r => { _cache = r; setRows(r); setLoading(false); })
            .catch(err => {
                console.warn('[useAtivacoesDiarias] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (_cache) return;
        load();
    }, [load]);

    return { rows, loading, error, refetch: load };
}
