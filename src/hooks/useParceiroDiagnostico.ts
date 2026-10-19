import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// "Por que este parceiro caiu?" — Netlify Function `parceiro-diagnostico`.
//
// Junta numa linha do tempo só o que estava espalhado em meia dúzia de telas
// (cardápio, funcionamento, promoções, pedidos) e o que não existia em lugar
// nenhum (método de pagamento, bairro, taxa de entrega). Ver o cabeçalho da
// function para as decisões de régua e os limites do histórico.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/parceiro-diagnostico';

export type TipoEvento = 'pagamento' | 'horario' | 'entrega' | 'recesso' | 'cardapio' | 'cupom';

export interface EventoDiagnostico {
    data: string;
    tipo: TipoEvento;
    titulo: string;
    detalhe: string;
    /** Quem mexeu: muda a conversa com o parceiro. */
    quem: 'loja' | 'admin' | 'sistema';
    /** Desligou algo — é o que costuma explicar queda. */
    desligou: boolean;
}

export interface ResumoDiagnostico {
    pagamento: number;
    pagamentoDesligou: number;
    horario: number;
    entrega: number;
    recesso: number;
    recessoPelaLoja: number;
    cupom: number;
    cardapio: number;
    /** Itens desativados que VENDIAM — a causa mais cara da lista. */
    cardapioQueVendia: number;
    /** Itens no ar mandando pedir por WhatsApp: o cliente sai do app. */
    itensFuga: string[];
    /** null = nenhum pedido no último mês, não "0% de cancelamento". */
    taxaCancelamento: number | null;
}

export interface Diagnostico {
    ok: true;
    estab: { id: number; nome: string; cidade: string; delivery: number };
    janela: { de: string; ate: string; dias: number };
    curva: { mes: string; aceitos: number; cancelados: number }[];
    eventos: EventoDiagnostico[];
    resumo: ResumoDiagnostico;
    elapsedMs?: number;
}

/** Cache por parceiro+janela: reabrir a ficha não paga 3s de novo. */
const _cache = new Map<string, Diagnostico>();

async function buscar(estabId: string, dias: number): Promise<Diagnostico> {
    const res = await fetch(`${FN_URL}?estabId=${encodeURIComponent(estabId)}&dias=${dias}`, {
        credentials: 'include' as RequestCredentials,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar o diagnóstico.`);
    }
    return json as Diagnostico;
}

interface EstadoDiagnostico {
    /** Chave a que `dados` e `erro` se referem. */
    chave: string;
    dados: Diagnostico | null;
    erro: string | null;
}

export function useParceiroDiagnostico(estabId: string | undefined, dias = 90) {
    const chave = `${estabId ?? ''}:${dias}`;
    const [estado, setEstado] = useState<EstadoDiagnostico>({ chave: '', dados: null, erro: null });

    const carregar = useCallback(() => {
        if (!estabId) return;
        setEstado({ chave, dados: null, erro: null });
        buscar(estabId, dias)
            .then(res => { _cache.set(chave, res); setEstado({ chave, dados: res, erro: null }); })
            .catch(err => {
                console.warn('[useParceiroDiagnostico] falha:', err);
                setEstado({ chave, dados: null, erro: err instanceof Error ? err.message : 'falha ao carregar' });
            });
    }, [estabId, dias, chave]);

    // Quem lê o cache é o render lá embaixo — por isso o efeito só dispara a
    // busca quando não há nada guardado, sem mexer em estado aqui.
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
