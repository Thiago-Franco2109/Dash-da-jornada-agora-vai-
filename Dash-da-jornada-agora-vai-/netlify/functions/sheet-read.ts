import type { Handler } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';

function buildQuotedRange(tabName: string): string {
    const safe = tabName.trim().replace(/'/g, "''");
    return `'${safe}'!A1:ZZ10000`;
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
            body: JSON.stringify({ error: 'Credenciais Google não configuradas no Netlify (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)' }),
        };
    }

    try {
        const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new Error('Falha ao obter token do service account');

        const range = encodeURIComponent(buildQuotedRange(tab));
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
        const json = await res.json();

        if (!res.ok) {
            return {
                statusCode: res.status,
                body: JSON.stringify({ error: json.error?.message || `Google API ${res.status}` }),
            };
        }

        const values: string[][] = json.values || [];
        if (values.length === 0) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { headers: [], rows: [], count: 0 } }),
            };
        }

        const headers = values[0].map(cell => String(cell ?? '').trim());
        const rows = values.slice(1).map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] != null ? String(row[index]) : '';
            });
            return obj;
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Credentials': 'true' },
            body: JSON.stringify({ success: true, data: { headers, rows, count: rows.length } }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 500, body: JSON.stringify({ error: message }) };
    }
};
