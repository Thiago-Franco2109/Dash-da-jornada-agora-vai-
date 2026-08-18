import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Etapa (lista) do Trello de cada parceiro pendente, casada por
 * estabelecimento_id — ver netlify/functions/onboarding-trello.ts.
 */

const FN_URL = '/.netlify/functions/onboarding-trello';

export interface EtapaTrello {
    estabId: string;
    cardId: string;
    cardUrl: string;
    etapa: string;
    diasNaEtapa: number | null;
}

async function fetchEtapasTrello(): Promise<EtapaTrello[]> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.etapas)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar etapas do Trello.`);
    }
    return json.etapas as EtapaTrello[];
}

export function useOnboardingTrello({ enabled = true }: { enabled?: boolean } = {}) {
    const [porEstabId, setPorEstabId] = useState<Map<string, EtapaTrello>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const carregouUmaVez = useRef(false);

    const load = useCallback(async () => {
        if (!enabled) return;
        setIsLoading(!carregouUmaVez.current);
        try {
            const etapas = await fetchEtapasTrello();
            setPorEstabId(new Map(etapas.map(e => [e.estabId, e])));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar etapas do Trello');
        } finally {
            carregouUmaVez.current = true;
            setIsLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        load();
    }, [load]);

    return { etapasPorEstabId: porEstabId, isLoadingTrello: isLoading, trelloError: error, refreshTrello: load };
}
