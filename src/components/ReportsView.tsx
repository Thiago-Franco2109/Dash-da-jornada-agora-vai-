
import { useState, useMemo } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';

interface ReportsViewProps {
    data: EnrichedPerformanceRow[];
}

export default function ReportsView({ data }: ReportsViewProps) {
    const [managerFilter, setManagerFilter] = useState('all');
    const [cityFilter, setCityFilter] = useState('all');

    // Filtered data based on toolbar
    const filteredData = useMemo(() => {
        return data
            .filter(row => managerFilter === 'all' || row.analista === managerFilter)
            .filter(row => cityFilter === 'all' || row.cidade === cityFilter);
    }, [data, managerFilter, cityFilter]);

    // KPI Calculations
    const kpis = useMemo(() => {
        const total = filteredData.length || 1; // avoid division by zero
        
        const withOrders = filteredData.filter(row => row.total_pedidos > 0).length;
        const meetingGoal = filteredData.filter(row => row.total_pedidos >= row.dias_desde_lancamento && row.dias_desde_lancamento > 0).length;
        const withPromo = filteredData.filter(row => row.promo_status === 'ativo').length;
        const withoutPromo = filteredData.filter(row => row.promo_status !== 'ativo').length;
        const withCupom = filteredData.filter(row => row.cupom_status === 'ativo').length;
        const withoutCupom = filteredData.filter(row => row.cupom_status !== 'ativo').length;

        return {
            total: filteredData.length,
            withOrders: { count: withOrders, percent: (withOrders / total) * 100 },
            meetingGoal: { count: meetingGoal, percent: (meetingGoal / total) * 100 },
            withPromo: { count: withPromo, percent: (withPromo / total) * 100 },
            withoutPromo: { count: withoutPromo, percent: (withoutPromo / total) * 100 },
            withCupom: { count: withCupom, percent: (withCupom / total) * 100 },
            withoutCupom: { count: withoutCupom, percent: (withoutCupom / total) * 100 },
        };
    }, [filteredData]);

    const noPromoList = useMemo(() => {
        return filteredData
            .filter(row => row.promo_status !== 'ativo')
            .sort((a, b) => b.dias_desde_lancamento - a.dias_desde_lancamento);
    }, [filteredData]);

    const noCupomList = useMemo(() => {
        return filteredData
            .filter(row => row.cupom_status !== 'ativo')
            .sort((a, b) => b.dias_desde_lancamento - a.dias_desde_lancamento);
    }, [filteredData]);

    const uniqueManagers = Array.from(new Set(data.map(d => d.analista))).filter(Boolean).sort();
    const uniqueCities = Array.from(new Set(data.map(d => d.cidade))).filter(Boolean).sort();

    return (
        <div className="flex-1 bg-slate-50 dark:bg-slate-900 min-h-screen overflow-y-auto">
            <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                
                {/* HEADER SECTION */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20">
                                <span className="material-symbols-outlined text-white text-2xl">analytics</span>
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Central de KPIs</h1>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">Análise macro de desempenho e saúde da base de parceiros.</p>
                    </div>

                    {/* FILTER TOOLBAR */}
                    <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-r border-slate-100 dark:border-slate-700">
                            <span className="material-symbols-outlined text-slate-400 text-sm">filter_list</span>
                        </div>
                        
                        <select 
                            value={managerFilter}
                            onChange={(e) => setManagerFilter(e.target.value)}
                            className="text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
                        >
                            <option value="all">Todos os Gestores</option>
                            {uniqueManagers.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>

                        <select 
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
                        >
                            <option value="all">Todas as Cidades</option>
                            {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        { (managerFilter !== 'all' || cityFilter !== 'all') && (
                            <button 
                                onClick={() => { setManagerFilter('all'); setCityFilter('all'); }}
                                className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                                title="Limpar filtros"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* KPI GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* KPI: Recebendo Pedidos */}
                    <KPICard 
                        title="Ativação de Pedidos"
                        value={`${kpis.withOrders.percent.toFixed(1)}%`}
                        subtitle={`${kpis.withOrders.count} de ${kpis.total} parceiros`}
                        icon="shopping_cart"
                        color="emerald"
                        trend="Receberam pelo menos 1 pedido"
                    />

                    {/* KPI: Meta Diária */}
                    <KPICard 
                        title="Meta de 1 Pedido/Dia"
                        value={`${kpis.meetingGoal.percent.toFixed(1)}%`}
                        subtitle={`${kpis.meetingGoal.count} parceiros na meta`}
                        icon="trending_up"
                        color="blue"
                        trend="Desempenho ideal (>= 1 pedido/dia)"
                    />

                    {/* KPI: Promoções Ativas */}
                    <KPICard 
                        title="Penetração de Promo"
                        value={`${kpis.withPromo.percent.toFixed(1)}%`}
                        subtitle={`${kpis.withPromo.count} com promoção ativa`}
                        icon="percent"
                        color="violet"
                        trend="Estratégia de preço ativa"
                    />

                    {/* KPI: Cupons Ativos */}
                    <KPICard 
                        title="Uso de Cupons"
                        value={`${kpis.withCupom.percent.toFixed(1)}%`}
                        subtitle={`${kpis.withCupom.count} com cupom ativo`}
                        icon="confirmation_number"
                        color="amber"
                        trend="Incentivo de primeira compra"
                    />
                </div>

                {/* SECONDARY STATS (Inverted/Pendencies) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 size-40 bg-violet-500/5 rounded-full blur-3xl group-hover:bg-violet-500/10 transition-colors" />
                        
                        <div className="flex items-start justify-between mb-8">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Oportunidade de Promoção</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Parceiros sem nenhuma promoção ativa configurada.</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-4xl font-black text-violet-500">{kpis.withoutPromo.count}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendente</span>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {noPromoList.map(store => (
                                <StoreMiniCard key={`no-promo-${store.estab_id || store.estabelecimento}`} store={store} type="promo" />
                            ))}
                            {noPromoList.length === 0 && <EmptyState message="Todos os parceiros têm promoções!" />}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 size-40 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors" />

                        <div className="flex items-start justify-between mb-8">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Oportunidade de Cupom</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Parceiros sem cupons ativos para atração de clientes.</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-4xl font-black text-amber-500">{kpis.withoutCupom.count}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendente</span>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {noCupomList.map(store => (
                                <StoreMiniCard key={`no-cupom-${store.estab_id || store.estabelecimento}`} store={store} type="cupom" />
                            ))}
                            {noCupomList.length === 0 && <EmptyState message="Todos os parceiros têm cupons!" />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KPICard({ title, value, subtitle, icon, color, trend }: { title: string; value: string; subtitle: string; icon: string; color: 'emerald' | 'blue' | 'violet' | 'amber'; trend: string }) {
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
                    <span className="material-symbols-outlined">{icon}</span>
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

function StoreMiniCard({ store, type }: { store: EnrichedPerformanceRow; type: 'promo' | 'cupom' }) {
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
                <div className={`absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-slate-50 dark:border-slate-900 flex items-center justify-center ${type === 'promo' ? 'bg-violet-500' : 'bg-amber-500'}`}>
                    <span className="material-symbols-outlined text-[8px] text-white font-black">
                        {type === 'promo' ? 'percent' : 'confirmation_number'}
                    </span>
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
                    {store[type === 'promo' ? 'promo_status' : 'cupom_status']}
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


