import type { CarteiraMetrica, CarteiraRow } from '../types/carteira';

/** Escala de cor vermelho→verde usada nas colunas de % da Carteira — simétrica: valor baixo pesa tanto quanto valor alto. */
export function pctCellClass(pct: number): string {
    if (pct >= 70) return 'bg-emerald-600 text-white font-semibold';
    if (pct >= 55) return 'bg-emerald-400 text-emerald-950 font-semibold';
    if (pct >= 45) return 'bg-lime-200 text-lime-950';
    if (pct >= 30) return 'bg-amber-200 text-amber-900';
    if (pct >= 15) return 'bg-red-300 text-red-950 font-semibold';
    return 'bg-red-600 text-white font-bold';
}

export const CARTEIRA_COLUMNS: { key: keyof CarteiraRow; label: string; align: 'left' | 'center'; isPct?: boolean; metrica?: CarteiraMetrica }[] = [
    { key: 'divisao', label: 'Divisão', align: 'left' },
    { key: 'cidade', label: 'Cidade', align: 'left' },
    { key: 'grupo', label: 'Grupo', align: 'left' },
    { key: 'total', label: 'Total', align: 'center', metrica: 'total' },
    { key: 'ativos', label: 'Ativos', align: 'center', metrica: 'ativos' },
    { key: 'suspenso', label: 'Suspenso', align: 'center', metrica: 'suspenso' },
    { key: 'pendente', label: 'Pendente', align: 'center', metrica: 'pendente' },
    { key: 'pctComPromo', label: '% com promo', align: 'center', isPct: true },
    { key: 'promoAprovada', label: 'Promo aprovada', align: 'center', metrica: 'promoAprovada' },
    { key: 'semPromo', label: 'Sem promo', align: 'center', metrica: 'semPromo' },
    { key: 'pctComCupom', label: '% com cupom', align: 'center', isPct: true },
    { key: 'cupomAprovado', label: 'Cupom aprovado', align: 'center', metrica: 'cupomAprovado' },
    { key: 'semCupom', label: 'Sem cupom', align: 'center', metrica: 'semCupom' },
];
