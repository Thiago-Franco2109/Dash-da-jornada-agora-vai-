import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import FilterToolbar from './FilterToolbar';
import PerformanceTable, { type SortConfig } from './PerformanceTable';
import type { StatusOverrideField, PromoStatus } from '../hooks/useStatusOverride';
import type { EnrichedPerformanceRow } from '../utils/calculations';

interface AllPartnersViewProps {
    data: EnrichedPerformanceRow[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    searchQuery: string;
    cityFilter: string;
    setCityFilter: (v: string) => void;
    priorityFilter: string;
    setPriorityFilter: (v: string) => void;
    managerFilter: string;
    setManagerFilter: (v: string) => void;
    sortConfig: SortConfig;
    requestSort: (key: string) => void;
    onRowClick: (row: EnrichedPerformanceRow) => void;
    onStatusChange?: (partnerId: string, field: StatusOverrideField, newStatus: PromoStatus) => void;
    /** journey = colunas da jornada; desempenho = semanas estendidas; indicador = INDICADOR_FORMATADO */
    tableVariant?: 'journey' | 'desempenho' | 'indicador';
    dataSourceLabel?: string;
    pedidosMesHeader?: string;
}

export default function AllPartnersView({
    data,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    searchQuery,
    cityFilter,
    setCityFilter,
    priorityFilter,
    setPriorityFilter,
    managerFilter,
    setManagerFilter,
    sortConfig,
    requestSort,
    onRowClick,
    onStatusChange,
    tableVariant = 'indicador',
    dataSourceLabel = 'INDICADOR_FORMATADO',
    pedidosMesHeader,
}: AllPartnersViewProps) {
    const filteredData = data.filter(row => {
        if (cityFilter && row.cidade !== cityFilter) return false;
        if (searchQuery && !row.estabelecimento.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        const priority = tableVariant === 'indicador' || tableVariant === 'desempenho'
            ? (row.risco_churn ?? row.priority_stars)
            : row.priority_stars;
        if (priorityFilter && priority.toString() !== priorityFilter) return false;
        if (managerFilter && row.analista !== managerFilter) return false;
        return true;
    }).sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let aVal: unknown = a[key as keyof typeof a];
        let bVal: unknown = b[key as keyof typeof b];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return direction === 'asc' ? 1 : -1;
        if (bVal == null) return direction === 'asc' ? -1 : 1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    const uniqueCities = Array.from(new Set(data.map(r => r.cidade).filter(Boolean))).sort();
    const uniqueManagers = Array.from(new Set(data.map(r => r.analista || 'Desconhecido'))).filter(m => m !== 'Desconhecido').sort();

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900 xl:border-r border-slate-200 dark:border-slate-700">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Todos os Parceiros
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base font-normal">
                            Lista completa da carteira ({dataSourceLabel}): somente lojas ativas — cidade, logo, relevância, status e pedidos mensais (col. G+).
                        </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isLoading || isRefreshing}
                            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className={`material-symbols-outlined text-lg ${(isLoading || isRefreshing) ? 'animate-spin text-primary' : ''}`}>sync</span>
                            {(isLoading || isRefreshing) ? 'Atualizando...' : 'Atualizar agora'}
                        </button>
                        {lastSyncTime && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-end gap-1">
                                Última atualização: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                        )}
                    </div>
                </div>

                {isUsingCache && (
                    <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-400">
                        <span className="material-symbols-outlined shrink-0 text-amber-600 dark:text-amber-500">cloud_off</span>
                        <div>
                            <p className="text-sm font-semibold">Usando dados em cache</p>
                            <p className="text-sm opacity-90">Exibindo a última versão salva localmente.</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className={`mt-4 flex items-start gap-3 p-3 rounded-lg ${isUsingCache && data.length > 0
                        ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-400'
                        : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-400'
                    }`}>
                        <span className="material-symbols-outlined shrink-0">{isUsingCache && data.length > 0 ? 'warning' : 'error'}</span>
                        <div>
                            <p className="text-sm font-semibold">{isUsingCache && data.length > 0 ? 'Não foi possível atualizar agora' : 'Erro ao carregar dados'}</p>
                            <p className="text-sm opacity-90">{error}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="shrink-0">
                <FilterToolbar
                    cityFilter={cityFilter}
                    setCityFilter={setCityFilter}
                    cities={uniqueCities}
                    priorityFilter={priorityFilter}
                    setPriorityFilter={setPriorityFilter}
                    managerFilter={managerFilter}
                    setManagerFilter={setManagerFilter}
                    managers={uniqueManagers}
                />
            </div>

            <div className="shrink-0 px-6 py-3 bg-slate-50/30 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-200">{filteredData.length}</strong> parceiros exibidos
                    {data.length > 0 && filteredData.length !== data.length && (
                        <span className="text-slate-400"> · {data.length} no total</span>
                    )}
                </span>
            </div>

            {isLoading && data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
                    <p className="text-slate-500 font-medium">Carregando todos os parceiros...</p>
                </div>
            ) : data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px] gap-4">
                    <span className="material-symbols-outlined text-5xl text-slate-300">groups</span>
                    <p className="text-slate-600 dark:text-slate-300 font-medium text-center max-w-lg">
                        {error || `Nenhum parceiro carregado. Verifique a aba ${dataSourceLabel} na planilha.`}
                    </p>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="flex items-center gap-2 bg-primary text-white font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                    >
                        <span className="material-symbols-outlined text-lg">refresh</span>
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                    <PerformanceTable
                        data={filteredData}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        onRowClick={onRowClick}
                        onStatusChange={onStatusChange}
                        variant={tableVariant}
                        pedidosMesHeader={pedidosMesHeader}
                    />
                </div>
            )}
        </div>
    );
}
