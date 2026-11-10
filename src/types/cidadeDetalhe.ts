/** Contrato da function `cidade-detalhe` — o drill-in de uma cidade do marketplace. */

/**
 * Posição do parceiro na curva de pedidos da cidade (ABC sobre a janela):
 *  - `ancora`  — começa antes dos 50% acumulados: meia cidade está aqui
 *  - `peso`    — entre 50% e 80%
 *  - `cauda`   — de 80% pra frente, ainda com pedido
 *  - `parada`  — ativo e zero pedido na janela
 *  - `fora`    — suspenso ou pendente, não entra na curva
 */
export type ClasseRelevancia = 'ancora' | 'peso' | 'cauda' | 'parada' | 'fora';

export interface ParceiroCidade {
    id: number;
    nome: string;
    /** 1 ativo · 4 suspenso · 0 pendente */
    delivery: number;
    pedidos: number;
    pedidos14: number;
    pedidos7: number;
    /** % dos pedidos da cidade na janela */
    share: number;
    /** % acumulado na curva, ordenado por volume */
    acumulado: number;
    classe: ClasseRelevancia;
    /** Última semana contra a média semanal da janela: 1 = mesmo passo. Null = sem base. */
    ritmo: number | null;
    promoAgora: boolean;
    promoSubsidiadaAgora: boolean;
    jaTevePromo: boolean;
    jaTevePromoSubsidiada: boolean;
    campanhas: string[];
    cupomAgora: boolean;
    cupomDestaqueAgora: boolean;
    jaTeveCupom: boolean;
}

export interface CidadeDetalhe {
    cidade: string;
    /** Janela em dias (7, 14, 28 ou 90), fechada e terminando em `ate`. */
    dias: number;
    de: string;
    ate: string;
    carteira: { total: number; ativos: number; suspenso: number; pendente: number };
    atividade: {
        pedidos: number;
        pedidos14: number;
        pedidos7: number;
        comPedido: number;
        comPedido14: number;
        comPedido7: number;
        semPedido: number;
    };
    marketing: {
        promoAgora: number;
        promoSubsidiadaAgora: number;
        nuncaTevePromo: number;
        cupomAgora: number;
        nuncaTeveCupom: number;
        semAcaoNenhuma: number;
    };
    parceiros: ParceiroCidade[];
    elapsedMs: number;
}

export const JANELAS_CIDADE = [7, 14, 28, 90] as const;
export type JanelaCidade = (typeof JANELAS_CIDADE)[number];
