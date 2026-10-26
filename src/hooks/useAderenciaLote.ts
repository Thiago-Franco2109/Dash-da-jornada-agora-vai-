import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
    buildAderencia,
    type AderenciaParceiro,
    type HorarioDia,
    type RecessoRecord,
} from '../utils/partnerFuncionamento';

const FUNCIONAMENTO_FN_URL = '/.netlify/functions/funcionamento';

/** Quantos parceiros por requisição. O teto da Function é 400. */
const TAMANHO_LOTE = 150;
/** Enquanto estiver fresco, trocar de filtro não refaz a consulta. */
const TTL_MS = 20 * 60 * 1000;

interface FuncionamentoBruto {
    horarios: HorarioDia[];
    recessos: RecessoRecord[];
    buscadoEm: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Store de módulo.
//
// Os horários vivem fora do React de propósito: a lista remonta a cada ida e
// volta para a ficha do parceiro, e a consulta é cara (duas tabelas, centenas
// de ids). O componente assina o store em vez de espelhar o cache em estado.
// ───────────────────────────────────────────────────────────────────────────

const cache = new Map<string, FuncionamentoBruto>();
/** Lotes em voo, para duas telas abertas não pedirem os mesmos ids. */
const emVoo = new Map<string, Promise<void>>();

interface EstadoStore {
    /** Muda a cada escrita no cache — é o que dispara o re-render. */
    versao: number;
    /** Lotes em voo agora. */
    carregando: number;
    erro: string | null;
}

let estado: EstadoStore = { versao: 0, carregando: 0, erro: null };
const ouvintes = new Set<() => void>();

function publicar(patch: Partial<EstadoStore>): void {
    estado = { ...estado, ...patch };
    for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void): () => void {
    ouvintes.add(ouvinte);
    return () => { ouvintes.delete(ouvinte); };
}

function lerEstado(): EstadoStore {
    return estado;
}

function estaFresco(entrada: FuncionamentoBruto | undefined, agora: number): boolean {
    return !!entrada && agora - entrada.buscadoEm < TTL_MS;
}

async function buscarLote(ids: string[], diasRecesso: number): Promise<void> {
    const url = `${FUNCIONAMENTO_FN_URL}?estabIds=${encodeURIComponent(ids.join(','))}&diasRecesso=${diasRecesso}`;
    const res = await fetch(url, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar funcionamento em lote.`);
    }
    const agora = Date.now();
    const lote = (json.lote ?? {}) as Record<string, { horarios?: HorarioDia[]; recessos?: RecessoRecord[] }>;
    // Grava inclusive os ids sem resposta: "sem grade no CMS" é um fato, não uma
    // falha — sem isso a tela pediria esses ids de novo a cada render.
    for (const id of ids) {
        const bruto = lote[id];
        cache.set(id, {
            horarios: Array.isArray(bruto?.horarios) ? bruto.horarios : [],
            recessos: Array.isArray(bruto?.recessos) ? bruto.recessos : [],
            buscadoEm: agora,
        });
    }
}

/** Dispara o que falta e avisa o store a cada lote que chega. */
function garantirCarregados(ids: string[], diasRecesso: number): void {
    const agora = Date.now();
    const faltando = ids.filter(id => !estaFresco(cache.get(id), agora));
    if (faltando.length === 0) return;

    for (let i = 0; i < faltando.length; i += TAMANHO_LOTE) {
        const grupo = faltando.slice(i, i + TAMANHO_LOTE);
        const chave = grupo.join(',');
        if (emVoo.has(chave)) continue;

        // Registrar o lote ANTES de publicar: `publicar` avisa o React, que pode
        // re-renderizar e rodar o efeito de novo na mesma pilha — com o mapa
        // ainda vazio, isso vira uma rajada de requisições iguais.
        const promessa = buscarLote(grupo, diasRecesso)
            .then(() => {
                publicar({ versao: estado.versao + 1, carregando: estado.carregando - 1 });
            })
            .catch((err: unknown) => {
                publicar({
                    carregando: estado.carregando - 1,
                    erro: err instanceof Error ? err.message : 'Falha ao carregar a aderência.',
                });
            })
            .finally(() => { emVoo.delete(chave); });
        emVoo.set(chave, promessa);
        publicar({ carregando: estado.carregando + 1, erro: null });
    }
}

interface UseAderenciaLoteOptions {
    /** ESTAB_IDs. Ids vazios ou não numéricos são ignorados. */
    estabIds: string[];
    /** Janela de análise. 14 = duas semanas. */
    dias?: number;
    enabled?: boolean;
}

export interface AderenciaLoteResultado {
    /** Aderência por ESTAB_ID. Parceiro sem grade no CMS fica de fora. */
    porEstab: Map<string, AderenciaParceiro>;
    isLoading: boolean;
    error: string | null;
    /** Quantos dos ids pedidos já foram resolvidos (com ou sem grade). */
    carregados: number;
    total: number;
    refresh: () => void;
}

/**
 * Aderência ao horário de vários parceiros de uma vez, para listas.
 *
 * A conta é a mesma da aba Funcionamento (`buildAderencia`); o que muda é a
 * origem: um endpoint em lote em vez de uma chamada por parceiro.
 */
export function useAderenciaLote({
    estabIds,
    dias = 14,
    enabled = true,
}: UseAderenciaLoteOptions): AderenciaLoteResultado {
    // A lista chega como array novo a cada render; a chave em string é o que
    // mantém efeito e memo estáveis.
    const chaveIds = useMemo(
        () => Array.from(new Set(
            estabIds.map(id => String(id ?? '').trim()).filter(id => /^\d+$/.test(id)),
        )).sort().join(','),
        [estabIds],
    );
    const ids = useMemo(() => (chaveIds ? chaveIds.split(',') : []), [chaveIds]);

    const snapshot = useSyncExternalStore(assinar, lerEstado, lerEstado);

    // A janela de recessos precisa cobrir os dias analisados mais o recesso que
    // começou na véspera do primeiro dia.
    const diasRecesso = Math.min(90, dias + 2);

    useEffect(() => {
        if (!enabled || ids.length === 0) return;
        garantirCarregados(ids, diasRecesso);
    }, [ids, diasRecesso, enabled, snapshot.versao]);

    const porEstab = useMemo(() => {
        const mapa = new Map<string, AderenciaParceiro>();
        if (!enabled) return mapa;
        const agora = new Date();
        for (const id of ids) {
            const bruto = cache.get(id);
            if (!bruto) continue;
            const aderencia = buildAderencia(bruto.horarios, bruto.recessos, dias, agora);
            if (!aderencia.temHorario) continue;
            mapa.set(id, aderencia);
        }
        return mapa;
        // `snapshot.versao` entra de propósito: o cache é mutável e é ele quem avisa.
    }, [ids, dias, enabled, snapshot.versao]);

    const carregados = useMemo(
        () => ids.filter(id => cache.has(id)).length,
        [ids, snapshot.versao],
    );

    const refresh = useCallback(() => {
        for (const id of ids) cache.delete(id);
        publicar({ versao: estado.versao + 1, erro: null });
    }, [ids]);

    return {
        porEstab,
        isLoading: snapshot.carregando > 0,
        error: snapshot.erro,
        carregados,
        total: ids.length,
        refresh,
    };
}
