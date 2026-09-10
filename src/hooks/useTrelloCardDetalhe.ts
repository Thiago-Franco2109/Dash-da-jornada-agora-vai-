import { useState, useCallback } from 'react';
import type { LabelTrello, MembroTrello } from '../types/trello';

/**
 * Detalhe completo de um card (pro modal "abrir sem sair do dashboard") e
 * a ação de comentar — ver netlify/functions/trello-card-detalhe.ts e
 * trello-card-comentar.ts.
 */

export interface ChecklistItemDetalhe {
    id: string;
    nome: string;
    feito: boolean;
}

export interface ChecklistDetalhe {
    id: string;
    nome: string;
    itens: ChecklistItemDetalhe[];
}

export interface AnexoDetalhe {
    id: string;
    nome: string;
    url: string;
    data: string;
    bytes: number | null;
    tipo: string;
}

export interface AutorComentario {
    nome: string;
    iniciais: string;
    avatarUrl: string | null;
}

export interface ComentarioDetalhe {
    id: string;
    texto: string;
    data: string;
    autor: AutorComentario;
}

export interface CardDetalhe {
    id: string;
    nome: string;
    descricao: string;
    due: string | null;
    dueComplete: boolean;
    closed: boolean;
    cardUrl: string;
    labels: LabelTrello[];
    membros: MembroTrello[];
    checklists: ChecklistDetalhe[];
    anexos: AnexoDetalhe[];
    comentarios: ComentarioDetalhe[];
}

async function fetchDetalhe(cardId: string): Promise<CardDetalhe> {
    const res = await fetch(`/.netlify/functions/trello-card-detalhe?cardId=${encodeURIComponent(cardId)}`, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.card) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar o card.`);
    }
    return json.card as CardDetalhe;
}

async function postComentario(cardId: string, texto: string): Promise<ComentarioDetalhe> {
    const res = await fetch('/.netlify/functions/trello-card-comentar', {
        method: 'POST',
        credentials: 'include' as RequestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, texto }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.comentario) {
        throw new Error(json?.error || `Erro ${res.status} ao comentar.`);
    }
    return json.comentario as ComentarioDetalhe;
}

async function putPrazo(cardId: string, due: string | null): Promise<{ due: string | null; dueComplete: boolean }> {
    const res = await fetch('/.netlify/functions/trello-card-editar', {
        method: 'POST',
        credentials: 'include' as RequestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, due }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao alterar o prazo.`);
    }
    return { due: json.due, dueComplete: json.dueComplete };
}

export function useTrelloCardDetalhe() {
    const [cardIdAberto, setCardIdAberto] = useState<string | null>(null);
    const [card, setCard] = useState<CardDetalhe | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [enviandoComentario, setEnviandoComentario] = useState(false);
    const [erroComentario, setErroComentario] = useState<string | null>(null);
    const [salvandoPrazo, setSalvandoPrazo] = useState(false);
    const [erroPrazo, setErroPrazo] = useState<string | null>(null);

    const abrir = useCallback(async (cardId: string) => {
        setCardIdAberto(cardId);
        setCard(null);
        setError(null);
        setErroComentario(null);
        setIsLoading(true);
        try {
            const detalhe = await fetchDetalhe(cardId);
            setCard(detalhe);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar o card');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fechar = useCallback(() => {
        setCardIdAberto(null);
        setCard(null);
        setError(null);
        setErroComentario(null);
        setErroPrazo(null);
    }, []);

    const comentar = useCallback(async (texto: string) => {
        if (!cardIdAberto) return;
        setEnviandoComentario(true);
        setErroComentario(null);
        try {
            const comentario = await postComentario(cardIdAberto, texto);
            setCard(prev => (prev ? { ...prev, comentarios: [...prev.comentarios, comentario] } : prev));
        } catch (err) {
            setErroComentario(err instanceof Error ? err.message : 'Falha ao comentar');
            throw err;
        } finally {
            setEnviandoComentario(false);
        }
    }, [cardIdAberto]);

    const editarPrazo = useCallback(async (due: string | null) => {
        if (!cardIdAberto) return;
        setSalvandoPrazo(true);
        setErroPrazo(null);
        try {
            const atualizado = await putPrazo(cardIdAberto, due);
            setCard(prev => (prev ? { ...prev, ...atualizado } : prev));
        } catch (err) {
            setErroPrazo(err instanceof Error ? err.message : 'Falha ao alterar o prazo');
            throw err;
        } finally {
            setSalvandoPrazo(false);
        }
    }, [cardIdAberto]);

    return {
        aberto: cardIdAberto != null,
        cardIdAberto,
        card,
        isLoading,
        error,
        abrir,
        fechar,
        comentar,
        enviandoComentario,
        erroComentario,
        editarPrazo,
        salvandoPrazo,
        erroPrazo,
    };
}
