import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import {
    buildPedidoMensalSeries,
    filterPedidoMensalRows,
    formatPedidoMensalBRL,
    formatPctCancel,
    listPedidoMensalMonths,
    parsePedidoMensalTable,
} from '../utils/pedidoMensal';
import {
    buildMergedCitySummaries,
    buildParceiroGmvSeries,
    buildParceiroRowLookup,
    filterParceiroMensalByMonth,
    filterParceiroMensalRows,
    lookupParceiroRow,
    mergeSeriesWithGmv,
    parseParceiroMensalWithInfo,
    type MonthPointWithGmv,
} from '../utils/parceiroMensal';
import { cityBelongsToManager, type Manager } from '../config/managerMapping';
import type { CarteiraRow } from '../types/carteira';
import {
    buildCityOkrMap,
    cityMatchesOkrFilter,
    getCityOkrCategory,
    getOkrCategoryLabel,
    listOkrCategoriesInMap,
    OKR_CATEGORY_OPTIONS,
    type OkrCategoryFilter,
    type OkrCategoryId,
} from '../utils/cityOkr';
import { formatSheetMonthLabel, matchesSheetMonthFilter, sheetMonthKey } from '../utils/sheetDates';

interface PedidoMensalViewProps {
    pedidoTable: GatewaySheetTable;
    parceiroTable: GatewaySheetTable;
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
    carteiraRows?: CarteiraRow[];
}

