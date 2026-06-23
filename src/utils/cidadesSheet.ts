import type { GatewaySheetTable } from '../types/gatewaySheet';
import type { CarteiraRow } from '../types/carteira';
import { CARTEIRA_DATA_SOURCE } from '../config/dataSource';
import { cellByPosition } from './sheetColumnMatch';

export const CIDADES_FIRST_DATA_ROW = CARTEIRA_DATA_SOURCE.firstDataRow;

const CIDADES_IDX = {
    divisao: 0,
    cidade: 1,
    grupo: 2,
    total: 3,
    ativos: 4,
    suspenso: 5,
    pendente: 6,
    pctComPromo: 7,
    promoAprovada: 8,
    semPromo: 9,
    pctComCupom: 10,
    cupomAprovado: 11,
    semCupom: 12,
} as const;

function normalizeKey(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[%_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function rowHasCidadesHeaderLabels(row: unknown[]): boolean {
    const norms = row.map(cell => normalizeKey(String(cell ?? '')));
    return norms.includes('cidade') && norms.includes('grupo') && norms.includes('total');
}

function isCarteiraHeaderRow(cidade: string, grupo: string): boolean {
    const c = cidade.toLowerCase();
    const g = grupo.toLowerCase();
    return c === 'cidade' || g === 'grupo' || c.includes('trimestre') || c.includes('ºq') || g.includes('ºq');
}

function parseCarteiraInt(val: unknown): number {
    if (val == null || val === '') return 0;
    const n = parseInt(String(val).replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
}

function parseCarteiraPercent(val: unknown): number {
    if (val == null || val === '') return 0;
    const raw = String(val).replace('%', '').replace(',', '.').trim();
    const n = parseFloat(raw);
    return Number.isNaN(n) ? 0 : n;
}

function rowLooksLikeCidadesData(row: unknown[]): boolean {
    const cidade = String(row[CIDADES_IDX.cidade] ?? '').trim();
    const grupo = String(row[CIDADES_IDX.grupo] ?? '').trim();
    return Boolean(cidade && grupo && !isCarteiraHeaderRow(cidade, grupo));
}

function detectCidadesHeaderRowIndex(values: unknown[][]): number {
    for (let i = 0; i < Math.min(20, values.length); i++) {
        if (rowHasCidadesHeaderLabels(values[i])) return i;
    }
    return -1;
}

function resolveCidadesDataStartIndex(values: unknown[][], headerRowIndex: number): number {
    const firstDataIndex = CIDADES_FIRST_DATA_ROW - 1;

    if (headerRowIndex >= 0) {
        const nextRow = values[headerRowIndex + 1] as unknown[] | undefined;
        if (nextRow && rowLooksLikeCidadesData(nextRow)) {
            return headerRowIndex + 1;
        }
        if (headerRowIndex === 0) {
            const atFirst = values[firstDataIndex] as unknown[] | undefined;
            if (atFirst && rowLooksLikeCidadesData(atFirst)) return firstDataIndex;
        }
        return headerRowIndex + 1;
    }

    return firstDataIndex;
}

function mapMatrixRow(row: unknown[], orderedHeaders: string[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < orderedHeaders.length; i++) {
        const val = row[i] ?? '';
        const key = orderedHeaders[i]?.trim() || `__col_${i}`;
        obj[key] = val;
        obj[`__col_${i}`] = val;
        obj[String(i)] = val;
    }
    return obj;
}

function buildOrderedHeaders(rawHeaderRow: string[], dataWidth: number): string[] {
    const headers = [...rawHeaderRow];
    while (headers.length < dataWidth) headers.push(`__col_${headers.length}`);
    return headers;
}

export function mergeCidadesHeaderAndData(headerRows: unknown[][], dataRows: unknown[][]): unknown[][] {
    if (!headerRows.length) return dataRows;
    return [headerRows[0] as unknown[], ...dataRows];
}

export function normalizeCidadesFromMatrix(values: unknown[][]): GatewaySheetTable {
    if (!values.length) {
        return { headers: [], rows: [], orderedHeaders: [] };
    }

    const headerRowIndex = detectCidadesHeaderRowIndex(values);
    let dataStartIndex: number;
    let headerSourceRow: string[];

    if (headerRowIndex >= 0) {
        headerSourceRow = values[headerRowIndex].map(cell => String(cell ?? '').trim());
        dataStartIndex = resolveCidadesDataStartIndex(values, headerRowIndex);
    } else {
        headerSourceRow = values[0].map(cell => String(cell ?? '').trim());
        dataStartIndex = resolveCidadesDataStartIndex(values, -1);
    }

    const dataWidth = Math.max(
        headerSourceRow.length,
        ...values.slice(dataStartIndex, dataStartIndex + 20).map(r => r.length),
    );
    const orderedHeaders = buildOrderedHeaders(headerSourceRow, dataWidth);

    const rows = values
        .slice(dataStartIndex)
        .map(row => mapMatrixRow(row as unknown[], orderedHeaders))
        .filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));

    return {
        headers: orderedHeaders.filter(Boolean),
        orderedHeaders,
        rows,
    };
}

export function headersLookLikeCidades(headers: string[]): boolean {
    const norms = headers.map(h => normalizeKey(String(h ?? '')));
    return norms.includes('cidade') && norms.includes('grupo') && norms.includes('total');
}

function matrixFromLooseRows(rows: unknown[], headerCount: number): unknown[][] {
    return rows.map(row => {
        if (Array.isArray(row)) return row;
        if (row && typeof row === 'object') {
            const record = row as Record<string, unknown>;
            const numericKeys = Object.keys(record).filter(k => /^\d+$/.test(k));
            if (numericKeys.length > 0) {
                const width = Math.max(headerCount, ...numericKeys.map(k => Number(k) + 1));
                return Array.from({ length: width }, (_, i) => record[String(i)] ?? record[i] ?? '');
            }
            return Object.values(record);
        }
        return [];
    });
}

export function normalizeCidadesGatewayPayload(
    headers: string[],
    rows: unknown[],
    values?: unknown[][],
): GatewaySheetTable {
    if (values?.length && Array.isArray(values[0])) {
        return normalizeCidadesFromMatrix(values);
    }

    if (headers.length > 0 && !headersLookLikeCidades(headers)) {
        const matrix = matrixFromLooseRows(rows, headers.length);
        if (matrix.length > 0) {
            return normalizeCidadesFromMatrix([headers, ...matrix]);
        }
    }

    const orderedHeaders = buildOrderedHeaders(
        headers,
        Math.max(headers.length, ...matrixFromLooseRows(rows, headers.length).map(r => r.length)),
    );
    const mappedRows = matrixFromLooseRows(rows, orderedHeaders.length)
        .map(row => mapMatrixRow(row, orderedHeaders))
        .filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));

    return {
        headers: orderedHeaders.filter(Boolean),
        orderedHeaders,
        rows: mappedRows,
    };
}

