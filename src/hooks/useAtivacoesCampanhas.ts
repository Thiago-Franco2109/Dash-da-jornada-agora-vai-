import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Relatório de ativação de campanhas — Netlify Function ativacoes-campanhas.
// Cupons têm fluxo por dia (data = criação). Promoções = estado atual.
// Em promoção o "quem ativou" existe: é o checkbox "Sucesso do Cliente"
// (campanha_promocao.metadata), marcado = CS. Sem data e sem histórico.
// Em cupom continua sem autor (usuario_id nulo).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/ativacoes-campanhas';

export interface AtivacoesCampanhas {
    windowDays: number;
    cupons: {
        total: number;
        porDia: { dia: string; n: number }[];
        porCidade: { cidade: string; n: number }[];
    };
    promos: {
        campanhas: {
            nome: string;
            data: string | null;
            /** nº de cidades com regra no `config` — não é participação */
            cidadesConfiguradas: number;
            participantes: number;
            /** parceiros marcados "Sucesso do Cliente" = ativados pelo CS */
            cs: number;
            parceiro: number;
        }[];
        totalParticipacoes: number;
        parceirosDistintos: number;
        cs: number;
        parceiro: number;
        porCidade: { cidade: string; n: number; cs: number; parceiro: number }[];
    };
    elapsedMs?: number;
}

const _cache: Record<number, AtivacoesCampanhas> = {};

async function fetchAtivacoes(windowDays: number): Promise<AtivacoesCampanhas> {
    const res = await fetch(`${FN_URL}?window=${windowDays}`, {
        credentials: 'include' as RequestCredentials,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar ativações.`);
    }
    return json as AtivacoesCampanhas;
}

export function useAtivacoesCampanhas(windowDays = 28) {
    const [data, setData] = useState<AtivacoesCampanhas | null>(_cache[windowDays] ?? null);
    const [loading, setLoading] = useState(!_cache[windowDays]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchAtivacoes(windowDays)
            .then(res => { _cache[windowDays] = res; setData(res); setLoading(false); })
            .catch(err => {
                console.warn('[useAtivacoesCampanhas] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [windowDays]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, refetch: load };
}
