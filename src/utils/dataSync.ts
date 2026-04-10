import { type PerformanceRow } from '../components/PerformanceTable';

export interface SyncResult {
    data: PerformanceRow[];
    lastSyncTime: Date;
    sourceUpdatedAt?: Date; // Optional
}
const CACHE_KEY = 'partner_journey_data_cache_v5';


const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "https://sheets-api-production-0097.up.railway.app")
    .trim()
    .replace(/\/+$/, '');

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
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

export async function fetchGoogleSheetsData(sheetId: string, tabName: string = "NOVOS"): Promise<PerformanceRow[]> {
    const fetchOptions = getFetchOptions();

    // Construir a URL do Gateway API (apenas o nome da aba, sem range)
    const url = apiUrl(`/api/sheets/${sheetId}/${encodeURIComponent(tabName)}`);


    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const message = errorJson.error || `Erro ${response.status}: ${response.statusText}`;
        const tentative = errorJson.tentativa ? ` (Attempted: ${errorJson.tentativa})` : "";
        throw new Error(`${message}${tentative}`);
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
                desempenho: row[5] || "",
                week_1: row[6] || 0,
                week_2: row[7] || 0,
                week_3: row[8] || 0,
                week_4: row[9] || 0,
                promo: row[10] || "",
                cupom: row[11] || ""
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

    if (headers && headers.length >= 7) {
        return dataRows.map(row => {
            const vals = headers.map(h => row[h]);
            const logoRaw = findValue(row, 'logo_url', 'Logo_URL', 'Logo');
            const logo_url = logoRaw != null && String(logoRaw).trim() ? String(logoRaw).trim() : '';
            const analista = findValue(row, 'analista', 'Analista', 'Gestor', 'Responsavel') || 'Desconhecido';
            
            const rawPromo = findValue(row, 'promos', 'promo', 'promocao', 'PROMO PARC.', 'PROMO', 'promoção', 'PROMO PARC', 'PROMOCOES', 'Promoções', 'promo_status') || vals[10];
            const rawCupom = findValue(row, 'cupons', 'cupom', 'CUPOM PARC.', 'CUPOM', 'cupom_status', 'CUPONS') || vals[11];

            return {
                cidade: String(vals[0] || '').trim(),
                estab_id: String(vals[1] || '').trim(),
                estabelecimento: String(vals[2] || '').trim(),
                status: (String(vals[3] || 'ativo').trim().toLowerCase()) as 'ativo' | 'suspenso',
                lancamento: String(vals[4] || '').trim(),
                desempenho: '',
                week_1: parseWeekValue(vals[6]),
                week_2: parseWeekValue(vals[7]),
                week_3: parseWeekValue(vals[8]),
                week_4: parseWeekValue(vals[9]),
                analista,
                promo_status: normalizePromoStatus(rawPromo),
                cupom_status: normalizePromoStatus(rawCupom),
                ...(logo_url ? { logo_url } : {}),
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
    const url = apiUrl(`/api/sheets/${sheetId}/${encodeURIComponent(tabName)}`);

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
