import { useCsKpis } from '../hooks/useCsKpis';

const brl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct1 = (n: number) => `${n.toFixed(1)}%`;

function Kpi({
    label, value, sub, tone = 'slate',
}: {
    label: string;
    value: string;
    sub?: string;
    tone?: 'slate' | 'emerald' | 'red' | 'amber' | 'indigo';
}) {
    const tones: Record<string, string> = {
        slate: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white',
        emerald: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300',
        red: 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-300',
        amber: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300',
        indigo: 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300',
    };
    return (
        <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
        </div>
    );
}

export default function CsKpisView() {
    const { kpis, loading, error, refetch } = useCsKpis(30);

    return (
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-white dark:bg-slate-900">
            <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sucesso do Cliente — KPIs</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Comissão líquida, retenção e risco · comparando os últimos {kpis?.windowDays ?? 30} dias com os {kpis?.windowDays ?? 30} anteriores (banco de teste)
                        </p>
                    </div>
                    <button
                        onClick={refetch}
                        className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                    >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Atualizar
                    </button>
                </div>
            </div>

            <div className="p-6">
                {loading ? (
                    <p className="text-sm text-slate-400">Calculando KPIs do banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar os KPIs: {error}
                    </div>
                ) : kpis ? (
                    <>
                        {/* Retenção / receita */}
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Retenção &amp; receita</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Kpi
                                label="Comissão líquida (30d)"
                                value={brl(kpis.comissao.atual)}
                                sub={`${kpis.comissao.variacaoPct >= 0 ? '▲' : '▼'} ${pct1(Math.abs(kpis.comissao.variacaoPct))} vs. 30d anteriores`}
                                tone={kpis.comissao.variacaoPct >= 0 ? 'emerald' : 'red'}
                            />
                            <Kpi
                                label="NRR (receita retida)"
                                value={pct1(kpis.nrrPct)}
                                sub="≥100% = carteira cresce sozinha"
                                tone={kpis.nrrPct >= 100 ? 'emerald' : 'slate'}
                            />
                            <Kpi
                                label="Churn de receita"
                                value={pct1(kpis.churnReceitaPct)}
                                sub={`GRR ${pct1(kpis.grrPct)}`}
                                tone="red"
                            />
                            <Kpi
                                label="Taxa de atividade"
                                value={pct1(kpis.atividade.taxaPct)}
                                sub={`${kpis.atividade.comPedido} de ${kpis.atividade.totalAtivos} ativos com pedido (${kpis.activityDays}d)`}
                                tone={kpis.atividade.taxaPct >= 80 ? 'emerald' : 'amber'}
                            />
                        </div>

                        {/* Fluxo de receita */}
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">Fluxo de receita (30d)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Kpi label="R$ perdido (zeraram)" value={brl(kpis.perdido.valor)} sub={`${kpis.perdido.count} parceiros pararam de gerar comissão`} tone="red" />
                            <Kpi label="Em queda (>50%)" value={brl(kpis.emQueda.valor)} sub={`${kpis.emQueda.count} parceiros caindo — em risco`} tone="amber" />
                            <Kpi label="Receita de novos" value={brl(kpis.novos.valor)} sub={`${kpis.novos.count} parceiros novos gerando comissão`} tone="emerald" />
                        </div>

                        {/* Quem contatar — por R$ */}
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">
                            Quem contatar — priorizado por R$ em risco
                        </p>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                                {kpis.topRisco.length === 0 ? (
                                    <p className="p-4 text-sm text-slate-400">Nenhum parceiro em risco no período. 🎉</p>
                                ) : (
                                    kpis.topRisco.map(p => (
                                        <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{p.nome}</p>
                                                <p className="text-xs text-slate-400 truncate">{p.cidade ?? 'cidade ?'}</p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="text-right">
                                                    <p className="text-xs text-slate-400">{brl(p.anterior)} → {brl(p.atual)}</p>
                                                    <p className="font-bold text-red-600 dark:text-red-400">-{brl(p.perda)}</p>
                                                </div>
                                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.tipo === 'zerou'
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                                    {p.tipo === 'zerou' ? 'zerou' : 'em queda'}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-slate-400 mt-3">
                            Dados do banco de teste (réplica diária). Cálculo em {kpis.elapsedMs ?? '—'}ms.
                        </p>
                    </>
                ) : null}
            </div>
        </div>
    );
}
