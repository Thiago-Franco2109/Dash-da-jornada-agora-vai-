import type { ContratoCD } from '../hooks/useContratosCD';

/**
 * Régua e formatação dos contratos do Cardápio Digital.
 *
 * Os contratos em si NÃO moram mais aqui. Até out/2026 este arquivo guardava
 * uma lista fixa de ~76 linhas, casada com o parceiro pelo NOME do
 * estabelecimento e congelada em jun/2026 — ela inflava o MRR em R$ 1.610
 * com contratos já cancelados, e o casamento por nome errava porque nome de
 * loja se repete entre cidades. Agora vêm dos campos personalizados do
 * Trello, por estabelecimento_id: ver netlify/functions/cd-contratos.ts e
 * src/hooks/useContratosCD.ts.
 */

/** Abaixo disso o contrato está em risco de virar cancelamento. */
const PEDIDOS_POR_DIA_RISCO = 1;

/** Semana atual acima disso é loja saudável — segura o MRR. */
const PEDIDOS_SEMANA_SEGURO = 7;

export function isMrrEmRisco(pedidosPorDia: number, contrato?: ContratoCD): boolean {
    return contrato?.ativo === true && pedidosPorDia < PEDIDOS_POR_DIA_RISCO;
}

export function calcularPedidosPorDia(pedidosSemanaAtual: number): number {
    return pedidosSemanaAtual / 7;
}

export function formatarMoedaBRL(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface MRRMetrics {
    mrrTotal: number;
    mrrEmRisco: number;
    mrrSeguro: number;
    mrrEmRiscoPct: number;
    lojasComContrato: number;
    lojasEmRisco: number;
    lojasSeguras: number;
    contratosAtivos: number;
}

interface LinhaComContrato {
    valor_contrato?: number;
    contrato_ativo?: boolean;
    mrr_em_risco?: boolean;
    week_1?: number;
    /** Id do card que originou o contrato — chave de deduplicação. */
    contrato_estab_id?: number;
}

/**
 * Métricas de MRR da aba "Todas as Lojas".
 *
 * `mrrTotal` e `contratosAtivos` vêm da carteira inteira (todos os contratos
 * do Trello), não das linhas filtradas na tela — é por isso que a tela rotula
 * esse card como total da carteira, e os outros como "sobre as lojas
 * exibidas". Misturar as duas bases numa linha só de KPIs foi o que escondeu
 * o erro da planilha por quatro meses.
 *
 * A deduplicação por `contrato_estab_id` existe porque a mesma loja pode ter
 * dois cadastros (marketplace e CD) e os dois podem cair na tabela: o
 * contrato é um só e não pode ser somado duas vezes.
 */
export function calcularMRRMetrics(
    rows: LinhaComContrato[],
    carteira?: { mrrTotal: number; contratosAtivos: number },
): MRRMetrics {
    const vistos = new Set<number>();
    const comContrato: LinhaComContrato[] = [];
    for (const r of rows) {
        if (r.valor_contrato == null || !r.contrato_ativo) continue;
        const chave = r.contrato_estab_id;
        if (chave != null) {
            if (vistos.has(chave)) continue;
            vistos.add(chave);
        }
        comContrato.push(r);
    }

    const emRisco = comContrato.filter(r => r.mrr_em_risco);
    const seguras = comContrato.filter(r => (r.week_1 ?? 0) > PEDIDOS_SEMANA_SEGURO);
    const soma = (lista: LinhaComContrato[]) => lista.reduce((s, r) => s + (r.valor_contrato ?? 0), 0);

    const mrrEmRisco = soma(emRisco);
    const mrrExibido = soma(comContrato);

    return {
        mrrTotal: carteira?.mrrTotal ?? mrrExibido,
        mrrEmRisco,
        mrrSeguro: soma(seguras),
        mrrEmRiscoPct: mrrExibido > 0 ? (mrrEmRisco / mrrExibido) * 100 : 0,
        lojasComContrato: comContrato.length,
        lojasEmRisco: emRisco.length,
        lojasSeguras: seguras.length,
        contratosAtivos: carteira?.contratosAtivos ?? comContrato.length,
    };
}
