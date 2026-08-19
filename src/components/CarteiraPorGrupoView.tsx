import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CarteiraEstabelecimento, CarteiraMetrica, CarteiraRow } from '../types/carteira';
import { cityBelongsToManager, type Manager } from '../config/managerMapping';
import { getInitialGrupo } from '../config/carteiraGrupoMapping';
import { useCarteiraClassificacao } from '../hooks/useCarteiraClassificacao';
import { fetchCarteiraDrillDown } from '../hooks/useCarteiraData';
import { pctCellClass, CARTEIRA_COLUMNS } from '../utils/carteiraColumns';
import EstablishmentDrillDownModal from './EstablishmentDrillDownModal';

interface CarteiraPorGrupoViewProps {
    rows: CarteiraRow[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
    /** Abre a tela interna do parceiro (mesma navegação da busca Cmd+K). */
    onNavigateToPartner?: (estabelecimento: CarteiraEstabelecimento) => void;
}

const SEM_GRUPO = 'Sem grupo';

type SortDirection = 'asc' | 'desc';
interface SortState {
    key: keyof CarteiraRow;
    direction: SortDirection;
}

function compareRows(a: CarteiraRow, b: CarteiraRow, key: keyof CarteiraRow): number {
    const aVal = a[key];
    const bVal = b[key];
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
    return String(aVal ?? '').localeCompare(String(bVal ?? ''), 'pt-BR');
}

function renderCell(
    row: CarteiraRow,
    col: (typeof CARTEIRA_COLUMNS)[number],
    isLastCol: boolean,
    onDrillDown: (cidade: string, metrica: CarteiraMetrica, label: string) => void,
) {
    const { key, isPct, metrica, label } = col;
    const value = row[key];
    const borderClass = isLastCol ? '' : 'border-r border-slate-100 dark:border-slate-800';

    if (isPct && typeof value === 'number') {
        return (
            <td key={String(key)} className={`px-2 py-1.5 text-center text-xs ${borderClass} ${pctCellClass(value)}`}>
                {value}%
            </td>
        );
    }

    if (metrica && typeof value === 'number') {
        return (
            <td key={String(key)} className={`px-2 py-1.5 text-center ${borderClass}`}>
                <button
                    type="button"
                    onClick={() => onDrillDown(row.cidade, metrica, label)}
                    disabled={value === 0}
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums px-1.5 py-0.5 rounded hover:bg-primary/10 hover:text-primary disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                >
                    {value.toLocaleString('pt-BR')}
                </button>
            </td>
        );
    }

    return (
        <td
            key={String(key)}
            className={`px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 ${borderClass} ${
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
    onNavigateToPartner,
}: CarteiraPorGrupoViewProps) {
    const [sort, setSort] = useState<SortState>({ key: 'cidade', direction: 'asc' });
    const [drillDown, setDrillDown] = useState<{ cidade: string; metrica: CarteiraMetrica; label: string } | null>(null);
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
    }, [rowsClassificadas, managerFilter, cidadeFilter]);

    const requestSort = (key: keyof CarteiraRow) => {
        setSort(prev => (prev.key === key && prev.direction === 'asc'
            ? { key, direction: 'desc' }
            : { key, direction: 'asc' }));
    };

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
                rows: [...groupRows].sort((a, b) => {
                    const cmp = compareRows(a, b, sort.key);
                    return sort.direction === 'asc' ? cmp : -cmp;
                }),
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
    }, [filteredRows, sort]);

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
                            Cidades
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

            <div className="shrink-0 px-6 py-2 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px] max-w-xs">
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
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
                    <div className="border border-slate-300 dark:border-slate-700 overflow-hidden min-w-max">
                        <table className="min-w-full border-collapse">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    {CARTEIRA_COLUMNS.map((col, i) => {
                                        const active = sort.key === col.key;
                                        return (
                                            <th
                                                key={col.key}
                                                scope="col"
                                                onClick={() => requestSort(col.key)}
                                                className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 border-b cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors ${
                                                    i < CARTEIRA_COLUMNS.length - 1 ? 'border-r' : ''
                                                } ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                                            >
                                                <span className="inline-flex items-center gap-0.5">
                                                    {col.label}
                                                    <span className={`material-symbols-outlined text-[13px] ${active ? 'opacity-100 text-primary' : 'opacity-30'}`}>
                                                        {active && sort.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                                                    </span>
                                                </span>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-slate-900">
                                {groups.map((group, groupIndex) => (
                                    <Fragment key={group.grupo}>
                                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-t border-b border-slate-300 dark:border-slate-600">
                                            <td colSpan={CARTEIRA_COLUMNS.length} className="px-2 py-1.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200">
                                                {group.grupo}
                                                <span className="ml-2 font-normal text-[11px] text-slate-400">
                                                    {group.rows.length} cidade{group.rows.length !== 1 ? 's' : ''} · {group.totals.ativos.toLocaleString('pt-BR')}/{group.totals.total.toLocaleString('pt-BR')} ativos
                                                </span>
                                            </td>
                                        </tr>
                                        {group.rows.map(row => (
                                            <tr
                                                key={`${row.cidade}-${row.grupo}`}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"
                                            >
                                                {CARTEIRA_COLUMNS.map((col, i) => renderCell(
                                                    row,
                                                    col,
                                                    i === CARTEIRA_COLUMNS.length - 1,
                                                    (cidade, metrica, label) => setDrillDown({ cidade, metrica, label }),
                                                ))}
                                            </tr>
                                        ))}
                                        {groupIndex < groups.length - 1 && (
                                            <tr aria-hidden="true">
                                                <td colSpan={CARTEIRA_COLUMNS.length} className="h-2 bg-transparent border-none p-0" />
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                            {filteredRows.length > 0 && (
                                <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-300 dark:border-slate-600">
                                    <tr className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                        <td colSpan={3} className="px-2 py-2 text-left border-r border-slate-200 dark:border-slate-700">
                                            Total ({filteredRows.length} cidades)
                                        </td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.total.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.ativos.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.suspenso.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.pendente.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center text-slate-400 border-r border-slate-200 dark:border-slate-700">—</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.promoAprovada.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.semPromo.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center text-slate-400 border-r border-slate-200 dark:border-slate-700">—</td>
                                        <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-700">{grandTotals.cupomAprovado.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-2 text-center">{grandTotals.semCupom.toLocaleString('pt-BR')}</td>
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

            {drillDown && (
                <EstablishmentDrillDownModal
                    title={`${drillDown.label} - ${drillDown.cidade}`}
                    fetchList={() => fetchCarteiraDrillDown(drillDown.cidade, drillDown.metrica)}
                    onNavigateToPartner={onNavigateToPartner}
                    onClose={() => setDrillDown(null)}
                />
            )}
        </div>
    );
}