function parseCarteiraRowFromRecord(
    row: Record<string, unknown>,
    orderedHeaders: string[],
): CarteiraRow | null {
    const cidade = cellByPosition(row, orderedHeaders, CIDADES_IDX.cidade, ['CIDADE', 'Cidade']);
    const grupo = cellByPosition(row, orderedHeaders, CIDADES_IDX.grupo, ['GRUPO', 'Grupo']);
    if (!cidade || !grupo || isCarteiraHeaderRow(cidade, grupo)) return null;

    const total = parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.total, ['TOTAL', 'Total']));
    if (total === 0 && !cidade) return null;

    return {
        divisao: cellByPosition(row, orderedHeaders, CIDADES_IDX.divisao, ['DIVISÃO', 'DIVISAO', 'Divisão']),
        cidade,
        grupo,
        total,
        ativos: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.ativos, ['ATIVOS', 'Ativos'])),
        suspenso: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.suspenso, ['SUSPENSO', 'Suspenso'])),
        pendente: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.pendente, ['PENDENTE', 'Pendente'])),
        pctComPromo: parseCarteiraPercent(cellByPosition(row, orderedHeaders, CIDADES_IDX.pctComPromo, ['% COM PROMO', 'COM PROMO'])),
        promoAprovada: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.promoAprovada, ['PROMO APROVADA', 'Promo Aprovada'])),
        semPromo: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.semPromo, ['SEM PROMO', 'Sem Promo'])),
        pctComCupom: parseCarteiraPercent(cellByPosition(row, orderedHeaders, CIDADES_IDX.pctComCupom, ['% COM CUPOM', 'COM CUPOM'])),
        cupomAprovado: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.cupomAprovado, ['CUPOM APROVADO', 'Cupom Aprovado'])),
        semCupom: parseCarteiraInt(cellByPosition(row, orderedHeaders, CIDADES_IDX.semCupom, ['SEM CUPOM', 'Sem Cupom'])),
    };
}

export function parseCarteiraFromGatewayTable(table: GatewaySheetTable): CarteiraRow[] {
    const ordered = table.orderedHeaders?.length
        ? table.orderedHeaders
        : table.headers;

    const parsed: CarteiraRow[] = [];
    for (const row of table.rows) {
        const item = parseCarteiraRowFromRecord(row, ordered);
        if (item) parsed.push(item);
    }
    return parsed;
}
