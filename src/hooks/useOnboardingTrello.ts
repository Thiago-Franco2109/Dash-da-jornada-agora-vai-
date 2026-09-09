import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CartaoTrelloVisual } from '../types/trello';

/**
 * TODOS os cards do board de onboarding no Trello — ver
 * netlify/functions/onboarding-trello.ts. Alimenta duas visualizações:
 *   - Tabela (pendentes do MySQL): usa `etapasPorEstabId`, casado por
 *     estabelecimento_id.
 *   - Quadro: usa `cards` + `listas` direto, espelhando o board inteiro.
 */

const FN_URL = '/.netlify/functions/onboarding-trello';

export interface CardTrelloOnboarding extends CartaoTrelloVisual {
    estabId: string | null;
    listId: string;
    etapa: string;
    listaOrdem: number;
    diasNaEtapa: number | null;
}

export interface ListaTrelloOnboarding {
    id: string;
    nome: string;
    ordem: number;
}

/** Formato enxuto usado pela coluna "Etapa (Trello)" da tabela de pendentes. */
export interface EtapaTrello {
    estabId: string;
    cardId: string;
    cardUrl: string;
    etapa: string;
    diasNaEtapa: number | null;
}

interface RespostaOnboardingTrello {
    cards: CardTrelloOnboarding[];
    listas: ListaTrelloOnboarding[];
}

async function fetchOnboardingTrello(): Promise<RespostaOnboardingTrello> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.cards) || !Array.isArray(json?.listas)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar cards do Trello.`);
    }
    return { cards: json.cards as CardTrelloOnboarding[], listas: json.listas as ListaTrelloOnboarding[] };
}

export function useOnboardingTrello({ enabled = true }: { enabled?: boolean } = {}) {
    const [cards, setCards] = useState<CardTrelloOnboarding[]>([]);
    const [listas, setListas] = useState<ListaTrelloOnboarding[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const carregouUmaVez = useRef(false);

    const load = useCallback(async () => {
        if (!enabled) return;
        setIsLoading(!carregouUmaVez.current);
        try {
            const dados = await fetchOnboardingTrello();
            setCards(dados.cards);
            setListas(dados.listas);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar cards do Trello');
        } finally {
            carregouUmaVez.current = true;
            setIsLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        load();
    }, [load]);

    const etapasPorEstabId = useMemo(() => {
        const map = new Map<string, EtapaTrello>();
        for (const c of cards) {
            if (!c.estabId) continue;
            map.set(c.estabId, { estabId: c.estabId, cardId: c.id, cardUrl: c.cardUrl, etapa: c.etapa, diasNaEtapa: c.diasNaEtapa });
        }
        return map;
    }, [cards]);

    return { cards, listas, etapasPorEstabId, isLoadingTrello: isLoading, trelloError: error, refreshTrello: load };
}
