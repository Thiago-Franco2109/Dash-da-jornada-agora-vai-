import { type PerformanceRow } from '../components/PerformanceTable';
import { supabase } from '../lib/supabase';

export interface SyncResult {
    data: PerformanceRow[];
    lastSyncTime: Date;
    sourceUpdatedAt?: Date; // Optional
}
export const CACHE_KEYS = {
    marketplace: 'partner_journey_data_cache_v5_marketplace',
    cd_novos: 'partner_journey_data_cache_v6_cd_novos',
    cd_desempenho: 'partner_journey_data_cache_v7_cd_desempenho',
} as const;

export type DataCacheKey = keyof typeof CACHE_KEYS;


const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "https://sheets-api-production-0097.up.railway.app")
    .trim()
    .replace(/\/+$/, '');

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

/**
 * Formata o segmento da aba na URL do Gateway.
 * O servidor monta o range do Google como `{aba}!A1:ZZ10000`.
 * Abas com espaços precisam de aspas simples: `'cd todos Desempenho'!A1:ZZ10000`
 */
export function encodeSheetTabForGateway(tabName: string): string {
    const trimmed = tabName.trim();
    if (!trimmed) return '';
    const needsQuotes = /\s/.test(trimmed) && !trimmed.startsWith("'");
    const forRange = needsQuotes ? `'${trimmed.replace(/'/g, "''")}'` : trimmed;
    return encodeURIComponent(forRange);
}

/** Prepara as opções de fetch incluindo token de fallback se disponível */
function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem("auth_token");
    const options: RequestInit = { credentials: "include" as RequestCredentials };
    if (token) {
        options.headers = {
            ...options.headers,
            "Authorization": `Bearer ${token}`
        };
    }
    return options;
}

// O Gateway usa a Linha 1 como header.
// Se a nova aba está "formatada", os dados devem começar imediatamente na próxima linha.
const SKIP_METADATA_ROWS = 0;

/** Fila global: uma requisição de planilha por vez (evita 429 por rajada) */
let sheetFetchChain: Promise<unknown> = Promise.resolve();

function enqueueSheetFetch<T>(fn: () => Promise<T>): Promise<T> {
    const task = sheetFetchChain.then(() => fn());
    sheetFetchChain = task.catch(() => {});
    return task;
}

