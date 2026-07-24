import { useState } from 'react';
import {
    useEstabelecimentoSummary,
    useEstabelecimentoActivity,
    fetchInativos,
    type EstabelecimentoStatusCount,
    type InativosResult,
} from '../hooks/useEstabelecimentos';

const ACTIVITY_WINDOW_DAYS = 28;

/**
 * Painel do "gabarito de churn" — distribuição real de status de contrato
 * vinda direto do banco de teste (tabela `estabelecimento`, campo `delivery`).
 *
 * É read-only e autônomo (usa o hook internamente). Se a sessão expirou ou o
 * banco estiver indisponível, mostra um aviso discreto em vez de quebrar a tela.
 */

// status que interessam pro churn, na ordem de exibição, com estilo
const HIGHLIGHT: { key: string; label: string; classes: string }[] = [
    { key: 'ativo',       label: 'Ativos',       classes: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300' },
    { key: 'cancelado',   label: 'Cancelados',   classes: 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-300' },
    { key: 'suspenso',    label: 'Suspensos',    classes: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300' },
    { key: 'desistencia', label: 'Desistências', classes: 'border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-300' },
];

function countFor(byStatus: EstabelecimentoStatusCount[], key: string): number {
    return byStatus.find(s => s.status === key)?.total ?? 0;
}

function pct(part: number, total: number): string {
    if (!total) return '—';
    return `${((part / total) * 100).toFixed(0)}%`;
}

export default function EstabelecimentoStatusPanel() {
    const { summary, loading, error, refetch } = useEstabelecimentoSummary();
    const { activity, loading: actLoading, error: actError } = useEstabelecimentoActivity(ACTIVITY_WINDOW_DAYS);

    // lista acionável de inativos — carregada sob demanda (query ~6s)
    const [showList, setShowList] = useState(false);
    const [inativos, setInativos] = useState<InativosResult | null>(null);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);

    const toggleList = () => {
        const next = !showList;
        setShowList(next);
        if (next && !inativos && !listLoading) {
            setListLoading(true);
            setListError(null);
            fetchInativos(ACTIVITY_WINDOW_DAYS)
                .then(res => { setInativos(res); setListLoading(false); })
                .catch(err => { setListError(err.message); setListLoading(false); });
        }
    };

    return (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-indigo-500">database</span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Status de contrato (banco de teste)
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Gabarito histórico de churn · tabela <code>estabelecimento</code>
                        </p>
                    </div>
                </div>
                <button
                    onClick={refetch}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    title="Recarregar do banco"
                >
                    Atualizar
                </button>
            </div>

            {loading ? (
                <p className="mt-3 text-sm text-slate-400">Carregando do banco…</p>
            ) : error ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                    Não foi possível carregar do banco: {error}
                </p>
            ) : summary ? (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {HIGHLIGHT.map(item => (
                        <div key={item.key} className={`rounded-lg border p-3 ${item.classes}`}>
                            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{item.label}</p>
                            <p className="mt-1 text-2xl font-bold">
                                {countFor(summary.byStatus, item.key).toLocaleString('pt-BR')}
                            </p>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Atividade recente dos parceiros ativos (cruza com a tabela pedido) */}
            <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Atividade dos ativos · últimos {ACTIVITY_WINDOW_DAYS} dias
                </p>
                {actLoading ? (
                    <p className="mt-2 text-sm text-slate-400">Calculando pedidos recentes…</p>
                ) : actError ? (
                    <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Não foi possível calcular: {actError}</p>
                ) : activity ? (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ativos (contrato)</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{activity.totalAtivos.toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Com pedido</p>
                            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                                {activity.comPedido.toLocaleString('pt-BR')}
                                <span className="ml-1 text-sm font-medium opacity-70">({pct(activity.comPedido, activity.totalAtivos)})</span>
                            </p>
                        </div>
                        <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Sem pedido (risco)</p>
                            <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">
                                {activity.semPedido.toLocaleString('pt-BR')}
                                <span className="ml-1 text-sm font-medium opacity-70">({pct(activity.semPedido, activity.totalAtivos)})</span>
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Lista acionável — quem contatar */}
                {activity && activity.semPedido > 0 && (
                    <div className="mt-3">
                        <button
                            onClick={toggleList}
                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[18px]">{showList ? 'expand_less' : 'expand_more'}</span>
                            {showList ? 'Ocultar lista' : `Ver os ${activity.semPedido} parceiros sem pedido`}
                        </button>

                        {showList && (
                            <div className="mt-2">
                                {listLoading ? (
                                    <p className="text-sm text-slate-400">Montando a lista (pode levar alguns segundos)…</p>
                                ) : listError ? (
                                    <p className="text-sm text-amber-600 dark:text-amber-400">Não foi possível carregar a lista: {listError}</p>
                                ) : inativos ? (
                                    <>
                                        <p className="text-xs text-slate-400 mb-2">
                                            {inativos.counts.warm} recuperáveis (pararam há {inativos.windowDays}–{inativos.warmWindowDays} dias) ·
                                            {' '}{inativos.counts.cold} frios (&gt; {inativos.warmWindowDays} dias). Ordenados por prioridade.
                                        </p>
                                        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60">
                                            {inativos.data.map(p => {
                                                const warm = !p.recencia.startsWith('>');
                                                return (
                                                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{p.nome}</p>
                                                            <p className="text-xs text-slate-400 truncate">{p.cidade ?? 'cidade ?'}</p>
                                                        </div>
                                                        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${warm
                                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                                            {warm ? 'recuperável' : 'frio'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
