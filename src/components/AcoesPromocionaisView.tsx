import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { AcaoPromocionalCidade, AcaoPromocionalMetrica, AcoesPromocionaisTotais } from '../types/acoesPromocionais';
import { ACOES_PROMOCIONAIS_COLUMNS, metricCellClass } from '../utils/acoesPromocionaisColumns';
import AcaoPromocionalDrillDownModal from './AcaoPromocionalDrillDownModal';

interface AcoesPromocionaisViewProps {
    cidades: AcaoPromocionalCidade[];
    totais: AcoesPromocionaisTotais | null;
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    lastSyncTime: Date | null;
    onRefresh: () => void;
}

type SortDirection = 'asc' | 'desc';
interface SortState {
    key: keyof AcaoPromocionalCidade;
    direction: SortDirection;
}

function compareRows(a: AcaoPromocionalCidade, b: AcaoPromocionalCidade, key: keyof AcaoPromocionalCidade): number {
    const aVal = a[key];
    const bVal = b[key];
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
    return String(aVal ?? '').localeCompare(String(bVal ?? ''), 'pt-BR');
}

function normalizeSearch(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function KpiCard({ label, value, subtitle, icon, accent }: { label: string; value: string; subtitle?: string; icon: string; accent: string }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{label}</p>
                <div className={`p-1.5 rounded-md ${accent}`}>
                    <span className="material-symbols-outlined text-[20px]">{icon}</span>
                </div>
            </div>
            <p className="text-slate-900 dark:text-white text-3xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
    );
}

