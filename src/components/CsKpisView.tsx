import { useState } from 'react';
import { useCsKpis, type CsKpiFigures } from '../hooks/useCsKpis';

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

function KpiBlocks({ f, activityDays }: { f: CsKpiFigures; activityDays: number }) {
    return (
        <>
            {/* Retenção / receita */}
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Retenção &amp; receita</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi
                    label="Comissão líquida (30d)"
                    value={brl(f.comissao.atual)}
                    sub={`${f.comissao.variacaoPct >= 0 ? '▲' : '▼'} ${pct1(Math.abs(f.comissao.variacaoPct))} vs. 30d anteriores`}
                    tone={f.comissao.variacaoPct >= 0 ? 'emerald' : 'red'}
                />
                <Kpi label="NRR (receita retida)" value={pct1(f.nrrPct)} sub="≥100% = carteira cresce sozinha" tone={f.nrrPct >= 100 ? 'emerald' : 'slate'} />
                <Kpi label="Churn de receita" value={pct1(f.churnReceitaPct)} sub={`GRR ${pct1(f.grrPct)}`} tone="red" />
                <Kpi
                    label="Taxa de atividade"
                    value={pct1(f.atividade.taxaPct)}
                    sub={`${f.atividade.comPedido} de ${f.atividade.totalAtivos} ativos com pedido (${activityDays}d)`}
                    tone={f.atividade.taxaPct >= 80 ? 'emerald' : 'amber'}
                />
            </div>

            {/* Decomposição do NRR */}
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">
                Movimento da receita — decompõe o NRR (vs. 30d anteriores)
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Expansão" value={`+${brl(f.expansao.valor)}`} sub={`${f.expansao.count} parceiros cresceram (upsell)`} tone="emerald" />
                <Kpi label="Contração" value={`−${brl(f.contracao.valor)}`} sub={`${f.contracao.count} parceiros encolheram`} tone="amber" />
                <Kpi label="Perdido (zerou)" value={`−${brl(f.perdido.valor)}`} sub={`${f.perdido.count} pararam de gerar comissão`} tone="red" />
                <Kpi label="Receita de novos" value={`+${brl(f.novos.valor)}`} sub={`${f.novos.count} parceiros novos`} tone="indigo" />
            </div>
            <p className="text-xs text-slate-400 mt-2">
                NRR {pct1(f.nrrPct)} = base + expansão − contração − perdido. {f.estavelCount} parceiros estáveis.
            </p>

            {/* Quem contatar — por R$ */}
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">
                Quem contatar — priorizado por R$ em risco
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                    {f.topRisco.length === 0 ? (
                        <p className="p-4 text-sm text-slate-400">Nenhum parceiro em risco no período. 🎉</p>
                    ) : (
                        f.topRisco.map(p => (
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
        </>
    );
}

export default function CsKpisView() {
    const { kpis, loading, error, refetch } = useCsKpis(30);
    const [cidade, setCidade] = useState<string>(''); // '' = Todas

    // KPIs da carteira selecionada (global ou cidade)
    const current: CsKpiFigures | null = !kpis
        ? null
        : cidade
            ? (kpis.cidades.find(c => c.cidade === cidade) ?? null)
            : kpis;

    return (
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-white dark:bg-slate-900">
            <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sucesso do Cliente — KPIs</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {cidade ? <>Carteira de <strong>{cidade}</strong></> : 'Carteira geral (todas as cidades)'}
                            {' · '}últimos {kpis?.windowDays ?? 30} dias vs. os {kpis?.windowDays ?? 30} anteriores
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {kpis && (
                            <select
                                value={cidade}
                                onChange={e => setCidade(e.target.value)}
                                className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
                                title="Escolher carteira por cidade"
                            >
                                <option value="">Todas as cidades</option>
                                {kpis.cidades.map(c => (
                                    <option key={c.cidade} value={c.cidade}>
                                        {c.cidade} — {brl(c.comissao.atual)}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button
                            onClick={refetch}
                            className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[18px]">refresh</span>
                            Atualizar
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {loading ? (
                    <p className="text-sm text-slate-400">Calculando KPIs do banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar os KPIs: {error}
                    </div>
                ) : current && kpis ? (
                    <>
                        <KpiBlocks f={current} activityDays={kpis.activityDays} />
                        <p className="text-xs text-slate-400 mt-3">
                            Dados do banco de teste (réplica diária). Cálculo em {kpis.elapsedMs ?? '—'}ms · {kpis.cidades.length} cidades.
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-slate-400">Sem dados para esta carteira.</p>
                )}
            </div>
        </div>
    );
}
