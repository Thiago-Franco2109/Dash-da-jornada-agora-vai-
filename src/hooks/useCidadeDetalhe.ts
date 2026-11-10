import { useEffect, useState } from 'react';
import type { CidadeDetalhe, JanelaCidade } from '../types/cidadeDetalhe';

const FN_URL = '/.netlify/functions/cidade-detalhe';

/**
 * Detalhe de uma cidade. Refaz a busca quando a cidade ou a janela mudam.
 *
 * `cidade = null` é o estado "nenhuma cidade aberta": o hook fica parado.
 *
 * `isLoading` é DERIVADO de "o resultado que tenho em mão é desta chave?", em
 * vez de ser um estado próprio ligado no começo do efeito — setState síncrono
 * dentro do efeito dispara render em cascata (o lint do projeto barra).
 * O resultado anterior continua sendo devolvido enquanto o novo não chega, pra
 * trocar de janela não piscar a tela inteira.
 *
 * O `AbortController` importa aqui: a function leva ~2,3s na maior cidade (o
 * scan de `cupom_desconto` é o caro), e sem ele trocar de janela duas vezes
 * deixaria a resposta velha chegar por último e sobrescrever a nova.
 */
export function useCidadeDetalhe(cidade: string | null, dias: JanelaCidade) {
    const chave = cidade ? `${cidade}|${dias}` : '';
    const [ultimo, setUltimo] = useState<{ chave: string; data: CidadeDetalhe } | null>(null);
    const [falha, setFalha] = useState<{ chave: string; msg: string } | null>(null);

    useEffect(() => {
        if (!cidade) return;

        const ctrl = new AbortController();
        const params = new URLSearchParams({ cidade, dias: String(dias) });

        fetch(`${FN_URL}?${params.toString()}`, {
            credentials: 'include' as RequestCredentials,
            signal: ctrl.signal,
        })
            .then(async res => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok !== true) {
                    throw new Error(json?.error || `Erro ${res.status} ao carregar a cidade.`);
                }
                return json as CidadeDetalhe;
            })
            .then(json => {
                if (ctrl.signal.aborted) return;
                setUltimo({ chave: `${cidade}|${dias}`, data: json });
            })
            .catch((err: unknown) => {
                if (ctrl.signal.aborted || (err as Error)?.name === 'AbortError') return;
                setFalha({
                    chave: `${cidade}|${dias}`,
                    msg: err instanceof Error ? err.message : 'Erro desconhecido.',
                });
            });

        return () => ctrl.abort();
    }, [cidade, dias]);

    const erroAtual = falha?.chave === chave ? falha.msg : null;

    return {
        /** Pode ser o resultado da chave anterior enquanto a atual não chega. */
        data: ultimo?.data ?? null,
        isLoading: !!cidade && ultimo?.chave !== chave && !erroAtual,
        error: erroAtual,
    };
}
