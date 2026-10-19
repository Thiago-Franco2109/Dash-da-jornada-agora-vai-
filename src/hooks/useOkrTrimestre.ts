import { useCallback, useEffect, useState } from 'react';
import { CIDADES_OKR } from '../config/cidadesOkr';

// ─────────────────────────────────────────────────────────────────────────
// Os três KRs de Sucesso do Cliente — Netlify Function `okr-trimestre`
// (banco de teste). KR 1 e 2 são marketplace nas cidades da OKR; o KR 3 é a
// base de Cardápio Digital inteira.
//
// Os prefixos das cidades vão NA CHAMADA, vindos de config/cidadesOkr.ts: é a
// mesma lista que acende o chip "Cidades OKR" no painel inteiro, e assim o
// número da OKR não pode divergir do recorte que a interface diz estar usando.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/okr-trimestre';

const PREFIXOS_OKR = CIDADES_OKR.flatMap(c => c.prefixos).join(',');

export interface OkrParceiroNovo {
    id: number;
    nome: string;
    cidade: string;
    lancamento: string;
    pedidos: number;
    /** Bateu a meta de pedidos na janela — conta mesmo antes de ela fechar. */
    atingiu: boolean;
    concluida: boolean;
    diasRestantes: number;
    /** Já tinha contrato antes deste lançamento. */
    relancamento: boolean;
    /** Relançou com documento diferente — sai da coorte do KR 1. */
    trocaDono: boolean;
    docAnterior: string;
    docAtual: string;
}

export interface OkrLojaEngajada {
    id: number;
    nome: string;
    cidade: string;
    lancamento: string;
    pedidos28d: number;
    /** A janela imediatamente anterior — o "antes" do antes→depois. */
    pedidos28dAnterior: number;
    engajada: boolean;
    /** Cruzou a régua nesta janela: é resultado, não participação. */
    cruzou: boolean;
    /** Caiu da régua: o vazamento do KR. */
    caiu: boolean;
    ultimoPedido: string | null;
    /** null = nenhum pedido no histórico consultado, não "há 0 dias". */
    diasSemPedido: number | null;
}

export interface OkrLojaCd {
    id: number;
    nome: string;
    cidade: string;
    /** delivery = 1 hoje. Contrato vivo com loja desligada existe. */
    ligada: boolean;
    porMes: Record<string, number>;
    faturamentoMes: number;
    acima: boolean;
}

export interface OkrParametros {
    janelaNovos: number;
    pedidosNovos: number;
    metaKr1: number;
    janelaEngajada: number;
    pedidosEngajada: number;
    metaKr2: number;
    faturamentoMinimo: number;
    metaKr3: number;
    desdeEngajada: string;
    desdeAnterior: string;
    ateAnterior: string;
}

export interface OkrTrimestre {
    ok: true;
    trimestre: {
        id: string; inicio: string; fim: string; corte: string; hoje: string;
        dadosAte: string; meses: string[]; mesCorrente: string; mesAnterior: string;
    };
    cidades: string[];
    parametros: OkrParametros;
    // Listas nominais, sem placar: quem soma é utils/okrFiguras.ts, que precisa
    // descontar as lojas fora da conta antes de fechar a porcentagem.
    kr1: { meta: number; parceiros: OkrParceiroNovo[] };
    kr2: { meta: number; parceiros: OkrLojaEngajada[] };
    kr3: { meta: number; lojas: OkrLojaCd[] };
    elapsedMs?: number;
}

/** Trimestre corrente no fuso de Brasília, no formato YYYY-Qn. */
export function trimestreAtual(): string {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    return `${hoje.slice(0, 4)}-Q${Math.floor((Number(hoje.slice(5, 7)) - 1) / 3) + 1}`;
}

/** O trimestre atual e os `quantos` anteriores, do mais novo para o mais velho. */
export function trimestresRecentes(quantos = 4): string[] {
    const atual = trimestreAtual();
    let ano = Number(atual.slice(0, 4));
    let tri = Number(atual.slice(6));
    const lista: string[] = [];
    for (let i = 0; i <= quantos; i++) {
        lista.push(`${ano}-Q${tri}`);
        tri -= 1;
        if (tri === 0) { tri = 4; ano -= 1; }
    }
    return lista;
}

/** Rótulo curto: "2026-Q4" → "4º tri 2026". */
export function rotuloTrimestre(id: string): string {
    return `${id.slice(6)}º tri ${id.slice(0, 4)}`;
}

const _cache = new Map<string, OkrTrimestre>();

async function fetchOkr(trimestre: string): Promise<OkrTrimestre> {
    const params = new URLSearchParams({ cidades: PREFIXOS_OKR, trimestre });
    const res = await fetch(`${FN_URL}?${params}`, { credentials: 'include' as RequestCredentials });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar a OKR.`);
    }
    return json as OkrTrimestre;
}

interface EstadoOkr {
    /** Trimestre a que `dados` e `error` se referem. */
    id: string;
    dados: OkrTrimestre | null;
    error: string | null;
}

export function useOkrTrimestre(trimestre: string) {
    const [estado, setEstado] = useState<EstadoOkr>({ id: '', dados: null, error: null });

    const load = useCallback(() => {
        setEstado({ id: trimestre, dados: null, error: null });
        fetchOkr(trimestre)
            .then(res => { _cache.set(trimestre, res); setEstado({ id: trimestre, dados: res, error: null }); })
            .catch(err => {
                console.warn('[useOkrTrimestre] falha:', err);
                setEstado({ id: trimestre, dados: null, error: err.message });
            });
    }, [trimestre]);

    // Trimestre já carregado não refaz a consulta: trocar de trimestre e voltar
    // é o movimento natural de quem está comparando. Quem lê o cache é o render
    // lá embaixo — por isso o efeito não precisa mexer em estado aqui.
    useEffect(() => {
        if (_cache.has(trimestre)) return;
        load();
    }, [trimestre, load]);

    const refetch = useCallback(() => { _cache.delete(trimestre); load(); }, [trimestre, load]);

    const doTrimestre = estado.id === trimestre;
    const dados = (doTrimestre ? estado.dados : null) ?? _cache.get(trimestre) ?? null;
    const error = doTrimestre ? estado.error : null;

    // Nada para mostrar e nenhum erro = a consulta ainda está em voo.
    return { dados, loading: dados === null && error === null, error, refetch };
}
