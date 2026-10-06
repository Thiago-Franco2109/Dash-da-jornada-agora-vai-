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
    /** Miniatura servida por trello-anexo.ts; null quando o arquivo não gera preview. */
    previewId: string | null;
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
    /** Comparado com `meuId` pra liberar editar/excluir só nos meus comentários. */
    autorId: string;
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

async function fetchDetalhe(cardId: string): Promise<{ card: CardDetalhe; meuId: string }> {
    const res = await fetch(`/.netlify/functions/trello-card-detalhe?cardId=${encodeURIComponent(cardId)}`, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.card) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar o card.`);
    }
    return { card: json.card as CardDetalhe, meuId: (json.meuId as string) ?? '' };
}

type AcaoComentario = 'criar' | 'editar' | 'excluir';

async function postComentario(
    cardId: string,
    acao: AcaoComentario,
    dados: { texto?: string; comentarioId?: string },
): Promise<ComentarioDetalhe | null> {
    const res = await fetch('/.netlify/functions/trello-card-comentar', {
        method: 'POST',
        credentials: 'include' as RequestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, acao, ...dados }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao salvar o comentário.`);
    }
    return (json.comentario as ComentarioDetalhe) ?? null;
}

/** Lê o arquivo como base64 puro (sem o prefixo `data:...;base64,`). */
function paraBase64(arquivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const resultado = String(reader.result);
            const virgula = resultado.indexOf(',');
            resolve(virgula >= 0 ? resultado.slice(virgula + 1) : resultado);
        };
        reader.onerror = () => reject(new Error('Não consegui ler o arquivo'));
        reader.readAsDataURL(arquivo);
    });
}

async function postAnexo(cardId: string, arquivo: File): Promise<AnexoDetalhe & { previewUrl: string }> {
    const dataBase64 = await paraBase64(arquivo);
    const res = await fetch('/.netlify/functions/trello-card-anexar', {
        method: 'POST',
        credentials: 'include' as RequestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cardId,
            nome: arquivo.name || 'imagem.png',
            mimeType: arquivo.type || 'application/octet-stream',
            dataBase64,
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.anexo) {
        throw new Error(json?.error || `Erro ${res.status} ao anexar o arquivo.`);
    }
    return json.anexo;
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
    const [meuId, setMeuId] = useState('');
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
            const { card: detalhe, meuId: id } = await fetchDetalhe(cardId);
            setCard(detalhe);
            setMeuId(id);
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

    /**
     * Comenta com anexos opcionais. Igual ao Trello: cada arquivo vira ANEXO do
     * card e o comentário referencia em markdown — por isso os uploads acontecem
     * antes do POST do texto, e o card ganha os anexos novos na hora.
     */
    const comentar = useCallback(async (texto: string, arquivos: File[] = []) => {
        if (!cardIdAberto) return;
        setEnviandoComentario(true);
        setErroComentario(null);
        try {
            const anexados: (AnexoDetalhe & { previewUrl: string })[] = [];
            for (const arquivo of arquivos) {
                anexados.push(await postAnexo(cardIdAberto, arquivo));
            }

            const markdown = anexados.map(a => `![${a.nome}](${a.previewUrl})`).join('\n');
            const textoFinal = [texto.trim(), markdown].filter(Boolean).join('\n\n');

            const comentario = await postComentario(cardIdAberto, 'criar', { texto: textoFinal });
            setCard(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    comentarios: comentario ? [...prev.comentarios, comentario] : prev.comentarios,
                    anexos: [...prev.anexos, ...anexados],
                };
            });
        } catch (err) {
            setErroComentario(err instanceof Error ? err.message : 'Falha ao comentar');
            throw err;
        } finally {
            setEnviandoComentario(false);
        }
    }, [cardIdAberto]);

    const editarComentario = useCallback(async (comentarioId: string, texto: string) => {
        if (!cardIdAberto) return;
        setErroComentario(null);
        try {
            const atualizado = await postComentario(cardIdAberto, 'editar', { comentarioId, texto });
            if (!atualizado) return;
            setCard(prev => (prev
                ? { ...prev, comentarios: prev.comentarios.map(c => (c.id === comentarioId ? atualizado : c)) }
                : prev));
        } catch (err) {
            setErroComentario(err instanceof Error ? err.message : 'Falha ao editar o comentário');
            throw err;
        }
    }, [cardIdAberto]);

    const excluirComentario = useCallback(async (comentarioId: string) => {
        if (!cardIdAberto) return;
        setErroComentario(null);
        try {
            await postComentario(cardIdAberto, 'excluir', { comentarioId });
            setCard(prev => (prev
                ? { ...prev, comentarios: prev.comentarios.filter(c => c.id !== comentarioId) }
                : prev));
        } catch (err) {
            setErroComentario(err instanceof Error ? err.message : 'Falha ao excluir o comentário');
            throw err;
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
        meuId,
        isLoading,
        error,
        abrir,
        fechar,
        comentar,
        editarComentario,
        excluirComentario,
        enviandoComentario,
        erroComentario,
        editarPrazo,
        salvandoPrazo,
        erroPrazo,
    };
}
