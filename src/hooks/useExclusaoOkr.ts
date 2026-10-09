import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { ExclusaoMap, ExclusaoOkr, MotivoExclusao } from '../config/exclusaoOkr';

// ─────────────────────────────────────────────────────────────────────────
// Lojas fora da conta da OKR — Supabase `okr_excluido`.
//
// Cache de módulo + inscritos (mesmo padrão de usePausaOnboarding): a lista de
// cada KR e o painel "fora da conta" são instâncias diferentes do hook na
// mesma tela, e precisam compartilhar estado — senão tirar uma loja da conta
// não atualizaria a porcentagem sem recarregar a página.
//
// Ver supabase/okr_excluido.sql e config/exclusaoOkr.ts.
// ─────────────────────────────────────────────────────────────────────────

let _cache: ExclusaoMap | null = null;
const inscritos = new Set<(m: ExclusaoMap) => void>();

function publicar(map: ExclusaoMap) {
    _cache = map;
    for (const fn of inscritos) fn(map);
}

interface ExclusaoRow {
    partner_id: string;
    motivo: string;
    observacao: string | null;
    nome: string | null;
    cidade: string | null;
    excluido_em: string;
    excluido_por: string | null;
}

function toExclusao(row: ExclusaoRow): ExclusaoOkr {
    return {
        partnerId: String(row.partner_id),
        motivo: row.motivo as MotivoExclusao,
        observacao: row.observacao ?? null,
        nome: row.nome ?? null,
        cidade: row.cidade ?? null,
        excluidoEm: row.excluido_em,
        excluidoPor: row.excluido_por ?? null,
    };
}

async function fetchExclusoes(): Promise<ExclusaoMap> {
    const { data, error } = await supabase
        .from('okr_excluido')
        .select('partner_id, motivo, observacao, nome, cidade, excluido_em, excluido_por');
    if (error) throw new Error(error.message);

    const map: ExclusaoMap = {};
    for (const row of (data ?? []) as ExclusaoRow[]) {
        map[String(row.partner_id)] = toExclusao(row);
    }
    return map;
}

export interface DadosExclusao {
    motivo: MotivoExclusao;
    observacao?: string | null;
    nome?: string | null;
    cidade?: string | null;
    excluidoPor?: string | null;
}

export function useExclusaoOkr() {
    const [exclusoes, setExclusoes] = useState<ExclusaoMap>(_cache ?? {});
    const [erro, setErro] = useState<string | null>(null);
    // Sem isto, os KRs apareceriam por um instante com a base cheia e logo
    // mudariam de porcentagem — justamente o número que vai para o chefe.
    const [carregando, setCarregando] = useState(_cache == null);

    useEffect(() => {
        inscritos.add(setExclusoes);
        return () => { inscritos.delete(setExclusoes); };
    }, []);

    useEffect(() => {
        if (_cache) return;
        fetchExclusoes()
            .then(m => { publicar(m); setCarregando(false); })
            .catch(err => {
                console.warn('[useExclusaoOkr] falha ao carregar:', err);
                setErro(err instanceof Error ? err.message : 'falha ao carregar');
                setCarregando(false);
            });
    }, []);

    /** Ids fora da conta, para filtrar as listas dos KRs. */
    const idsExcluidos = useMemo(
        () => new Set(Object.keys(exclusoes).map(Number)),
        [exclusoes],
    );

    /** Tira da conta. Otimista: desfaz o mapa se o Supabase recusar. */
    const excluir = useCallback(async (partnerId: string | number, dados: DadosExclusao): Promise<boolean> => {
        const id = String(partnerId);
        const nova: ExclusaoOkr = {
            partnerId: id,
            motivo: dados.motivo,
            observacao: dados.observacao?.trim() ? dados.observacao.trim() : null,
            nome: dados.nome ?? null,
            cidade: dados.cidade ?? null,
            excluidoEm: new Date().toISOString(),
            excluidoPor: dados.excluidoPor ?? null,
        };
        const anterior = (_cache ?? {})[id];
        publicar({ ...(_cache ?? {}), [id]: nova });

        const { error } = await supabase
            .from('okr_excluido')
            .upsert({
                partner_id: id,
                motivo: nova.motivo,
                observacao: nova.observacao,
                nome: nova.nome,
                cidade: nova.cidade,
                excluido_em: nova.excluidoEm,
                excluido_por: nova.excluidoPor,
                atualizado_em: new Date().toISOString(),
            }, { onConflict: 'partner_id' });

        if (error) {
            console.error('[useExclusaoOkr] falha ao excluir:', error);
            setErro(error.message);
            const revertido = { ...(_cache ?? {}) };
            if (anterior) revertido[id] = anterior; else delete revertido[id];
            publicar(revertido);
            return false;
        }
        setErro(null);
        return true;
    }, []);

    /** Devolve a loja para a conta — some da tabela, não vira linha "cancelada". */
    const reincluir = useCallback(async (partnerId: string | number): Promise<boolean> => {
        const id = String(partnerId);
        const anterior = (_cache ?? {})[id];
        if (!anterior) return true;

        const otimista = { ...(_cache ?? {}) };
        delete otimista[id];
        publicar(otimista);

        const { error } = await supabase.from('okr_excluido').delete().eq('partner_id', id);
        if (error) {
            console.error('[useExclusaoOkr] falha ao reincluir:', error);
            setErro(error.message);
            publicar({ ...(_cache ?? {}), [id]: anterior });
            return false;
        }
        setErro(null);
        return true;
    }, []);

    return { exclusoes, idsExcluidos, carregando, erro, excluir, reincluir };
}
