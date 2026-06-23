import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { GatewaySheetTable } from '../types/gatewaySheet';

interface GatewaySheetViewProps {
    title: string;
    description: string;
    sheetId: string;
    tabName: string;
    table: GatewaySheetTable;
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
}

function formatCell(value: unknown): string {
    if (value == null || value === '') return '—';
    if (typeof value === 'number') return value.toLocaleString('pt-BR');
    return String(value);
}

export default function GatewaySheetView({
    title,
    description,
    sheetId,
    tabName,
    table,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
}: GatewaySheetViewProps) {
    const [search, setSearch] = useState('');

    const columns = useMemo(() => {
        if (table.headers.length > 0) return table.headers;
        const first = table.rows[0];
        return first ? Object.keys(first) : [];
    }, [table]);

    const filteredRows = useMemo(() => {
        if (!search.trim()) return table.rows;
        const q = search.toLowerCase();
        return table.rows.filter(row =>
            columns.some(col => String(row[col] ?? '').toLowerCase().includes(q)),
        );
    }, [table.rows, columns, search]);

    const apiPath = `/api/sheets/${sheetId}/${encodeURIComponent(tabName)}`;

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            {title}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">{description}</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-2 truncate" title={apiPath}>
                            API: {apiPath}
                        </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isLoading || isRefreshing}
                            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-lg ${isLoading || isRefreshing ? 'animate-spin text-primary' : ''}`}>
                                sync
                            </span>
                            {isLoading || isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
                        </button>
                        {lastSyncTime && (
                            <p className="text-xs text-slate-400 mt-2">
                                Última atualização: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        )}
                    </div>
                </div>

                {isUsingCache && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                        Exibindo cache local — não foi possível sincronizar agora.
                    </div>
                )}
                {error && !isUsingCache && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}
            </div>

            <div className="shrink-0 px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center bg-slate-50/50 dark:bg-slate-900/50">
                <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
                    <span className="text-slate-500 font-medium">Buscar</span>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filtrar linhas..."
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    />
                </label>
                <span className="text-xs text-slate-400">
                    {filteredRows.length} linha{filteredRows.length !== 1 ? 's' : ''} · {columns.length} coluna{columns.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
                {isLoading && table.rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                        <p className="text-slate-500 text-sm">Carregando {tabName}...</p>
                    </div>
                ) : columns.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-12">
                        Nenhuma coluna encontrada. Verifique se a aba <strong>{tabName}</strong> tem cabeçalhos na linha 1.
                    </p>
                ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm min-w-max">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    {columns.map(col => (
                                        <th
                                            key={col}
                                            scope="col"
                                            className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap"
                                        >
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {filteredRows.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        {columns.map(col => (
                                            <td
                                                key={col}
                                                className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap"
                                            >
                                                {formatCell(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredRows.length === 0 && !isLoading && (
                            <p className="p-8 text-center text-sm text-slate-500">Nenhum dado para os filtros atuais.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
