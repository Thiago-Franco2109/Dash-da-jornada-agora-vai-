import { type PerformanceRow } from '../components/PerformanceTable';

export interface SyncResult {
    data: PerformanceRow[];
    lastSyncTime: Date;
    sourceUpdatedAt?: Date; // Optional
}

const CACHE_KEY = 'partner_journey_data_cache';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://bigou-sheets-api.netlify.app";

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

// O Gateway usa a Linha 1 como header.
// Se a nova aba está "formatada", os dados devem começar imediatamente na próxima linha.
const SKIP_METADATA_ROWS = 0;

/**
 * Busca os dados da planilha via Bigou Sheets Gateway.
 */
export async function fetchGoogleSheetsData(sheetId: string, tabName: string = "NOVOS"): Promise<PerformanceRow[]> {
    const fetchOptions: RequestInit = { credentials: "include" as RequestCredentials };

    // Construir a URL do Gateway API (apenas o nome da aba, sem range)
    const url = apiUrl(`/api/sheets/${sheetId}/${encodeURIComponent(tabName)}`);

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    // Formato do Gateway: { success, data: { headers, rows, count } }
    if (json.success && json.data && Array.isArray(json.data.rows)) {
        return parseGatewayRows(json.data.rows, json.data.headers);
    }

    // Fallback: se o formato for diferente (array direto ou .values)
    const values = Array.isArray(json) ? json : json.values;
    if (values && Array.isArray(values) && values.length > 0) {
        if (Array.isArray(values[0])) {
            // Array de arrays: mapeamento por posição
            const dataRows = values.slice(SKIP_METADATA_ROWS);
            const mappedData = dataRows.map((row: any[]) => ({
                cidade: row[0] || "",
                id: row[1] || "",
                estabelecimento: row[2] || "",
                status: (row[3] || "ativo").toLowerCase(),
                lancamento: row[4] || "",
                week_1: row[6] || 0,
                week_2: row[7] || 0,
                week_3: row[8] || 0,
                week_4: row[9] || 0
            }));
            return validateAndMapData(mappedData);
        }
        return validateAndMapData(values.slice(SKIP_METADATA_ROWS));
    }

    return [];
}

/**
 * Encontra um valor num objeto de row, testando múltiplos nomes de chave
 */
function findValue(row: Record<string, any>, ...candidates: string[]): any {
    for (const key of candidates) {
        if (key in row && row[key] !== undefined) return row[key];
    }
    const rowKeys = Object.keys(row);
    for (const candidate of candidates) {
        const lower = candidate.toLowerCase();
        const match = rowKeys.find(k => k.toLowerCase() === lower);
        if (match && row[match] !== undefined) return row[match];
    }
    return undefined;
}

/**
 * Processa as rows retornadas pelo Gateway.
 */
function parseGatewayRows(rows: Record<string, any>[], headers?: string[]): PerformanceRow[] {
    const dataRows = rows.slice(SKIP_METADATA_ROWS);

    if (dataRows.length === 0) return [];

    if (headers && headers.length >= 7) {
        return dataRows.map(row => {
            const vals = headers.map(h => row[h]);
            return {
                cidade: String(vals[0] || '').trim(),
                estabelecimento: String(vals[2] || '').trim(),
                status: (String(vals[3] || 'ativo').trim().toLowerCase()) as 'ativo' | 'suspenso',
                lancamento: String(vals[4] || '').trim(),
                desempenho: '',
                week_1: parseWeekValue(vals[6]),
                week_2: parseWeekValue(vals[7]),
                week_3: parseWeekValue(vals[8]),
                week_4: parseWeekValue(vals[9]),
            };
        }).filter(row => row.estabelecimento && row.estabelecimento.length > 1);
    }

    return validateAndMapData(dataRows);
}

function parseWeekValue(val: any): number {
    if (val == null || val === '') return 0;
    const num = parseInt(String(val), 10);
    return isNaN(num) ? 0 : num;
}

function validateAndMapData(rawData: any[]): PerformanceRow[] {
    return rawData.map(row => {
        const cidade = findValue(row, 'cidade', 'Cidade', 'PEDIDOS_ACEITOS') || 'Desconhecida';
        const estabelecimento = findValue(row, 'estabelecimento', 'Estabelecimento', 'TODAS') || 'Desconhecido';
        const status = (String(findValue(row, 'status', 'Status') || 'ativo')).toLowerCase() as 'ativo' | 'suspenso';
        const lancamento = String(findValue(row, 'lancamento', 'Lancamento', 'Lançamento') || '');
        const analista = findValue(row, 'analista', 'Analista', 'Gestor', 'Responsavel') || 'Desconhecido';
        const logo_url = findValue(row, 'logo_url', 'Logo_URL', 'Logo') || '';

        return {
            cidade,
            estabelecimento,
            status,
            lancamento,
            desempenho: '',
            week_1: parseWeekValue(findValue(row, 'Week_1', 'week_1')),
            week_2: parseWeekValue(findValue(row, 'Week_2', 'week_2')),
            week_3: parseWeekValue(findValue(row, 'Week_3', 'week_3')),
            week_4: parseWeekValue(findValue(row, 'Week_4', 'week_4')),
            analista,
            ...(logo_url ? { logo_url } : {})
        };
    }).filter(row => row.estabelecimento && row.estabelecimento !== 'Desconhecido' && row.estabelecimento.length > 1);
}

export function saveToCache(result: SyncResult): void {
    try {
        const cacheData = {
            data: result.data,
            lastSyncTime: result.lastSyncTime.toISOString(),
            sourceUpdatedAt: result.sourceUpdatedAt ? result.sourceUpdatedAt.toISOString() : undefined
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.warn("Failed to save data to local storage cache", error);
    }
}

export function loadFromCache(): SyncResult | null {
    try {
        const cachedString = localStorage.getItem(CACHE_KEY);
        if (!cachedString) return null;

        const cachedData = JSON.parse(cachedString);
        return {
            data: cachedData.data,
            lastSyncTime: new Date(cachedData.lastSyncTime),
            sourceUpdatedAt: cachedData.sourceUpdatedAt ? new Date(cachedData.sourceUpdatedAt) : undefined
        };
    } catch (error) {
        console.warn("Failed to load data from local storage cache", error);
        return null;
    }
}