function formatSheetFetchError(status: number, errorJson: Record<string, unknown>): string {
    const detail = String(errorJson.error || errorJson.message || '').trim();
    switch (status) {
        case 429:
            return 'Limite de leituras da planilha atingido (429). Aguarde ~1 minuto e clique em Atualizar.';
        case 500:
        case 502:
            if (detail.includes('Unable to parse range')) {
                return `A aba não foi encontrada na planilha (erro ${status}). O Google não reconheceu o nome da aba — confira se ela existe com o nome exato.${detail ? ` (${detail})` : ''}`;
            }
            return `Falha no servidor ao ler a aba (erro ${status}). Tente novamente em instantes.${detail ? ` (${detail})` : ''}`;
        case 503:
        case 504:
            return `Servidor temporariamente indisponível (${status}). Tente novamente.${detail ? ` (${detail})` : ''}`;
        case 404:
            return `Aba não encontrada na planilha.${detail ? ` ${detail}` : ''}`;
        default:
            return detail || `Erro ${status}: falha ao buscar planilha`;
    }
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);
        lastResponse = response;
        const shouldRetry = response.status === 429 || response.status === 503 || response.status === 504;
        if (!shouldRetry || attempt === maxRetries) return response;
        const delayMs = 1000 * (attempt + 1);
        console.warn(`[dataSync] HTTP ${response.status}. Retry em ${delayMs}ms (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return lastResponse!;
}

function buildQuotedSheetRange(tabName: string): string {
    const safe = tabName.trim().replace(/'/g, "''");
    return `'${safe}'!A1:ZZ10000`;
}

type SheetRowParser = (rows: Record<string, unknown>[], headers?: string[]) => PerformanceRow[];

function parseGatewayJson(json: Record<string, unknown>, parser: SheetRowParser = parseGatewayRows): PerformanceRow[] {
    if (json.success && json.data && Array.isArray((json.data as { rows?: unknown }).rows)) {
        const data = json.data as { rows: Record<string, unknown>[]; headers?: string[] };
        return parser(data.rows, data.headers);
    }

    const values = Array.isArray(json) ? json : (json.values as unknown);
    if (values && Array.isArray(values) && values.length > 0) {
        if (Array.isArray(values[0])) {
            const dataRows = (values as unknown[][]).slice(SKIP_METADATA_ROWS);
            const mappedData = dataRows.map((row: unknown[]) => mapPositionalRow(row));
            return parser(mappedData as Record<string, unknown>[]);
        }
        return parser((values as unknown[]).slice(SKIP_METADATA_ROWS) as Record<string, unknown>[]);
    }

    return [];
}

/** Tenta várias codificações de URL (aspas no range) e nomes de aba */
async function fetchFromGatewayVariants(
    sheetId: string,
    tabNames: string[],
    parser: SheetRowParser,
): Promise<PerformanceRow[]> {
    const fetchOptions = getFetchOptions();
    const uniqueTabs = [...new Set(tabNames.map(t => t.trim()).filter(Boolean))];
    let lastError: Error | null = null;

    for (const tab of uniqueTabs) {
        const encodings = [
            encodeSheetTabForGateway(tab),
            encodeURIComponent(tab),
        ].filter(Boolean);

        for (const encoded of encodings) {
            const url = apiUrl(`/api/sheets/${sheetId}/${encoded}`);
            try {
                const response = await fetchWithRetry(url, fetchOptions);
                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({})) as Record<string, unknown>;
                    lastError = new Error(formatSheetFetchError(response.status, errorJson));
                    continue;
                }
                const rows = parseGatewayJson(await response.json(), parser);
                if (rows.length > 0 || uniqueTabs.length === 1) return rows;
            } catch (err) {
                lastError = err as Error;
            }
        }
    }

    throw lastError ?? new Error('Falha ao buscar planilha via Gateway');
}

/** Fallback: Google Sheets API com range quotado corretamente (contorna bug do Gateway Railway) */
async function fetchFromGoogleSheetsApiDirect(sheetId: string, tabName: string, parser: SheetRowParser = parseGatewayRows): Promise<PerformanceRow[]> {
    const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
    if (!token) throw new Error('Token indisponível para fallback Google API');

    const range = encodeURIComponent(buildQuotedSheetRange(tabName));
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({})) as { values?: unknown[][]; error?: { message?: string } };

    if (!res.ok) {
        throw new Error(json.error?.message || `Google API ${res.status}`);
    }

    const values = json.values || [];
    if (values.length === 0) return [];

    const headers = values[0].map(cell => String(cell ?? '').trim());
    const rows = values.slice(1).map(row => {
        const obj: Record<string, unknown> = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] ?? '';
        });
        return obj;
    });

    return parser(rows, headers);
}

/** Fallback Netlify/Vite: gviz CSV com service account (evita erro "Unable to parse range") */
async function fetchFromNetlifySheetRead(
    sheetId: string,
    tabName: string,
    parser: SheetRowParser = parseGatewayRows,
    tabVariants: string[] = [],
): Promise<PerformanceRow[]> {
    const tabs = [...new Set([tabName.trim(), ...tabVariants.map(t => t.trim()).filter(Boolean)])];
    let lastError: Error | null = null;

    for (const tab of tabs) {
        const params = new URLSearchParams({ sheetId, tab });
        const url = `/.netlify/functions/sheet-read?${params.toString()}`;
        try {
            const res = await fetch(url, getFetchOptions());
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { error?: string };
                lastError = new Error(err.error || `sheet-read ${res.status}`);
                continue;
            }
            const rows = parseGatewayJson(await res.json(), parser);
            if (rows.length > 0) return rows;
        } catch (err) {
            lastError = err as Error;
        }
    }

    throw lastError ?? new Error('sheet-read falhou para todas as variantes de aba');
}

async function fetchSheetData(
    sheetId: string,
    tabName: string,
    parser: SheetRowParser = parseGatewayRows,
    options?: { tabVariants?: string[]; preferGviz?: boolean },
): Promise<PerformanceRow[]> {
    return enqueueSheetFetch(async () => {
        const trimmedTab = tabName.trim();
        const tabVariants = options?.tabVariants ?? [];
        const allTabNames = [...new Set([trimmedTab, ...tabVariants.map(t => t.trim()).filter(Boolean)])];

        const strategies: { name: string; run: () => Promise<PerformanceRow[]> }[] = options?.preferGviz
            ? [
                { name: 'sheet-read-gviz', run: () => fetchFromNetlifySheetRead(sheetId, trimmedTab, parser, allTabNames) },
                { name: 'gateway', run: () => fetchFromGatewayVariants(sheetId, allTabNames, parser) },
                { name: 'google-api', run: () => fetchFromGoogleSheetsApiDirect(sheetId, trimmedTab, parser) },
            ]
            : [
                { name: 'gateway', run: () => fetchFromGatewayVariants(sheetId, allTabNames, parser) },
                { name: 'google-api', run: () => fetchFromGoogleSheetsApiDirect(sheetId, trimmedTab, parser) },
                { name: 'sheet-read-gviz', run: () => fetchFromNetlifySheetRead(sheetId, trimmedTab, parser, allTabNames) },
            ];

        let lastError: Error | null = null;

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            const isLast = i === strategies.length - 1;
            try {
                const rows = await strategy.run();
                if (strategy.name !== 'gateway') {
                    console.info(`[dataSync] Aba "${trimmedTab}" carregada via fallback ${strategy.name} (${rows.length} linhas)`);
                }
                return rows;
            } catch (err) {
                lastError = err as Error;
                console.warn(`[dataSync] ${strategy.name} falhou para "${trimmedTab}":`, lastError.message);
                if (!isLast) continue;
                throw lastError;
            }
        }

        throw lastError ?? new Error(`Falha ao carregar aba "${trimmedTab}"`);
    });
}

export async function fetchGoogleSheetsData(sheetId: string, tabName: string = "NOVOS"): Promise<PerformanceRow[]> {
    return fetchSheetData(sheetId, tabName, parseGatewayRows);
}

function isTabNotFoundError(err: unknown): boolean {
    const msg = String((err as Error)?.message || '').toLowerCase();
    return msg.includes('parse range')
        || msg.includes('unable to parse')
        || msg.includes('not found')
        || msg.includes('404')
        || (msg.includes('500') && msg.includes('aba'));
}

async function fetchGatewayTabOnce(
    sheetId: string,
    tab: string,
    parser: SheetRowParser,
): Promise<PerformanceRow[]> {
    const fetchOptions = getFetchOptions();
    const url = apiUrl(`/api/sheets/${sheetId}/${encodeURIComponent(tab)}`);
    const response = await fetchWithRetry(url, fetchOptions, 0);

    if (!response.ok) {
        const errorJson = await response.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(formatSheetFetchError(response.status, errorJson));
    }

    return parseGatewayJson(await response.json(), parser);
}

async function fetchAvailableSheetTabs(sheetId: string): Promise<string[]> {
    const url = `/.netlify/functions/list-sheet-tabs?sheetId=${encodeURIComponent(sheetId)}`;
    const res = await fetch(url, getFetchOptions());
    if (!res.ok) return [];
    const json = await res.json() as { tabs?: string[] };
    return json.tabs ?? [];
}

function formatTabNotFoundMessage(requestedTab: string, availableTabs: string[]): string {
    if (availableTabs.length === 0) {
        return `A aba "${requestedTab}" não foi encontrada pelo Gateway. Confira o nome exato na planilha (clique direito na aba → Renomear).`;
    }
    return `A aba "${requestedTab}" não existe na planilha. Abas disponíveis: ${availableTabs.map(t => `"${t}"`).join(', ')}. Renomeie ou ajuste em dataSource.ts.`;
}

/** Aba CD desempenho — Gateway Bigou + fallback sheet-read (descobre nome real da aba) */
export async function fetchCDDesempenhoSheetData(sheetId: string, tabName: string): Promise<PerformanceRow[]> {
    return enqueueSheetFetch(async () => {
        const tab = tabName.trim();
        let gatewayError: Error | null = null;

        try {
            return await fetchGatewayTabOnce(sheetId, tab, parseCDDesempenhoRows);
        } catch (err) {
            gatewayError = err as Error;
            if (!isTabNotFoundError(err)) throw gatewayError;
        }

        try {
            const params = new URLSearchParams({ sheetId, tab });
            const res = await fetch(`/.netlify/functions/sheet-read?${params}`, getFetchOptions());
            const json = await res.json() as { success?: boolean; error?: string; availableTabs?: string[]; resolvedTab?: string };

            if (!res.ok) {
                if (json.availableTabs?.length) {
                    throw new Error(formatTabNotFoundMessage(tab, json.availableTabs));
                }
                throw new Error(json.error || `sheet-read ${res.status}`);
            }

            if (json.resolvedTab && json.resolvedTab !== tab) {
                console.info(`[dataSync] Aba resolvida: "${json.resolvedTab}" (config: "${tab}")`);
            }

            return parseGatewayJson(json as Record<string, unknown>, parseCDDesempenhoRows);
        } catch (fallbackErr) {
            const availableTabs = await fetchAvailableSheetTabs(sheetId).catch(() => [] as string[]);
            if (availableTabs.length) {
                throw new Error(formatTabNotFoundMessage(tab, availableTabs));
            }
            throw fallbackErr instanceof Error ? fallbackErr : gatewayError ?? new Error('Falha ao carregar desempenho');
        }
    });
}

function mapPositionalRow(row: any[]): Record<string, unknown> {
    return {
        cidade: row[0] || '',
        estab_id: row[1] || '',
        estabelecimento: row[2] || '',
        status: row[3] || 'ativo',
        lancamento: row[4] || '',
        desempenho: row[5] || '',
        week_1: row[6] || 0,
        week_2: row[7] || 0,
        week_3: row[8] || 0,
        week_4: row[9] || 0,
        promo: row[10] || '',
        cupom: row[11] || '',
    };
}

/**
 * Encontra um valor num objeto de row, testando múltiplos nomes de chave
 */
export function findValue(row: Record<string, any>, ...candidates: string[]): any {
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
 * Normaliza o valor bruto para as métricas de Promoção e Cupom.
 * Retorna 'ativo' para APROV, 'aguardando' para AGUAR, ou 'inativo' (vazio/ausente).
 */
export function normalizePromoStatus(raw: any): 'ativo' | 'aguardando' | 'inativo' {
    if (raw == null) return 'inativo';
    const s = String(raw).trim().toUpperCase();
    if (s.includes('APROV') || s.includes('ATIVO')) return 'ativo';
    if (s.includes('AGUAR')) return 'aguardando';
    return 'inativo';
}

/**
 * Processas as rows retornadas pelo Gateway.
 */
function parseGatewayRows(rows: Record<string, any>[], headers?: string[]): PerformanceRow[] {
    const dataRows = rows.slice(SKIP_METADATA_ROWS);

    if (dataRows.length === 0) return [];

    if (headers && headers.length >= 3) {
        return dataRows.map(row => {
            const vals = headers.map(h => row[h]);
            const logoRaw = findValue(row, 'logo_url', 'Logo_URL', 'Logo');
            const logo_url = logoRaw != null && String(logoRaw).trim() ? String(logoRaw).trim() : '';
            const analista = findValue(row, 'analista', 'Analista', 'Gestor', 'Responsavel', 'Responsável') || 'Desconhecido';
            const rawPromo = findValue(row, 'promos', 'promo', 'promocao', 'PROMO PARC.', 'PROMO', 'promoção', 'PROMO PARC', 'PROMOCOES', 'Promoções', 'promo_status') || vals[10];
            const rawCupom = findValue(row, 'cupons', 'cupom', 'CUPOM PARC.', 'CUPOM', 'cupom_status', 'CUPONS') || vals[11];
            const estabelecimento = String(vals[2] || findValue(row, 'estabelecimento', 'Estabelecimento') || '').trim();

            return {
                cidade: String(vals[0] || findValue(row, 'cidade', 'Cidade') || '').trim(),
                estab_id: String(vals[1] || findValue(row, 'estab_id', 'ID', 'Id') || '').trim(),
                estabelecimento,
                status: (String(vals[3] || findValue(row, 'status', 'Status') || 'ativo').trim().toLowerCase()) as 'ativo' | 'suspenso',
                lancamento: String(vals[4] || findValue(row, 'lancamento', 'Lancamento', 'Lançamento') || '').trim(),
                desempenho: String(vals[5] || findValue(row, 'desempenho', 'Desempenho') || '').trim(),
                week_1: parseWeekValue(vals[6] ?? findValue(row, 'Week_1', 'week_1')),
                week_2: parseWeekValue(vals[7] ?? findValue(row, 'Week_2', 'week_2')),
                week_3: parseWeekValue(vals[8] ?? findValue(row, 'Week_3', 'week_3')),
                week_4: parseWeekValue(vals[9] ?? findValue(row, 'Week_4', 'week_4')),
                analista,
                promo_status: normalizePromoStatus(rawPromo),
                cupom_status: normalizePromoStatus(rawCupom),
                ...(logo_url ? { logo_url } : {}),
            };
        }).filter(isValidPartnerRow);
    }

    return validateAndMapData(dataRows);
}

function isValidPartnerRow(row: PerformanceRow): boolean {
    const name = (row.estabelecimento || '').trim();
    if (name.length > 1 && name !== 'Desconhecido') return true;
    const id = (row.estab_id || '').trim();
    return id.length > 0;
}

function parseWeekValue(val: unknown): number {
    if (val == null || val === '') return 0;
    const num = parseInt(String(val), 10);
    return isNaN(num) ? 0 : num;
}

function looksLikeDateValue(val: unknown): boolean {
    if (val == null || val === '') return false;
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(val).trim());
}

function looksLikeNumericValue(val: unknown): boolean {
    if (val == null || val === '') return false;
    const s = String(val).trim().replace(',', '.');
    return !isNaN(Number(s)) && s !== '';
}

function parseWeekFromRow(row: Record<string, unknown>, weekNum: 1 | 2 | 3 | 4): number {
    return parseWeekValue(findValue(
        row,
        `Week_${weekNum}`,
        `week_${weekNum}`,
        `Semana ${weekNum}`,
        `Semana${weekNum}`,
        `S${weekNum}`,
        `W${weekNum}`,
    ));
}

function findColumnByPattern(row: Record<string, unknown>, headers: string[], patterns: RegExp[]): unknown {
    for (const header of headers) {
        if (patterns.some(p => p.test(header))) return row[header];
    }
    for (const key of Object.keys(row)) {
        if (patterns.some(p => p.test(key))) return row[key];
    }
    return undefined;
}

/**
 * Parser da aba CD_TODOS_DESEMPENHO.
 * Não exige coluna de lançamento — mapeia semanas e desempenho por cabeçalho.
 */
export function parseCDDesempenhoRows(rows: Record<string, unknown>[], headers?: string[]): PerformanceRow[] {
    const dataRows = rows.slice(SKIP_METADATA_ROWS);
    if (dataRows.length === 0) return [];

    const headerList = headers?.map(h => h.trim()) ?? [];
    const hasLancamentoHeader = headerList.some(h => /lançamento|lancamento/i.test(h));

    if (headerList.length >= 3) {
        return dataRows.map(row => {
            const cidade = String(findValue(row, 'cidade', 'Cidade') || findColumnByPattern(row, headerList, [/cidade/i]) || '').trim();
            const estab_id = String(findValue(row, 'estab_id', 'ID', 'Id') || findColumnByPattern(row, headerList, [/^id$/i, /estab.*id/i]) || '').trim();
            const estabelecimento = String(findValue(row, 'estabelecimento', 'Estabelecimento', 'Loja', 'Parceiro') || findColumnByPattern(row, headerList, [/estabelecimento|loja|parceiro|nome/i]) || '').trim();
            const status = (String(findValue(row, 'status', 'Status') || findColumnByPattern(row, headerList, [/status/i]) || 'ativo')).trim().toLowerCase() as 'ativo' | 'suspenso';
            const analista = findValue(row, 'analista', 'Analista', 'Gestor', 'Responsavel', 'Responsável') || findColumnByPattern(row, headerList, [/analista|gestor|respons/i]) || 'Desconhecido';
            const desempenho = String(findValue(row, 'desempenho', 'Desempenho', 'DESEMPENHO') || findColumnByPattern(row, headerList, [/desempenho/i]) || '').trim();
            const lancamento = hasLancamentoHeader
                ? String(findValue(row, 'lancamento', 'Lancamento', 'Lançamento') || '').trim()
                : '';

            let week_1 = parseWeekFromRow(row, 1);
            let week_2 = parseWeekFromRow(row, 2);
            let week_3 = parseWeekFromRow(row, 3);
            let week_4 = parseWeekFromRow(row, 4);

            if (week_1 === 0 && week_2 === 0 && week_3 === 0 && week_4 === 0) {
                week_1 = parseWeekValue(findColumnByPattern(row, headerList, [/week.?1|semana.?1|^s1$|^w1$/i]));
                week_2 = parseWeekValue(findColumnByPattern(row, headerList, [/week.?2|semana.?2|^s2$|^w2$/i]));
                week_3 = parseWeekValue(findColumnByPattern(row, headerList, [/week.?3|semana.?3|^s3$|^w3$/i]));
                week_4 = parseWeekValue(findColumnByPattern(row, headerList, [/week.?4|semana.?4|^s4$|^w4$/i]));
            }

            // Posicional sem lançamento: E=desempenho ou W1, F–I=semanas
            if (!hasLancamentoHeader && week_1 === 0 && week_2 === 0 && week_3 === 0 && week_4 === 0) {
                const vals = headerList.map(h => row[h]);
                if (looksLikeNumericValue(vals[4]) && looksLikeNumericValue(vals[5])) {
                    week_1 = parseWeekValue(vals[4]);
                    week_2 = parseWeekValue(vals[5]);
                    week_3 = parseWeekValue(vals[6]);
                    week_4 = parseWeekValue(vals[7]);
                } else if (looksLikeNumericValue(vals[5])) {
                    week_1 = parseWeekValue(vals[5]);
                    week_2 = parseWeekValue(vals[6]);
                    week_3 = parseWeekValue(vals[7]);
                    week_4 = parseWeekValue(vals[8]);
                }
            }

            const rawPromo = findValue(row, 'promos', 'promo', 'PROMO', 'promo_status');
            const rawCupom = findValue(row, 'cupons', 'cupom', 'CUPOM', 'cupom_status');

            return {
                cidade,
                estab_id,
                estabelecimento,
                status,
                lancamento,
                desempenho,
                week_1,
                week_2,
                week_3,
                week_4,
                analista,
                promo_status: normalizePromoStatus(rawPromo),
                cupom_status: normalizePromoStatus(rawCupom),
            };
        }).filter(isValidPartnerRow);
    }

    return dataRows.map(row => {
        const arr = Array.isArray(row) ? row as unknown[] : Object.values(row);
        const cidade = String(arr[0] ?? '').trim();
        const estab_id = String(arr[1] ?? '').trim();
        const estabelecimento = String(arr[2] ?? '').trim();
        const status = (String(arr[3] ?? 'ativo')).trim().toLowerCase() as 'ativo' | 'suspenso';

        let lancamento = '';
        let desempenho = '';
        let week_1 = 0;
        let week_2 = 0;
        let week_3 = 0;
        let week_4 = 0;

        if (looksLikeDateValue(arr[4])) {
            lancamento = String(arr[4]);
            desempenho = String(arr[5] ?? '');
            week_1 = parseWeekValue(arr[6]);
            week_2 = parseWeekValue(arr[7]);
            week_3 = parseWeekValue(arr[8]);
            week_4 = parseWeekValue(arr[9]);
        } else if (looksLikeNumericValue(arr[4]) && looksLikeNumericValue(arr[5])) {
            week_1 = parseWeekValue(arr[4]);
            week_2 = parseWeekValue(arr[5]);
            week_3 = parseWeekValue(arr[6]);
            week_4 = parseWeekValue(arr[7]);
        } else {
            desempenho = String(arr[4] ?? '');
            week_1 = parseWeekValue(arr[5]);
            week_2 = parseWeekValue(arr[6]);
            week_3 = parseWeekValue(arr[7]);
            week_4 = parseWeekValue(arr[8]);
        }

        return {
            cidade,
            estab_id,
            estabelecimento,
            status,
            lancamento,
            desempenho,
            week_1,
            week_2,
            week_3,
            week_4,
            analista: 'Desconhecido',
            promo_status: 'inativo' as const,
            cupom_status: 'inativo' as const,
        };
    }).filter(isValidPartnerRow);
}

function validateAndMapData(rawData: any[]): PerformanceRow[] {
    return rawData.map(row => {
        const cidade = findValue(row, 'cidade', 'Cidade', 'PEDIDOS_ACEITOS') || 'Desconhecida';
        const estab_id = String(findValue(row, 'estab_id', 'ESTAB_ID', 'ID', 'Id', 'id') || '').trim();
        const estabelecimento = findValue(row, 'estabelecimento', 'Estabelecimento', 'TODAS') || 'Desconhecido';
        const status = (String(findValue(row, 'status', 'Status') || 'ativo')).toLowerCase() as 'ativo' | 'suspenso';
        const lancamento = String(findValue(row, 'lancamento', 'Lancamento', 'Lançamento') || '');
        const analista = findValue(row, 'analista', 'Analista', 'Gestor', 'Responsavel') || 'Desconhecido';
        const logo_url = findValue(row, 'logo_url', 'Logo_URL', 'Logo') || '';
        const rawPromo = findValue(row, 'promos', 'promo', 'promocao', 'PROMO PARC.', 'PROMO', 'promoção', 'PROMO PARC', 'PROMOCOES', 'Promoções', 'promo_status');
        const rawCupom = findValue(row, 'cupons', 'cupom', 'CUPOM PARC.', 'CUPOM', 'cupom_status', 'CUPONS');

        return {
            cidade,
            estab_id,
            estabelecimento,
            status,
            lancamento,
            desempenho: '',
            week_1: parseWeekValue(findValue(row, 'Week_1', 'week_1')),
            week_2: parseWeekValue(findValue(row, 'Week_2', 'week_2')),
            week_3: parseWeekValue(findValue(row, 'Week_3', 'week_3')),
            week_4: parseWeekValue(findValue(row, 'Week_4', 'week_4')),
            analista,
            promo_status: normalizePromoStatus(rawPromo),
            cupom_status: normalizePromoStatus(rawCupom),
            ...(logo_url ? { logo_url } : {})
        };
    }).filter(isValidPartnerRow);
}

export function saveToCache(result: SyncResult, cacheKey: string = CACHE_KEYS.marketplace): void {
    try {
        const cacheData = {
            data: result.data,
            lastSyncTime: result.lastSyncTime.toISOString(),
            sourceUpdatedAt: result.sourceUpdatedAt ? result.sourceUpdatedAt.toISOString() : undefined
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn("Failed to save data to local storage cache", error);
    }
}

const LEGACY_CACHE_KEY = 'partner_journey_data_cache_v5';

export function loadFromCache(cacheKey: string = CACHE_KEYS.marketplace): SyncResult | null {
    try {
        let cachedString = localStorage.getItem(cacheKey);
        // Migra cache legado para o marketplace
        if (!cachedString && cacheKey === CACHE_KEYS.marketplace) {
            cachedString = localStorage.getItem(LEGACY_CACHE_KEY);
            if (cachedString) localStorage.setItem(cacheKey, cachedString);
        }
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

/** Chave estável para casar nome do parceiro (planilha principal × planilha de logos). */
export function normalizePartnerLookupKey(name: string): string {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function extractLogoSheetStoreName(row: Record<string, any>): string {
    const v = findValue(
        row,
        'parceiro_nome',
        'Parceiro_Nome',
        'estabelecimento',
        'Estabelecimento',
        'Loja',
        'loja',
        'Parceiro',
        'parceiro',
        'Nome',
        'nome',
        'Parceiros',
        'Fantasia',
        'fantasia'
    );
    return v != null ? String(v).trim() : '';
}

function normalizeLogoUrlCandidate(raw: unknown): string {
    if (raw == null) return '';
    const s = String(raw).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    return '';
}

function extractLogoSheetUrl(row: Record<string, any>): string {
    const fromLogo = normalizeLogoUrlCandidate(findValue(row, 'logo_url', 'Logo_URL', 'Logo', 'logo'));
    if (fromLogo) return fromLogo;

    const fromCms = normalizeLogoUrlCandidate(findValue(row, 'cms_arte_url', 'CMS_Arte_URL', 'cms_arte'));
    if (fromCms) return fromCms;

    const arquivo = findValue(row, 'logo_arquivo', 'Logo_Arquivo', 'logo_arquivo');
    return normalizeLogoUrlCandidate(arquivo);
}

/** Extrai linhas da planilha de logos quando o JSON do gateway varia levemente. */
function extractLogoSheetRows(json: any): Record<string, any>[] {
    if (json?.data?.rows && Array.isArray(json.data.rows)) return json.data.rows;
    if (Array.isArray(json?.rows)) return json.rows;

    const values = Array.isArray(json) ? json : json?.values;
    if (!values?.length || !Array.isArray(values[0])) return [];

    const header = (values[0] as any[]).map((h) => String(h ?? '').trim());
    const lower = header.map((h) => h.toLowerCase());

    const idxNome =
        lower.indexOf('parceiro_nome') >= 0
            ? lower.indexOf('parceiro_nome')
            : lower.indexOf('estabelecimento') >= 0
              ? lower.indexOf('estabelecimento')
              : lower.indexOf('loja') >= 0
                ? lower.indexOf('loja')
                : lower.indexOf('nome') >= 0
                  ? lower.indexOf('nome')
                  : -1;
    if (idxNome < 0) return [];

    const idxLogoUrl = lower.indexOf('logo_url') >= 0 ? lower.indexOf('logo_url') : lower.indexOf('logo');
    const idxCms = lower.indexOf('cms_arte_url');
    const idxArq = lower.indexOf('logo_arquivo');

    const objects: Record<string, any>[] = [];
    for (let r = 1; r < values.length; r++) {
        const line = values[r] as any[];
        if (!line?.length) continue;
        const o: Record<string, any> = {
            parceiro_nome: line[idxNome],
        };
        if (idxLogoUrl >= 0) o.logo_url = line[idxLogoUrl];
        if (idxCms >= 0) o.cms_arte_url = line[idxCms];
        if (idxArq >= 0) o.logo_arquivo = line[idxArq];
        objects.push(o);
    }
    return objects;
}

export async function fetchPartnerLogoMap(sheetId: string, tabName: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (!sheetId?.trim() || !tabName?.trim()) return out;

    const fetchOptions = getFetchOptions();
    const url = apiUrl(`/api/sheets/${sheetId}/${encodeSheetTabForGateway(tabName)}`);

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        throw new Error(`Logo sheet: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    let rows: Record<string, any>[] = [];
    if (json?.data?.rows && Array.isArray(json.data.rows)) {
        rows = json.data.rows;
    } else {
        rows = extractLogoSheetRows(json);
    }

    if (import.meta.env.DEV && rows.length === 0) {
        console.warn('[fetchPartnerLogoMap] Nenhuma linha parseada. Chaves do JSON:', json && typeof json === 'object' ? Object.keys(json) : typeof json);
    }

    for (const row of rows) {
        const storeName = extractLogoSheetStoreName(row);
        const logoUrl = extractLogoSheetUrl(row);
        if (!storeName || !logoUrl) continue;
        const key = normalizePartnerLookupKey(storeName);
        if (!key) continue;
        out[key] = logoUrl;
    }

    return out;
}

