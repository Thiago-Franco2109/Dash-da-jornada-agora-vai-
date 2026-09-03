import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Resumo da atividade do dono do token no Trello hoje (comentários + cards
 * movidos) — ver netlify/functions/trello-atividade-hoje.ts.
 */

const FN_URL = '/.netlify/functions/trello-atividade-hoje';

export interface AtividadeTrelloHoje {
    data: string;
    totalMovimentacoes: number;
    comentarios: number;
    cardsMovidos: number;
}

async function fetchAtividadeHoje(): Promise<AtividadeTrelloHoje> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar atividade do Trello.`);
    }
    return json as AtividadeTrelloHoje;
}

export function useTrelloAtividadeHoje() {
    const [data, setData] = useState<AtividadeTrelloHoje | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const carregouUmaVez = useRef(false);

    const refresh = useCallback(async () => {
        if (carregouUmaVez.current) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const atividade = await fetchAtividadeHoje();
            setData(atividade);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar atividade do Trello');
        } finally {
            carregouUmaVez.current = true;
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, isLoading, isRefreshing, error, refresh };
}
