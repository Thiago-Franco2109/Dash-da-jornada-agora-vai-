import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CarteiraRow } from '../types/carteira';
import { cityBelongsToManager, type Manager } from '../config/managerMapping';
import { getInitialGrupo } from '../config/carteiraGrupoMapping';
import { useCarteiraClassificacao } from '../hooks/useCarteiraClassificacao';
import { pctCellClass, CARTEIRA_COLUMNS } from '../utils/carteiraColumns';

interface CarteiraPorGrupoViewProps {
    rows: CarteiraRow[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
}

const SEM_GRUPO = 'Sem grupo';

function renderCell(row: CarteiraRow, key: keyof CarteiraRow, isPct?: boolean) {
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
                key === 'cidade' ? 'text-left whitespace-nowrap' : 'text-center'
            }`}
        >
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </td>
    );
}

export default function CarteiraPorGrupoView({
    rows,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
}: CarteiraPorGrupoViewProps) {
    const [cidadeFilter, setCidadeFilter] = useState('');

    // Mesma classificação (Supabase) usada na Carteira — aqui é só leitura.
    const { mapa: classificacao } = useCarteiraClassificacao();

    const rowsClassificadas = useMemo(
        () => rows.map(row => ({
            ...row,
            divisao: classificacao[row.cidade]?.divisao || row.divisao,
            grupo: classificacao[row.cidade]?.grupo || row.grupo || getInitialGrupo(row.cidade),
        })),
        [rows, classificacao],
    );

    const filteredRows = useMemo(() => {
        return rowsClassificadas.filter(row => {
            if (managerFilter && !cityBelongsToManager(row.cidade, managerFilter as Manager)) return false;
            if (cidadeFilter && !row.cidade.toLowerCase().includes(cidadeFilter.toLowerCase())) return false;
            return true;
        });
    }, [rowsClassificadas, cidadeFilter, managerFilter]);

    const groups = useMemo(() => {
        const byGrupo = new Map<string, CarteiraRow[]>();
        for (const row of filteredRows) {
            const grupo = row.grupo || SEM_GRUPO;
            if (!byGrupo.has(grupo)) byGrupo.set(grupo, []);
            byGrupo.get(grupo)!.push(row);
        }
        return Array.from(byGrupo.entries())
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
            .map(([grupo, groupRows]) => ({
                grupo,
                rows: [...groupRows].sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR')),
                totals: groupRows.reduce(
                    (acc, row) => ({
                        total: acc.total + row.total,
                        ativos: acc.ativos + row.ativos,
                        suspenso: acc.suspenso + row.suspenso,
                        pendente: acc.pendente + row.pendente,
                    }),
                    { total: 0, ativos: 0, suspenso: 0, pendente: 0 },
                ),
            }));
    }, [filteredRows]);

    const grandTotals = useMemo(() => {
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

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Carteira por Grupo
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">
                            Níveis de ativação da carteira, agrupados por grupo comercial.
                        </p>
                        {managerFilter && (
                            <p className="text-xs text-primary font-semibold mt-1">
                                Filtrando carteira de {managerFilter}
                            </p>
                        )}
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
                    {groups.length} grupo{groups.length !== 1 ? 's' : ''} · {filteredRows.length} cidade{filteredRows.length !== 1 ? 's' : ''}
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
                                    {CARTEIRA_COLUMNS.map(col => (
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
                                {groups.map((group, groupIndex) => (
                                    <Fragment key={group.grupo}>
                                        <tr className="bg-slate-50 dark:bg-slate-800/60">
                                            <td colSpan={CARTEIRA_COLUMNS.length} className="px-2 py-2 text-left text-sm font-bold text-slate-700 dark:text-slate-200">
                                                {group.grupo}
                                                <span className="ml-2 font-normal text-xs text-slate-400">
                                                    {group.rows.length} cidade{group.rows.length !== 1 ? 's' : ''} · {group.totals.ativos.toLocaleString('pt-BR')}/{group.totals.total.toLocaleString('pt-BR')} ativos
                                                </span>
                                            </td>
                                        </tr>
                                        {group.rows.map(row => (
                                            <tr key={`${row.cidade}-${row.grupo}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                {CARTEIRA_COLUMNS.map(col => renderCell(row, col.key, col.isPct))}
                                            </tr>
                                        ))}
                                        {groupIndex < groups.length - 1 && (
                                            <tr aria-hidden="true">
                                                <td colSpan={CARTEIRA_COLUMNS.length} className="h-3 bg-transparent border-none p-0" />
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                            {filteredRows.length > 0 && (
                                <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-600">
                                    <tr className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                        <td colSpan={3} className="px-2 py-3 text-left">
                                            Total ({filteredRows.length} cidades)
                                        </td>
                                        <td className="px-2 py-3 text-center">{grandTotals.total.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.ativos.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.suspenso.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.pendente.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.promoAprovada.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.semPromo.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.cupomAprovado.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{grandTotals.semCupom.toLocaleString('pt-BR')}</td>
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
