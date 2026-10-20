import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Histórico do parceiro — Netlify Function `parceiro-historico`.
//
// A curva de pedidos e tudo que mudou na loja no mesmo eixo de tempo. Ver o
// cabeçalho da function para de onde vem cada evento e o que o banco NÃO
// guarda (o log não diz qual item foi desativado, só que um foi).
//
// A janela é cara (~10 idas ao banco, ~3s em 12 meses), e todos os filtros
// da tela são client-side de propósito: trocar chip não refaz a consulta.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/parceiro-historico';

export type TipoHistorico =
    | 'cardapio'
    | 'promocao'
    | 'cupom'
    | 'horario'
    | 'recesso'
    | 'entrega'
    | 'pagamento'
    | 'cancelamento';

export type ImpactoHistorico = 'negativo' | 'positivo' | 'neutro';

/** Quem mexeu: muda a conversa com o parceiro. 'misto' = os dois no mesmo dia. */
export type QuemHistorico = 'loja' | 'admin' | 'sistema' | 'misto';

export interface EventoHistorico {
    dia: string;
    tipo: TipoHistorico;
    titulo: string;
    /** Quantas vezes o mesmo título aconteceu no dia. */
    quantidade: number;
    impacto: ImpactoHistorico;
    quem: QuemHistorico;
    detalhe: string;
    /** Nomes quando o banco deixa saber quais. Nunca é a lista completa. */
    exemplos: string[];
    /** Quem assinou, pelo nome, quando a mexida veio de alguém da Bigou. */
    autores: string[];
}

export interface DiaHistorico {
    dia: string;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvLiq: number;
}

export interface Historico {
    ok: true;
    estab: { id: number; nome: string; cidade: string; delivery: number };
    janela: { de: string; ate: string; meses: number };
    serie: DiaHistorico[];
    eventos: EventoHistorico[];
    resumo: {
        totalEventos: number;
        porTipo: Partial<Record<TipoHistorico, number>>;
        negativos: number;
        pelaLoja: number;
    };
    fontes: { logDesde: string | null; logTruncado: boolean };
    elapsedMs?: number;
}

/** Cache por parceiro+janela: reabrir a ficha não paga a consulta de novo. */
const _cache = new Map<string, Historico>();

async function buscar(estabId: string, meses: number): Promise<Historico> {
    const res = await fetch(`${FN_URL}?estabId=${encodeURIComponent(estabId)}&meses=${meses}`, {
        credentials: 'include' as RequestCredentials,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar o histórico.`);
    }
    return json as Historico;
}

interface EstadoHistorico {
    /** Chave a que `dados` e `erro` se referem. */
    chave: string;
    dados: Historico | null;
    erro: string | null;
}

export function useParceiroHistorico(estabId: string | undefined, meses = 12) {
    const chave = `${estabId ?? ''}:${meses}`;
    const [estado, setEstado] = useState<EstadoHistorico>({ chave: '', dados: null, erro: null });

    const carregar = useCallback(() => {
        if (!estabId) return;
        setEstado({ chave, dados: null, erro: null });
        buscar(estabId, meses)
            .then(res => { _cache.set(chave, res); setEstado({ chave, dados: res, erro: null }); })
            .catch(err => {
                console.warn('[useParceiroHistorico] falha:', err);
                setEstado({ chave, dados: null, erro: err instanceof Error ? err.message : 'falha ao carregar' });
            });
    }, [estabId, meses, chave]);

    // Quem lê o cache é o render — o efeito só dispara a busca quando não há
    // nada guardado, sem mexer em estado aqui.
    useEffect(() => {
        if (!estabId || _cache.has(chave)) return;
        carregar();
    }, [estabId, chave, carregar]);

    const recarregar = useCallback(() => { _cache.delete(chave); carregar(); }, [chave, carregar]);

    const daChave = estado.chave === chave;
    const dados = (daChave ? estado.dados : null) ?? _cache.get(chave) ?? null;
    const erro = daChave ? estado.erro : null;

    // Nada para mostrar e nenhum erro = a consulta ainda está em voo.
    return { dados, carregando: Boolean(estabId) && dados === null && erro === null, erro, recarregar };
}