export default function AcoesPromocionaisView({
    cidades,
    totais,
    isLoading,
    isRefreshing = false,
    error,
    lastSyncTime,
    onRefresh,
}: AcoesPromocionaisViewProps) {
    const [cidadeFilter, setCidadeFilter] = useState('');
    const [sort, setSort] = useState<SortState>({ key: 'cidade', direction: 'asc' });
    const [drillDown, setDrillDown] = useState<{ cidade: string; metrica: AcaoPromocionalMetrica; label: string } | null>(null);

    const filteredCidades = useMemo(() => {
        const q = normalizeSearch(cidadeFilter);
        const rows = q ? cidades.filter(c => normalizeSearch(c.cidade).includes(q)) : cidades;
        return [...rows].sort((a, b) => {
            const cmp = compareRows(a, b, sort.key);
            return sort.direction === 'asc' ? cmp : -cmp;
        });
    }, [cidades, cidadeFilter, sort]);

    const requestSort = (key: keyof AcaoPromocionalCidade) => {
        setSort(prev => (prev.key === key && prev.direction === 'asc'
            ? { key, direction: 'desc' }
            : { key, direction: 'asc' }));
    };

    const pctCidadesComAcoes = totais && totais.totalCidades > 0
        ? Math.round((totais.cidadesComAcoes / totais.totalCidades) * 1000) / 10
        : 0;
    const pct = (parte: number, base: number) => (base > 0 ? Math.round((parte / base) * 1000) / 10 : 0);

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Ações Promocionais por Cidade
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">
                            Cobertura de promoções e cupons por localidade.
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

                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                {totais && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
                        <KpiCard
                            label="Cidades c/ Ações"
                            value={String(totais.cidadesComAcoes)}
                            subtitle={`${pctCidadesComAcoes}% de ${totais.totalCidades}`}
                            icon="location_city"
                            accent="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        />
                        <KpiCard
                            label="Lojas Ativas"
                            value={totais.lojasAtivas.toLocaleString('pt-BR')}
                            icon="storefront"
                            accent="bg-blue-50 dark:bg-blue-900/30 text-primary"
                        />
                        <KpiCard
                            label="Com Promoção"
                            value={totais.comPromocao.toLocaleString('pt-BR')}
                            subtitle={`${pct(totais.comPromocao, totais.lojasAtivas)}%`}
                            icon="campaign"
                            accent="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600"
                        />
                        <KpiCard
                            label="Cupom Destaque"
                            value={totais.cupomDestaque.toLocaleString('pt-BR')}
                            subtitle={`${pct(totais.cupomDestaque, totais.lojasAtivas)}%`}
                            icon="confirmation_number"
                            accent="bg-amber-50 dark:bg-amber-900/30 text-amber-600"
                        />
                        <KpiCard
                            label="Cupom Regular"
                            value={totais.cupomRegular.toLocaleString('pt-BR')}
                            subtitle={`${pct(totais.cupomRegular, totais.lojasAtivas)}%`}
                            icon="sell"
                            accent="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        />
                    </div>
                )}
            </div>

            <div className="shrink-0 px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center bg-slate-50/50 dark:bg-slate-900/50">
                <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
                    <input
                        type="search"
                        value={cidadeFilter}
                        onChange={e => setCidadeFilter(e.target.value)}
                        placeholder="Buscar localidade..."
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    />
                </label>
                <span className="text-xs text-slate-400 ml-auto">
                    {filteredCidades.length} cidade{filteredCidades.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
                {isLoading && cidades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                        <p className="text-slate-500 text-sm">Carregando ações promocionais...</p>
                    </div>
                ) : (
                    <div className="border border-slate-300 dark:border-slate-700 overflow-hidden min-w-max">
                        <table className="min-w-full border-collapse">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    {ACOES_PROMOCIONAIS_COLUMNS.map((col, i) => {
                                        const active = sort.key === col.key;
                                        return (
                                            <th
                                                key={col.key}
                                                scope="col"
                                                onClick={() => requestSort(col.key)}
                                                className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors ${
                                                    i < ACOES_PROMOCIONAIS_COLUMNS.length - 1 ? 'border-r' : ''
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
                                {filteredCidades.map((row, rowIndex) => (
                                    <tr
                                        key={row.cidade}
                                        className={`hover:bg-slate-50 dark:hover:bg-slate-900/20 ${
                                            rowIndex < filteredCidades.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''
                                        }`}
                                    >
                                        {ACOES_PROMOCIONAIS_COLUMNS.map((col, i) => {
                                            const borderClass = i < ACOES_PROMOCIONAIS_COLUMNS.length - 1 ? 'border-r border-slate-100 dark:border-slate-800' : '';
                                            if (col.key === 'cidade') {
                                                return (
                                                    <td key={col.key} className={`px-2 py-2 text-xs font-semibold text-slate-800 dark:text-white text-left whitespace-nowrap ${borderClass}`}>
                                                        {row.cidade}
                                                    </td>
                                                );
                                            }
                                            const value = row[col.key] as number;
                                            const pctValue = col.pctKey ? (row[col.pctKey] as number) : null;
                                            if (!col.metrica) {
                                                return (
                                                    <td key={col.key} className={`px-2 py-2 text-xs text-center text-slate-700 dark:text-slate-300 ${borderClass}`}>
                                                        {value.toLocaleString('pt-BR')}
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={col.key} className={`px-2 py-2 text-center ${borderClass}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDrillDown({ cidade: row.cidade, metrica: col.metrica!, label: col.label })}
                                                        disabled={value === 0}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums transition-opacity hover:opacity-80 disabled:cursor-default ${metricCellClass(col.metrica, value)}`}
                                                    >
                                                        {value.toLocaleString('pt-BR')}
                                                        {pctValue != null && value > 0 && (
                                                            <span className="opacity-70 font-normal">({pctValue}%)</span>
                                                        )}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredCidades.length === 0 && !isLoading && (
                            <p className="p-8 text-center text-sm text-slate-500">Nenhuma cidade encontrada para o filtro atual.</p>
                        )}
                    </div>
                )}
            </div>

            {drillDown && (
                <AcaoPromocionalDrillDownModal
                    cidade={drillDown.cidade}
                    metrica={drillDown.metrica}
                    metricaLabel={drillDown.label}
                    onClose={() => setDrillDown(null)}
                />
            )}
        </div>
    );
}
