import type { EnrichedPerformanceRow } from './calculations';

/**
 * Em qual aba de período a linha cai.
 *
 * Existe porque a regra estava escrita DUAS vezes (no filtro da tabela e nos
 * contadores das abas) e só por sorte concordavam. Quem não lançou sai pela
 * flag, nunca pelo número de dias — o `dias_desde_lancamento: 0` do
 * pré-lançamento é zerado de propósito e não quer dizer "lançou hoje".
 */
export type FaixaJornada = 'pre' | '1-7' | '8-14' | '15-21' | '22-28' | 'fora';

/** 'fora' nunca vira aba: é a folga de dias que o banco traz, não um período. */
export type AbaJornada = Exclude<FaixaJornada, 'fora'> | 'all';

export const ABAS_JORNADA: { id: AbaJornada; label: string }[] = [
    { id: 'all', label: 'Todos os Períodos' },
    // Antes do dia 1: a fileira é uma linha do tempo.
    { id: 'pre', label: 'Pré-lançamento' },
    { id: '1-7', label: '1 a 7 dias' },
    { id: '8-14', label: '8 a 14 dias' },
    { id: '15-21', label: '15 a 21 dias' },
    { id: '22-28', label: '22 a 28 dias' },
];

export function faixaDaLinha(row: EnrichedPerformanceRow): FaixaJornada {
    if (row.pre_lancamento) return 'pre';
    const d = row.dias_desde_lancamento;
    if (d >= 1 && d <= 7) return '1-7';
    if (d >= 8 && d <= 14) return '8-14';
    if (d >= 15 && d <= 21) return '15-21';
    if (d >= 22 && d <= 28) return '22-28';
    // A jornada vem do banco com folga de dias (ver netlify/functions/jornada.ts);
    // esse resto não pertence a nenhuma aba, nem a "Todos".
    return 'fora';
}

/** "Todos os Períodos" = a jornada inteira (pré + 1-28), sem a folga do banco. */
export function estaNaAba(row: EnrichedPerformanceRow, aba: AbaJornada): boolean {
    const faixa = faixaDaLinha(row);
    if (aba === 'all') return faixa !== 'fora';
    return faixa === aba;
}

export function contarPorFaixa(linhas: EnrichedPerformanceRow[]): Record<FaixaJornada | 'all', number> {
    const c: Record<FaixaJornada | 'all', number> = { all: 0, pre: 0, '1-7': 0, '8-14': 0, '15-21': 0, '22-28': 0, fora: 0 };
    for (const row of linhas) {
        const f = faixaDaLinha(row);
        c[f]++;
        if (f !== 'fora') c.all++;
    }
    return c;
}
