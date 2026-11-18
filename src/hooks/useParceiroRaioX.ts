import { useState, useEffect } from 'react';

/**
 * Raio-x do parceiro contra os concorrentes dele — ver
 * netlify/functions/parceiro-raio-x.ts.
 *
 * Responde "qual problema atacar", comparando sempre contra o mesmo segmento
 * na mesma cidade: pedidos, profundidade de cardápio, preço por tamanho,
 * taxa e alcance de entrega.
 *
 * ⚠️ A VISITA não vem daqui. O acesso à loja é do GA, chega pela planilha
 * (`useDailyAccessSync`) e a tela cruza os dois lados por `estab_id` usando a
 * lista `pares`. Por isso o achado de visibilidade é montado no componente,
 * não na function.
 *
 * ⚠️ Dados D-1 pra trás: o banco das functions tem ~1 dia de atraso.
 */

export interface AchadoRaioX {
    id: string;
    /** 1 = ataque isto primeiro. */
    severidade: 1 | 2 | 3;
    titulo: string;
    detalhe: string;
}

export interface VolumeComparado {
    /** Nome do item do parceiro, como está no cardápio. */
    item: string;
    volume: number;
    unidade: 'ml' | 'g';
    meuPreco: number;
    medianaSegmento: number;
    menorSegmento: number;
    maiorSegmento: number;
    lojasComparadas: number;
    maisBarato: { id: number; nome: string; preco: number };
    /** Acima (+) ou abaixo (−) da mediana do segmento, em %. */
    deltaPct: number;
    /** 1 = o mais barato da cidade naquele tamanho. */
    posicao: number;
    totalComparados: number;
}

export interface ParRaioX {
    id: number;
    nome: string;
    ehOParceiro: boolean;
    pedidos: number;
    diasComPedido: number;
    itens: number;
    precoMedio: number;
    taxaMedia: number;
}

export interface RaioX {
    ok: true;
    estabId: number;
    /** Preenchido quando não há com quem comparar — a tela some em vez de mentir. */
    semComparacao?: 'sem_cidade' | 'sem_segmento';
    parceiro: {
        id: number;
        nome: string;
        cidade: string | null;
        localidadeId: number | null;
        cardapioDigital: number;
        entregaPorRaio?: boolean;
    };
    janela: { dias: number; ateOntem: boolean };
    segmento: {
        id: number;
        nome: string;
        lojasNaCidade: number;
        /** Segmento com menos lojas que o mínimo: a mediana não é régua. */
        poucosPares: boolean;
        candidatos: { id: number; nome: string; principal: boolean; lojasNaCidade: number }[];
    };
    pedidos: {
        loja: number;
        diasComPedido: number;
        medianaSegmento: number;
        melhorSegmento: number;
        posicao: number;
        totalComparados: number;
    };
    cardapio: {
        itens: number;
        medianaItensSegmento: number;
        precoMedio: number;
        medianaPrecoSegmento: number;
        entrada: number;
    };
    entrega: {
        bairros: number;
        medianaBairrosSegmento: number;
        taxaMedia: number;
        medianaTaxaSegmento: number;
        taxaMinima: number;
    };
    volumes: VolumeComparado[];
    pares: ParRaioX[];
    achados: AchadoRaioX[];
    tookMs: number;
}

interface UseParceiroRaioXResult {
    data: RaioX | null;
    loading: boolean;
    error: string | null;
}

export function useParceiroRaioX(estabId?: string | number, enabled = true): UseParceiroRaioXResult {
    const [data, setData] = useState<RaioX | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const id = estabId == null ? '' : String(estabId).trim();
    // Parceiro sem ESTAB_ID numérico não existe no banco do CMS (veio só da
    // planilha): estado derivado, nunca setState dentro do effect.
    const ativo = enabled && /^\d+$/.test(id);

    useEffect(() => {
        if (!ativo) return;

        let cancelado = false;

        const carregar = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/.netlify/functions/parceiro-raio-x?estabId=${encodeURIComponent(id)}`, {
                    credentials: 'include' as RequestCredentials,
                    cache: 'no-store',
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok === false) {
                    throw new Error(json?.error || `Erro ${res.status} ao montar o raio-x.`);
                }
                if (!cancelado) setData(json as RaioX);
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
