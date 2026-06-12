import type { GatewaySheetTable } from '../types/gatewaySheet';
import { INDICADOR_DATA_SOURCE } from '../config/dataSource';

/** Linha 1-based onde começam os parceiros (após cabeçalho + linha de fórmulas) */
export const INDICADOR_FIRST_DATA_ROW = INDICADOR_DATA_SOURCE.firstDataRow;

export const INDICADOR_COL_HEADERS = [
    'CIDADE',
    'ESTAB_ID',
    'ESTABELECIMENTO',
    'CONTRATO',
    'PROMOÇÃO',
    'CUPOM PARC.',
] as const;

function normalizeKey(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s.]+/g, ' ')
        .trim();
}

export function isGmvMonthHeader(value: string): boolean {
    return /^[a-záàâãéêíóôõúç]{3,4}\.\/\d{2,4}$/i.test(value.trim());
}

function rowHasIndicadorHeaderLabels(row: unknown[]): boolean {
    const norms = row.map(cell => normalizeKey(String(cell ?? '')));
    return norms.includes('estabelecimento')
        || norms.includes('cidade')
        || norms.includes('estab id');
}

function looksLikeMoney(val: string): boolean {
    return /R\$\s*[\d.,]+/i.test(val);
}

function looksLikePartnerName(val: string): boolean {
    if (!val || looksLikeMoney(val)) return false;
    if (/^\d+$/.test(val)) return false;
    if (/^(ativo|suspenso|cancelado|estabelecimento|cidade|estab_id)$/i.test(val)) return false;
    if (/APROV:|AGUAR:/i.test(val)) return false;
    return val.length >= 2;
}

export function normalizeEstabId(raw: string): string {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(\d{3,})/);
    return match ? match[1] : '';
}

function rowLooksLikePartnerData(row: unknown[]): boolean {
    const cidade = String(row[0] ?? '').trim();
    const estabId = normalizeEstabId(String(row[1] ?? ''));
    const estabelecimento = String(row[2] ?? '').trim();
    return looksLikePartnerName(estabelecimento) && estabId.length > 0 && cidade.length >= 2 && !looksLikeMoney(cidade);
}

function detectIndicadorHeaderRowIndex(values: unknown[][]): number {
    for (let i = 0; i < Math.min(25, values.length); i++) {
        if (rowHasIndicadorHeaderLabels(values[i])) return i;
    }
    return -1;
}

/** Índice 0-based da primeira linha de parceiros (linha 3 da planilha = índice 2) */
function resolveIndicadorDataStartIndex(values: unknown[][], headerRowIndex: number): number {
    const firstDataIndex = INDICADOR_FIRST_DATA_ROW - 1;

    if (headerRowIndex >= 0) {
        const nextRow = values[headerRowIndex + 1] as unknown[] | undefined;
        if (nextRow && rowLooksLikePartnerData(nextRow)) {
            return headerRowIndex + 1;
        }
        if (headerRowIndex === 0) {
            const rowAtFirstData = values[firstDataIndex] as unknown[] | undefined;
            if (rowAtFirstData && rowLooksLikePartnerData(rowAtFirstData)) {
                return firstDataIndex;
            }
        }
        return headerRowIndex + 1;
    }

    const row0 = values[0]?.map(cell => String(cell ?? '').trim()) ?? [];
    const row0OnlyMonths = row0.filter(Boolean).every(isGmvMonthHeader);

    if (row0OnlyMonths) {
        if (values.length > firstDataIndex && rowLooksLikePartnerData(values[firstDataIndex] as unknown[])) {
            return firstDataIndex;
        }
        if (values.length > 1 && rowLooksLikePartnerData(values[1] as unknown[])) {
            return 1;
        }
    }

    return firstDataIndex;
}

/** Monta matriz [cabeçalho, ...dados] a partir de leituras separadas (A1 + A3:) */
export function mergeIndicadorHeaderAndData(
    headerRows: unknown[][],
    dataRows: unknown[][],
): unknown[][] {
    if (!headerRows.length) return dataRows;
    const header = headerRows[0] as unknown[];
    return [header, ...dataRows];
}

