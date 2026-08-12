import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * DIVISÃO e GRUPO por cidade — os dois rótulos da Carteira que não existem no
 * banco Bigou (ver supabase/carteira_cidade.sql). Ficam no Supabase e são
 * editados pela própria tela.
 */

export interface CarteiraClassificacao {
    divisao: string;
    grupo: string;
}

export type CarteiraClassificacaoMap = Record<string, CarteiraClassificacao>;

export async function fetchCarteiraClassificacao(): Promise<CarteiraClassificacaoMap> {
    const { data, error } = await supabase
        .from('carteira_cidade')
        .select('cidade, divisao, grupo');

    if (error) throw error;

    const mapa: CarteiraClassificacaoMap = {};
    for (const row of (data ?? []) as { cidade: string; divisao: string; grupo: string }[]) {
        mapa[row.cidade] = { divisao: row.divisao ?? '', grupo: row.grupo ?? '' };
    }
    return mapa;
}

export function useCarteiraClassificacao() {
    const [mapa, setMapa] = useState<CarteiraClassificacaoMap>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setMapa(await fetchCarteiraClassificacao());
            setError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar divisão/grupo';
            console.warn('[useCarteiraClassificacao]', message);
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /** Salva os dois rótulos de uma cidade e atualiza o estado local na hora. */
    const salvar = useCallback(async (cidade: string, valores: CarteiraClassificacao) => {
        const anterior = mapa[cidade];
        setMapa(prev => ({ ...prev, [cidade]: valores }));

        const { error: upsertError } = await supabase
            .from('carteira_cidade')
            .upsert({
                cidade,
                divisao: valores.divisao,
                grupo: valores.grupo,
                atualizado_em: new Date().toISOString(),
            }, { onConflict: 'cidade' });

        if (upsertError) {
            // Desfaz para a tela não mentir sobre o que está salvo.
            setMapa(prev => {
                const next = { ...prev };
                if (anterior) next[cidade] = anterior;
                else delete next[cidade];
                return next;
            });
            throw upsertError;
        }
    }, [mapa]);

    return { mapa, isLoading, error, salvar, refetch: load };
}
