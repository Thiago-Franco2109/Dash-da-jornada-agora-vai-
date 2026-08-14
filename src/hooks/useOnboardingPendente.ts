import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Parceiros pendentes de ativação — assinaram contrato, ainda não lançaram.
 * Ver netlify/functions/onboarding-pendentes.ts para a definição exata.
 */

const ONBOARDING_FN_URL = '/.netlify/functions/onboarding-pendentes';

export interface ParceiroPendente {
    estabId: string;
    estabelecimento: string;
    cidade: string;
    contratoId: number;
    dataAdesao: string;
    diasPendente: number;
}

async function fetchPendentes(produto?: 'cd'): Promise<ParceiroPendente[]> {
    const url = produto === 'cd' ? `${ONBOARDING_FN_URL}?produto=cd` : ONBOARDING_FN_URL;
    const res = await fetch(url, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.pendentes)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar onboarding pendente.`);
    }
    return json.pendentes as ParceiroPendente[];
}

export function useOnboardingPendente({ enabled = true, produto }: { enabled?: boolean; produto?: 'cd' } = {}) {
    const [pendentes, setPendentes] = useState<ParceiroPendente[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const carregouUmaVez = useRef(false);

    const load = useCallback(async () => {
        if (!enabled) return;
        if (carregouUmaVez.current) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const dados = await fetchPendentes(produto);
            setPendentes(dados);
            setLastSyncTime(new Date());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar onboarding pendente');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
            carregouUmaVez.current = true;
        }
    }, [enabled, produto]);

    useEffect(() => { load(); }, [load]);

    return { pendentes, isLoading, isRefreshing, error, lastSyncTime, refreshData: load };
}
