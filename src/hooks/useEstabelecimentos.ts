import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Integração com a Netlify Function `estabelecimento` (banco de teste MySQL).
// A function é read-only e protegida: exige a mesma sessão do app (Gateway).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/estabelecimento';

/** Token Bearer nos dois storages (igual ao AuthContext). */
function getFetchOptions(): RequestInit {
    const token =
        sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '';
    const options: RequestInit = { credentials: 'include' as RequestCredentials };
    if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
    }
    return options;
}

async function fetchFn<T>(query: string): Promise<T> {
    const res = await fetch(`${FN_URL}${query}`, getFetchOptions());
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        if (res.status === 401) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        throw new Error(json?.error || `Erro ${res.status} ao consultar estabelecimentos.`);
    }
    return json as T;
}

// ─── Tipos (espelham o retorno da function) ───────────────────────────────

/** Rótulos de status do contrato — derivados do campo `delivery`. */
export type EstabelecimentoStatus =
    | 'ativo' | 'cancelado' | 'suspenso' | 'desistencia'
    | 'nao_delivery' | 'inativo' | 'outro' | 'desconhecido' | string;

export interface EstabelecimentoStatusCount {
    delivery: number | null;
    status: EstabelecimentoStatus;
    total: number;
}

export interface EstabelecimentoSummary {
    total: number;
    byStatus: EstabelecimentoStatusCount[];
}

export interface Estabelecimento {
    id: number;
    uid: string | null;
    nome: string;
    delivery: number | null;
    status: EstabelecimentoStatus;
    ativo: number;
    localidadeId: number | null;
    notaQualificacao: number | null;
    indiceDelivery: number | null;
    indiceDestaque: number | null;
}

export interface EstabelecimentoListResult {
    total: number;
    count: number;
    limit: number;
    offset: number;
    data: Estabelecimento[];
}

export interface EstabelecimentoListParams {
    /** Código de delivery (1 ativo / 2 cancelado / 4 suspenso / 5 desistência). */
    status?: number;
    /** Busca por nome (LIKE). */
    search?: string;
    limit?: number;
    offset?: number;
}

// ─── Cache do resumo (não muda a cada render; recarrega sob demanda) ───────
let _summaryCache: EstabelecimentoSummary | null = null;
let _summaryPromise: Promise<EstabelecimentoSummary> | null = null;

async function fetchSummary(force = false): Promise<EstabelecimentoSummary> {
    if (!force && _summaryCache) return _summaryCache;
    if (!force && _summaryPromise) return _summaryPromise;

    _summaryPromise = fetchFn<{ total: number; byStatus: EstabelecimentoStatusCount[] }>('?summary=1')
        .then(res => {
            _summaryCache = { total: res.total, byStatus: res.byStatus };
            return _summaryCache;
        })
        .finally(() => { _summaryPromise = null; });

    return _summaryPromise;
}

/**
 * Resumo de parceiros por status (o "gabarito" de churn histórico).
 * Uso: const { summary, loading, error, refetch } = useEstabelecimentoSummary();
 */
export function useEstabelecimentoSummary() {
    const [summary, setSummary] = useState<EstabelecimentoSummary | null>(_summaryCache);
    const [loading, setLoading] = useState(!_summaryCache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback((force = false) => {
        setLoading(true);
        setError(null);
        fetchSummary(force)
            .then(s => { setSummary(s); setLoading(false); })
            .catch(err => {
                console.warn('[useEstabelecimentoSummary] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        // se já há cache, o estado inicial (useState acima) já reflete ele
        if (_summaryCache) return;
        load();
    }, [load]);

    return { summary, loading, error, refetch: () => load(true) };
}

// ─── Atividade: ativos com pedido numa janela de N dias ──────────────────
export interface EstabelecimentoActivity {
    windowDays: number;
    totalAtivos: number;
    comPedido: number;
    semPedido: number;
}

const _activityCache: Record<number, EstabelecimentoActivity> = {};

/**
 * Quantos parceiros ativos (delivery=1) receberam pedido nos últimos N dias.
 * Uso: const { activity, loading, error, refetch } = useEstabelecimentoActivity(28);
 */
export function useEstabelecimentoActivity(windowDays = 28) {
    const [activity, setActivity] = useState<EstabelecimentoActivity | null>(
        _activityCache[windowDays] ?? null,
    );
    const [loading, setLoading] = useState(!_activityCache[windowDays]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback((force = false) => {
        if (!force && _activityCache[windowDays]) {
            setActivity(_activityCache[windowDays]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        fetchFn<EstabelecimentoActivity>(`?activity=${windowDays}`)
            .then(res => {
                _activityCache[windowDays] = res;
                setActivity(res);
                setLoading(false);
            })
            .catch(err => {
                console.warn('[useEstabelecimentoActivity] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [windowDays]);

    useEffect(() => {
        if (_activityCache[windowDays]) return;
        load();
    }, [load, windowDays]);

    return { activity, loading, error, refetch: () => load(true) };
}

/** Monta a query string a partir dos filtros. */
function buildListQuery(params: EstabelecimentoListParams): string {
    const q = new URLSearchParams();
    if (params.status != null) q.set('status', String(params.status));
    if (params.search) q.set('search', params.search);
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    const s = q.toString();
    return s ? `?${s}` : '';
}

/** Busca pontual da lista (sem hook) — útil fora de componentes. */
export function fetchEstabelecimentos(
    params: EstabelecimentoListParams = {},
): Promise<EstabelecimentoListResult> {
    return fetchFn<EstabelecimentoListResult>(buildListQuery(params));
}

/**
 * Lista de parceiros com filtros/paginação.
 * Refaz a busca quando status/search/limit/offset mudam.
 */
export function useEstabelecimentos(params: EstabelecimentoListParams = {}) {
    const { status, search, limit, offset } = params;
    const [result, setResult] = useState<EstabelecimentoListResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchEstabelecimentos({ status, search, limit, offset })
            .then(r => { setResult(r); setLoading(false); })
            .catch(err => {
                console.warn('[useEstabelecimentos] falha:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [status, search, limit, offset]);

    useEffect(() => { load(); }, [load]);

    return { result, loading, error, refetch: load };
}
