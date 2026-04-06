
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

    // specific lists for the report
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

    const stats = useMemo(() => {
        return {
            total: filteredData.length,
            noPromo: noPromoList.length,
            noCupom: noCupomList.length
        };
    }, [filteredData, noPromoList, noCupomList]);

    const uniqueManagers = Array.from(new Set(data.map(d => d.analista))).filter(Boolean).sort();
    const uniqueCities = Array.from(new Set(data.map(d => d.cidade))).filter(Boolean).sort();

    return (
        <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
            
            {/* LARGE DASHBOARD STATS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 dark:bg-black p-6 rounded-[2rem] border border-slate-800 shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="material-symbols-outlined text-8xl">storefront</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Total de Lojas</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-5xl font-black text-white">{stats.total}</h2>
                        <span className="text-slate-500 font-bold text-lg">onboarding</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-4 border-violet-500/10 shadow-lg relative group">
                    <div className="absolute top-0 right-0 p-4 text-violet-500/10 group-hover:text-violet-500/20 transition-colors">
                        <span className="material-symbols-outlined text-7xl font-light">percent</span>
                    </div>
                    <p className="text-xs font-bold text-violet-500/60 uppercase tracking-[0.2em] mb-2">Sem Promoção</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-5xl font-black text-slate-900 dark:text-white">{stats.noPromo}</h2>
                        <span className="text-violet-500 font-bold text-lg">pendentes</span>
                    </div>
                    <div className="mt-4 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-violet-500 rounded-full" 
                            style={{ width: `${(stats.noPromo / stats.total) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-4 border-indigo-500/10 shadow-lg relative group">
                    <div className="absolute top-0 right-0 p-4 text-indigo-500/10 group-hover:text-indigo-500/20 transition-colors">
                        <span className="material-symbols-outlined text-7xl font-light">confirmation_number</span>
                    </div>
                    <p className="text-xs font-bold text-indigo-500/60 uppercase tracking-[0.2em] mb-2">Sem Cupom</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-5xl font-black text-slate-900 dark:text-white">{stats.noCupom}</h2>
                        <span className="text-indigo-500 font-bold text-lg">pendentes</span>
                    </div>
                    <div className="mt-4 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${(stats.noCupom / stats.total) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* FILTER TOOLBAR */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-[1.5rem] sticky top-[72px] z-10 backdrop-blur-md border border-white dark:border-slate-700">
                <div className="flex items-center gap-2 px-3 border-r border-slate-200 dark:border-slate-700 mr-2">
                    <span className="material-symbols-outlined text-slate-400">tune</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase">Filtros</span>
                </div>
                
                <select 
                    value={managerFilter}
                    onChange={(e) => setManagerFilter(e.target.value)}
                    className="text-xs font-bold px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 transition-all cursor-pointer"
                >
                    <option value="all">Todas os Gestores</option>
                    {uniqueManagers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <select 
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="text-xs font-bold px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 transition-all cursor-pointer"
                >
                    <option value="all">Todas as Cidades</option>
                    {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                { (managerFilter !== 'all' || cityFilter !== 'all') && (
                    <button 
                        onClick={() => { setManagerFilter('all'); setCityFilter('all'); }}
                        className="text-[10px] font-black text-violet-500 uppercase tracking-widest hover:text-violet-600 transition-colors"
                    >
                        Resetar Filtros
                    </button>
                )}
            </div>

            {/* TWO COLUMN GRID FOR LISTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                
                {/* LIST: NO PROMO */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-2">
                        <div className="size-8 bg-violet-500 text-white rounded-lg flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <span className="material-symbols-outlined text-sm">percent</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Sem Promoção Ativa</h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full ml-auto">
                            {noPromoList.length} lojas
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2">
                        {noPromoList.map(store => (
                            <div key={`promo-${store.estab_id || store.estabelecimento}`} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 hover:border-violet-500/30 hover:shadow-md transition-all active:scale-[0.98]">
                                <div className="shrink-0">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} alt={store.estabelecimento} className="size-10 rounded-xl object-cover border border-slate-100 dark:border-slate-700 shadow-sm" />
                                    ) : (
                                        <div className="size-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-100 dark:border-slate-700">
                                            <span className="material-symbols-outlined text-[20px]">store</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{store.estabelecimento}</h4>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight mt-0.5 italic">{store.cidade} • {store.analista}</p>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${store.dias_desde_lancamento > 15 ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>
                                        {store.dias_desde_lancamento} dias
                                    </span>
                                    {store.promo_status === 'aguardando' && (
                                        <span className="text-[9px] font-bold text-amber-500 mt-1 uppercase">Aguardando</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {noPromoList.length === 0 && (
                            <div className="py-20 text-center bg-slate-50 dark:bg-slate-800/20 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                                <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">verified</span>
                                <p className="text-sm font-bold text-slate-500">Nenhuma loja pendente de promoção!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* LIST: NO CUPOM */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-2">
                        <div className="size-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <span className="material-symbols-outlined text-sm">confirmation_number</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Sem Cupom Ativo</h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full ml-auto">
                            {noCupomList.length} lojas
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2">
                        {noCupomList.map(store => (
                            <div key={`cupom-${store.estab_id || store.estabelecimento}`} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 hover:border-indigo-500/30 hover:shadow-md transition-all active:scale-[0.98]">
                                <div className="shrink-0">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} alt={store.estabelecimento} className="size-10 rounded-xl object-cover border border-slate-100 dark:border-slate-700 shadow-sm" />
                                    ) : (
                                        <div className="size-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-100 dark:border-slate-700">
                                            <span className="material-symbols-outlined text-[20px]">store</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{store.estabelecimento}</h4>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight mt-0.5 italic">{store.cidade} • {store.analista}</p>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${store.dias_desde_lancamento > 15 ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>
                                        {store.dias_desde_lancamento} dias
                                    </span>
                                    {store.cupom_status === 'aguardando' && (
                                        <span className="text-[9px] font-bold text-amber-500 mt-1 uppercase">Aguardando</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {noCupomList.length === 0 && (
                            <div className="py-20 text-center bg-slate-50 dark:bg-slate-800/20 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                                <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">verified</span>
                                <p className="text-sm font-bold text-slate-500">Nenhuma loja pendente de cupom!</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}


