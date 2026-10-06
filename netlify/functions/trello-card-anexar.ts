import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';
import { trelloUpload } from './_shared/trello';

/**
 * Anexa um arquivo (normalmente print colado da área de transferência) a um
 * card — POST /1/cards/{id}/attachments, multipart.
 *
 * É assim que o próprio Trello faz imagem em comentário: o arquivo vira ANEXO
 * do card e o comentário só referencia ele em markdown
 * `![nome](url-do-preview)` — confirmado lendo comentários reais criados pelo
 * app oficial. Por isso devolvemos `previewUrl` já escolhido (~600px, mesmo
 * tamanho que o Trello usa) pronto pra montar o markdown.
 *
 * Limite de 4 MB: o corpo da request chega em base64 (+33%) e a Netlify/Lambda
 * corta em 6 MB. Print de tela cabe folgado.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const TAMANHO_MAX_BYTES = 4 * 1024 * 1024;
const LARGURA_PREVIEW_ALVO = 600;

interface TrelloPreview {
    id: string;
    url: string;
    width: number;
    height: number;
}

interface TrelloAnexoCriado {
    id: string;
    name: string;
    url: string;
    date: string;
    bytes: number | null;
    mimeType: string;
    previews?: TrelloPreview[];
}

/** O Trello embute o preview de ~600px nos comentários, não o original (que pode ter vários MB). */
function escolherPreview(previews: TrelloPreview[] | undefined): TrelloPreview | null {
    if (!previews?.length) return null;
    const ordenados = [...previews].sort((a, b) => a.width - b.width);
    return ordenados.find(p => p.width >= LARGURA_PREVIEW_ALVO) ?? ordenados[ordenados.length - 1];
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let body: { cardId?: unknown; nome?: unknown; mimeType?: unknown; dataBase64?: unknown };
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'JSON inválido no corpo da requisição' }) };
    }

    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    const nome = typeof body.nome === 'string' && body.nome.trim() ? body.nome.trim() : 'anexo';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'application/octet-stream';
    const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';

    if (!cardId) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'cardId é obrigatório' }) };
    }
    if (!dataBase64) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Arquivo vazio' }) };
    }

    const bytes = Buffer.from(dataBase64, 'base64');
    if (bytes.length === 0) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Arquivo inválido (base64 não decodificou)' }) };
    }
    if (bytes.length > TAMANHO_MAX_BYTES) {
        return {
            statusCode: 413,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Arquivo muito grande (${(bytes.length / 1024 / 1024).toFixed(1)} MB). Máximo 4 MB.` }),
        };
    }

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;

    const missing = [
        ['TRELLO_API_KEY', key],
        ['TRELLO_TOKEN', token],
    ].filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
        return {
            statusCode: 500,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Variáveis de ambiente ausentes: ${missing.join(', ')}` }),
        };
    }

    try {
        const criado = await trelloUpload<TrelloAnexoCriado>(
            `/cards/${cardId}/attachments`,
            key!,
            token!,
            { bytes, nome, mimeType },
            { name: nome, mimeType, fields: 'all' },
        );

        const preview = escolherPreview(criado.previews);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                anexo: {
                    id: criado.id,
                    nome: criado.name,
                    url: criado.url,
                    data: criado.date,
                    bytes: criado.bytes,
                    tipo: criado.mimeType,
                    // URL que vai pro markdown do comentário; cai no original
                    // quando o arquivo não gera preview (PDF, zip etc.).
                    previewUrl: preview?.url ?? criado.url,
                    previewId: preview?.id ?? null,
                },
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: message }),
        };
    }
};
