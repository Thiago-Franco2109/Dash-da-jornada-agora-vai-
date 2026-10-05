import { useState, useEffect } from 'react';

/**
 * Análise do cardápio de um parceiro — ver netlify/functions/cardapio-analise.ts.
 *
 * Responde o que o CS consegue acionar por telefone: itens sem foto, itens que não
 * vendem, e promoção no ar vendendo mal. Dados D-1 pra trás (o banco das functions
 * tem ~1 dia de atraso) — a tela precisa rotular como tal, nunca como "hoje".
 */

export interface ItemCardapio {
    id: number;
    nome: string;
    vendas: number;
}

export interface PromoNoAr {
    id: number;
    nome: string;
    vendas: number;
    temFoto: boolean;
    /** No ar e perdendo pro item mediano de preço cheio — ver régua na function. */
    furada: boolean;
}

export interface CardapioAnalise {
    estabId: number;
    janela: { dias: number; ateOntem: boolean };
    pedidos: number;
    resumo: {
        totalItens: number;
        comFoto: number;
        semFoto: number;
        pctSemFoto: number;
        itensSemVenda: number;
        medianaBase: number;
        promosNoAr: number;
        promosFuradas: number;
    };
    maisVendido: ItemCardapio | null;
    /** Ordenada por vendas DESC: item que JÁ vende e não tem foto é o conserto mais valioso. */
    semFotoLista: ItemCardapio[];
    /** Tem foto e ainda assim não vendeu nada — o problema não é a foto. */
    zeradosLista: { id: number; nome: string }[];
    promosNoArLista: PromoNoAr[];
}

interface UseCardapioAnaliseResult {
    data: CardapioAnalise | null;
    loading: boolean;
    error: string | null;
}

export function useCardapioAnalise(estabId?: string | number, enabled = true): UseCardapioAnaliseResult {
    const [data, setData] = useState<CardapioAnalise | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const id = estabId == null ? '' : String(estabId).trim();
    // Parceiro sem ESTAB_ID numérico não existe no banco do CMS (vem só da planilha).
    // Isso é estado DERIVADO, não guardado: zerar por setState dentro do effect causaria
    // render em cascata (react-hooks/set-state-in-effect).
    const ativo = enabled && /^\d+$/.test(id);

    useEffect(() => {
        if (!ativo) return;

        let cancelado = false;

        // O corpo do effect não chama setState direto (react-hooks/set-state-in-effect):
        // tudo acontece dentro desta função, inclusive o loading inicial.
        const carregar = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/.netlify/functions/cardapio-analise?estabId=${encodeURIComponent(id)}`, {
                    credentials: 'include' as RequestCredentials,
                    cache: 'no-store',
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok === false) {
                    throw new Error(json?.error || `Erro ${res.status} ao analisar o cardápio.`);
                }
                if (!cancelado) setData(json as CardapioAnalise);
            } catch (err: unknown) {
                if (cancelado) return;
                setData(null);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelado) setLoading(false);
            }
        };

        void carregar();

        return () => { cancelado = true; };
    }, [id, ativo]);

    return ativo ? { data, loading, error } : { data: null, loading: false, error: null };
}
