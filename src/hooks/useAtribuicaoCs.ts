import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
    setAtribuicoesCarregadas,
    type Manager,
    type ProductModeKey,
} from '../config/managerMapping';

/**
 * Atribuição de CS — quem cuida de cada cidade (marketplace) e de cada loja
 * (Cardápio Digital, vendido para o Brasil inteiro e quase sempre em cidade
 * sem carteira). Ver supabase/atribuicao_cs.sql.
 *
 * Antes isso vivia em duas planilhas separadas, num mapa fixo no código e em
 * overrides no localStorage — cada navegador com uma verdade. Agora é uma só.
 */

export interface AtribuicaoParceiro {
    analista: Manager;
    estabelecimento: string;
    cidade: string;
}

export interface AtribuicoesCs {
    /** cidade → analista, por produto */
    porCidade: Record<ProductModeKey, Record<string, Manager>>;
    /** estab_id → atribuição, por produto */
    porParceiro: Record<ProductModeKey, Record<string, AtribuicaoParceiro>>;
}

const VAZIO: AtribuicoesCs = {
    porCidade: { marketplace: {}, cardapio_digital: {} },
    porParceiro: { marketplace: {}, cardapio_digital: {} },
};

/** Nome do produto como fica salvo no Supabase. */
function produtoDb(mode: ProductModeKey): string {
    return mode === 'cardapio_digital' ? 'cardapio_digital' : 'marketplace';
}

function modeDeProduto(produto: string): ProductModeKey {
    return produto === 'cardapio_digital' ? 'cardapio_digital' : 'marketplace';
}

export async function fetchAtribuicoesCs(): Promise<AtribuicoesCs> {
    const [cidades, parceiros] = await Promise.all([
        supabase.from('cs_cidade').select('cidade, produto, analista'),
        supabase.from('cs_parceiro').select('estab_id, produto, analista, estabelecimento, cidade'),
    ]);

    if (cidades.error) throw cidades.error;
    if (parceiros.error) throw parceiros.error;

    const out: AtribuicoesCs = {
        porCidade: { marketplace: {}, cardapio_digital: {} },
        porParceiro: { marketplace: {}, cardapio_digital: {} },
    };

    for (const row of (cidades.data ?? []) as { cidade: string; produto: string; analista: string }[]) {
        out.porCidade[modeDeProduto(row.produto)][row.cidade] = row.analista as Manager;
    }

    for (const row of (parceiros.data ?? []) as {
        estab_id: string; produto: string; analista: string; estabelecimento: string; cidade: string;
    }[]) {
        out.porParceiro[modeDeProduto(row.produto)][String(row.estab_id)] = {
            analista: row.analista as Manager,
            estabelecimento: row.estabelecimento ?? '',
            cidade: row.cidade ?? '',
        };
    }

    return out;
}

export function useAtribuicaoCs() {
    const [atribuicoes, setAtribuicoes] = useState<AtribuicoesCs>(VAZIO);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            const dados = await fetchAtribuicoesCs();
            setAtribuicoes(dados);
            // Publica para o resolvedor síncrono usado pelas telas.
            setAtribuicoesCarregadas(dados);
            setError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar atribuições';
            console.warn('[useAtribuicaoCs]', message);
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const salvarCidade = useCallback(async (cidade: string, analista: Manager, mode: ProductModeKey) => {
        const anterior = atribuicoes.porCidade[mode][cidade];
        const otimista: AtribuicoesCs = {
            ...atribuicoes,
            porCidade: { ...atribuicoes.porCidade, [mode]: { ...atribuicoes.porCidade[mode] } },
        };

        if (analista === 'DESCONHECIDO') delete otimista.porCidade[mode][cidade];
        else otimista.porCidade[mode][cidade] = analista;

        setAtribuicoes(otimista);
        setAtribuicoesCarregadas(otimista);

        const resposta = analista === 'DESCONHECIDO'
            ? await supabase.from('cs_cidade').delete().eq('cidade', cidade).eq('produto', produtoDb(mode))
            : await supabase.from('cs_cidade').upsert(
                { cidade, produto: produtoDb(mode), analista, atualizado_em: new Date().toISOString() },
                { onConflict: 'cidade,produto' },
            );

        if (resposta.error) {
            await load(); // recarrega para a tela não mentir sobre o que está salvo
            throw resposta.error;
        }
        return anterior;
    }, [atribuicoes, load]);

    const salvarParceiro = useCallback(async (
        estabId: string,
        analista: Manager,
        mode: ProductModeKey,
        info?: { estabelecimento?: string; cidade?: string },
    ) => {
        const otimista: AtribuicoesCs = {
            ...atribuicoes,
            porParceiro: { ...atribuicoes.porParceiro, [mode]: { ...atribuicoes.porParceiro[mode] } },
        };

        if (analista === 'DESCONHECIDO') {
            delete otimista.porParceiro[mode][estabId];
        } else {
            otimista.porParceiro[mode][estabId] = {
                analista,
                estabelecimento: info?.estabelecimento ?? atribuicoes.porParceiro[mode][estabId]?.estabelecimento ?? '',
                cidade: info?.cidade ?? atribuicoes.porParceiro[mode][estabId]?.cidade ?? '',
            };
        }

        setAtribuicoes(otimista);
        setAtribuicoesCarregadas(otimista);

        const resposta = analista === 'DESCONHECIDO'
            ? await supabase.from('cs_parceiro').delete().eq('estab_id', estabId).eq('produto', produtoDb(mode))
            : await supabase.from('cs_parceiro').upsert({
                estab_id: estabId,
                produto: produtoDb(mode),
                analista,
                estabelecimento: info?.estabelecimento ?? '',
                cidade: info?.cidade ?? '',
                atualizado_em: new Date().toISOString(),
            }, { onConflict: 'estab_id,produto' });

        if (resposta.error) {
            await load();
            throw resposta.error;
        }
    }, [atribuicoes, load]);

    return { atribuicoes, isLoading, error, salvarCidade, salvarParceiro, refetch: load };
}
