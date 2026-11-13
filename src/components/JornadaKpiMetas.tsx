import { Fragment } from 'react';
import { METAS_JORNADA, statusDaMeta, CLASSE_STATUS_META } from '../config/metasJornada';

interface JornadaKpiMetasProps {
  /** Parceiros lançados na tela — o denominador dos três percentuais. */
  total: number;
  pedidosCount: number;
  promocaoCount: number;
  cupomCount: number;
  /**
   * Parceiros que o CS marcou como "Promo ativa" e que o banco ainda não
   * confirmou. NÃO entra no percentual: ele tem meta, e meta que se bate
   * clicando deixa de ser meta. Aparece ao lado como "+N" — o trabalho fica
   * visível no dia em que foi feito, e o número oficial espera o banco.
   */
  promocaoMarcadoCount?: number;
}

/**
 * Os três KPIs do cabeçalho da Jornada, coloridos contra a meta.
 *
 * A cor é status, não decoração: verde = bateu a meta, âmbar = está em 75%+
 * dela, vermelho = abaixo disso. A meta aparece embaixo do rótulo porque sem
 * ela a cor não tem referência — "80%" sozinho não diz se é bom.
 */
export default function JornadaKpiMetas({ total, pedidosCount, promocaoCount, cupomCount, promocaoMarcadoCount = 0 }: JornadaKpiMetasProps) {
  // Sem parceiro na tela não há o que avaliar: pintar 0% de vermelho seria
  // acusar um resultado que ninguém teve chance de produzir.
  const vazio = total === 0;
  const base = total || 1;
  const kpis = [
    { label: 'Ativação de Pedidos', valor: (pedidosCount / base) * 100, meta: METAS_JORNADA.pedidos, marcados: 0 },
    { label: 'Captação de Promoção', valor: (promocaoCount / base) * 100, meta: METAS_JORNADA.promocao, marcados: promocaoMarcadoCount },
    { label: 'Captação de Cupons', valor: (cupomCount / base) * 100, meta: METAS_JORNADA.cupons, marcados: 0 },
  ];

  return (
    <div className="flex items-center gap-4 md:gap-6 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
      {kpis.map(({ label, valor, meta, marcados }, i) => (
        <Fragment key={label}>
          {i > 0 && <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />}
          <div className="text-center px-1" title={vazio ? `Meta ${meta}% — nenhum parceiro na tela` : `Meta ${meta}% — hoje ${valor.toFixed(1)}% dos parceiros na tela${marcados > 0 ? `\n+${marcados} marcado(s) por você, aguardando o banco` : ''}`}>
            <p className="flex items-baseline justify-center gap-1 leading-none">
              <span className={`text-lg font-black tabular-nums ${vazio ? 'text-slate-300 dark:text-slate-600' : CLASSE_STATUS_META[statusDaMeta(valor, meta)]}`}>
                {vazio ? '—' : `${valor.toFixed(1)}%`}
              </span>
              {marcados > 0 && (
                <span
                  key={marcados}
                  className="animate-[pulse_1s_ease-in-out_2] text-[11px] font-black tabular-nums text-sky-600 dark:text-sky-400"
                  title={`${marcados} ${marcados === 1 ? 'parceiro marcado' : 'parceiros marcados'} como "Promo ativa" por você, esperando o banco confirmar. Não entra no percentual até lá.`}
                >
                  +{marcados}
                </span>
              )}
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">{label}</p>
            <p className="text-[9px] font-medium text-slate-400/80 dark:text-slate-500 tabular-nums whitespace-nowrap">meta {meta}%</p>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
