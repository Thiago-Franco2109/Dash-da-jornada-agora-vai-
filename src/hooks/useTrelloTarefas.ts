import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Cards do Trello atribuídos a mim (dono do token), em todos os boards —
 * ver netlify/functions/trello-tarefas.ts.
 */

const FN_URL = '/.netlify/functions/trello-tarefas';

export interface TarefaTrello {
    id: string;
    nome: string;
    due: string | null;
    dueComplete: boolean;
    boardId: string;
    board: string;
    listId: string;
    lista: string;
    cardUrl: string;
}

async function fetchTarefasTrello(): Promise<TarefaTrello[]> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.tarefas)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar tarefas do Trello.`);
    }
    return json.tarefas as TarefaTrello[];
}

export function useTrelloTarefas() {
    const [data, setData] = useState<TarefaTrello[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const carregouUmaVez = useRef(false);

    const refresh = useCallback(async () => {
        setIsLoading(!carregouUmaVez.current);
        try {
            const tarefas = await fetchTarefasTrello();
            setData(tarefas);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar tarefas do Trello');
        } finally {
            carregouUmaVez.current = true;
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, isLoading, error, refresh };
}
