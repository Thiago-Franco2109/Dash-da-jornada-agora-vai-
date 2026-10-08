import { useState, useEffect } from 'react';

/**
 * Relatório de pedidos de um parceiro — ver netlify/functions/pedido-relatorio.ts.
 *
 * A janela vai como duas datas (`de`/`ate`, inclusive nas duas pontas), do jeito que o
 * CMS oficial faz. O banco das functions não é tempo real: a resposta traz
 * `janela.ultimoPedidoNoBanco` pra tela avisar quando o período pedido passa do que já
 * chegou aqui.
 *
 * Só é chamado quando a aba Pedidos está aberta (`enabled`) — são 3 queries no banco
 * e abrir a tela do parceiro já dispara `cardapio-analise` e `parceiro-acesso`.
 */

export interface PedidoRelatorioTotais {
    recebidos: number;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvBruto: number;
    gmvLiq: number;
    comissao: number;
    ticketMedio: number;
    pctCancelamento: number;
    pctExpirado: number;
    pctOnline: number;
    novosNaLoja: number;
    pctNovosNaLoja: number;
    cupomBigou: number;
    cupomLoja: number;
    cardapioDigital: number;
    pctCardapioDigital: number;
    diasComPedido: number;
    diasNaJanela: number;
    mediaDiaAtivo: number;
}

export interface PedidoRelatorioDia {
    /** 'YYYY-MM-DD' — todos os dias da janela, inclusive os zerados. */
    dia: string;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvLiq: number;
}

export interface PedidoRelatorioItem {
    id: number;
    nome: string;
    qtd: number;
    /** Em quantos pedidos o item apareceu (não a quantidade vendida). */
    pedidos: number;
    receita: number;
    pctPedidos: number;
    temFoto: boolean | null;
    /** Cópia do prato dentro de uma campanha — o mesmo prato pode ter outra linha. */
    campanha: boolean;
    /** Vendeu na janela mas hoje não está no cardápio (inativo, arquivado ou apagado). */
    foraDoCardapio: boolean;
}

export interface PeriodoRelatorio {
    /** 'AAAA-MM-DD', inclusive. */
    de: string;
    /** 'AAAA-MM-DD', inclusive. */
    ate: string;
}

export interface PedidoRelatorio {
    estabId: number;
    janela: {
        dias: number;
        de: string;
        ate: string;
        /** 'AAAA-MM-DD HH:mm' do pedido mais recente do sistema, ou null. */
        ultimoPedidoNoBanco: string | null;
    };
    totais: PedidoRelatorioTotais;
    serieDiaria: PedidoRelatorioDia[];
    porHora: { hora: number; aceitos: number }[];
    /** dow: domingo = 0. `media` é por dia em que a loja operou naquele dia da semana. */
    porDiaSemana: { dow: number; aceitos: number; dias: number; media: number }[];
    pico: { dow: number; hora: number; aceitos: number } | null;
    cancelamentos: { codigo: number; motivo: string; n: number }[];
    itens: PedidoRelatorioItem[];
    /** Quantos itens distintos venderam na janela — `itens` traz só os primeiros. */
    itensComVenda: number;
}

interface UsePedidoRelatorioResult {
    data: PedidoRelatorio | null;
    loading: boolean;
    error: string | null;
}

export function usePedidoRelatorio(estabId: string | number | undefined, periodo: PeriodoRelatorio, enabled = true): UsePedidoRelatorioResult {
    const [data, setData] = useState<PedidoRelatorio | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const id = estabId == null ? '' : String(estabId).trim();
    // Desmonta o objeto pra não depender da identidade dele no array do effect: a tela
    // monta `{de, ate}` a cada render e um objeto novo refaria o fetch sem parar.
    const { de, ate } = periodo;
    // Parceiro sem ESTAB_ID numérico não existe no banco do CMS (vem só da planilha).
    // Estado DERIVADO, não guardado: zerar por setState dentro do effect causaria
    // render em cascata (react-hooks/set-state-in-effect).
    const ativo = enabled && /^\d+$/.test(id);

    useEffect(() => {
        if (!ativo) return;

        let cancelado = false;

        const carregar = async () => {
            setLoading(true);
            setError(null);
            try {
                // Sem `cache: 'no-store'` de propósito: a function manda
                // `private, max-age=300` e o dado é de dias fechados, então trocar de
                // aba e voltar não precisa refazer as 3 queries.
                const res = await fetch(
                    `/.netlify/functions/pedido-relatorio?estabId=${encodeURIComponent(id)}`
                    + `&de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
                    { credentials: 'include' as RequestCredentials },
                );
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok === false) {
                    throw new Error(json?.error || `Erro ${res.status} ao carregar o relatório de pedidos.`);
                }
                if (!cancelado) setData(json as PedidoRelatorio);
            } catch (err: unknown) {
                if (cancelado) return;
                setData(null);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelado) setLoading(false);
            }
        };

        void carregar();

        return () => { cancelado = true; };
    }, [id, de, ate, ativo]);

    return ativo ? { data, loading, error } : { data: null, loading: false, error: null };
}
