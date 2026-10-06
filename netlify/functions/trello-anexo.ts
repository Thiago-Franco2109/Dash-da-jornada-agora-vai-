import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloBaixarAnexo } from './_shared/trello';

/**
 * Serve os bytes de um anexo do Trello pro <img> do dashboard.
 *
 * As URLs de anexo do Trello respondem 401 sem o header `Authorization: OAuth`
 * (e esse header carrega o TRELLO_TOKEN, que NUNCA pode ir pro navegador) —
 * então a imagem precisa passar por aqui.
 *
 * A URL é MONTADA no servidor a partir dos ids validados, nunca aceita URL
 * pronta do cliente: senão isso virava um proxy aberto pra qualquer host.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** Ids do Trello são ObjectIds de 24 hex — qualquer coisa fora disso é recusada. */
const ID_TRELLO = /^[a-f0-9]{24}$/i;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const cardId = event.queryStringParameters?.cardId?.trim() ?? '';
    const anexoId = event.queryStringParameters?.anexoId?.trim() ?? '';
    const previewId = event.queryStringParameters?.previewId?.trim() ?? '';

    if (!ID_TRELLO.test(cardId) || !ID_TRELLO.test(anexoId) || (previewId && !ID_TRELLO.test(previewId))) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetros inválidos' }) };
    }

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;
    if (!key || !token) {
        return { statusCode: 500, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Variáveis de ambiente do Trello ausentes' }) };
    }

    // O nome final do arquivo não importa pro Trello servir o conteúdo, só o caminho.
    const url = previewId
        ? `https://trello.com/1/cards/${cardId}/attachments/${anexoId}/previews/${previewId}/download/anexo`
        : `https://trello.com/1/cards/${cardId}/attachments/${anexoId}/download/anexo`;

    try {
        const { bytes, contentType } = await trelloBaixarAnexo(url, key, token);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
                // Anexo é imutável: id novo a cada upload, pode cachear forte.
                'Cache-Control': 'private, max-age=86400',
            },
            body: bytes.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: erroHeaders, body: JSON.stringify({ ok: false, error: message }) };
    }
};
