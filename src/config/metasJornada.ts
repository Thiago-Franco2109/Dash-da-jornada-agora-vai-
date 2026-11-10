/**
 * Metas dos três KPIs do cabeçalho da Jornada.
 *
 * As metas são diferentes entre si (95 / 80 / 60), então comparar o desvio
 * absoluto engana: faltar 15pp para a meta de 95% de pedidos é um problema
 * muito menor do que faltar 15pp para a meta de 60% de cupons. A faixa de cor
 * é por isso RELATIVA — `valor / meta` —, e não pela distância em pontos.
 *
 * Lembrando o que o KPI mede (App.tsx, `jornadaKpiRows`): é o percentual dos
 * parceiros NA TELA — mesmos filtros, mesma aba de período, sem os de
 * pré-lançamento. Trocar de aba muda o número e, com ele, a cor.
 */

export const METAS_JORNADA = {
  pedidos: 95,
  promocao: 80,
  cupons: 60,
} as const;

/** Abaixo disto a meta deixa de ser "quase lá" e vira buraco. */
const LIMIAR_ATENCAO = 0.75;

export type StatusMeta = 'atingida' | 'atencao' | 'critico';

export function statusDaMeta(percentual: number, meta: number): StatusMeta {
  const razao = percentual / meta;
  if (razao >= 1) return 'atingida';
  if (razao >= LIMIAR_ATENCAO) return 'atencao';
  return 'critico';
}

/** Classe do número grande, no mesmo idioma de cor do resto do painel. */
export const CLASSE_STATUS_META: Record<StatusMeta, string> = {
  atingida: 'text-emerald-600 dark:text-emerald-400',
  atencao: 'text-amber-600 dark:text-amber-400',
  critico: 'text-red-600 dark:text-red-400',
};