/**
 * Prioriza URL da planilha de logos; se ainda vazia, mantém coluna da planilha principal.
 * Assim, logo preenchida no dia seguinte passa a aparecer no próximo refresh.
 */
export function mergeLogoMapIntoRows(rows: PerformanceRow[], logoMap: Record<string, string>): PerformanceRow[] {
    return rows.map((row) => {
        const key = normalizePartnerLookupKey(row.estabelecimento);
        const fromRepo = key && logoMap[key] ? logoMap[key].trim() : '';
        const fromMain = row.logo_url?.trim() || '';
        const merged = fromRepo || fromMain;
        if (merged) return { ...row, logo_url: merged };
        const { logo_url: _omit, ...rest } = row;
        return rest as PerformanceRow;
    });
}

/**
 * Busca os dados de avaliações a partir da planilha pública e retorna um mapa de avaliações por parceiro.
 */
export async function fetchAvaliacoesMap(): Promise<Record<string, number>> {
    const csvUrl = "https://docs.google.com/spreadsheets/d/196UERhbkyBm3YZuqrqgyMTwZI0aiUqRQaQju6i4ilh4/export?format=csv&gid=1204641336";
    try {
        const response = await fetch(csvUrl);
        if (!response.ok) return {};
        const text = await response.text();
        const lines = text.split('\n');
        const map: Record<string, number> = {};

        if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const partnerIdx = headers.indexOf('estabelecimento');
            const evalIdx = headers.indexOf('total avaliações');

            if (partnerIdx >= 0 && evalIdx >= 0) {
                for (let i = 1; i < lines.length; i++) {
                    // Trata CSV simples (assumindo que não há vírgulas no nome da loja)
                    // Caso haja, seria ideal um parser robusto, mas split serve como base rápida
                    const cols = lines[i].split(',');
                    // Reconstroi o nome do estabelecimento se houver vírgula extra (tentativa simples)
                    const evalStr = cols.pop()?.trim(); // Pega o último que é Total Avaliações (se houver mais colunas)
                    
                    if (evalStr !== undefined) {
                        const total = parseInt(evalStr, 10);
                        if (!isNaN(total)) {
                            // Se a estrutura for estrita ID, Nome, Data, Total
                            const name = cols[1]?.replace(/^"|"$/g, '').trim(); 
                            if (name) {
                                const key = normalizePartnerLookupKey(name);
                                map[key] = total;
                            }
                        }
                    }
                }
            }
        }
        return map;
    } catch (err) {
        console.error("Erro ao buscar avaliações da planilha pública", err);
        return {};
    }
}

