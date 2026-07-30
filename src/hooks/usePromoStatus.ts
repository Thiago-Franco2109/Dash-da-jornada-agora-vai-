import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Status dos itens promocionais por parceiro/campanha (Function promo-status).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/promo-status';

export type StatusCounts = { rascunho: number; pendente: number; aprovado: number };

/** Resumo por parceiro (calculado no front) para a coluna Promoções. */
export type PromoCampanhaStatus = 'pendente' | 'aprovado' | 'rascunho' | 'sem item';
export interface PromoResumo {
    pendente: number;     // total de itens pendentes (disponíveis p/ o dono ativar)
    aprovado: number;     // total de itens aprovados
    rascunho: number;
    semItem: number;      // nº de campanhas da cidade sem item pro parceiro
    detalhe: { campanha: string; status: PromoCampanhaStatus }[];
}

export interface PromoStatusData {
    /** porParceiro[estabId][nomeCampanha] = { rascunho, pendente, aprovado } */
    porParceiro: Record<string, Record<string, StatusCounts>>;
    /** campanhasPorLocalidade[localidade_id] = nomes de campanha na cidade */
    campanhasPorLocalidade: Record<string, string[]>;
}

/**
 * Resumo de promoções de um parceiro: cruza os itens dele (porParceiro) com as
 * campanhas da cidade dele (campanhasPorLocalidade). Campanha na cidade sem
 * item pro parceiro = "sem item".
 */
export function computePromoResumo(
    estabId: string,
    localidadeId: string | number | null | undefined,
    data: PromoStatusData,
): PromoResumo {
    const porCampanha = data.porParceiro[estabId] ?? {};
    const cityCampaigns = (localidadeId != null ? data.campanhasPorLocalidade[String(localidadeId)] : undefined) ?? [];
    const todas = new Set<string>([...Object.keys(porCampanha), ...cityCampaigns]);

    let pendente = 0, aprovado = 0, rascunho = 0, semItem = 0;
    const detalhe: { campanha: string; status: PromoCampanhaStatus }[] = [];
    for (const camp of todas) {
        const cc = porCampanha[camp];
        const total = cc ? cc.pendente + cc.aprovado + cc.rascunho : 0;
        if (total === 0) {
            semItem++;
            detalhe.push({ campanha: camp, status: 'sem item' });
            continue;
        }
        pendente += cc.pendente; aprovado += cc.aprovado; rascunho += cc.rascunho;
        const status: PromoCampanhaStatus = cc.pendente > 0 ? 'pendente' : cc.aprovado > 0 ? 'aprovado' : 'rascunho';
        detalhe.push({ campanha: camp, status });
    }
    return { pendente, aprovado, rascunho, semItem, detalhe };
}

let _cache: PromoStatusData | null = null;

async function fetchPromoStatus(): Promise<PromoStatusData> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar status de promoções.`);
    }
    return {
        porParceiro: json.porParceiro ?? {},
        campanhasPorLocalidade: json.campanhasPorLocalidade ?? {},
    };
}

export function usePromoStatus() {
    const [promoData, setPromoData] = useState<PromoStatusData>(_cache ?? { porParceiro: {}, campanhasPorLocalidade: {} });
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchPromoStatus()
            .then(d => { _cache = d; setPromoData(d); setLoading(false); })
            .catch(err => { console.warn('[usePromoStatus] falha:', err); setError(err.message); setLoading(false); });
    }, []);

    useEffect(() => {
        if (_cache) return;
        load();
    }, [load]);

    return { promoData, loading, error, refetch: load };
}
