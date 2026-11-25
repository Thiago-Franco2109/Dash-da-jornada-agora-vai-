import type { Handler } from '@netlify/functions';
import { GoogleAuth } from 'google-auth-library';

/**
 * Acessos ao cardápio direto da GA4 Data API.
 *
 * Substitui o caminho antigo (GA → add-on SyncWith → planilha → gateway), que
 * acumulou três defeitos independentes: o gateway monta as colunas pela linha 1
 * da aba (e a linha 1 é a faixa do add-on), corta a resposta em ~10 mil linhas
 * (a aba crua tem ~31 mil, ordenada por volume, então as lojas pequenas sumiam
 * sem erro), e a janela ficava presa nos 30 dias configurados no relatório.
 *
 * Aqui a loja é identificada por `estabelecimento_id` — nunca por nome, que se
 * repete entre cidades.
 */

const PROPERTY_ID = '196047970'; // Bigou (conta Lab Cinco)
const GA_ENDPOINT = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`;

/** Data no fuso de São Paulo, que é o fuso em que a própria API responde. */
function diaSP(offsetDias: number): string {
    const agora = new Date(Date.now() - offsetDias * 86400000);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(agora);
}

async function runReport(token: string, body: Record<string, unknown>) {
    const res = await fetch(GA_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detalhe = await res.text();
        throw new Error(`GA ${res.status}: ${detalhe.slice(0, 300)}`);
    }
    return res.json() as Promise<{
        rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
    }>;
}

const filtroAccessStore = {
    filter: { fieldName: 'eventName', stringFilter: { value: 'access_store' } },
};

export const handler: Handler = async (event) => {
    const dias = Math.min(Math.max(parseInt(event.queryStringParameters?.dias ?? '30', 10) || 30, 1), 365);

    // O GA exclui o dia corrente: ele ainda está aberto e o número subiria ao
    // longo do dia, o que faria a última barra parecer queda.
    const inicio = diaSP(dias);
    const fim = diaSP(1);

    const clientEmail = process.env.GA_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = (process.env.GA_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Credenciais do GA não configuradas (GA_CLIENT_EMAIL / GA_PRIVATE_KEY)' }),
        };
    }

    try {
        const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
        });
        const token = (await (await auth.getClient()).getAccessToken()).token;
        if (!token) throw new Error('Falha ao obter token do service account');

        const dateRanges = [{ startDate: inicio, endDate: fim }];

        const [porLoja, porCidade] = await Promise.all([
            runReport(token, {
                dateRanges,
                dimensions: [{ name: 'customEvent:estabelecimento_id' }],
                metrics: [{ name: 'activeUsers' }],
                dimensionFilter: filtroAccessStore,
                limit: 100000,
            }),
            runReport(token, {
                dateRanges,
                dimensions: [{ name: 'customUser:localidade' }],
                metrics: [{ name: 'activeUsers' }],
                dimensionFilter: filtroAccessStore,
                limit: 1000,
            }),
        ]);

        // `(not set)` é acesso que o app não atribuiu a ninguém — não é loja nem
        // cidade, e somá-lo em qualquer lugar inventaria número.
        const naoAtribuido = (v: string) => !v || /^\(not set\)$/i.test(v.trim());

        const lojas: Record<string, number> = {};
        for (const row of porLoja.rows ?? []) {
            const id = row.dimensionValues[0]?.value ?? '';
            if (naoAtribuido(id)) continue;
            lojas[id.trim()] = Number(row.metricValues[0]?.value ?? 0);
        }

        const cidades: Record<string, number> = {};
        for (const row of porCidade.rows ?? []) {
            const cidade = row.dimensionValues[0]?.value ?? '';
            if (naoAtribuido(cidade)) continue;
            cidades[cidade.trim()] = Number(row.metricValues[0]?.value ?? 0);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=900' },
            body: JSON.stringify({
                ok: true,
                janela: { inicio, fim, dias },
                lojas,
                cidades,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: message }) };
    }
};
