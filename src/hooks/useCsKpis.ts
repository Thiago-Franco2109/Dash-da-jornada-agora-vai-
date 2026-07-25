import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// KPIs de Sucesso do Cliente — Netlify Function cs-kpis (banco de teste).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/cs-kpis';

export interface CsRiscoPartner {
    id: number;
    nome: string;
    cidade: string | null;
    anterior: number;
    atual: number;
    perda: number;
    tipo: 'zerou' | 'queda';
}

export interface CsKpis {
    windowDays: number;
    activityDays: number;
    comissao: { atual: number; anterior: number; variacaoPct: number };
    nrrPct: number;
    grrPct: number;
    churnReceitaPct: number;
    perdido: { valor: number; count: number };
    emQueda: { valor: number; count: number };
    novos: { valor: number; count: number };
    atividade: { totalAtivos: number; comPedido: number; semPedido: number; taxaPct: number };
    topRisco: CsRiscoPartner[];
    elapsedMs?: number;
}

let _cache: CsKpis | null = null;

async function fetchCsKpis(windowDays: number): Promise<CsKpis> {
    const res = await fetch(`${FN_URL}?window=${windowDays}`, {
        credentials: 'include' as RequestCredentials,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar KPIs.`);
    }
    return json as CsKpis;
}

/**
 * KPIs de CS. A consulta cruza Comissao_View (comissão líquida) por parceiro.
 * Uso: const { kpis, loading, error, refetch } = useCsKpis(30);
 */
export function useCsKpis(windowDays = 30) {
    const [kpis, setKpis] = useState<CsKpis | null>(_cache);
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchCsKpis(windowDays)
            .then(res => { _cache = res; setKpis(res); setLoading(false); })
            .catch(err => {
                console.warn('[useCsKpis] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [windowDays]);

    useEffect(() => { load(); }, [load]);

    return { kpis, loading, error, refetch: load };
}