function maxRowWidth(values: unknown[][], start: number, sample = 30): number {
    let max = 0;
    const end = Math.min(values.length, start + sample);
    for (let i = start; i < end; i++) {
        max = Math.max(max, values[i].length);
    }
    return max;
}

function buildOrderedHeaders(rawHeaderRow: string[], dataWidth: number): string[] {
    const firstGmvIndex = rawHeaderRow.findIndex(h => isGmvMonthHeader(h));
    const monthHeaders = rawHeaderRow.filter(h => isGmvMonthHeader(h));

    if (rowHasIndicadorHeaderLabels(rawHeaderRow)) {
        const headers = [...rawHeaderRow];
        while (headers.length < dataWidth) headers.push(`__col_${headers.length}`);
        return headers;
    }

    if (firstGmvIndex > 0) {
        const headers = [...rawHeaderRow];
        for (let i = 0; i < firstGmvIndex && i < INDICADOR_COL_HEADERS.length; i++) {
            if (!headers[i]?.trim()) headers[i] = INDICADOR_COL_HEADERS[i];
        }
        while (headers.length < dataWidth) headers.push(`__col_${headers.length}`);
        return headers;
    }

    const headers: string[] = [...INDICADOR_COL_HEADERS];
    for (const month of monthHeaders) {
        if (!headers.includes(month)) headers.push(month);
    }

    while (headers.length < dataWidth) {
        headers.push(`__col_${headers.length}`);
    }

    return headers;
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

/**
 * Reconstrói a aba INDICADOR a partir da matriz bruta (values).
 * Corrige quando o Google omite colunas A–F vazias no cabeçalho e só retorna meses de GMV.
 */
export function normalizeIndicadorFromMatrix(values: unknown[][]): GatewaySheetTable {
    if (!values.length) {
        return { headers: [], rows: [], orderedHeaders: [] };
    }

    const headerRowIndex = detectIndicadorHeaderRowIndex(values);
    let dataStartIndex: number;
    let headerSourceRow: string[];

    if (headerRowIndex >= 0) {
        headerSourceRow = values[headerRowIndex].map(cell => String(cell ?? '').trim());
        dataStartIndex = resolveIndicadorDataStartIndex(values, headerRowIndex);
    } else {
        const row0 = values[0].map(cell => String(cell ?? '').trim());
        headerSourceRow = row0;
        dataStartIndex = resolveIndicadorDataStartIndex(values, -1);
    }

    const dataWidth = maxRowWidth(values, dataStartIndex);
    const orderedHeaders = buildOrderedHeaders(headerSourceRow, Math.max(dataWidth, headerSourceRow.length));

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

export function headersLookLikeIndicadorMisaligned(headers: string[]): boolean {
    const nonEmpty = headers.map(h => h.trim()).filter(Boolean);
    if (nonEmpty.length === 0) return false;
    const hasPartnerHeader = nonEmpty.some(h => {
        const norm = normalizeKey(h);
        return norm === 'cidade' || norm === 'estabelecimento' || norm === 'estab id';
    });
    if (hasPartnerHeader) return false;
    return nonEmpty.every(isGmvMonthHeader) || nonEmpty.some(isGmvMonthHeader);
}

export function normalizeIndicadorGatewayPayload(
    headers: string[],
    rows: unknown[],
    values?: unknown[][],
): GatewaySheetTable {
    if (values?.length && Array.isArray(values[0])) {
        return normalizeIndicadorFromMatrix(values);
    }

    if (headersLookLikeIndicadorMisaligned(headers)) {
        const matrix = matrixFromLooseRows(rows, headers.length);
        if (matrix.length > 0) {
            const withSyntheticHeader = [headers, ...matrix];
            return normalizeIndicadorFromMatrix(withSyntheticHeader);
        }
    }

    const orderedHeaders = buildOrderedHeaders(headers, Math.max(headers.length, ...matrixFromLooseRows(rows, headers.length).map(r => r.length)));
    const mappedRows = matrixFromLooseRows(rows, orderedHeaders.length)
        .map(row => mapMatrixRow(row, orderedHeaders))
        .filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));

    return {
        headers: orderedHeaders.filter(Boolean),
        orderedHeaders,
        rows: mappedRows,
    };
}
