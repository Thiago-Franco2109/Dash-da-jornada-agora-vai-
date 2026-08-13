import type { AcaoPromocionalCidade, AcaoPromocionalMetrica } from '../types/acoesPromocionais';

/**
 * Cor por coluna (categórica, fixa) — diferente de `carteiraColumns.tsx`'s
 * `pctCellClass`, que é um heatmap por VALOR. Aqui cada métrica tem sua
 * própria cor de identidade, igual a referência do CMS; "0" nunca vira
 * pílula colorida, só texto cinza.
 */
const METRIC_ACCENTS: Partial<Record<AcaoPromocionalMetrica, string>> = {
    comPromocao: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    promoSubsidio: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
    promoSemSubsidio: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    comCupom: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    cupomDestaque: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    primeiroPedido: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    taxaEntrega: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
    cupomRegular: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
    semAcao: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

export function metricCellClass(metrica: AcaoPromocionalMetrica, value: number): string {
    if (value <= 0) return 'text-slate-300 dark:text-slate-600';
    return METRIC_ACCENTS[metrica] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300';
}

export interface AcoesPromocionaisColumn {
    key: keyof AcaoPromocionalCidade;
    /** Métrica de drill-down associada (undefined = coluna não clicável, ex. nome da cidade). */
    metrica?: AcaoPromocionalMetrica;
    label: string;
    align: 'left' | 'center';
    pctKey?: keyof AcaoPromocionalCidade;
}

export const ACOES_PROMOCIONAIS_COLUMNS: AcoesPromocionaisColumn[] = [
    { key: 'cidade', label: 'Localidade', align: 'left' },
    { key: 'lojasAtivas', label: 'Lojas Ativas', align: 'center' },
    { key: 'comPromocao', metrica: 'comPromocao', label: 'Com Promoção', align: 'center', pctKey: 'pctComPromocao' },
    { key: 'promoSubsidio', metrica: 'promoSubsidio', label: 'Promo c/ Subsídio', align: 'center', pctKey: 'pctPromoSubsidio' },
    { key: 'promoSemSubsidio', metrica: 'promoSemSubsidio', label: 'Promo s/ Subsídio', align: 'center', pctKey: 'pctPromoSemSubsidio' },
    { key: 'comCupom', metrica: 'comCupom', label: 'Com Cupom', align: 'center', pctKey: 'pctComCupom' },
    { key: 'cupomDestaque', metrica: 'cupomDestaque', label: 'Cupom Destaque', align: 'center', pctKey: 'pctCupomDestaque' },
    { key: 'primeiroPedido', metrica: 'primeiroPedido', label: '1º Pedido', align: 'center', pctKey: 'pctPrimeiroPedido' },
    { key: 'taxaEntrega', metrica: 'taxaEntrega', label: 'Taxa Entrega', align: 'center', pctKey: 'pctTaxaEntrega' },
    { key: 'cupomRegular', metrica: 'cupomRegular', label: 'Cupom Regular', align: 'center', pctKey: 'pctCupomRegular' },
    { key: 'semAcao', metrica: 'semAcao', label: 'Sem Ação', align: 'center', pctKey: 'pctSemAcao' },
];
