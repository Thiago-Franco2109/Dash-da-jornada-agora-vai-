import { normalize as normalizeCity } from '../hooks/useCityIds';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import type { PedidoMensalCitySummary, PedidoMensalMonthPoint, PedidoMensalRow } from './pedidoMensal';
import { buildCitySummaries, parseSheetNumber } from './pedidoMensal';
import { cellText, resolveSheetColumn } from './sheetColumnMatch';
import {
    formatSheetMonthLabel,
    matchesSheetMonthFilter,
    matchesSheetMonthKey,
    parseMonthFromRow,
    sheetMonthKey,
} from './sheetDates';

/** Linha da aba PARCEIRO_MENSAL */
export interface ParceiroMensalRow {
    monthStart: Date | null;
    /** yyyy-MM — usado no filtro de período */
    monthKey: string | null;
    cidade: string;
    parceiroId: string;
    parceiro: string;
    pedidosAceitos: number;
    pedidosCancelados: number;
    pctCancelamento: number;
    comissaoLiq: number;
    comissaoBruta: number;
    txServico: number;
    comissaoLiqTxServico: number;
    gmvLiq: number;
    gmvBruto: number;
    gmvBrutoOnline: number;
    taxaPgtOnline: number;
    taxaGatewayAprox: number;
    comissaoBrutaExpirado: number;
    comissaoBrutaCancelados: number;
    /** Alias — GMV líquido (métrica principal nos gráficos) */
    gmv: number;
}

export interface ParceiroGmvMonthPoint {
    monthStart: Date;
    label: string;
    gmv: number;
    gmvBruto: number;
}

export interface ParceiroMensalParseInfo {
    headers: string[];
    gmvColumn: string | null;
    monthColumn: string | null;
    rowCount: number;
    rowsWithMonth: number;
    rowsWithGmv: number;
    totalGmv: number;
    totalGmvBruto: number;
}

const COL = {
    monthStart: ['DATA_MES', 'MONTH_START', 'MONTH_STA', 'MES_INICIO', 'MES'],
    cidade: ['CIDADE'],
    parceiroId: ['PARCEIRO_ID', 'ESTAB_ID'],
    parceiro: ['PARCEIRO', 'ESTABELECIMENTO'],
    pedidosAceitos: ['PEDIDOS_ACEITOS'],
    pedidosCancelados: ['PEDIDOS_CANCELADOS'],
    pctCancelamento: ['PORC_CANCELAMENTO', 'PORC_CANCEL'],
    comissaoLiq: ['COMISSAO_LIQ'],
    comissaoBruta: ['COMISSAO_BRUTA'],
    txServico: ['TX_SERVICO'],
    comissaoLiqTxServico: ['COMISSAO_LIQ_TX_SERVICO'],
    gmvLiq: ['GMV_LIQ'],
    gmvBruto: ['GMV_BRUTO'],
    gmvBrutoOnline: ['GMV_BRUTO_ONLINE'],
    taxaPgtOnline: ['TAXA_PGT_ONLINE'],
    taxaGatewayAprox: ['TAXA_GATEWAY_APROX'],
    comissaoBrutaExpirado: ['COMISSAO_BRUTA_EXPIRADO'],
    comissaoBrutaCancelados: ['COMISSAO_BRUTA_CANCELADOS'],
} as const;

function normalizeKey(key: string): string {
    return key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s]+/g, ' ')
        .trim();
}

function normalizePartnerName(name: string): string {
    return normalizeKey(name);
}

function headersOf(table: GatewaySheetTable): string[] {
    const keys = new Set<string>(table.headers.filter(Boolean));
    for (const row of table.rows.slice(0, 100)) {
        for (const key of Object.keys(row)) {
            if (key) keys.add(key);
        }
    }
    if (keys.size > 0) return Array.from(keys);
    const first = table.rows[0];
    return first ? Object.keys(first) : [];
}

function resolveCol(headers: string[], candidates: readonly string[]): string | null {
    return resolveSheetColumn(headers, [...candidates]);
}

