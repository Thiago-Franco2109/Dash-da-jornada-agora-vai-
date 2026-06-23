import { useMemo, useState } from 'react';
import type { CrmGoalMetric, CrmPipelineAggregate } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CrmPartner } from '../../types/crm';
import { aggregatePipeline, computeGoalProgress, findGoalForScope, getGoalMetricLabel } from '../../utils/crmPipeline';
import { useCrmGoals } from '../../hooks/useCrmGoals';

interface CrmPipelineDashboardProps {
    partners: CrmPartner[];
    localStatus: Record<string, PromoStatus>;
    overdueByKey?: (key: string) => number;
}

function FunnelBar({ agg }: { agg: CrmPipelineAggregate }) {
    const total = agg.total || 1;
    const segments = [
        { key: 'ativo', count: agg.ativo, color: 'bg-emerald-500' },
        { key: 'ofertei', count: agg.ofertei, color: 'bg-orange-400' },
        { key: 'aguardando', count: agg.aguardando, color: 'bg-red-400' },
        { key: 'negado', count: agg.negado, color: 'bg-slate-400' },
    ];

    return (
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {segments.map(seg => (
                seg.count > 0 && (
                    <div
                        key={seg.key}
                        className={`${seg.color} transition-all`}
                        style={{ width: `${(seg.count / total) * 100}%` }}
                        title={`${seg.key}: ${seg.count}`}
                    />
                )
            ))}
        </div>
    );
}

