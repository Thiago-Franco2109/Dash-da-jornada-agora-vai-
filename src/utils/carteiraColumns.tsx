import type { CarteiraRow } from '../types/carteira';

/** Escala de cor vermelho→verde usada nas colunas de % da Carteira. */
export function pctCellClass(pct: number): string {
    if (pct >= 70) return 'bg-emerald-600 text-white font-semibold';
    if (pct >= 55) return 'bg-emerald-400 text-emerald-950 font-semibold';
    if (pct >= 45) return 'bg-lime-200 text-lime-950';
    if (pct >= 30) return 'bg-amber-100 text-amber-900';
    return 'bg-red-100 text-red-800';
}

export const CARTEIRA_COLUMNS: { key: keyof CarteiraRow; label: string; align: 'left' | 'center'; isPct?: boolean }[] = [
    { key: 'divisao', label: 'Divisão', align: 'left' },
    { key: 'cidade', label: 'Cidade', align: 'left' },
    { key: 'grupo', label: 'Grupo', align: 'left' },
    { key: 'total', label: 'Total', align: 'center' },
    { key: 'ativos', label: 'Ativos', align: 'center' },
    { key: 'suspenso', label: 'Suspenso', align: 'center' },
    { key: 'pendente', label: 'Pendente', align: 'center' },
    { key: 'pctComPromo', label: '% com promo', align: 'center', isPct: true },
    { key: 'promoAprovada', label: 'Promo aprovada', align: 'center' },
    { key: 'semPromo', label: 'Sem promo', align: 'center' },
    { key: 'pctComCupom', label: '% com cupom', align: 'center', isPct: true },
    { key: 'cupomAprovado', label: 'Cupom aprovado', align: 'center' },
    { key: 'semCupom', label: 'Sem cupom', align: 'center' },
];
