import type { Handler } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const sheetId = event.queryStringParameters?.sheetId?.trim();
    if (!sheetId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Parâmetro sheetId é obrigatório' }) };
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Credenciais Google não configuradas' }),
        };
    }

    try {
        const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new Error('Falha ao obter token');

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
        const json = await res.json() as { sheets?: { properties?: { title?: string } }[]; error?: { message?: string } };

        if (!res.ok) {
            return { statusCode: res.status, body: JSON.stringify({ error: json.error?.message || 'Erro ao listar abas' }) };
        }

        const tabs = (json.sheets ?? [])
            .map(s => s.properties?.title?.trim())
            .filter((t): t is string => Boolean(t));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, tabs }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 500, body: JSON.stringify({ error: message }) };
    }
};
