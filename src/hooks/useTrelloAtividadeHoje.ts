import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Resumo da atividade do dono do token no Trello num dia (comentários, cards
 * movidos e, opcionalmente, anexos) — ver netlify/functions/trello-atividade-hoje.ts.
 *
 * Sem argumento nenhum é "hoje, sem anexos", que é o que o cabeçalho da tela
 * Trello consome. O diário passa `data` (pra poder voltar em dias anteriores) e
 * `anexos` (o print de confirmação conta como trabalho feito).
 */

const FN_URL = '/.netlify/functions/trello-atividade-hoje';

export interface MovimentacaoTrello {
    id: string;
    tipo: 'comentario' | 'movido' | 'anexo';
    quando: string;
    cardNome: string;
    cardUrl: string;
    boardNome: string;
    /** Só em comentários — texto cru do Trello (pode ter markdown/anexos embutidos). */
    texto?: string;
    /** Só em movimentações de lista. */
    listaAntes?: string;
    listaDepois?: string;
    /** Só em anexos. */
    anexoNome?: string;
}

/** Cards distintos (não ações) por lista de destino ou por board. */
export interface ContagemPorNome {
    nome: string;
    cards: number;
}

export interface AtividadeTrelloHoje {
    /** Primeiro dia da janela. Mantido por compatibilidade com a tela Trello. */
    data: string;
    de: string;
    ate: string;
    totalMovimentacoes: number;
    comentarios: number;
    cardsMovidos: number;
    anexos: number;
    porLista: ContagemPorNome[];
    porBoard: ContagemPorNome[];
    /** A API do Trello corta em 1000 ações — aí o resumo está incompleto. */
    truncado: boolean;
    movimentacoes: MovimentacaoTrello[];
}

export interface OpcoesAtividade {
    /** Um dia só, YYYY-MM-DD no fuso de Brasília. Default: hoje. */
    data?: string;
    /** Janela fechada nas duas pontas; ignora `data` quando presente. */
    de?: string;
    ate?: string;
    /** Inclui `addAttachmentToCard` na contagem. Default: false. */
    anexos?: boolean;
    /** Não busca nada enquanto false — pro relatório semanal só pagar quando abre. */
    ativo?: boolean;
}

async function fetchAtividade({ data, de, ate, anexos }: OpcoesAtividade): Promise<AtividadeTrelloHoje> {
    const params = new URLSearchParams();
    if (de && ate) {
        params.set('de', de);
        params.set('ate', ate);
    } else if (data) {
        params.set('data', data);
    }
    if (anexos) params.set('anexos', '1');
    const query = params.toString();

    const res = await fetch(query ? `${FN_URL}?${query}` : FN_URL, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar atividade do Trello.`);
    }
    return json as AtividadeTrelloHoje;
}

export function useTrelloAtividadeHoje(opcoes: OpcoesAtividade = {}) {
    const { data: dia, de, ate, anexos, ativo = true } = opcoes;
    const [data, setData] = useState<AtividadeTrelloHoje | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const carregouUmaVez = useRef(false);

    const refresh = useCallback(async () => {
        if (!ativo) return;
        if (carregouUmaVez.current) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const atividade = await fetchAtividade({ data: dia, de, ate, anexos });
            setData(atividade);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar atividade do Trello');
        } finally {
            carregouUmaVez.current = true;
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [dia, de, ate, anexos, ativo]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, isLoading, isRefreshing, error, refresh };
}
