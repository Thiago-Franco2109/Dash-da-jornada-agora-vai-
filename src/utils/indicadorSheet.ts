import type { GatewaySheetTable } from '../types/gatewaySheet';
import { INDICADOR_DATA_SOURCE } from '../config/dataSource';
import { agentDebugLog } from './agentDebugLog';

/** Linha 1-based onde começam os parceiros (após cabeçalho + linha de fórmulas) */
export const INDICADOR_FIRST_DATA_ROW = INDICADOR_DATA_SOURCE.firstDataRow;

export const INDICADOR_COL_HEADERS = [
    'CIDADE',
    'ESTAB_ID',
    'ESTABELECIMENTO',
    'CONTRATO',
    'OFERTAS DA CASA',
    'SUPER PROMOS',
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

/** Aliases de colunas legadas → cabeçalho canônico atual (pós OFERTAS DA CASA) */
const INDICADOR_COLUMN_ALIASES: Record<string, string[]> = {
    'super promos': ['promocao', 'promoção', 'promo'],
    'cupom parc': ['cupom parc', 'cupom parc.', 'cupom_parc'],
    'ofertas da casa': ['ofertas da casa'],
};

function resolveRecordCell(record: Record<string, unknown>, header: string, index: number): unknown {
    const key = header.trim();
    if (key) {
        if (record[key] != null && String(record[key]).trim()) return record[key];
        const norm = normalizeKey(key);
        for (const k of Object.keys(record)) {
            if (normalizeKey(k) === norm && String(record[k] ?? '').trim()) return record[k];
        }
        const aliases = INDICADOR_COLUMN_ALIASES[norm] ?? [];
        for (const alias of aliases) {
            for (const k of Object.keys(record)) {
                if (normalizeKey(k) === alias && String(record[k] ?? '').trim()) return record[k];
            }
        }
    }
    if (record[`__col_${index}`] != null && String(record[`__col_${index}`]).trim()) {
        return record[`__col_${index}`];
    }
    if (record[String(index)] != null && String(record[String(index)]).trim()) {
        return record[String(index)];
    }
    return '';
}

/** Converte linha { CIDADE: '…', SUPER PROMOS: '…' } para array alinhado aos cabeçalhos */
function rowToArrayByHeaders(record: Record<string, unknown>, orderedHeaders: string[]): unknown[] {
    return orderedHeaders.map((header, index) => resolveRecordCell(record, header, index));
}

function matrixFromLooseRows(rows: unknown[], headerCount: number, orderedHeaders?: string[]): unknown[][] {
    return rows.map(row => {
        if (Array.isArray(row)) return row;
        if (row && typeof row === 'object') {
            const record = row as Record<string, unknown>;
            const numericKeys = Object.keys(record).filter(k => /^\d+$/.test(k));
            if (numericKeys.length > 0) {
                const width = Math.max(headerCount, ...numericKeys.map(k => Number(k) + 1));
                return Array.from({ length: width }, (_, i) => record[String(i)] ?? record[i] ?? '');
            }
            if (orderedHeaders?.length) {
                return rowToArrayByHeaders(record, orderedHeaders);
            }
            return Object.values(record);
        }
        return [];
    });
}

/** Cabeçalhos reconhecem colunas de campanha do layout atual (pós OFERTAS DA CASA) */
export function indicadorHasCampaignColumns(headers: string[]): boolean {
    const norms = headers.map(h => normalizeKey(h));
    const hasPromo = norms.some(h =>
        h === 'super promos' || h === 'promocao' || h === 'promoção' || h.startsWith('super promos'),
    );
    const hasCupom = norms.some(h => h.includes('cupom'));
    return hasPromo && hasCupom;
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
    let branch = 'named-rows';
    let result: GatewaySheetTable;

    if (values?.length && Array.isArray(values[0])) {
        branch = 'matrix-values';
        result = normalizeIndicadorFromMatrix(values);
    } else if (headersLookLikeIndicadorMisaligned(headers)) {
        branch = 'misaligned-headers';
        const matrix = matrixFromLooseRows(rows, headers.length);
        if (matrix.length > 0) {
            const withSyntheticHeader = [headers, ...matrix];
            result = normalizeIndicadorFromMatrix(withSyntheticHeader);
        } else {
            branch = 'misaligned-empty';
            result = { headers: [], rows: [], orderedHeaders: [] };
        }
    } else {
        const headerSourceRow = headers.map(h => String(h ?? '').trim());
        const provisionalWidth = Math.max(
            headerSourceRow.length,
            ...rows.map(row => {
                if (Array.isArray(row)) return row.length;
                if (row && typeof row === 'object') return Object.keys(row as object).length;
                return 0;
            }),
        );
        const orderedHeaders = buildOrderedHeaders(headerSourceRow, provisionalWidth);

        const mappedRows = matrixFromLooseRows(rows, orderedHeaders.length, orderedHeaders)
            .map(row => mapMatrixRow(row, orderedHeaders))
            .filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));

        result = {
            headers: orderedHeaders.filter(Boolean),
            orderedHeaders,
            rows: mappedRows,
        };
    }

    // #region agent log
    const oh = result.orderedHeaders ?? result.headers ?? [];
    const sampleRow = result.rows.find(r => String(r['ESTAB_ID'] ?? r['__col_1'] ?? '').includes('26904'));
    agentDebugLog({ hypothesisId: 'H1-H2', location: 'indicadorSheet.ts:normalizeIndicadorGatewayPayload', message: 'INDICADOR normalize branch', runId: 'post-fix', data: { branch, headerCount: oh.length, headers: oh.slice(0, 10), hasCampaignCols: indicadorHasCampaignColumns(oh), rowCount: result.rows.length, sample26904: sampleRow ? { promo: sampleRow['SUPER PROMOS'] ?? sampleRow['PROMOÇÃO'] ?? sampleRow['__col_5'], cupom: sampleRow['CUPOM PARC.'] ?? sampleRow['__col_6'] } : null } });
    // #endregion

    return result;
}