/**
 * Mescla o mapa de avaliações nas linhas de performance
 */
export function mergeAvaliacoesMapIntoRows(rows: PerformanceRow[], map: Record<string, number>): PerformanceRow[] {
    return rows.map(row => {
        const key = normalizePartnerLookupKey(row.estabelecimento);
        if (key && map[key] !== undefined) {
            return { ...row, total_avaliacoes: map[key] };
        }
        return row;
    });
}

/**
 * Busca todas as notas de relevância comercial no Supabase.
 */
export async function fetchRelevanceMap(): Promise<Record<string, number>> {
    try {
        const { data, error } = await supabase
            .from('partner_relevance')
            .select('partner_id, relevance_score');

        if (error) throw error;

        const map: Record<string, number> = {};
        data?.forEach((item: { partner_id: string; relevance_score: number }) => {
            map[item.partner_id] = item.relevance_score;
        });
        return map;
    } catch (err) {
        console.error("Erro ao buscar mapa de relevância no Supabase", err);
        return {};
    }
}

/**
 * Mescla o mapa de relevância nas linhas de performance
 */
export function mergeRelevanceMapIntoRows(rows: PerformanceRow[], map: Record<string, number>): PerformanceRow[] {
    return rows.map(row => {
        const id = row.estab_id || row.estabelecimento;
        if (id && map[id] !== undefined) {
            return { ...row, commercial_relevance: map[id] };
        }
        return row;
    });
}

/**
 * Busca os status de promoção e cupom personalizados no Supabase.
 */
export async function fetchStatusOverridesMap(): Promise<Record<string, {promo: string, cupom: string}>> {
    try {
        const { data, error } = await supabase
            .from('partner_status_overrides')
            .select('partner_id, promo_status_override, cupom_status_override');

        if (error) throw error;

        const map: Record<string, {promo: string, cupom: string}> = {};
        data?.forEach((item: any) => {
            map[item.partner_id] = {
                promo: item.promo_status_override,
                cupom: item.cupom_status_override
            };
        });
        return map;
    } catch (err) {
        console.warn("Erro ao buscar status overrides no Supabase", err);
        return {};
    }
}

/**
 * Mescla o mapa de status overrides nas linhas de performance
 */
export function mergeStatusOverridesIntoRows(rows: PerformanceRow[], map: Record<string, {promo: string, cupom: string}>): PerformanceRow[] {
    return rows.map(row => {
        const id = row.estab_id || row.estabelecimento;
        if (id && map[id]) {
            return {
                ...row,
                promo_status: (map[id].promo as any) || row.promo_status,
                cupom_status: (map[id].cupom as any) || row.cupom_status
            };
        }
        return row;
    });
}
