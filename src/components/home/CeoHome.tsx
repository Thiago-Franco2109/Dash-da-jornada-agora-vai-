import { useMemo } from 'react';
import { useCsKpis } from '../../hooks/useCsKpis';
import { aggregateKpisByManager, type ManagerKpis } from '../../utils/csKpisByManager';
import { getProfileInfo } from '../../config/profiles';
import type { SessionProfile } from '../../config/managerSession';
import type { AppView } from '../../types/views';

const BALOO = "'Baloo 2', 'Manrope', sans-serif";

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

/** Carteiras que aparecem no comparativo, na ordem. */
const COMPARED: SessionProfile[] = ['THIAGO', 'LAÍS'];

const ALERT_PREVIEW_SIZE = 5;

function Kpi({ label, value, sub, tone, icon }: {
    label: string;
    value: string;
    sub?: string;
    tone: 'emerald' | 'red' | 'slate';
    icon: string;
}) {
    const tones = {
        emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
        red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
        slate: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
    } as const;

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
                <span className={`material-symbols-outlined text-[18px] rounded-full p-1 ${tones[tone]}`}>{icon}</span>
            </div>
            <p className="text-3xl leading-none text-slate-900 dark:text-white" style={{ fontFamily: BALOO, fontWeight: 800 }}>
                {value}
            </p>
            {sub && <p className={`mt-2 text-xs font-semibold ${tones[tone].split(' ')[0]} ${tones[tone].split(' ')[1]}`}>{sub}</p>}
        </div>
    );
}

/** Barra proporcional ao maior valor entre as carteiras comparadas. */
function CompareBar({ label, value, count, max, tone }: {
    label: string;
    value: number;
    count?: number;
    max: number;
    tone: string;
}) {
    const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1 gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{brl(value)}</span>
            </div>
            <span className="block h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
            </span>
            {count !== undefined && (
                <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    {count} {count === 1 ? 'parceiro' : 'parceiros'}
                </span>
            )}
        </div>
    );
}