function okrBadgeClass(category: OkrCategoryId): string {
    switch (category) {
        case 'top5':
            return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300';
        case 'potenciais':
            return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
        case 'resignificadas':
            return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
        case 'lancadas_2324':
        case 'lancadas_25':
        case 'lancadas_26':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
}

function pctChange(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null;
    return Math.round(((current - previous) / previous) * 100);
}

function BarChart({
    title,
    series,
    valueKey,
    formatValue,
    barClass,
}: {
    title: string;
    series: MonthPointWithGmv[];
    valueKey: 'pedidosAceitos' | 'comissaoLiq' | 'gmv';
    formatValue: (n: number) => string;
    barClass: string;
}) {
    const max = Math.max(...series.map(p => p[valueKey]), 1);

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">{title}</h2>
            <div className="flex items-end gap-1 md:gap-2 h-44">
                {series.map(point => {
                    const value = point[valueKey];
                    const heightPct = Math.max(4, (value / max) * 100);
                    return (
                        <div
                            key={`${title}-${point.label}`}
                            className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group"
                            title={`${point.label}: ${formatValue(value)}`}
                        >
                            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-full">
                                {formatValue(value)}
                            </span>
                            <div
                                className={`w-full max-w-[48px] rounded-t-md transition-all ${barClass}`}
                                style={{ height: `${heightPct}%` }}
                            />
                            <span className="text-[9px] md:text-[10px] text-slate-500 mt-2 truncate w-full text-center capitalize">
                                {point.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function PedidoMensalView({
    pedidoTable,
    parceiroTable,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
    carteiraRows = [],
}: PedidoMensalViewProps) {
    const [monthFilter, setMonthFilter] = useState('');
    const [okrFilter, setOkrFilter] = useState<OkrCategoryFilter>('');
    const [cityFilter, setCityFilter] = useState('');
    const [partnerFilter, setPartnerFilter] = useState('');

    const cityOkrMap = useMemo(() => buildCityOkrMap(carteiraRows), [carteiraRows]);
    const hasOkrRegistry = cityOkrMap.size > 0;

    const okrOptions = useMemo(() => {
        const present = listOkrCategoriesInMap(cityOkrMap);
        return OKR_CATEGORY_OPTIONS.filter(opt => !opt.id || present.includes(opt.id));
    }, [cityOkrMap]);

    const allPedidoRows = useMemo(() => {
        let rows = parsePedidoMensalTable(pedidoTable);
        if (managerFilter) {
            rows = rows.filter(row => cityBelongsToManager(row.cidade, managerFilter as Manager));
        }
        if (okrFilter) {
            rows = rows.filter(row => cityMatchesOkrFilter(row.cidade, okrFilter, cityOkrMap));
        }
        return rows;
    }, [pedidoTable, managerFilter, okrFilter, cityOkrMap]);

    const { allParceiroRows, parceiroParseInfo } = useMemo(() => {
        const { rows, info } = parseParceiroMensalWithInfo(parceiroTable);
        let filtered = rows;
        if (managerFilter) {
            filtered = filtered.filter(row => cityBelongsToManager(row.cidade, managerFilter as Manager));
        }
        if (okrFilter) {
            filtered = filtered.filter(row => cityMatchesOkrFilter(row.cidade, okrFilter, cityOkrMap));
        }
        return { allParceiroRows: filtered, parceiroParseInfo: info };
    }, [parceiroTable, managerFilter, okrFilter, cityOkrMap]);

    const months = useMemo(() => {
        const map = new Map<string, { key: string; label: string }>();
        for (const m of listPedidoMensalMonths(allPedidoRows)) map.set(m.key, m);
        for (const row of allParceiroRows) {
            const key = row.monthKey ?? (row.monthStart ? sheetMonthKey(row.monthStart) : null);
            if (!key) continue;
            if (!map.has(key)) {
                const date = row.monthStart ?? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
                map.set(key, { key, label: formatSheetMonthLabel(date) });
            }
        }
        return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    }, [allPedidoRows, allParceiroRows]);

    const scopedPedidoRows = useMemo(
        () => (monthFilter
            ? allPedidoRows.filter(r => matchesSheetMonthFilter(r.monthStart, monthFilter))
            : allPedidoRows),
        [allPedidoRows, monthFilter],
    );

    const scopedParceiroRows = useMemo(
        () => (monthFilter
            ? filterParceiroMensalByMonth(allParceiroRows, monthFilter, allPedidoRows)
            : allParceiroRows),
        [allParceiroRows, allPedidoRows, monthFilter],
    );

    const citySummaries = useMemo(
        () => buildMergedCitySummaries(allPedidoRows, allParceiroRows, monthFilter),
        [allPedidoRows, allParceiroRows, monthFilter],
    );

    const partnersInCity = useMemo(() => {
        if (!cityFilter) return [];
        const set = new Set<string>();
        for (const row of scopedPedidoRows) {
            if (row.cidade === cityFilter && row.estabelecimento) set.add(row.estabelecimento);
        }
        for (const row of scopedParceiroRows) {
            if (row.cidade === cityFilter && row.parceiro) set.add(row.parceiro);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [scopedPedidoRows, scopedParceiroRows, cityFilter]);

    useEffect(() => {
        setPartnerFilter('');
    }, [cityFilter]);

    useEffect(() => {
        setCityFilter('');
        setPartnerFilter('');
    }, [okrFilter]);

    useEffect(() => {
        if (!monthFilter || !cityFilter) return;
        if (!citySummaries.some(c => c.cidade === cityFilter)) {
            setCityFilter('');
            setPartnerFilter('');
        }
    }, [monthFilter, cityFilter, citySummaries]);

    const filteredPedidoRows = useMemo(
        () => (cityFilter ? filterPedidoMensalRows(scopedPedidoRows, cityFilter, partnerFilter || undefined) : []),
        [scopedPedidoRows, cityFilter, partnerFilter],
    );

    const filteredParceiroRows = useMemo(
        () => (cityFilter ? filterParceiroMensalRows(scopedParceiroRows, cityFilter, partnerFilter || undefined) : []),
        [scopedParceiroRows, cityFilter, partnerFilter],
    );

    const series = useMemo(
        () => mergeSeriesWithGmv(
            buildPedidoMensalSeries(filteredPedidoRows),
            buildParceiroGmvSeries(filteredParceiroRows),
        ),
        [filteredPedidoRows, filteredParceiroRows],
    );

    const parceiroLookup = useMemo(() => buildParceiroRowLookup(filteredParceiroRows), [filteredParceiroRows]);

    const detailRows = useMemo(
        () => [...filteredPedidoRows].sort((a, b) => (b.monthStart?.getTime() ?? 0) - (a.monthStart?.getTime() ?? 0)),
        [filteredPedidoRows],
    );

    const lastMonth = series.length > 0 ? series[series.length - 1] : null;
    const prevMonth = series.length > 1 ? series[series.length - 2] : null;
    const pedidosVariation = lastMonth && prevMonth
        ? pctChange(lastMonth.pedidosAceitos, prevMonth.pedidosAceitos)
        : null;
    const gmvVariation = lastMonth && prevMonth
        ? pctChange(lastMonth.gmv, prevMonth.gmv)
        : null;

    const cityTotals = useMemo(() => {
        if (!cityFilter) return null;
        return citySummaries.find(c => c.cidade === cityFilter) ?? null;
    }, [citySummaries, cityFilter]);

    const totalComissao = citySummaries.reduce((s, c) => s + c.comissaoLiq, 0);
    const totalGmv = citySummaries.reduce((s, c) => s + c.gmv, 0);
    const totalGmvBruto = citySummaries.reduce((s, c) => s + c.gmvBruto, 0);
    const hasData = allPedidoRows.length > 0 || allParceiroRows.length > 0;
    const gmvMissing =
        parceiroParseInfo.rowCount > 0
        && totalGmv === 0
        && parceiroParseInfo.totalGmv === 0;

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Pedidos mensais
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">
                            Resultado por cidade: <strong>GMV líq./bruto</strong> (aba PARCEIRO_MENSAL), <strong>comissão líquida</strong> e pedidos (aba PEDIDO_MENSAL).
                        </p>
                        {(managerFilter || okrFilter) && (
                            <p className="text-xs text-primary font-semibold mt-1">
                                {managerFilter && <>Carteira de {managerFilter}</>}
                                {managerFilter && okrFilter && ' · '}
                                {okrFilter && <>OKR: {getOkrCategoryLabel(okrFilter as OkrCategoryId)}</>}
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
                {gmvMissing && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                        A aba <strong>PARCEIRO_MENSAL</strong> carregou {parceiroParseInfo.rowCount} linhas, mas o GMV veio zerado.
                        {parceiroParseInfo.gmvColumn
                            ? ` Coluna detectada: "${parceiroParseInfo.gmvColumn}".`
                            : ` Não encontramos coluna GMV nos cabeçalhos: ${parceiroParseInfo.headers.slice(0, 8).join(', ') || '(vazio)'}${parceiroParseInfo.headers.length > 8 ? '…' : ''}.`}
                        {' '}Confira se os cabeçalhos estão na linha 1 e me diga o nome exato da coluna de GMV.
                    </div>
                )}
                {!gmvMissing && parceiroParseInfo.rowCount > 0 && parceiroParseInfo.gmvColumn && (
                    <p className="mt-3 text-xs text-slate-400">
                        PARCEIRO_MENSAL: {parceiroParseInfo.rowCount} linhas · {parceiroParseInfo.rowsWithMonth} com mês · {parceiroParseInfo.rowsWithGmv} com GMV · coluna {parceiroParseInfo.gmvColumn}
                        {parceiroParseInfo.totalGmvBruto > 0 && ` · bruto ${formatPedidoMensalBRL(parceiroParseInfo.totalGmvBruto)}`}
                    </p>
                )}
            </div>

            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-end bg-slate-50/50 dark:bg-slate-900/50">
                <label className="flex flex-col gap-1 text-sm min-w-[200px]">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Categoria OKR</span>
                    <select
                        value={okrFilter}
                        onChange={e => setOkrFilter(e.target.value as OkrCategoryFilter)}
                        disabled={isLoading || !hasOkrRegistry}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                        {okrOptions.map(opt => (
                            <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1 text-sm min-w-[180px]">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Período</span>
                    <select
                        value={monthFilter}
                        onChange={e => setMonthFilter(e.target.value)}
                        disabled={isLoading}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                        <option value="">Todos os meses</option>
                        {months.map(m => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1 text-sm min-w-[220px]">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Cidade (detalhe)</span>
                    <select
                        value={cityFilter}
                        onChange={e => setCityFilter(e.target.value)}
                        disabled={isLoading || citySummaries.length === 0}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                        <option value="">Visão geral — todas as cidades</option>
                        {citySummaries.map(c => (
                            <option key={c.cidade} value={c.cidade}>{c.cidade}</option>
                        ))}
                    </select>
                </label>

                {cityFilter && (
                    <label className="flex flex-col gap-1 text-sm min-w-[260px]">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Estabelecimento</span>
                        <select
                            value={partnerFilter}
                            onChange={e => setPartnerFilter(e.target.value)}
                            disabled={partnersInCity.length === 0}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                        >
                            <option value="">Todos da cidade ({partnersInCity.length})</option>
                            {partnersInCity.map(partner => (
                                <option key={partner} value={partner}>{partner}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6 space-y-6">
                {isLoading && !hasData ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                        <p className="text-slate-500 text-sm">Carregando pedidos e GMV…</p>
                    </div>
                ) : !cityFilter ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-blue-50/50 dark:bg-blue-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">GMV líq. total</p>
                                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                                    {formatPedidoMensalBRL(totalGmv)}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {monthFilter ? 'No mês selecionado' : 'Soma de todos os períodos'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-indigo-50/50 dark:bg-indigo-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">GMV bruto total</p>
                                <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mt-1">
                                    {formatPedidoMensalBRL(totalGmvBruto)}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Aba PARCEIRO_MENSAL</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-emerald-50/50 dark:bg-emerald-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Comissão líquida total</p>
                                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                                    {formatPedidoMensalBRL(totalComissao)}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Aba PEDIDO_MENSAL</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Cidades</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{citySummaries.length}</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    Resultado por cidade
                                </h2>
                                <span className="text-xs text-slate-400">Clique em uma cidade para ver evolução</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                                    <thead className="bg-slate-100 dark:bg-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">Cidade</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600">OKR</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600">Lojas</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase text-blue-700">GMV líq.</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase text-indigo-700">GMV bruto</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600">Pedidos</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase text-emerald-700">Comissão líq.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {citySummaries.map(row => {
                                            const okrCat = getCityOkrCategory(row.cidade, cityOkrMap);
                                            return (
                                            <tr
                                                key={row.cidade}
                                                onClick={() => setCityFilter(row.cidade)}
                                                className="hover:bg-primary/5 cursor-pointer transition-colors"
                                            >
                                                <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200">
                                                    {row.cidade}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${okrBadgeClass(okrCat)}`}>
                                                        {getOkrCategoryLabel(okrCat)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right text-slate-600">{row.lojas}</td>
                                                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-700 dark:text-blue-400">
                                                    {formatPedidoMensalBRL(row.gmv)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-semibold text-indigo-700 dark:text-indigo-400">
                                                    {formatPedidoMensalBRL(row.gmvBruto)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-semibold">
                                                    {row.pedidosAceitos.toLocaleString('pt-BR')}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700 dark:text-emerald-400">
                                                    {formatPedidoMensalBRL(row.comissaoLiq)}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : series.length === 0 && detailRows.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-12">
                        Nenhum dado para {cityFilter}{partnerFilter ? ` · ${partnerFilter}` : ''}.
                    </p>
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-sm">
                            <button
                                type="button"
                                onClick={() => { setCityFilter(''); setPartnerFilter(''); }}
                                className="text-primary hover:underline"
                            >
                                ← Todas as cidades
                            </button>
                            <span className="text-slate-400">/</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{cityFilter}</span>
                            {cityOkrMap.size > 0 && (
                                <span className={`ml-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${okrBadgeClass(getCityOkrCategory(cityFilter, cityOkrMap))}`}>
                                    {getOkrCategoryLabel(getCityOkrCategory(cityFilter, cityOkrMap))}
                                </span>
                            )}
                            {partnerFilter && (
                                <>
                                    <span className="text-slate-400">/</span>
                                    <span className="text-slate-600">{partnerFilter}</span>
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-blue-50/50 dark:bg-blue-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">GMV líq. (recorte)</p>
                                <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                                    {formatPedidoMensalBRL(cityTotals?.gmv ?? 0)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-indigo-50/50 dark:bg-indigo-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">GMV bruto (recorte)</p>
                                <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400 mt-1">
                                    {formatPedidoMensalBRL(cityTotals?.gmvBruto ?? 0)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-emerald-50/50 dark:bg-emerald-900/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Comissão (recorte)</p>
                                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                                    {formatPedidoMensalBRL(cityTotals?.comissaoLiq ?? 0)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">GMV último mês</p>
                                <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                                    {lastMonth ? formatPedidoMensalBRL(lastMonth.gmv) : '—'}
                                </p>
                                {gmvVariation != null && (
                                    <p className={`text-xs mt-1 ${gmvVariation >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {gmvVariation > 0 ? '+' : ''}{gmvVariation}% vs anterior
                                    </p>
                                )}
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Pedidos último mês</p>
                                <p className="text-xl font-bold mt-1">
                                    {lastMonth?.pedidosAceitos.toLocaleString('pt-BR') ?? '—'}
                                </p>
                                {pedidosVariation != null && (
                                    <p className={`text-xs mt-1 ${pedidosVariation >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {pedidosVariation > 0 ? '+' : ''}{pedidosVariation}% vs anterior
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <BarChart
                                title="GMV — evolução mês a mês"
                                series={series}
                                valueKey="gmv"
                                formatValue={formatPedidoMensalBRL}
                                barClass="bg-blue-500"
                            />
                            <BarChart
                                title="Comissão líquida — evolução mês a mês"
                                series={series}
                                valueKey="comissaoLiq"
                                formatValue={formatPedidoMensalBRL}
                                barClass="bg-emerald-500"
                            />
                            <BarChart
                                title="Pedidos aceitos — evolução mês a mês"
                                series={series}
                                valueKey="pedidosAceitos"
                                formatValue={n => n.toLocaleString('pt-BR')}
                                barClass="bg-primary"
                            />
                        </div>

                        {detailRows.length > 0 && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Detalhe por período</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                                        <thead className="bg-slate-100 dark:bg-slate-800">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-slate-600">Período</th>
                                                {!partnerFilter && (
                                                    <th className="px-3 py-2 text-left text-xs font-bold uppercase text-slate-600">Estabelecimento</th>
                                                )}
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-blue-700">GMV líq.</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-indigo-700">GMV bruto</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-slate-600">Pedidos</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-emerald-700">Com. líq.</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-emerald-600">Com. bruta</th>
                                                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-slate-600">% canc.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {detailRows.map(row => {
                                                const parceiro = lookupParceiroRow(row, parceiroLookup);
                                                const gmvLiq = parceiro?.gmvLiq ?? 0;
                                                const gmvBruto = parceiro?.gmvBruto ?? 0;
                                                const comissaoLiq = parceiro?.comissaoLiq || row.comissaoLiq;
                                                const comissaoBruta = parceiro?.comissaoBruta ?? 0;
                                                const pedidos = parceiro?.pedidosAceitos || row.pedidosAceitos;
                                                const pctCancel = parceiro?.pctCancelamento || row.pctCancelados;
                                                return (
                                                    <tr key={row.chave || `${row.estabelecimento}-${row.monthStart?.toISOString()}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                        <td className="px-3 py-2 text-sm whitespace-nowrap capitalize">
                                                            {row.monthStart ? format(row.monthStart, 'MMM/yyyy', { locale: ptBR }) : '—'}
                                                        </td>
                                                        {!partnerFilter && (
                                                            <td className="px-3 py-2 text-sm max-w-[180px] truncate" title={row.estabelecimento}>
                                                                {row.estabelecimento}
                                                            </td>
                                                        )}
                                                        <td className="px-3 py-2 text-sm text-right font-semibold text-blue-700 dark:text-blue-400">
                                                            {formatPedidoMensalBRL(gmvLiq)}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-right font-semibold text-indigo-700 dark:text-indigo-400">
                                                            {formatPedidoMensalBRL(gmvBruto)}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-right font-semibold">
                                                            {pedidos.toLocaleString('pt-BR')}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-right font-semibold text-emerald-700 dark:text-emerald-400">
                                                            {formatPedidoMensalBRL(comissaoLiq)}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-right font-semibold text-emerald-600 dark:text-emerald-500">
                                                            {formatPedidoMensalBRL(comissaoBruta)}
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-right text-slate-500">
                                                            {formatPctCancel(pctCancel)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