function GoalEditor({
    metric,
    currentTarget,
    onSave,
}: {
    metric: CrmGoalMetric;
    currentTarget?: number;
    onSave: (target: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(String(currentTarget ?? ''));

    if (!editing) {
        return (
            <button
                type="button"
                onClick={() => {
                    setValue(String(currentTarget ?? ''));
                    setEditing(true);
                }}
                className="text-[10px] text-primary hover:underline font-semibold"
            >
                {currentTarget != null ? `Meta: ${currentTarget}${metric === 'promo_ativa_rate' ? '%' : ''}` : 'Definir meta'}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <input
                type="number"
                min={0}
                max={metric === 'promo_ativa_rate' ? 100 : 9999}
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-14 h-6 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1"
                autoFocus
            />
            <button
                type="button"
                onClick={() => {
                    const n = parseInt(value, 10);
                    if (!isNaN(n)) onSave(n);
                    setEditing(false);
                }}
                className="text-[10px] font-bold text-emerald-600"
            >
                OK
            </button>
        </div>
    );
}

export default function CrmPipelineDashboard({ partners, localStatus }: CrmPipelineDashboardProps) {
    const [groupBy, setGroupBy] = useState<'manager' | 'city'>('manager');
    const [primaryMetric, setPrimaryMetric] = useState<CrmGoalMetric>('promo_ativa_rate');
    const { goals, upsertGoal } = useCrmGoals();

    const aggregates = useMemo(
        () => aggregatePipeline(partners, groupBy, localStatus),
        [partners, groupBy, localStatus],
    );

    const totals = useMemo(() => {
        const all: CrmPipelineAggregate = {
            key: 'total',
            label: 'Total geral',
            total: 0,
            aguardando: 0,
            ofertei: 0,
            negado: 0,
            ativo: 0,
            inativo: 0,
            semCupom: 0,
            overdueFollowUps: 0,
        };
        for (const agg of aggregates) {
            all.total += agg.total;
            all.aguardando += agg.aguardando;
            all.ofertei += agg.ofertei;
            all.negado += agg.negado;
            all.ativo += agg.ativo;
            all.inativo += agg.inativo;
            all.semCupom += agg.semCupom;
        }
        return all;
    }, [aggregates]);

    const conversionRate = totals.total > 0 ? Math.round((totals.ativo / totals.total) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pipeline agregado</h2>
                    <p className="text-xs text-slate-500">Funil de promoções por {groupBy === 'manager' ? 'gestor' : 'cidade'} com metas</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setGroupBy('manager')}
                            className={`px-3 py-1.5 text-xs font-semibold ${groupBy === 'manager' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600'}`}
                        >
                            Por gestor
                        </button>
                        <button
                            type="button"
                            onClick={() => setGroupBy('city')}
                            className={`px-3 py-1.5 text-xs font-semibold ${groupBy === 'city' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600'}`}
                        >
                            Por cidade
                        </button>
                    </div>
                    <select
                        value={primaryMetric}
                        onChange={e => setPrimaryMetric(e.target.value as CrmGoalMetric)}
                        className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                        <option value="promo_ativa_rate">Meta: % promo ativa</option>
                        <option value="promo_ativa_count">Meta: qtd promo ativa</option>
                        <option value="pending_max">Meta: máx. não ofertados</option>
                        <option value="offered_max">Meta: máx. aguardando retorno</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Parceiros', value: totals.total, color: 'text-blue-600' },
                    { label: 'Promo ativa', value: totals.ativo, color: 'text-emerald-600' },
                    { label: 'Não ofertado', value: totals.aguardando, color: 'text-red-600' },
                    { label: 'Aguardando', value: totals.ofertei, color: 'text-orange-600' },
                    { label: 'Conversão', value: `${conversionRate}%`, color: 'text-violet-600' },
                ].map(kpi => (
                    <div key={kpi.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
                        <p className={`text-2xl font-black ${kpi.color}`}>{typeof kpi.value === 'number' ? kpi.value.toLocaleString('pt-BR') : kpi.value}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-500">{kpi.label}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                                    {groupBy === 'manager' ? 'Gestor' : 'Cidade'}
                                </th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Total</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Não ofert.</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Aguard.</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Ativo</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase text-center">Negado</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Funil</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Meta ({getGoalMetricLabel(primaryMetric)})</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {aggregates.map(agg => {
                                const goal = findGoalForScope(goals, groupBy, agg.key, primaryMetric);
                                const progress = goal ? computeGoalProgress(agg, goal) : null;
                                const ativoRate = agg.total > 0 ? Math.round((agg.ativo / agg.total) * 100) : 0;

                                return (
                                    <tr key={agg.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="py-3 px-4">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{agg.label}</p>
                                            <p className="text-[10px] text-slate-400">{ativoRate}% conversão</p>
                                        </td>
                                        <td className="py-3 px-4 text-center text-sm font-bold">{agg.total}</td>
                                        <td className="py-3 px-4 text-center text-sm text-red-600 font-semibold">{agg.aguardando}</td>
                                        <td className="py-3 px-4 text-center text-sm text-orange-600 font-semibold">{agg.ofertei}</td>
                                        <td className="py-3 px-4 text-center text-sm text-emerald-600 font-semibold">{agg.ativo}</td>
                                        <td className="py-3 px-4 text-center text-sm text-slate-500">{agg.negado}</td>
                                        <td className="py-3 px-4 min-w-[120px]">
                                            <FunnelBar agg={agg} />
                                        </td>
                                        <td className="py-3 px-4 min-w-[140px]">
                                            <GoalEditor
                                                metric={primaryMetric}
                                                currentTarget={goal?.target}
                                                onSave={target => upsertGoal(groupBy, agg.key, primaryMetric, target)}
                                            />
                                            {progress && (
                                                <div className="mt-1.5">
                                                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                                                        <span className={progress.met ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                                                            {progress.current}{primaryMetric === 'promo_ativa_rate' ? '%' : ''} / {progress.target}{primaryMetric === 'promo_ativa_rate' ? '%' : ''}
                                                        </span>
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            {progress.met ? 'check_circle' : 'warning'}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${progress.met ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${progress.percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {aggregates.length === 0 && (
                    <p className="p-8 text-center text-sm text-slate-500">Nenhum dado para agregar com os filtros atuais.</p>
                )}
            </div>
        </div>
    );
}
