import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Série mensal de ativação de ações na carteira — Function ativacoes-mensal.
// Promoção tem corte CS vs parceiro (checkbox "Sucesso do Cliente"); cupom
// não tem autor. `confiabilidade` cai com a idade do mês porque a data vem de
// `data_modificacao_status`, que só guarda a ÚLTIMA mudança de status.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/ativacoes-mensal';

export type Confiabilidade = 'alta' | 'media' | 'baixa';

export interface MesAtivacao {
    mes: string;
    /** mês corrente, ainda incompleto */
    parcial: boolean;
    /** veio do snapshot do Supabase — foto tirada quando o mês fechou */
    congelado: boolean;
    congeladoEm: string | null;
    confiabilidade: Confiabilidade;
    promo: {
        total: number;
        cs: number;
        parceiro: number;
        pctParceiro: number | null;
        parceiros: number;
        /** zero por sobrescrita, não por ausência de atividade → mostrar lacuna */
        semDado: boolean;
    };
    cupons: { total: number; parceiros: number };
}

export interface AtivacoesMensal {
    meses: number;
    series: MesAtivacao[];
    porCampanha: { mes: string; campanha: string; total: number; cs: number; parceiro: number }[];
    porCidade: { mes: string; cidade: string; total: number; cs: number; parceiro: number; cupons: number }[];
    snapshot: { disponivel: boolean; mesesCongelados: string[]; erro: string | null };
    fonte: { promo: string; autoria: string; cupom: string };
    elapsedMs?: number;
}

const _cache: Record<number, AtivacoesMensal> = {};

async function fetchMensal(meses: number): Promise<AtivacoesMensal> {
    const res = await fetch(`${FN_URL}?meses=${meses}`, { credentials: 'include' as RequestCredentials });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar a série mensal.`);
    }
    return json as AtivacoesMensal;
}

export function useAtivacoesMensal(meses = 12) {
    const [data, setData] = useState<AtivacoesMensal | null>(_cache[meses] ?? null);
    const [loading, setLoading] = useState(!_cache[meses]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchMensal(meses)
            .then(res => { _cache[meses] = res; setData(res); setLoading(false); })
            .catch(err => {
                console.warn('[useAtivacoesMensal] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [meses]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, refetch: load };
}
