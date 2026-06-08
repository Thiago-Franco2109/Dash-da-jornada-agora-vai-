import { useState, useMemo } from 'react';
import { type EnrichedPerformanceRow } from '../utils/calculations';
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

interface ContactsViewProps {
    data: EnrichedPerformanceRow[];
    onRowClick: (row: EnrichedPerformanceRow) => void;
}

export default function ContactsView({ data, onRowClick }: ContactsViewProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'dias_desde_lancamento', direction: 'desc' });
    const [managerFilter, setManagerFilter] = useState<string>('');

    // Filter partners that hit exactly 7, 14, 21 or 28 days today
    const contactsToday = useMemo(() => {
        return data.filter(row => {
            const d = row.dias_desde_lancamento;
            return d === 7 || d === 14 || d === 21 || d === 28;
        });
    }, [data]);

    const managers = useMemo(() => {
        const unique = new Set(contactsToday.map(r => r.analista || 'Sem gestor'));
        return Array.from(unique).sort();
    }, [contactsToday]);

    const filteredAndSortedData = useMemo(() => {
        let result = [...contactsToday];
        
        if (managerFilter) {
            result = result.filter(r => (r.analista || 'Sem gestor') === managerFilter);
        }

        result.sort((a: any, b: any) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            let aVal = a[key];
            let bVal = b[key];
            
            if (key === 'desempenho' && typeof aVal === 'string') {
                aVal = parseFloat(aVal.replace('%', ''));
                bVal = parseFloat(bVal.replace('%', ''));
            }

            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [contactsToday, managerFilter, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getStageColor = (days: number) => {
        if (days === 7) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        if (days === 14) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        if (days === 21) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        if (days === 28) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    };

    const getPriorityDisplay = (stars: number) => {
        if (stars >= 4) return { label: 'Alta', color: 'text-red-600 dark:text-red-400', icon: 'priority_high' };
        if (stars === 3) return { label: 'Média', color: 'text-amber-600 dark:text-amber-400', icon: 'remove' };
        return { label: 'Baixa', color: 'text-emerald-600 dark:text-emerald-400', icon: 'arrow_downward' };
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-8">
            {/* Header & Utility Bar */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Lojas para Contatar Hoje</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Exibindo somente parceiros com contato agendado para hoje (D7, D14, D21, D28)</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select 
                            value={managerFilter}
                            onChange={(e) => setManagerFilter(e.target.value)}
                            className="appearance-none h-10 pl-4 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none cursor-pointer"
                        >
                            <option value="">Filtrar por Responsável</option>
                            {managers.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                    </div>
                </div>
            </div>

            {/* Data Table Container */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                {contactsToday.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="size-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600">done_all</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Nenhum contato pendente</h3>
                        <p className="text-slate-500 text-sm">Nenhuma loja completa 7, 14, 21 ou 28 dias hoje.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => requestSort('estabelecimento')}>
                                        Nome do Parceiro {sortConfig?.key === 'estabelecimento' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => requestSort('cidade')}>
                                        Cidade {sortConfig?.key === 'cidade' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => requestSort('analista')}>
                                        Responsável {sortConfig?.key === 'analista' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => requestSort('dias_desde_lancamento')}>
                                        Estágio {sortConfig?.key === 'dias_desde_lancamento' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => requestSort('priority_stars')}>
                                        Prioridade {sortConfig?.key === 'priority_stars' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">
                                        Ação
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {filteredAndSortedData.map(row => {
                                    const priority = getPriorityDisplay(row.priority_stars || 0);
                                    const isCritical = row.dias_desde_lancamento === 7;
                                    
                                    return (
                                        <tr key={`${row.estabelecimento}-${row.cidade}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group ${isCritical ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    {row.logo_url ? (
                                                        <img src={row.logo_url} alt={row.estabelecimento} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm object-cover" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-sm">
                                                            {row.estabelecimento.substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.estabelecimento}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">{row.cidade}</td>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                                        <span className="material-symbols-outlined text-[14px] text-slate-500">person</span>
                                                    </div>
                                                    <span className="text-sm text-slate-900 dark:text-slate-200">{row.analista || 'Sem gestor'}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${getStageColor(row.dias_desde_lancamento)}`}>
                                                    D{row.dias_desde_lancamento}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className={`flex items-center gap-1.5 ${priority.color}`}>
                                                    <span className="material-symbols-outlined text-[16px]">{priority.icon}</span>
                                                    <span className="text-sm font-semibold">{priority.label}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <button 
                                                    onClick={() => onRowClick(row)}
                                                    className="text-sm font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 px-4 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Abrir
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