function resolveAllCols(headers: string[], candidates: readonly string[]): string[] {
    const found = new Set<string>();
    for (const candidate of candidates) {
        const col = resolveSheetColumn(headers, [candidate]);
        if (col) found.add(col);
    }
    return Array.from(found);
}

function num(row: Record<string, unknown>, col: string | null): number {
    return col ? parseSheetNumber(row[col]) : 0;
}

function rowMatchesMonth(
    row: ParceiroMensalRow,
    monthKeyFilter: string,
    pedidoIndex?: PedidoMonthIndex,
): boolean {
    if (!monthKeyFilter) return true;
    if (matchesSheetMonthKey(row.monthKey, monthKeyFilter)) return true;
    if (matchesSheetMonthFilter(row.monthStart, monthKeyFilter)) return true;
    if (row.monthKey || row.monthStart) return false;
    if (!pedidoIndex) return false;
    if (row.parceiroId && pedidoIndex.estabIds.has(row.parceiroId.trim())) return true;
    const partnerKey = `${normalizeCity(row.cidade)}|${normalizePartnerName(row.parceiro)}`;
    return pedidoIndex.cityPartners.has(partnerKey);
}

interface PedidoMonthIndex {
    estabIds: Set<string>;
    cityPartners: Set<string>;
}

function buildPedidoMonthIndex(pedidoRows: PedidoMensalRow[], monthKeyFilter: string): PedidoMonthIndex {
    const scoped = pedidoRows.filter(row => matchesSheetMonthFilter(row.monthStart, monthKeyFilter));
    return {
        estabIds: new Set(scoped.map(row => row.estabId.trim()).filter(Boolean)),
        cityPartners: new Set(
            scoped.map(row => `${normalizeCity(row.cidade)}|${normalizePartnerName(row.estabelecimento)}`),
        ),
    };
}

function filterByMonth(
    rows: ParceiroMensalRow[],
    monthKeyFilter: string,
    pedidoRows: PedidoMensalRow[] = [],
): ParceiroMensalRow[] {
    if (!monthKeyFilter) return rows;
    const pedidoIndex = buildPedidoMonthIndex(pedidoRows, monthKeyFilter);
    return rows.filter(row => rowMatchesMonth(row, monthKeyFilter, pedidoIndex));
}

function mergeParceiroMetrics(target: ParceiroMensalRow, add: ParceiroMensalRow): ParceiroMensalRow {
    return {
        ...target,
        pedidosAceitos: target.pedidosAceitos + add.pedidosAceitos,
        pedidosCancelados: target.pedidosCancelados + add.pedidosCancelados,
        comissaoLiq: target.comissaoLiq + add.comissaoLiq,
        comissaoBruta: target.comissaoBruta + add.comissaoBruta,
        txServico: target.txServico + add.txServico,
        comissaoLiqTxServico: target.comissaoLiqTxServico + add.comissaoLiqTxServico,
        gmvLiq: target.gmvLiq + add.gmvLiq,
        gmvBruto: target.gmvBruto + add.gmvBruto,
        gmvBrutoOnline: target.gmvBrutoOnline + add.gmvBrutoOnline,
        taxaPgtOnline: target.taxaPgtOnline + add.taxaPgtOnline,
        taxaGatewayAprox: target.taxaGatewayAprox + add.taxaGatewayAprox,
        comissaoBrutaExpirado: target.comissaoBrutaExpirado + add.comissaoBrutaExpirado,
        comissaoBrutaCancelados: target.comissaoBrutaCancelados + add.comissaoBrutaCancelados,
        gmv: target.gmv + add.gmv,
    };
}

export function parseParceiroMensalTable(table: GatewaySheetTable): ParceiroMensalRow[] {
    return parseParceiroMensalWithInfo(table).rows;
}

