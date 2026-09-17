import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Status dos itens promocionais por parceiro/campanha (Function promo-status).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/promo-status';

export type StatusCounts = {
    rascunho: number;
    pendente: number;
    aprovado: number;
    /** Há quantos dias o item pendente mais antigo desta campanha espera. null = sem data no banco. */
    pendenteDias?: number | null;
    pendenteDesde?: string | null;
};

/** Resumo por parceiro (calculado no front) para a coluna Promoções. */
export type PromoCampanhaStatus = 'pendente' | 'aprovado' | 'rascunho' | 'sem item';
export interface PromoResumo {
    pendente: number;     // total de itens pendentes (oferta pronta, esperando o ok do parceiro)
    aprovado: number;     // total de itens aprovados
    rascunho: number;
    semItem: number;      // nº de campanhas da cidade sem item pro parceiro
    /** A espera mais longa entre as campanhas pendentes do parceiro. null = nenhuma com data. */
    pendenteDiasMax: number | null;
    detalhe: { campanha: string; status: PromoCampanhaStatus; dias?: number | null }[];
}

/** Campanha vigente no CMS (`campanha_promocao`). `id` monta o link do CMS. */
export interface CampanhaVigente {
    id: number;
    nome: string;
}

export interface PromoStatusData {
    /**
     * TODA campanha vigente, tenha item ou não — é a mesma lista que o CS vê no
     * CMS. As duas abaixo só enxergam campanha que já tem item em algum lugar.
     */
    campanhas: CampanhaVigente[];
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
    let pendenteDiasMax: number | null = null;
    const detalhe: PromoResumo['detalhe'] = [];
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
        const dias = cc.pendente > 0 ? (cc.pendenteDias ?? null) : null;
        // Sem data no banco fica null e nunca vira 0: "parado hoje" esconderia o caso mais antigo.
        if (dias != null) pendenteDiasMax = pendenteDiasMax == null ? dias : Math.max(pendenteDiasMax, dias);
        detalhe.push({ campanha: camp, status, dias });
    }
    return { pendente, aprovado, rascunho, semItem, pendenteDiasMax, detalhe };
}

let _cache: PromoStatusData | null = null;

async function fetchPromoStatus(): Promise<PromoStatusData> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar status de promoções.`);
    }
    return {
        campanhas: (json.campanhas ?? []) as CampanhaVigente[],
        porParceiro: json.porParceiro ?? {},
        campanhasPorLocalidade: json.campanhasPorLocalidade ?? {},
    };
}

export function usePromoStatus() {
    const [promoData, setPromoData] = useState<PromoStatusData>(_cache ?? { campanhas: [], porParceiro: {}, campanhasPorLocalidade: {} });
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
