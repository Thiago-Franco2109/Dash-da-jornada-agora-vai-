import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import { cellText, resolveSheetColumn } from './sheetColumnMatch';
import { formatSheetMonthLabel, matchesSheetMonthFilter, parseSheetMonthDate, sheetMonthKey } from './sheetDates';

export interface PedidoMensalRow {
    chave: string;
    monthStart: Date | null;
    monthEnd: Date | null;
    monthMovel: number;
    cidade: string;
    estabId: string;
    estabelecimento: string;
    contrato: string;
    pedidosAceitos: number;
    pedidosCancelados: number;
    pctCancelados: number;
    incentivos: number;
    cupomParceiro: number;
    recessos: number;
    comissaoLiq: number;
    novosUsuarios: number;
    aceitosPgtOnline: number;
    canceladosPgtOnline: number;
    pctCancelPgtOnline: number;
    aceitosCupom: number;
    canceladosCupom: number;
    pctCancelCupom: number;
}

export interface PedidoMensalMonthPoint {
    monthStart: Date;
    label: string;
    pedidosAceitos: number;
    pedidosCancelados: number;
    comissaoLiq: number;
    lojas: number;
}

export interface PedidoMensalCitySummary {
    cidade: string;
    lojas: number;
    pedidosAceitos: number;
    pedidosCancelados: number;
    comissaoLiq: number;
    incentivos: number;
    cupomParceiro: number;
    novosUsuarios: number;
}

const COL = {
    chave: ['CHAVE'],
    monthStart: ['MONTH_START', 'MONTH_STA', 'DATA_MES', 'MES_INICIO', 'MES'],
    monthEnd: ['MONTH_END'],
    monthMovel: ['MONTH_MOVEL'],
    cidade: ['CIDADE'],
    estabId: ['ESTAB_ID'],
    estabelecimento: ['ESTABELECIMENTO'],
    contrato: ['CONTRATO'],
    pedidosAceitos: ['PEDIDOS_ACEITOS'],
    pedidosCancelados: ['PEDIDOS_CANCELADOS'],
    pctCancelados: ['PORC_CANCEL'],
    incentivos: ['INCENTIVOS'],
    cupomParceiro: ['CUPOM_PARCEIRO'],
    recessos: ['RECESSOS'],
    comissaoLiq: ['COMISSAO_LIQ'],
    novosUsuarios: ['NOVOS_USUARIOS'],
    aceitosPgtOnline: ['ACEITOS_PGT_ONLINE'],
    canceladosPgtOnline: ['CANCELADOS_PGT_ONLINE'],
    pctCancelPgtOnline: ['PORC_CANCEL_PGT_ONLINE'],
    aceitosCupom: ['ACEITOS_CUPOM'],
    canceladosCupom: ['CANCELADOS_CUPOM'],
    pctCancelCupom: ['PORC_CANCEL_CUPOM'],
} as const;

function headersOf(table: GatewaySheetTable): string[] {
    if (table.headers.length > 0) return table.headers;
    const first = table.rows[0];
    return first ? Object.keys(first) : [];
}

export function parseSheetNumber(val: unknown): number {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

    const original = String(val).trim();
    if (!original) return 0;

    let negative = original.startsWith('-') || original.includes('(');
    if (/-\s*R\$/i.test(original) || /R\$\s*-/i.test(original)) negative = true;

    let raw = original
        .replace(/R\$/gi, '')
        .replace(/[()]/g, '')
        .replace(/\s/g, '')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    if (!raw) return 0;

    const hasComma = raw.includes(',');
    const normalized = hasComma
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
    const n = parseFloat(normalized);
    if (Number.isNaN(n)) return 0;
    return negative ? -Math.abs(n) : n;
}

export function formatPedidoMensalBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function resolveCol(headers: string[], candidates: readonly string[]): string | null {
    return resolveSheetColumn(headers, [...candidates]);
}

function num(row: Record<string, unknown>, col: string | null): number {
    return col ? parseSheetNumber(row[col]) : 0;
}

