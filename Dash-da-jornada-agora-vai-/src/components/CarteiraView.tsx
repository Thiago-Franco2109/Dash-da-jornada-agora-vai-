import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CarteiraRow } from '../types/carteira';
import { cityBelongsToManager, type Manager } from '../config/managerMapping';

interface CarteiraViewProps {
    rows: CarteiraRow[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
}

function pctCellClass(pct: number): string {
    if (pct >= 70) return 'bg-emerald-600 text-white font-semibold';
    if (pct >= 55) return 'bg-emerald-400 text-emerald-950 font-semibold';
    if (pct >= 45) return 'bg-lime-200 text-lime-950';
    if (pct >= 30) return 'bg-amber-100 text-amber-900';
    return 'bg-red-100 text-red-800';
}

const COLUMNS: { key: keyof CarteiraRow; label: string; align: 'left' | 'center'; isPct?: boolean }[] = [
    { key: 'divisao', label: 'Divisão', align: 'left' },
    { key: 'cidade', label: 'Cidade', align: 'left' },
    { key: 'grupo', label: 'Grupo', align: 'left' },
    { key: 'total', label: 'Total', align: 'center' },
    { key: 'ativos', label: 'Ativos', align: 'center' },
    { key: 'suspenso', label: 'Suspenso', align: 'center' },
    { key: 'pendente', label: 'Pendente', align: 'center' },
    { key: 'pctComPromo', label: '% com promo', align: 'center', isPct: true },
    { key: 'promoAprovada', label: 'Promo aprovada', align: 'center' },
    { key: 'semPromo', label: 'Sem promo', align: 'center' },
    { key: 'pctComCupom', label: '% com cupom', align: 'center', isPct: true },
    { key: 'cupomAprovado', label: 'Cupom aprovado', align: 'center' },
    { key: 'semCupom', label: 'Sem cupom', align: 'center' },
];

export default function CarteiraView({
    rows,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
}: CarteiraViewProps) {
    const [grupoFilter, setGrupoFilter] = useState('');
    const [cidadeFilter, setCidadeFilter] = useState('');

    const grupos = useMemo(
        () => Array.from(new Set(rows.map(r => r.grupo).filter(Boolean))).sort(),
        [rows],
    );

    const filteredRows = useMemo(() => {
        return rows.filter(row => {
            if (managerFilter && !cityBelongsToManager(row.cidade, managerFilter as Manager)) return false;
            if (grupoFilter && row.grupo !== grupoFilter) return false;
            if (cidadeFilter && !row.cidade.toLowerCase().includes(cidadeFilter.toLowerCase())) return false;
            return true;
        });
    }, [rows, grupoFilter, cidadeFilter, managerFilter]);

    const totals = useMemo(() => {
        return filteredRows.reduce(
            (acc, row) => ({
                total: acc.total + row.total,
                ativos: acc.ativos + row.ativos,
                suspenso: acc.suspenso + row.suspenso,
                pendente: acc.pendente + row.pendente,
                promoAprovada: acc.promoAprovada + row.promoAprovada,
                semPromo: acc.semPromo + row.semPromo,
                cupomAprovado: acc.cupomAprovado + row.cupomAprovado,
                semCupom: acc.semCupom + row.semCupom,
            }),
            {
                total: 0,
                ativos: 0,
                suspenso: 0,
                pendente: 0,
                promoAprovada: 0,
                semPromo: 0,
                cupomAprovado: 0,
                semCupom: 0,
            },
        );
    }, [filteredRows]);

    const renderCell = (row: CarteiraRow, key: keyof CarteiraRow, isPct?: boolean) => {
        const value = row[key];
        if (isPct && typeof value === 'number') {
            return (
                <td key={String(key)} className={`px-2 py-2 text-center text-sm ${pctCellClass(value)}`}>
                    {value}%
                </td>
            );
        }
        return (
            <td
                key={String(key)}
                className={`px-2 py-2 text-sm text-slate-700 dark:text-slate-300 ${
                    key === 'divisao' || key === 'cidade' || key === 'grupo' ? 'text-left whitespace-nowrap' : 'text-center'
                }`}
            >
                {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
            </td>
        );
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Carteira
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">
                            Visão por cidade e grupo — aba <strong>CIDADES</strong> via Bigou Gateway.
                        </p>
                        {managerFilter && (
                            <p className="text-xs text-primary font-semibold mt-1">
                                Filtrando carteira de {managerFilter}
                            </p>
                        )}
                        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                            Na planilha, os cabeçalhos (DIVISÃO, CIDADE, GRUPO, TOTAL…) devem estar na <strong>linha 1</strong> da aba.
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
                <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 font-medium">Grupo</span>
                    <select
                        value={grupoFilter}
                        onChange={e => setGrupoFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    >
                        <option value="">Todos</option>
                        {grupos.map(g => (
                            <option key={g} value={g}>{g}</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
                    <span className="text-slate-500 font-medium">Cidade</span>
                    <input
                        type="search"
                        value={cidadeFilter}
                        onChange={e => setCidadeFilter(e.target.value)}
                        placeholder="Filtrar cidade..."
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    />
                </label>
                <span className="text-xs text-slate-400 ml-auto">
                    {filteredRows.length} linha{filteredRows.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
                {isLoading && rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                        <p className="text-slate-500 text-sm">Carregando carteira...</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm min-w-max">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    {COLUMNS.map(col => (
                                        <th
                                            key={col.key}
                                            scope="col"
                                            className={`px-2 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${
                                                col.align === 'left' ? 'text-left' : 'text-center'
                                            }`}
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {filteredRows.map(row => (
                                    <tr key={`${row.cidade}-${row.grupo}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        {COLUMNS.map(col => renderCell(row, col.key, col.isPct))}
                                    </tr>
                                ))}
                            </tbody>
                            {filteredRows.length > 0 && (
                                <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-600">
                                    <tr className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                        <td colSpan={3} className="px-2 py-3 text-left">
                                            Total ({filteredRows.length} grupos)
                                        </td>
                                        <td className="px-2 py-3 text-center">{totals.total.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.ativos.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.suspenso.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.pendente.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{totals.promoAprovada.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.semPromo.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{totals.cupomAprovado.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.semCupom.toLocaleString('pt-BR')}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                        {filteredRows.length === 0 && !isLoading && (
                            <p className="p-8 text-center text-sm text-slate-500">Nenhum dado encontrado para os filtros atuais.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
