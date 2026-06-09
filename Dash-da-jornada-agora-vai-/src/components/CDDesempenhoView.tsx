import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { calcularMRRMetrics, formatarMoedaBRL } from '../config/cdContracts';
import FilterToolbar from './FilterToolbar';
import PerformanceTable, { type SortConfig } from './PerformanceTable';
import type { EnrichedPerformanceRow } from '../utils/calculations';

interface CDDesempenhoViewProps {
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
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado') => void;
}

export default function CDDesempenhoView({
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
}: CDDesempenhoViewProps) {
    const filteredData = useMemo(() => {
        let rows = data.filter(row => {
            if (cityFilter && row.cidade !== cityFilter) return false;
            if (searchQuery && !row.estabelecimento.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (priorityFilter && (row.risco_churn ?? row.priority_stars).toString() !== priorityFilter) return false;
            if (managerFilter && row.analista !== managerFilter) return false;
            return true;
        });

        if (sortConfig) {
            rows = [...rows].sort((a, b) => {
                const { key, direction } = sortConfig;
                let aVal: unknown = a[key as keyof EnrichedPerformanceRow];
                let bVal: unknown = b[key as keyof EnrichedPerformanceRow];

                if (key === 'lancamento') {
                    const parseDate = (v: string) => {
                        const [d, m, y] = v.split('/');
                        return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
                    };
                    aVal = parseDate(aVal as string);
                    bVal = parseDate(bVal as string);
                } else if (key === 'tendencia_pedidos') {
                    const order: Record<string, number> = { queda: 0, estavel: 1, alta: 2 };
                    aVal = order[String(a.tendencia_pedidos || 'estavel')];
                    bVal = order[String(b.tendencia_pedidos || 'estavel')];
                } else if (key === 'risco_churn') {
                    aVal = a.risco_churn ?? a.priority_stars;
                    bVal = b.risco_churn ?? b.priority_stars;
                } else if (key === 'desempenho' && typeof aVal === 'string') {
                    aVal = parseFloat((aVal as string).replace('%', '').replace(',', '.')) || 0;
                    bVal = parseFloat((bVal as string).replace('%', '').replace(',', '.')) || 0;
                } else if (key === 'mrr_em_risco') {
                    aVal = a.mrr_em_risco ? 1 : 0;
                    bVal = b.mrr_em_risco ? 1 : 0;
                } else if (key === 'valor_contrato' || key === 'pedidos_por_dia') {
                    aVal = (aVal as number) ?? -1;
                    bVal = (bVal as number) ?? -1;
                }

                if (aVal! < bVal!) return direction === 'asc' ? -1 : 1;
                if (aVal! > bVal!) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return rows;
    }, [data, cityFilter, searchQuery, priorityFilter, managerFilter, sortConfig]);

    const uniqueCities = useMemo(
        () => Array.from(new Set(data.map(r => r.cidade).filter(Boolean))).sort(),
        [data],
    );
    const uniqueManagers = useMemo(
        () => Array.from(new Set(data.map(r => r.analista || 'Desconhecido'))).filter(m => m !== 'Desconhecido').sort(),
        [data],
    );

    const mrrMetrics = useMemo(() => calcularMRRMetrics(filteredData), [filteredData]);

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900 xl:border-r border-slate-200 dark:border-slate-700">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Desempenho de Todas as Lojas
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base font-normal">
                            Acompanhe pedidos semanais e identifique lojas em risco de churn para agir antes da perda do parceiro.
                        </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <button
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
                            <p className="text-sm opacity-90">Mostrando as últimas informações salvas localmente da aba de desempenho.</p>
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
                            <p className="text-sm font-semibold">
                                {isUsingCache && data.length > 0 ? 'Não foi possível atualizar agora' : 'Erro ao carregar dados'}
                            </p>
                            <p className="text-sm opacity-90">{error}</p>
                            {isUsingCache && data.length > 0 && (
                                <p className="text-xs mt-1 opacity-80">Exibindo a última versão salva localmente.</p>
                            )}
                        </div>
                    </div>
                )}

                {data.length > 0 && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">MRR total</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{formatarMoedaBRL(mrrMetrics.mrrTotal)}</p>
                            <p className="text-xs text-slate-400 mt-1">{mrrMetrics.contratosAtivos} contratos ativos no cadastro</p>
                        </div>
                        <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">MRR em risco</p>
                            <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{formatarMoedaBRL(mrrMetrics.mrrEmRisco)}</p>
                            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                                {mrrMetrics.lojasEmRisco} lojas com &lt; 1 pedido/dia
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">% MRR em risco</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{mrrMetrics.mrrEmRiscoPct.toFixed(1)}%</p>
                            <p className="text-xs text-slate-400 mt-1">sobre lojas com contrato na planilha</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lojas c/ contrato</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{mrrMetrics.lojasComContrato}</p>
                            <p className="text-xs text-slate-400 mt-1">casadas com o cadastro de contratos</p>
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
                    <strong className="text-slate-700 dark:text-slate-200">{filteredData.length}</strong> lojas exibidas
                </span>
            </div>

            {isLoading && data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
                    <p className="text-slate-500 font-medium">Carregando desempenho das lojas...</p>
                    <p className="text-slate-400 text-sm mt-2 text-center max-w-md">
                        Lendo aba &quot;CD_TODOS_DESEMPENHO&quot; via Bigou API…
                    </p>
                </div>
            ) : data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px] gap-4">
                    <span className="material-symbols-outlined text-5xl text-slate-300">storefront</span>
                    <p className="text-slate-600 dark:text-slate-300 font-medium text-center max-w-lg">
                        {error
                            ? error
                            : 'Nenhuma loja carregada. Verifique se a aba CD_TODOS_DESEMPENHO tem cabeçalhos na linha 1 (Cidade, ID, Estabelecimento, Status, Week_1…Week_4).'}
                    </p>
                    <button
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
                        variant="desempenho"
                    />
                </div>
            )}
        </div>
    );
}