export function parsePedidoMensalTable(table: GatewaySheetTable): PedidoMensalRow[] {
    const headers = headersOf(table);
    const cols = {
        chave: resolveCol(headers, COL.chave),
        monthStart: resolveCol(headers, COL.monthStart),
        monthEnd: resolveCol(headers, COL.monthEnd),
        monthMovel: resolveCol(headers, COL.monthMovel),
        cidade: resolveCol(headers, COL.cidade),
        estabId: resolveCol(headers, COL.estabId),
        estabelecimento: resolveCol(headers, COL.estabelecimento),
        contrato: resolveCol(headers, COL.contrato),
        pedidosAceitos: resolveCol(headers, COL.pedidosAceitos),
        pedidosCancelados: resolveCol(headers, COL.pedidosCancelados),
        pctCancelados: resolveCol(headers, COL.pctCancelados),
        incentivos: resolveCol(headers, COL.incentivos),
        cupomParceiro: resolveCol(headers, COL.cupomParceiro),
        recessos: resolveCol(headers, COL.recessos),
        comissaoLiq: resolveCol(headers, COL.comissaoLiq),
        novosUsuarios: resolveCol(headers, COL.novosUsuarios),
        aceitosPgtOnline: resolveCol(headers, COL.aceitosPgtOnline),
        canceladosPgtOnline: resolveCol(headers, COL.canceladosPgtOnline),
        pctCancelPgtOnline: resolveCol(headers, COL.pctCancelPgtOnline),
        aceitosCupom: resolveCol(headers, COL.aceitosCupom),
        canceladosCupom: resolveCol(headers, COL.canceladosCupom),
        pctCancelCupom: resolveCol(headers, COL.pctCancelCupom),
    };

    const parsed: PedidoMensalRow[] = [];
    for (const row of table.rows) {
        const cidade = cellText(row, cols.cidade);
        const estabelecimento = cellText(row, cols.estabelecimento);
        if (!cidade && !estabelecimento) continue;

        parsed.push({
            chave: cellText(row, cols.chave),
            monthStart: parseSheetMonthDate(cols.monthStart ? row[cols.monthStart] : null),
            monthEnd: parseSheetMonthDate(cols.monthEnd ? row[cols.monthEnd] : null),
            monthMovel: num(row, cols.monthMovel),
            cidade,
            estabId: cellText(row, cols.estabId),
            estabelecimento,
            contrato: cellText(row, cols.contrato),
            pedidosAceitos: num(row, cols.pedidosAceitos),
            pedidosCancelados: num(row, cols.pedidosCancelados),
            pctCancelados: num(row, cols.pctCancelados),
            incentivos: num(row, cols.incentivos),
            cupomParceiro: num(row, cols.cupomParceiro),
            recessos: num(row, cols.recessos),
            comissaoLiq: num(row, cols.comissaoLiq),
            novosUsuarios: num(row, cols.novosUsuarios),
            aceitosPgtOnline: num(row, cols.aceitosPgtOnline),
            canceladosPgtOnline: num(row, cols.canceladosPgtOnline),
            pctCancelPgtOnline: num(row, cols.pctCancelPgtOnline),
            aceitosCupom: num(row, cols.aceitosCupom),
            canceladosCupom: num(row, cols.canceladosCupom),
            pctCancelCupom: num(row, cols.pctCancelCupom),
        });
    }
    return parsed;
}

export function listPedidoMensalMonths(rows: PedidoMensalRow[]): { key: string; label: string }[] {
    const map = new Map<string, Date>();
    for (const row of rows) {
        if (!row.monthStart) continue;
        const key = sheetMonthKey(row.monthStart);
        if (!map.has(key)) map.set(key, row.monthStart);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1].getTime() - a[1].getTime())
        .map(([key, date]) => ({
            key,
            label: formatSheetMonthLabel(date),
        }));
}

function filterByMonth(rows: PedidoMensalRow[], monthKeyFilter: string): PedidoMensalRow[] {
    if (!monthKeyFilter) return rows;
    return rows.filter(row => matchesSheetMonthFilter(row.monthStart, monthKeyFilter));
}

/** Ranking por cidade — pedidos e comissão líquida */
export function buildCitySummaries(rows: PedidoMensalRow[], monthKeyFilter = ''): PedidoMensalCitySummary[] {
    const scoped = filterByMonth(rows, monthKeyFilter);
    const map = new Map<string, PedidoMensalCitySummary & { estabSet: Set<string> }>();

    for (const row of scoped) {
        if (!row.cidade) continue;
        let entry = map.get(row.cidade);
        if (!entry) {
            entry = {
                cidade: row.cidade,
                lojas: 0,
                pedidosAceitos: 0,
                pedidosCancelados: 0,
                comissaoLiq: 0,
                incentivos: 0,
                cupomParceiro: 0,
                novosUsuarios: 0,
                estabSet: new Set<string>(),
            };
            map.set(row.cidade, entry);
        }
        if (row.estabelecimento) entry.estabSet.add(row.estabelecimento);
        entry.pedidosAceitos += row.pedidosAceitos;
        entry.pedidosCancelados += row.pedidosCancelados;
        entry.comissaoLiq += row.comissaoLiq;
        entry.incentivos += row.incentivos;
        entry.cupomParceiro += row.cupomParceiro;
        entry.novosUsuarios += row.novosUsuarios;
    }

    return Array.from(map.values())
        .map(({ estabSet, ...summary }) => ({
            ...summary,
            lojas: estabSet.size,
        }))
        .sort((a, b) => b.comissaoLiq - a.comissaoLiq);
}

export function buildPedidoMensalSeries(rows: PedidoMensalRow[]): PedidoMensalMonthPoint[] {
    const map = new Map<string, PedidoMensalMonthPoint>();

    for (const row of rows) {
        if (!row.monthStart) continue;
        const key = sheetMonthKey(row.monthStart);
        const existing = map.get(key);
        if (existing) {
            existing.pedidosAceitos += row.pedidosAceitos;
            existing.pedidosCancelados += row.pedidosCancelados;
            existing.comissaoLiq += row.comissaoLiq;
            existing.lojas += 1;
        } else {
            map.set(key, {
                monthStart: row.monthStart,
                label: format(row.monthStart, 'MMM/yy', { locale: ptBR }),
                pedidosAceitos: row.pedidosAceitos,
                pedidosCancelados: row.pedidosCancelados,
                comissaoLiq: row.comissaoLiq,
                lojas: 1,
            });
        }
    }

    return Array.from(map.values()).sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());
}

export function filterPedidoMensalRows(
    rows: PedidoMensalRow[],
    cidade: string,
    estabelecimento?: string,
): PedidoMensalRow[] {
    return rows.filter(row => {
        if (row.cidade !== cidade) return false;
        if (estabelecimento && row.estabelecimento !== estabelecimento) return false;
        return true;
    });
}

export function formatPctCancel(value: number): string {
    if (value <= 0) return '—';
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return `${value.toFixed(1)}%`;
}