export function parseParceiroMensalWithInfo(table: GatewaySheetTable): {
    rows: ParceiroMensalRow[];
    info: ParceiroMensalParseInfo;
} {
    const headers = headersOf(table);
    const monthColumns = resolveAllCols(headers, COL.monthStart);
    const cols = {
        monthStart: monthColumns[0] ?? null,
        cidade: resolveCol(headers, COL.cidade),
        parceiroId: resolveCol(headers, COL.parceiroId),
        parceiro: resolveCol(headers, COL.parceiro),
        pedidosAceitos: resolveCol(headers, COL.pedidosAceitos),
        pedidosCancelados: resolveCol(headers, COL.pedidosCancelados),
        pctCancelamento: resolveCol(headers, COL.pctCancelamento),
        comissaoLiq: resolveCol(headers, COL.comissaoLiq),
        comissaoBruta: resolveCol(headers, COL.comissaoBruta),
        txServico: resolveCol(headers, COL.txServico),
        comissaoLiqTxServico: resolveCol(headers, COL.comissaoLiqTxServico),
        gmvLiq: resolveCol(headers, COL.gmvLiq),
        gmvBruto: resolveCol(headers, COL.gmvBruto),
        gmvBrutoOnline: resolveCol(headers, COL.gmvBrutoOnline),
        taxaPgtOnline: resolveCol(headers, COL.taxaPgtOnline),
        taxaGatewayAprox: resolveCol(headers, COL.taxaGatewayAprox),
        comissaoBrutaExpirado: resolveCol(headers, COL.comissaoBrutaExpirado),
        comissaoBrutaCancelados: resolveCol(headers, COL.comissaoBrutaCancelados),
    };

    const parsed: ParceiroMensalRow[] = [];
    let rowsWithMonth = 0;
    let rowsWithGmv = 0;
    let totalGmv = 0;
    let totalGmvBruto = 0;

    for (const row of table.rows) {
        const cidade = cellText(row, cols.cidade);
        const parceiro = cellText(row, cols.parceiro);
        if (!cidade && !parceiro) continue;

        const { monthStart, monthKey } = parseMonthFromRow(row, monthColumns);
        if (monthKey) rowsWithMonth += 1;

        const gmvLiq = num(row, cols.gmvLiq);
        const gmvBruto = num(row, cols.gmvBruto);
        if (gmvLiq > 0 || gmvBruto > 0) {
            rowsWithGmv += 1;
            totalGmv += gmvLiq;
            totalGmvBruto += gmvBruto;
        }

        parsed.push({
            monthStart,
            monthKey,
            cidade,
            parceiroId: cellText(row, cols.parceiroId),
            parceiro,
            pedidosAceitos: num(row, cols.pedidosAceitos),
            pedidosCancelados: num(row, cols.pedidosCancelados),
            pctCancelamento: num(row, cols.pctCancelamento),
            comissaoLiq: num(row, cols.comissaoLiq),
            comissaoBruta: num(row, cols.comissaoBruta),
            txServico: num(row, cols.txServico),
            comissaoLiqTxServico: num(row, cols.comissaoLiqTxServico),
            gmvLiq,
            gmvBruto,
            gmvBrutoOnline: num(row, cols.gmvBrutoOnline),
            taxaPgtOnline: num(row, cols.taxaPgtOnline),
            taxaGatewayAprox: num(row, cols.taxaGatewayAprox),
            comissaoBrutaExpirado: num(row, cols.comissaoBrutaExpirado),
            comissaoBrutaCancelados: num(row, cols.comissaoBrutaCancelados),
            gmv: gmvLiq,
        });
    }

    return {
        rows: parsed,
        info: {
            headers,
            gmvColumn: cols.gmvLiq,
            monthColumn: cols.monthStart,
            rowCount: parsed.length,
            rowsWithMonth,
            rowsWithGmv,
            totalGmv,
            totalGmvBruto,
        },
    };
}

export function filterParceiroMensalByMonth(
    rows: ParceiroMensalRow[],
    monthKeyFilter: string,
    pedidoRows: PedidoMensalRow[] = [],
): ParceiroMensalRow[] {
    return filterByMonth(rows, monthKeyFilter, pedidoRows);
}

export function filterParceiroMensalRows(
    rows: ParceiroMensalRow[],
    cidade: string,
    parceiro?: string,
): ParceiroMensalRow[] {
    return rows.filter(row => {
        if (row.cidade !== cidade) return false;
        if (parceiro && row.parceiro !== parceiro) return false;
        return true;
    });
}