function WalletCard({ profileId, kpis, max }: { profileId: SessionProfile; kpis?: ManagerKpis; max: number }) {
    const info = getProfileInfo(profileId);
    const label = info?.label ?? profileId;

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5">
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                {info?.avatar ? (
                    <img
                        src={info.avatar}
                        alt=""
                        className="size-10 rounded-full object-cover border-2 border-white dark:border-slate-600 shadow"
                        style={{ background: info ? `linear-gradient(160deg, ${info.tint[0]}, ${info.tint[1]})` : undefined }}
                    />
                ) : (
                    <span className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold">
                        {label.charAt(0)}
                    </span>
                )}
                <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white truncate" style={{ fontFamily: BALOO }}>{label}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {kpis ? `${kpis.cidades.length} ${kpis.cidades.length === 1 ? 'cidade' : 'cidades'}` : 'sem cidades nesta janela'}
                    </p>
                </div>
                {kpis && (
                    <span className="ml-auto text-right shrink-0">
                        <span className="block text-lg leading-none text-slate-900 dark:text-white" style={{ fontFamily: BALOO, fontWeight: 800 }}>
                            {brl(kpis.comissaoAtual)}
                        </span>
                        <span className={`text-[11px] font-bold ${kpis.variacaoPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {kpis.variacaoPct >= 0 ? '+' : ''}{pct1(kpis.variacaoPct)}
                        </span>
                    </span>
                )}
            </div>

            {kpis ? (
                <div className="space-y-4">
                    <CompareBar label="Receita de novos" value={kpis.novos.valor} count={kpis.novos.count} max={max} tone="bg-emerald-500" />
                    <CompareBar label="Expansão" value={kpis.expansao.valor} count={kpis.expansao.count} max={max} tone="bg-teal-500" />
                    <CompareBar label="Contração" value={kpis.contracao.valor} count={kpis.contracao.count} max={max} tone="bg-amber-500" />
                    <CompareBar label="Perdido" value={kpis.perdido.valor} count={kpis.perdido.count} max={max} tone="bg-red-500" />
                    <div className="flex gap-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                            NRR <strong className="text-slate-900 dark:text-white">{pct1(kpis.nrrPct)}</strong>
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                            GRR <strong className="text-slate-900 dark:text-white">{pct1(kpis.grrPct)}</strong>
                        </span>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma cidade desta carteira teve receita na janela.</p>
            )}
        </div>
    );
}

interface CeoHomeProps {
    onNavigate: (view: AppView) => void;
}

export default function CeoHome({ onNavigate }: CeoHomeProps) {
    const { kpis, loading, error, refetch } = useCsKpis(30);

    const byManager = useMemo(
        () => (kpis ? aggregateKpisByManager(kpis.cidades) : []),
        [kpis]
    );

    const maxBar = useMemo(() => {
        const values = byManager.flatMap(m => [m.novos.valor, m.expansao.valor, m.contracao.valor, m.perdido.valor]);
        return values.length ? Math.max(...values) : 0;
    }, [byManager]);

    if (loading) {
        return (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-emerald-600">progress_activity</span>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Carregando os números da operação…</p>
            </div>
        );
    }

    if (error || !kpis) {
        return (
            <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-8 text-center">
                <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">error</span>
                <p className="mt-2 font-bold text-red-800 dark:text-red-300">Não foi possível carregar os KPIs.</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                <button
                    type="button"
                    onClick={refetch}
                    className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
                >
                    Tentar de novo
                </button>
            </div>
        );
    }

    const alerts = kpis.topRisco.slice(0, ALERT_PREVIEW_SIZE);

    return (
        <div className="space-y-10">
            {/* ── Visão geral ──────────────────────────────────────── */}
            <section>
                <h2 className="flex items-center gap-2 mb-4 text-xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: BALOO }}>
                    <span className="material-symbols-outlined text-sky-600">query_stats</span>
                    Visão geral da operação
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">(últimos {kpis.windowDays} dias)</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi
                        label="Comissão líquida"
                        value={brl(kpis.comissao.atual)}
                        sub={`${kpis.comissao.variacaoPct >= 0 ? '+' : ''}${pct1(kpis.comissao.variacaoPct)} vs. período anterior`}
                        tone={kpis.comissao.variacaoPct >= 0 ? 'emerald' : 'red'}
                        icon={kpis.comissao.variacaoPct >= 0 ? 'trending_up' : 'trending_down'}
                    />
                    <Kpi
                        label="NRR (receita retida)"
                        value={pct1(kpis.nrrPct)}
                        sub={kpis.nrrPct >= 100 ? 'A carteira cresce sozinha' : 'Abaixo de 100%: a carteira encolhe'}
                        tone={kpis.nrrPct >= 100 ? 'emerald' : 'red'}
                        icon="done_all"
                    />
                    <Kpi
                        label="GRR (retenção bruta)"
                        value={pct1(kpis.grrPct)}
                        sub="Sem contar expansão"
                        tone="slate"
                        icon="drag_handle"
                    />
                    <Kpi
                        label="Churn de receita"
                        value={pct1(kpis.churnReceitaPct)}
                        sub={`${brl(kpis.perdido.valor)} perdidos em ${kpis.perdido.count} parceiros`}
                        tone="red"
                        icon="trending_down"
                    />
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Comparativo de carteiras ─────────────────────── */}
                <section className="lg:col-span-2">
                    <h2 className="flex items-center gap-2 mb-4 text-xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: BALOO }}>
                        <span className="material-symbols-outlined text-sky-600">group_work</span>
                        Comparativo de carteiras
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {COMPARED.map(id => (
                            <WalletCard
                                key={id}
                                profileId={id}
                                kpis={byManager.find(m => m.manager === id)}
                                max={maxBar}
                            />
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        Somado a partir das cidades de cada gestor. As barras usam a mesma escala nos dois cards.
                    </p>
                </section>

                {/* ── Alertas críticos ─────────────────────────────── */}
                <section className="flex flex-col">
                    <h2 className="flex items-center gap-2 mb-4 text-xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: BALOO }}>
                        <span className="material-symbols-outlined text-red-500">warning</span>
                        Alertas críticos
                    </h2>

                    <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3 flex flex-col gap-2">
                        {alerts.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                                <span className="material-symbols-outlined text-3xl text-emerald-500">task_alt</span>
                                <p className="mt-2 font-bold text-slate-700 dark:text-slate-200">Nenhuma queda relevante.</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Nenhum parceiro zerou ou perdeu mais da metade da receita na janela.
                                </p>
                            </div>
                        ) : (
                            <>
                                {alerts.map(alert => (
                                    <div
                                        key={alert.id}
                                        className={`rounded-r-lg border-l-4 bg-slate-50 dark:bg-slate-800 p-3 ${alert.tipo === 'zerou' ? 'border-l-red-500' : 'border-l-amber-500'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-900 dark:text-white truncate">{alert.nome}</p>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                    {alert.cidade || 'sem cidade'} • {brl(alert.anterior)} → {brl(alert.atual)}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase ${alert.tipo === 'zerou' ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                                                {alert.tipo === 'zerou' ? 'zerou' : 'queda'}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">−{brl(alert.perda)}</p>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => onNavigate('cs_kpis')}
                                    className="mt-auto w-full rounded-lg border border-sky-200 dark:border-sky-900 py-2 text-sm font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                                >
                                    Abrir KPIs de CS
                                </button>
                            </>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
