
import { useState, useMemo, useCallback } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import { CAMPAIGN_TYPES, type CampaignTypeId } from '../config/campaignTypes';
import CampaignIcons from './CampaignIcons';
import { useCsKpis, type CsCityKpis } from '../hooks/useCsKpis';
import { useAtivacoesCampanhas } from '../hooks/useAtivacoesCampanhas';
import { useAtivacoesMensal } from '../hooks/useAtivacoesMensal';
import AtivacoesMensalChart from './reports/AtivacoesMensalChart';
import { getEffectiveManager } from '../config/managerMapping';

interface ReportsViewProps {
    data: EnrichedPerformanceRow[];
    managerFilter?: string;
}

type CentralTab = 'overview' | 'atividade' | 'ativacoes';

const TABS: { id: CentralTab; label: string; icon: string; wip?: boolean }[] = [
    { id: 'overview', label: 'Visão Geral', icon: 'dashboard' },
    { id: 'atividade', label: 'Atividade da Base', icon: 'storefront' },
    { id: 'ativacoes', label: 'Ativação de Campanhas', icon: 'campaign', wip: true },
];

export default function ReportsView({ data, managerFilter = '' }: ReportsViewProps) {
    const [activeTab, setActiveTab] = useState<CentralTab>('overview');

    return (
        <div className="flex-1 bg-slate-50 dark:bg-slate-900 min-h-screen overflow-y-auto">
            <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* HEADER */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20">
                            <span className="material-symbols-outlined text-white text-2xl">analytics</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Central de KPIs</h1>
                        {managerFilter && (
                            <span className="text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary rounded-xl ml-1">
                                {managerFilter}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Análise macro de desempenho e saúde da base de parceiros.</p>
                </div>

                {/* TAB BAR */}
                <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-700">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
                                activeTab === t.id
                                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                            {t.label}
                            {t.wip && (
                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                                    Em construção
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === 'overview' && <OverviewTab data={data} managerFilter={managerFilter} />}
                {activeTab === 'atividade' && <AtividadeBaseTab managerFilter={managerFilter} />}
                {activeTab === 'ativacoes' && <AtivacaoCampanhasTab managerFilter={managerFilter} />}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// ABA 1 — VISÃO GERAL (conteúdo original da Central de KPIs, sem alterações de lógica)
// ─────────────────────────────────────────────────────────────────────────

function OverviewTab({ data, managerFilter }: { data: EnrichedPerformanceRow[]; managerFilter: string }) {
    const [cityFilter, setCityFilter] = useState('all');

    const filteredData = useMemo(() => {
        return data
            .filter(row => !managerFilter || row.analista === managerFilter)
            .filter(row => cityFilter === 'all' || row.cidade === cityFilter);
    }, [data, managerFilter, cityFilter]);

    // KPI Calculations
    const kpis = useMemo(() => {
        const total = filteredData.length || 1;

        const withOrders = filteredData.filter(row => row.total_pedidos > 0).length;
        const meetingGoal = filteredData.filter(row => row.total_pedidos >= row.dias_desde_lancamento && row.dias_desde_lancamento > 0).length;

        const campaignStats = Object.fromEntries(
            CAMPAIGN_TYPES.map(c => {
                const withActive = filteredData.filter(row =>
                    (row.campaign_statuses?.[c.id] ?? (c.id === 'super_promos' ? row.promo_status : c.id === 'cupons_destaque' ? row.cupom_status : undefined)) === 'ativo',
                ).length;
                return [c.id, {
                    withActive,
                    withoutActive: filteredData.length - withActive,
                    percent: (withActive / total) * 100,
                }];
            }),
        ) as Record<CampaignTypeId, { withActive: number; withoutActive: number; percent: number }>;

        return {
            total: filteredData.length,
            withOrders: { count: withOrders, percent: (withOrders / total) * 100 },
            meetingGoal: { count: meetingGoal, percent: (meetingGoal / total) * 100 },
            campaigns: campaignStats,
        };
    }, [filteredData]);

    const noCampaignLists = useMemo(() => {
        const lists = {} as Record<CampaignTypeId, EnrichedPerformanceRow[]>;
        for (const c of CAMPAIGN_TYPES) {
            lists[c.id] = filteredData
                .filter(row =>
                    (row.campaign_statuses?.[c.id] ?? (c.id === 'super_promos' ? row.promo_status : c.id === 'cupons_destaque' ? row.cupom_status : 'aguardando')) !== 'ativo',
                )
                .sort((a, b) => b.dias_desde_lancamento - a.dias_desde_lancamento);
        }
        return lists;
    }, [filteredData]);

    const uniqueCities = Array.from(new Set(data.map(d => d.cidade))).filter(Boolean).sort();

    return (
        <div className="space-y-10">
            {/* FILTER TOOLBAR */}
            <div className="flex justify-end">
                <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 px-3 border-r border-slate-100 dark:border-slate-700">
                        <span className="material-symbols-outlined text-slate-400 text-sm">filter_list</span>
                    </div>

                    <select
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                        className="text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                        <option value="all">Todas as Cidades</option>
                        {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {cityFilter !== 'all' && (
                        <button
                            onClick={() => setCityFilter('all')}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                            title="Limpar filtros"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* KPI GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                <KPICard
                    title="Ativação de Pedidos"
                    value={`${kpis.withOrders.percent.toFixed(1)}%`}
                    subtitle={`${kpis.withOrders.count} de ${kpis.total} parceiros`}
                    icons={['shopping_cart']}
                    color="emerald"
                    trend="Receberam pelo menos 1 pedido"
                />
                <KPICard
                    title="Meta de 1 Pedido/Dia"
                    value={`${kpis.meetingGoal.percent.toFixed(1)}%`}
                    subtitle={`${kpis.meetingGoal.count} parceiros na meta`}
                    icons={['trending_up']}
                    color="blue"
                    trend="Desempenho ideal (>= 1 pedido/dia)"
                />
                {CAMPAIGN_TYPES.map(c => (
                    <KPICard
                        key={c.id}
                        title={c.label}
                        value={`${kpis.campaigns[c.id].percent.toFixed(1)}%`}
                        subtitle={`${kpis.campaigns[c.id].withActive} com campanha ativa`}
                        icons={c.icons}
                        color={c.id === 'ofertas_da_casa' ? 'amber' : c.id === 'super_promos' ? 'violet' : 'amber'}
                        trend="Penetração na base filtrada"
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {CAMPAIGN_TYPES.map(c => (
                    <div key={c.id} className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 size-40 bg-violet-500/5 rounded-full blur-3xl group-hover:bg-violet-500/10 transition-colors" />
                        <div className="flex items-start justify-between mb-8">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Oportunidade — {c.shortLabel}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Parceiros sem {c.label.toLowerCase()} ativa.</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-4xl font-black text-violet-500">{kpis.campaigns[c.id].withoutActive}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendente</span>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {noCampaignLists[c.id].map(store => (
                                <StoreMiniCard key={`no-${c.id}-${store.estab_id || store.estabelecimento}`} store={store} campaignId={c.id} />
                            ))}
                            {noCampaignLists[c.id].length === 0 && (
                                <EmptyState message={`Todos os parceiros têm ${c.shortLabel.toLowerCase()} ativa!`} />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// ABA 2 — ATIVIDADE DA BASE (dados reais do banco via cs-kpis)
// ─────────────────────────────────────────────────────────────────────────

type Segmento = 'cidade' | 'gestor';
type ActivityRow = { segmento: string; ativos: number; comPedido: number; semPedido: number; pedidos: number; taxaPct: number };

const intBR = (n: number) => n.toLocaleString('pt-BR');

function AtividadeBaseTab({ managerFilter }: { managerFilter: string }) {
    const { kpis, loading, error, refetch } = useCsKpis(30); // atividade = 28d (padrão do servidor)
    const [segmento, setSegmento] = useState<Segmento>('cidade');

    // Cidades visíveis conforme o filtro de gestor do menu
    const cidadesVisiveis = useMemo<CsCityKpis[]>(() => {
        if (!kpis) return [];
        if (!managerFilter) return kpis.cidades;
        const mf = managerFilter.trim().toUpperCase();
        return kpis.cidades.filter(c => getEffectiveManager(c.cidade, '').toUpperCase() === mf);
    }, [kpis, managerFilter]);

    // Totais dos cards: global quando sem filtro (mais preciso), soma das cidades quando filtrado
    const totais = useMemo(() => {
        if (!kpis) return { ativos: 0, comPedido: 0, semPedido: 0, pedidos: 0, taxaPct: 0 };
        if (!managerFilter) {
            const a = kpis.atividade;
            return { ativos: a.totalAtivos, comPedido: a.comPedido, semPedido: a.semPedido, pedidos: a.pedidosCount, taxaPct: a.taxaPct };
        }
        const acc = cidadesVisiveis.reduce(
            (s, c) => ({
                ativos: s.ativos + c.atividade.totalAtivos,
                comPedido: s.comPedido + c.atividade.comPedido,
                pedidos: s.pedidos + c.atividade.pedidosCount,
            }),
            { ativos: 0, comPedido: 0, pedidos: 0 },
        );
        return {
            ...acc,
            semPedido: acc.ativos - acc.comPedido,
            taxaPct: acc.ativos > 0 ? (acc.comPedido / acc.ativos) * 100 : 0,
        };
    }, [kpis, managerFilter, cidadesVisiveis]);

    // Linhas da tabela de segmentação
    const rows = useMemo<ActivityRow[]>(() => {
        if (segmento === 'cidade') {
            return cidadesVisiveis
                .map(c => ({
                    segmento: c.cidade,
                    ativos: c.atividade.totalAtivos,
                    comPedido: c.atividade.comPedido,
                    semPedido: c.atividade.semPedido,
                    pedidos: c.atividade.pedidosCount,
                    taxaPct: c.atividade.taxaPct,
                }))
                .sort((a, b) => b.pedidos - a.pedidos);
        }
        // Por gestor: agrega as cidades pelo mapa cidade → gestor
        const byMgr = new Map<string, { ativos: number; comPedido: number; pedidos: number }>();
        for (const c of cidadesVisiveis) {
            const m = getEffectiveManager(c.cidade, '') || 'Desconhecido';
            const cur = byMgr.get(m) ?? { ativos: 0, comPedido: 0, pedidos: 0 };
            cur.ativos += c.atividade.totalAtivos;
            cur.comPedido += c.atividade.comPedido;
            cur.pedidos += c.atividade.pedidosCount;
            byMgr.set(m, cur);
        }
        return [...byMgr.entries()]
            .map(([segmento, v]) => ({
                segmento,
                ativos: v.ativos,
                comPedido: v.comPedido,
                semPedido: v.ativos - v.comPedido,
                pedidos: v.pedidos,
                taxaPct: v.ativos > 0 ? (v.comPedido / v.ativos) * 100 : 0,
            }))
            .sort((a, b) => b.pedidos - a.pedidos);
    }, [segmento, cidadesVisiveis]);

    if (loading) {
        return <p className="text-sm text-slate-400 py-8">Calculando atividade da base no banco…</p>;
    }
    if (error || !kpis) {
        return (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm flex items-center justify-between gap-4">
                <span>Não foi possível carregar a atividade da base{error ? `: ${error}` : '.'}</span>
                <button onClick={refetch} className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
                    Tentar de novo
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Base ativa (delivery) · pedidos nos últimos <strong>{kpis.activityDays}</strong> dias
                    {managerFilter ? <> · gestor <strong>{managerFilter}</strong></> : ' · todas as cidades'}
                </p>
                <button
                    onClick={refetch}
                    className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                    Atualizar
                </button>
            </div>

            {/* CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Parceiros Ativos"
                    value={intBR(totais.ativos)}
                    subtitle="Estabelecimentos com delivery"
                    icons={['storefront']}
                    color="emerald"
                    trend="Base ativa total"
                />
                <KPICard
                    title={`Recebendo Pedidos (${kpis.activityDays}d)`}
                    value={intBR(totais.comPedido)}
                    subtitle={`${totais.taxaPct.toFixed(1)}% da base ativa`}
                    icons={['receipt_long']}
                    color="blue"
                    trend="Ao menos 1 pedido no período"
                />
                <KPICard
                    title={`Sem Pedido (${kpis.activityDays}d)`}
                    value={intBR(totais.semPedido)}
                    subtitle="Alvo de reativação"
                    icons={['running_with_errors']}
                    color="amber"
                    trend="Ativos que não venderam"
                />
                <KPICard
                    title={`Nº de Pedidos (${kpis.activityDays}d)`}
                    value={intBR(totais.pedidos)}
                    subtitle="Volume total no período"
                    icons={['shopping_bag']}
                    color="violet"
                    trend="Contagem de pedidos"
                />
            </div>

            {/* TABELA DE SEGMENTAÇÃO */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
                <div className="flex items-center justify-between gap-4 flex-wrap p-6 pb-4 border-b border-slate-100 dark:border-slate-700/50">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Segmentação</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{rows.length} {segmento === 'cidade' ? 'cidades' : 'gestores'} · ordenado por nº de pedidos</p>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl">
                        {(['cidade', 'gestor'] as Segmento[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setSegmento(s)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                                    segmento === s
                                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                            >
                                Por {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
                                <th className="text-left font-black px-6 py-3">{segmento === 'cidade' ? 'Cidade' : 'Gestor'}</th>
                                <th className="text-right font-black px-4 py-3">Ativos</th>
                                <th className="text-right font-black px-4 py-3">Receb. pedidos</th>
                                <th className="text-right font-black px-4 py-3">Sem pedido</th>
                                <th className="text-right font-black px-4 py-3">Taxa</th>
                                <th className="text-right font-black px-6 py-3">Nº pedidos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.segmento} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                                    <td className="px-6 py-3 font-bold text-slate-900 dark:text-white">{r.segmento}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{intBR(r.ativos)}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{intBR(r.comPedido)}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{intBR(r.semPedido)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-md tabular-nums ${
                                            r.taxaPct >= 80
                                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                : r.taxaPct >= 50
                                                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                                    : 'bg-red-50 dark:bg-red-500/10 text-red-500'
                                        }`}>
                                            {r.taxaPct.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right font-black text-slate-900 dark:text-white tabular-nums">{intBR(r.pedidos)}</td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                                        Nenhuma cidade encontrada para este filtro.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-xs text-slate-400">
                Dados do banco (réplica). Cálculo em {kpis.elapsedMs ?? '—'}ms · {kpis.cidades.length} cidades no período.
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// ABA 3 — ATIVAÇÃO DE CAMPANHAS (relatório retroativo — cupons + promoções)
// ─────────────────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [7, 28, 90] as const;
const MESES_OPTIONS = [6, 12, 24] as const;

type AtivRow = { segmento: string; cupons: number; promo: number; cs: number; parceiro: number };

export function AtivacaoCampanhasTab({ managerFilter }: { managerFilter: string }) {
    const [windowDays, setWindowDays] = useState<number>(28);
    const [mesesJanela, setMesesJanela] = useState<number>(12);
    const [segmento, setSegmento] = useState<Segmento>('cidade');
    const { data, loading, error, refetch } = useAtivacoesCampanhas(windowDays);
    const { data: mensal, loading: mensalLoading, error: mensalError } = useAtivacoesMensal(mesesJanela);

    const matchesManager = useCallback(
        (cidade: string) => !managerFilter || getEffectiveManager(cidade, '').toUpperCase() === managerFilter.trim().toUpperCase(),
        [managerFilter],
    );

    // cupons/dia visível conforme filtro de gestor não se aplica (é agregado global);
    // porém total e tabela respeitam o gestor via cidades.
    const cuponsPorDia = data?.cupons.porDia ?? [];

    const totais = useMemo(() => {
        if (!data) return { cupons: 0, promoParticipacoes: 0, promoDistintos: 0, cs: 0, parceiro: 0 };
        // sem filtro: usa os totais oficiais (mais precisos p/ 'todos')
        if (!managerFilter) {
            return {
                cupons: data.cupons.total,
                promoParticipacoes: data.promos.totalParticipacoes,
                promoDistintos: data.promos.parceirosDistintos,
                cs: data.promos.cs,
                parceiro: data.promos.parceiro,
            };
        }
        const doGestor = data.promos.porCidade.filter(c => matchesManager(c.cidade));
        const cupons = data.cupons.porCidade.filter(c => matchesManager(c.cidade)).reduce((s, c) => s + c.n, 0);
        const promoParticipacoes = doGestor.reduce((s, c) => s + c.n, 0);
        return {
            cupons,
            promoParticipacoes,
            promoDistintos: promoParticipacoes,
            cs: doGestor.reduce((s, c) => s + c.cs, 0),
            parceiro: doGestor.reduce((s, c) => s + c.parceiro, 0),
        };
    }, [data, managerFilter, matchesManager]);

    /** % das participações que o parceiro ativou sozinho (sem marca do CS) */
    const pctParceiro = totais.promoParticipacoes > 0
        ? Math.round((totais.parceiro / totais.promoParticipacoes) * 100)
        : 0;

    const rows = useMemo<AtivRow[]>(() => {
        if (!data) return [];
        const cupMap = new Map<string, number>();
        data.cupons.porCidade.forEach(c => cupMap.set(c.cidade, c.n));
        const promoMap = new Map<string, { n: number; cs: number; parceiro: number }>();
        data.promos.porCidade.forEach(c => promoMap.set(c.cidade, { n: c.n, cs: c.cs, parceiro: c.parceiro }));
        const cidades = new Set<string>([...cupMap.keys(), ...promoMap.keys()]);

        const base = [...cidades]
            .filter(c => matchesManager(c))
            .map(c => {
                const p = promoMap.get(c);
                return { cidade: c, cupons: cupMap.get(c) ?? 0, promo: p?.n ?? 0, cs: p?.cs ?? 0, parceiro: p?.parceiro ?? 0 };
            });

        if (segmento === 'cidade') {
            return base
                .map(b => ({ segmento: b.cidade, cupons: b.cupons, promo: b.promo, cs: b.cs, parceiro: b.parceiro }))
                .sort((a, b) => (b.cupons + b.promo) - (a.cupons + a.promo));
        }
        const byMgr = new Map<string, { cupons: number; promo: number; cs: number; parceiro: number }>();
        for (const b of base) {
            const m = getEffectiveManager(b.cidade, '') || 'Desconhecido';
            const cur = byMgr.get(m) ?? { cupons: 0, promo: 0, cs: 0, parceiro: 0 };
            cur.cupons += b.cupons;
            cur.promo += b.promo;
            cur.cs += b.cs;
            cur.parceiro += b.parceiro;
            byMgr.set(m, cur);
        }
        return [...byMgr.entries()]
            .map(([segmento, v]) => ({ segmento, cupons: v.cupons, promo: v.promo, cs: v.cs, parceiro: v.parceiro }))
            .sort((a, b) => (b.cupons + b.promo) - (a.cupons + a.promo));
    }, [data, segmento, matchesManager]);

    const maxDia = Math.max(1, ...cuponsPorDia.map(d => d.n));

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Ativações de campanhas
                    {managerFilter ? <> · gestor <strong>{managerFilter}</strong></> : ' · todas as cidades'}
                </p>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl">
                        {WINDOW_OPTIONS.map(w => (
                            <button
                                key={w}
                                onClick={() => setWindowDays(w)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    windowDays === w ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                            >
                                {w}d
                            </button>
                        ))}
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

            {/* aviso honesto: em construção + limitação do dado */}
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 p-4">
                <span className="material-symbols-outlined text-amber-500 text-[20px] mt-0.5">construction</span>
                <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-1">
                    <p className="font-black uppercase tracking-wide">Como ler estes números</p>
                    <p>
                        Em <strong>promoções</strong>, o corte CS vs parceiro vem do checkbox <strong>"Sucesso do Cliente"</strong> do painel:
                        marcado = quem ativou foi o CS. É <strong>estado atual, sem data e sem histórico</strong> — se o CS desmarcar, o número muda
                        retroativamente. A marca é por campanha/parceiro, não por item, então tende a puxar para o CS.
                        Em <strong>cupons</strong> continua sem autor: só temos a data de ativação (fluxo diário abaixo).
                    </p>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-slate-400 py-8">Calculando ativações no banco…</p>
            ) : error || !data ? (
                <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 p-4 text-red-600 dark:text-red-400 text-sm flex items-center justify-between gap-4">
                    <span>Não foi possível carregar as ativações{error ? `: ${error}` : '.'}</span>
                    <button onClick={refetch} className="shrink-0 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors">Tentar de novo</button>
                </div>
            ) : (
                <>
                    {/* CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                        <KPICard
                            title={`Cupons Ativados (${windowDays}d)`}
                            value={intBR(totais.cupons)}
                            subtitle="Cupons de destaque criados no período"
                            icons={['confirmation_number']}
                            color="emerald"
                            trend="Tem data de ativação"
                        />
                        <KPICard
                            title="Promoções — Participações"
                            value={intBR(totais.promoParticipacoes)}
                            subtitle={`${data.promos.campanhas.length} campanhas ativas`}
                            icons={['local_offer']}
                            color="violet"
                            trend="Parceiro × campanha, item aprovado"
                        />
                        <KPICard
                            title="Promoções — Parceiros"
                            value={intBR(totais.promoDistintos)}
                            subtitle="Parceiros distintos em promoção"
                            icons={['groups']}
                            color="blue"
                            trend="Únicos em alguma campanha ativa"
                        />
                        <KPICard
                            title="Ativação do Parceiro"
                            value={`${pctParceiro}%`}
                            subtitle={`${intBR(totais.parceiro)} parceiro · ${intBR(totais.cs)} CS`}
                            icons={['storefront']}
                            color="amber"
                            trend="Sem marca de Sucesso do Cliente"
                        />
                    </div>

                    {/* TIMELINE DE CUPONS */}
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none p-6">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-1">Cupons ativados por dia</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-6">Últimos {windowDays} dias · base global (não filtra por gestor)</p>
                        <div className="flex items-end gap-1 h-40">
                            {cuponsPorDia.length === 0 && <p className="text-sm text-slate-400">Sem cupons no período.</p>}
                            {cuponsPorDia.map(d => (
                                <div key={d.dia} className="flex-1 h-full flex flex-col items-center justify-end gap-1 group/bar" title={`${d.dia}: ${d.n} cupons`}>
                                    <span className="text-[9px] font-bold text-slate-400 opacity-0 group-hover/bar:opacity-100 transition-opacity">{d.n}</span>
                                    <div
                                        className="w-full rounded-t-md bg-emerald-400/80 dark:bg-emerald-500/70 hover:bg-emerald-500 transition-colors"
                                        style={{ height: `${(d.n / maxDia) * 100}%`, minHeight: d.n > 0 ? '4px' : '0' }}
                                    />
                                    <span className="text-[8px] text-slate-400 rotate-45 origin-left h-4 whitespace-nowrap">{d.dia.slice(5)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* EVOLUÇÃO MENSAL */}
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Evolução mensal — quem ativou</h3>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl">
                                {MESES_OPTIONS.map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMesesJanela(m)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            mesesJanela === m ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                        }`}
                                    >
                                        {m}m
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-6">
                            Promoções aprovadas por mês · base global (não filtra por gestor)
                        </p>
                        {mensalLoading ? (
                            <p className="text-sm text-slate-400 py-8">Montando a série mensal…</p>
                        ) : mensalError || !mensal ? (
                            <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 p-4 text-red-600 dark:text-red-400 text-sm">
                                Não foi possível carregar a série mensal{mensalError ? `: ${mensalError}` : '.'}
                            </div>
                        ) : (
                            <>
                                <AtivacoesMensalChart series={mensal.series} />
                                <p className="mt-5 text-[11px] text-slate-400 leading-relaxed">
                                    Mês <strong>congelado</strong> vem do snapshot: a foto foi tirada quando o mês fechou, então é o valor real.
                                    Mês não congelado é lido ao vivo de <code>data_modificacao_status</code>, que guarda só a <strong>última</strong> mudança
                                    de status — é um <strong>piso</strong>, e quanto mais antigo, mais já encolheu. Meses em branco não são meses sem
                                    ativação: são meses cujas aprovações já foram sobrescritas.
                                    {mensal.snapshot.mesesCongelados.length === 0 && (
                                        <> <strong className="text-amber-600 dark:text-amber-400">Nenhum mês congelado ainda</strong> — toda a série
                                        acima está sujeita a encolher.</>
                                    )}
                                </p>
                            </>
                        )}
                    </div>

                    {/* SEGMENTAÇÃO */}
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none overflow-hidden">
                        <div className="flex items-center justify-between gap-4 flex-wrap p-6 pb-4 border-b border-slate-100 dark:border-slate-700/50">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Segmentação</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{rows.length} {segmento === 'cidade' ? 'cidades' : 'gestores'} · cupons no período + participações em promoção</p>
                            </div>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl">
                                {(['cidade', 'gestor'] as Segmento[]).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSegmento(s)}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                                            segmento === s ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                        }`}
                                    >
                                        Por {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
                                        <th className="text-left font-black px-6 py-3">{segmento === 'cidade' ? 'Cidade' : 'Gestor'}</th>
                                        <th className="text-right font-black px-4 py-3">Cupons ({windowDays}d)</th>
                                        <th className="text-right font-black px-4 py-3">Promo (participações)</th>
                                        <th className="text-right font-black px-4 py-3">Parceiro</th>
                                        <th className="text-right font-black px-4 py-3">CS</th>
                                        <th className="text-right font-black px-6 py-3">% Parceiro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.segmento} className="border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                                            <td className="px-6 py-3 font-bold text-slate-900 dark:text-white">{r.segmento}</td>
                                            <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{intBR(r.cupons)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-violet-600 dark:text-violet-400 tabular-nums">{intBR(r.promo)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{intBR(r.parceiro)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{intBR(r.cs)}</td>
                                            <td className="px-6 py-3 text-right font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                                {r.promo > 0 ? `${Math.round((r.parceiro / r.promo) * 100)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">Nenhuma ativação para este filtro.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400">
                        Dados do banco (réplica). Cálculo em {data.elapsedMs ?? '—'}ms.
                    </p>
                </>
            )}
        </div>
    );
}

function KPICard({ title, value, subtitle, icons, color, trend }: { title: string; value: string; subtitle: string; icons: readonly string[]; color: 'emerald' | 'blue' | 'violet' | 'amber'; trend: string }) {
    const colors = {
        emerald: 'bg-emerald-500 shadow-emerald-500/20 text-emerald-500',
        blue: 'bg-blue-500 shadow-blue-500/20 text-blue-500',
        violet: 'bg-violet-500 shadow-violet-500/20 text-violet-500',
        amber: 'bg-amber-500 shadow-amber-500/20 text-amber-500',
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none hover:shadow-xl transition-all hover:-translate-y-1 group">
            <div className="flex items-center justify-between mb-4">
                <div className={`size-12 rounded-2xl ${colors[color].split(' ')[0]} flex items-center justify-center text-white shadow-lg ${colors[color].split(' ')[1]}`}>
                    <CampaignIcons icons={icons} iconClassName="text-[22px]" />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${colors[color].split(' ')[2]} bg-slate-50 dark:bg-slate-900/50`}>
                    KPI
                </span>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{value}</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>

            <div className="pt-4 border-t border-slate-50 dark:border-slate-700/50">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] text-slate-400">info</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{trend}</span>
                </div>
            </div>
        </div>
    );
}

function StoreMiniCard({ store, campaignId }: { store: EnrichedPerformanceRow; campaignId: CampaignTypeId }) {
    const campaign = CAMPAIGN_TYPES.find(c => c.id === campaignId)!;
    const status = store.campaign_statuses?.[campaignId]
        ?? (campaignId === 'super_promos' ? store.promo_status : campaignId === 'cupons_destaque' ? store.cupom_status : 'aguardando');
    return (
        <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all group/card">
            <div className="shrink-0 relative">
                {store.logo_url ? (
                    <img src={store.logo_url} alt={store.estabelecimento} className="size-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                ) : (
                    <div className="size-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-[20px]">store</span>
                    </div>
                )}
                <div className={`absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-slate-50 dark:border-slate-900 flex items-center justify-center ${
                    campaignId === 'ofertas_da_casa' ? 'bg-amber-500' : campaignId === 'super_promos' ? 'bg-violet-500' : 'bg-indigo-500'
                }`}>
                    <CampaignIcons icons={campaign.icons} iconClassName="text-[8px] text-white font-black" />
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover/card:text-primary transition-colors">{store.estabelecimento}</h4>
                <div className="flex items-center gap-2">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter truncate max-w-[120px]">{store.analista}</p>
                    <span className="size-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                    <p className="text-[10px] text-slate-400 font-medium italic">{store.cidade}</p>
                </div>
            </div>

            <div className="flex flex-col items-end">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${store.dias_desde_lancamento > 15 ? 'bg-red-50 dark:bg-red-500/10 text-red-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                    {store.dias_desde_lancamento}d
                </span>
                <span className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">
                    {status}
                </span>
            </div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="py-12 text-center bg-emerald-50/30 dark:bg-emerald-500/5 rounded-3xl border-2 border-dashed border-emerald-100 dark:border-emerald-500/20">
            <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">check_circle</span>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{message}</p>
        </div>
    );
}