interface CityParceiroTotals {
    gmv: number;
    gmvBruto: number;
}

function addToCityTotals(map: Map<string, CityParceiroTotals>, cidade: string, row: ParceiroMensalRow) {
    if (!cidade) return;
    const norm = normalizeCity(cidade);
    const apply = (key: string) => {
        const cur = map.get(key) ?? { gmv: 0, gmvBruto: 0 };
        map.set(key, {
            gmv: cur.gmv + row.gmvLiq,
            gmvBruto: cur.gmvBruto + row.gmvBruto,
        });
    };
    apply(norm);
    if (norm !== cidade) apply(cidade);
}

function parceiroTotalsByCity(
    rows: ParceiroMensalRow[],
    monthKeyFilter: string,
    pedidoRows: PedidoMensalRow[] = [],
): Map<string, CityParceiroTotals> {
    const scoped = filterByMonth(rows, monthKeyFilter, pedidoRows);
    const map = new Map<string, CityParceiroTotals>();
    for (const row of scoped) {
        addToCityTotals(map, row.cidade, row);
    }
    return map;
}

function resolveCityTotals(cidade: string, map: Map<string, CityParceiroTotals>): CityParceiroTotals {
    return map.get(normalizeCity(cidade)) ?? map.get(cidade) ?? { gmv: 0, gmvBruto: 0 };
}

export type CitySummaryWithGmv = PedidoMensalCitySummary & {
    gmv: number;
    gmvBruto: number;
};

export function buildMergedCitySummaries(
    pedidoRows: PedidoMensalRow[],
    parceiroRows: ParceiroMensalRow[],
    monthKeyFilter = '',
): CitySummaryWithGmv[] {
    const scopedParceiro = filterByMonth(parceiroRows, monthKeyFilter, pedidoRows);
    const pedidoSummaries = buildCitySummaries(pedidoRows, monthKeyFilter);
    const parceiroMap = parceiroTotalsByCity(parceiroRows, monthKeyFilter, pedidoRows);

    const pedidoMap = new Map(pedidoSummaries.map(s => [s.cidade, s]));
    const allCities = new Set([
        ...pedidoMap.keys(),
        ...scopedParceiro.map(r => r.cidade).filter(Boolean),
    ]);

    return Array.from(allCities)
        .map(cidade => {
            const base = pedidoMap.get(cidade);
            const p = resolveCityTotals(cidade, parceiroMap);
            return {
                cidade,
                lojas: base?.lojas ?? 0,
                pedidosAceitos: base?.pedidosAceitos ?? 0,
                pedidosCancelados: base?.pedidosCancelados ?? 0,
                comissaoLiq: base?.comissaoLiq ?? 0,
                incentivos: base?.incentivos ?? 0,
                cupomParceiro: base?.cupomParceiro ?? 0,
                novosUsuarios: base?.novosUsuarios ?? 0,
                gmv: p.gmv,
                gmvBruto: p.gmvBruto,
            };
        })
        .sort((a, b) => b.gmv - a.gmv || b.comissaoLiq - a.comissaoLiq);
}

export function buildParceiroGmvSeries(rows: ParceiroMensalRow[]): ParceiroGmvMonthPoint[] {
    const map = new Map<string, ParceiroGmvMonthPoint>();

    for (const row of rows) {
        if (!row.monthStart) continue;
        const key = sheetMonthKey(row.monthStart);
        const existing = map.get(key);
        if (existing) {
            existing.gmv += row.gmvLiq;
            existing.gmvBruto += row.gmvBruto;
        } else {
            map.set(key, {
                monthStart: row.monthStart,
                label: formatSheetMonthLabel(row.monthStart, 'MMM/yy'),
                gmv: row.gmvLiq,
                gmvBruto: row.gmvBruto,
            });
        }
    }

    return Array.from(map.values()).sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());
}

export type MonthPointWithGmv = PedidoMensalMonthPoint & { gmv: number; gmvBruto: number };

function monthKeysForDate(d: Date): string[] {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return [`${y}-${m}-${day}`, sheetMonthKey(d)];
}

