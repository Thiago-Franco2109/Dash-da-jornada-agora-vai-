import type { Handler } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';

function parseCSV(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') { currentCell += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim()); currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell.trim());
            if (currentRow.some(c => c !== '')) rows.push(currentRow);
            currentRow = []; currentCell = '';
        } else if (char !== '\r') {
            currentCell += char;
        }
    }

    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c !== '')) rows.push(currentRow);
    }

    return rows;
}

function rowsToGatewayJson(values: string[][]) {
    if (values.length === 0) {
        return { success: true, data: { headers: [], rows: [], count: 0 } };
    }
    const headers = values[0].map(cell => String(cell ?? '').trim());
    const rows = values.slice(1).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] != null ? String(row[index]) : '';
        });
        return obj;
    });
    return { success: true, data: { headers, rows, count: rows.length } };
}

function normalizeTabName(name: string): string {
    return name.toLowerCase().replace(/[\s_]+/g, '');
}

/** Encontra o título exato da aba na planilha (case/spacing insensitive) */
export function resolveSheetTabTitle(hint: string, availableTabs: string[]): string | null {
    const hintNorm = normalizeTabName(hint);
    const exact = availableTabs.find(t => normalizeTabName(t) === hintNorm);
    if (exact) return exact;

    if (/desempenho/i.test(hint)) {
        const byKeyword = availableTabs.find(t => /desempenho/i.test(t));
        if (byKeyword) return byKeyword;
    }

    if (/novos/i.test(hint)) {
        const byKeyword = availableTabs.find(t => /novos/i.test(t) && /formatado/i.test(t));
        if (byKeyword) return byKeyword;
    }

    return null;
}

async function listSheetTabs(sheetId: string, token: string): Promise<string[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as { sheets?: { properties?: { title?: string } }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message || `Erro ao listar abas (${res.status})`);
    return (json.sheets ?? [])
        .map(s => s.properties?.title?.trim())
        .filter((t): t is string => Boolean(t));
}

async function fetchViaGviz(sheetId: string, tab: string, token: string): Promise<string[][]> {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    const res = await fetch(gvizUrl, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'follow',
    });

    if (!res.ok) {
        throw new Error(`gviz ${res.status}`);
    }

    const text = await res.text();
    if (text.includes('<!DOCTYPE html') || text.includes('accounts.google.com')) {
        throw new Error('Acesso negado ao ler a planilha via service account');
    }

    return parseCSV(text);
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const sheetId = event.queryStringParameters?.sheetId?.trim();
    const tab = event.queryStringParameters?.tab?.trim();

    if (!sheetId || !tab) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Parâmetros sheetId e tab são obrigatórios' }) };
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Credenciais Google não configuradas (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)' }),
        };
    }

    try {
        const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly',
            ],
        });
        const client = await auth.getClient();
        const tokenResult = await client.getAccessToken();
        if (!tokenResult.token) throw new Error('Falha ao obter token do service account');
        const token = tokenResult.token;

        const availableTabs = await listSheetTabs(sheetId, token);
        const resolvedTab = resolveSheetTabTitle(tab, availableTabs);

        if (!resolvedTab) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Aba "${tab}" não encontrada na planilha.`,
                    availableTabs,
                }),
            };
        }

        const values = await fetchViaGviz(sheetId, resolvedTab, token);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Credentials': 'true' },
            body: JSON.stringify({ ...rowsToGatewayJson(values), resolvedTab }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 500, body: JSON.stringify({ error: message }) };
    }
};
