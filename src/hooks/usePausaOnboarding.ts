import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    diasNaPausaAtual,
    type MotivoPausa,
    type PausaMap,
    type PausaOnboarding,
} from '../config/pausaOnboarding';

// ─────────────────────────────────────────────────────────────────────────
// Pausa do onboarding, por parceiro — Supabase `onboarding_pausa`.
//
// Cache de módulo + inscritos (mesmo padrão de useCrmNotes): a ficha do
// parceiro escreve e a lista lê na mesma aba, então as duas instâncias do hook
// precisam compartilhar estado — senão pausar não some com a linha da fila sem
// recarregar a página.
//
// Ver supabase/onboarding_pausa.sql e config/pausaOnboarding.ts.
// ─────────────────────────────────────────────────────────────────────────

let _cache: PausaMap | null = null;
const inscritos = new Set<(m: PausaMap) => void>();

function publicar(map: PausaMap) {
    _cache = map;
    for (const fn of inscritos) fn(map);
}

interface PausaRow {
    partner_id: string;
    pausado: boolean;
    motivo: string;
    observacao: string | null;
    previsao_retorno: string | null;
    pausado_em: string;
    pausado_por: string | null;
    retomado_em: string | null;
    dias_acumulados: number | null;
}

function toPausa(row: PausaRow): PausaOnboarding {
    return {
        partnerId: String(row.partner_id),
        pausado: !!row.pausado,
        motivo: row.motivo as MotivoPausa,
        observacao: row.observacao ?? null,
        previsaoRetorno: row.previsao_retorno ? String(row.previsao_retorno).slice(0, 10) : null,
        pausadoEm: row.pausado_em,
        pausadoPor: row.pausado_por ?? null,
        retomadoEm: row.retomado_em ?? null,
        diasAcumulados: row.dias_acumulados ?? 0,
    };
}

async function fetchPausas(): Promise<PausaMap> {
    const { data, error } = await supabase
        .from('onboarding_pausa')
        .select('partner_id, pausado, motivo, observacao, previsao_retorno, pausado_em, pausado_por, retomado_em, dias_acumulados');
    if (error) throw new Error(error.message);

    const map: PausaMap = {};
    for (const row of (data ?? []) as PausaRow[]) {
        map[String(row.partner_id)] = toPausa(row);
    }
    return map;
}

export interface DadosPausa {
    motivo: MotivoPausa;
    observacao?: string | null;
    /** YYYY-MM-DD */
    previsaoRetorno?: string | null;
    pausadoPor?: string | null;
}

export function usePausaOnboarding() {
    const [pausaMap, setPausaMap] = useState<PausaMap>(_cache ?? {});
    const [erro, setErro] = useState<string | null>(null);
    // Sem isto, a lista mostraria "ninguém pausado" enquanto carrega — e os dias
    // ativos apareceriam sem desconto por um instante.
    const [carregando, setCarregando] = useState(_cache == null);

    useEffect(() => {
        inscritos.add(setPausaMap);
        return () => { inscritos.delete(setPausaMap); };
    }, []);

    useEffect(() => {
        if (_cache) return;
        fetchPausas()
            .then(m => { publicar(m); setCarregando(false); })
            .catch(err => {
                console.warn('[usePausaOnboarding] falha ao carregar:', err);
                setErro(err instanceof Error ? err.message : 'falha ao carregar');
                setCarregando(false);
            });
    }, []);

    const getPausa = useCallback(
        (partnerId: string | number): PausaOnboarding | undefined => pausaMap[String(partnerId)],
        [pausaMap],
    );

    /** Grava o estado e atualiza o mapa de forma otimista, revertendo se o Supabase recusar. */
    const salvar = useCallback(async (nova: PausaOnboarding): Promise<boolean> => {
        const id = nova.partnerId;
        const anterior = (_cache ?? {})[id];
        publicar({ ...(_cache ?? {}), [id]: nova });

        const { error } = await supabase
            .from('onboarding_pausa')
            .upsert({
                partner_id: id,
                pausado: nova.pausado,
                motivo: nova.motivo,
                observacao: nova.observacao,
                previsao_retorno: nova.previsaoRetorno,
                pausado_em: nova.pausadoEm,
                pausado_por: nova.pausadoPor,
                retomado_em: nova.retomadoEm,
                dias_acumulados: nova.diasAcumulados,
                atualizado_em: new Date().toISOString(),
            }, { onConflict: 'partner_id' });

        if (error) {
            console.error('[usePausaOnboarding] falha ao salvar:', error);
            setErro(error.message);
            const revertido = { ...(_cache ?? {}) };
            if (anterior) revertido[id] = anterior; else delete revertido[id];
            publicar(revertido);
            return false;
        }
        setErro(null);
        return true;
    }, []);

    const pausar = useCallback(async (partnerId: string | number, dados: DadosPausa): Promise<boolean> => {
        const id = String(partnerId);
        const anterior = (_cache ?? {})[id];
        return salvar({
            partnerId: id,
            pausado: true,
            motivo: dados.motivo,
            observacao: dados.observacao?.trim() ? dados.observacao.trim() : null,
            previsaoRetorno: dados.previsaoRetorno || null,
            pausadoEm: new Date().toISOString(),
            pausadoPor: dados.pausadoPor ?? null,
            retomadoEm: null,
            // Pausa nova começa do zero, mas preserva o que pausas anteriores já
            // descontaram — senão retomar e pausar de novo devolveria os dias.
            diasAcumulados: anterior?.diasAcumulados ?? 0,
        });
    }, [salvar]);

    const retomar = useCallback(async (partnerId: string | number): Promise<boolean> => {
        const id = String(partnerId);
        const atual = (_cache ?? {})[id];
        if (!atual) return true;
        return salvar({
            ...atual,
            pausado: false,
            retomadoEm: new Date().toISOString(),
            // Fecha a conta: o que a pausa em curso descontava vira permanente.
            diasAcumulados: atual.diasAcumulados + diasNaPausaAtual(atual),
        });
    }, [salvar]);

    return { pausaMap, carregando, erro, getPausa, pausar, retomar };
}