function rowLookupKeys(row: Pick<ParceiroMensalRow, 'parceiroId' | 'cidade' | 'parceiro' | 'monthStart'>): string[] {
    const keys = new Set<string>();
    if (row.parceiroId) keys.add(row.parceiroId.trim());
    if (row.cidade && row.parceiro && row.monthStart) {
        for (const month of monthKeysForDate(row.monthStart)) {
            keys.add(`${row.cidade}|${row.parceiro}|${month}`);
            keys.add(`${normalizeCity(row.cidade)}|${normalizePartnerName(row.parceiro)}|${month}`);
        }
    }
    return Array.from(keys);
}

export function buildParceiroRowLookup(rows: ParceiroMensalRow[]): Map<string, ParceiroMensalRow> {
    const map = new Map<string, ParceiroMensalRow>();
    for (const row of rows) {
        for (const key of rowLookupKeys(row)) {
            const existing = map.get(key);
            map.set(key, existing ? mergeParceiroMetrics(existing, row) : { ...row });
        }
    }
    return map;
}

function lookupKeysForPedidoRow(
    row: Pick<PedidoMensalRow, 'chave' | 'estabId' | 'cidade' | 'estabelecimento' | 'monthStart'>,
): string[] {
    const keys: string[] = [];
    if (row.estabId?.trim()) keys.push(row.estabId.trim());
    if (row.chave?.trim()) keys.push(row.chave.trim());
    if (row.cidade && row.estabelecimento && row.monthStart) {
        for (const month of monthKeysForDate(row.monthStart)) {
            keys.push(`${row.cidade}|${row.estabelecimento}|${month}`);
            keys.push(`${normalizeCity(row.cidade)}|${normalizePartnerName(row.estabelecimento)}|${month}`);
        }
    }
    return keys;
}

export function lookupParceiroRow(
    row: Pick<PedidoMensalRow, 'chave' | 'estabId' | 'cidade' | 'estabelecimento' | 'monthStart'>,
    lookup: Map<string, ParceiroMensalRow>,
): ParceiroMensalRow | null {
    for (const key of lookupKeysForPedidoRow(row)) {
        const found = lookup.get(key);
        if (found) return found;
    }
    return null;
}

export function lookupGmvForPedidoRow(
    row: Pick<PedidoMensalRow, 'chave' | 'estabId' | 'cidade' | 'estabelecimento' | 'monthStart'>,
    lookup: Map<string, ParceiroMensalRow>,
): number {
    return lookupParceiroRow(row, lookup)?.gmvLiq ?? 0;
}

/** @deprecated use buildParceiroRowLookup */
export function buildGmvLookup(rows: ParceiroMensalRow[]): Map<string, ParceiroMensalRow> {
    return buildParceiroRowLookup(rows);
}

export function mergeSeriesWithGmv(
    pedidoSeries: PedidoMensalMonthPoint[],
    gmvSeries: ParceiroGmvMonthPoint[],
): MonthPointWithGmv[] {
    const gmvMap = new Map(gmvSeries.map(p => [sheetMonthKey(p.monthStart), p]));
    const pedidoMap = new Map(pedidoSeries.map(p => [sheetMonthKey(p.monthStart), p]));
    const allKeys = new Set([...pedidoMap.keys(), ...gmvMap.keys()]);

    return Array.from(allKeys)
        .map(key => {
            const pedido = pedidoMap.get(key);
            const gmvPoint = gmvMap.get(key);
            const monthStart = pedido?.monthStart ?? gmvPoint?.monthStart;
            if (!monthStart) return null;
            return {
                monthStart,
                label: pedido?.label ?? gmvPoint?.label ?? formatSheetMonthLabel(monthStart, 'MMM/yy'),
                pedidosAceitos: pedido?.pedidosAceitos ?? 0,
                pedidosCancelados: pedido?.pedidosCancelados ?? 0,
                comissaoLiq: pedido?.comissaoLiq ?? 0,
                lojas: pedido?.lojas ?? 0,
                gmv: gmvPoint?.gmv ?? 0,
                gmvBruto: gmvPoint?.gmvBruto ?? 0,
            };
        })
        .filter((point): point is MonthPointWithGmv => point != null)
        .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());
}
