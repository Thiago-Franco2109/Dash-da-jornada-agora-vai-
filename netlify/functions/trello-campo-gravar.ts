import type { Handler } from '@netlify/functions';
import { checkOrigin } from './_shared/auth';

/**
 * Grava um campo personalizado de um card (status de campanha no quadro da
 * jornada).
 *
 * É o lado de escrita do `trello-jornada`. Fica numa Function porque
 * TRELLO_API_KEY/TRELLO_TOKEN são credenciais de servidor — nunca VITE_.
 *
 * `idValue` vazio APAGA o valor (volta pro campo em branco). O Trello pede
 * `{"idValue": ""}` no corpo pra isso; mandar o campo ausente não limpa.
 *
 * O `trelloFetch` compartilhado não serve aqui: ele manda tudo por query
 * string, e este endpoint exige corpo JSON.
 *
 * ATENÇÃO À AUTORIA: o token é o do projeto, então toda escrita aparece no
 * histórico do card como sendo do dono do token (ver memória do projeto sobre
 * a extensão de print). Para status de campanha isso é aceitável — o que
 * importa é o valor —, mas não use este caminho pra nada que vire métrica de
 * quem fez.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;
    if (!key || !token) {
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Faltam TRELLO_API_KEY/TRELLO_TOKEN no ambiente.' }) };
    }

    let corpo: { cardId?: string; campoId?: string; idValue?: string | null };
    try {
        corpo = JSON.parse(event.body ?? '{}');
    } catch {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Corpo inválido (esperado JSON).' }) };
    }

    const { cardId, campoId, idValue } = corpo;
    if (!cardId || !campoId) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'cardId e campoId são obrigatórios.' }) };
    }

    const started = Date.now();
    try {
        const url = `https://api.trello.com/1/cards/${cardId}/customField/${campoId}/item`
            + `?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // String vazia = limpar. `null` viraria "null" e o Trello recusa.
            body: JSON.stringify({ idValue: idValue ?? '' }),
        });
        if (!res.ok) {
            const detalhe = (await res.text().catch(() => '')).slice(0, 300);
            return {
                statusCode: 502,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: false, error: `Trello ${res.status}: ${res.statusText}${detalhe ? ` — ${detalhe}` : ''}`, elapsedMs: Date.now() - started }),
            };
        }
        return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true, elapsedMs: Date.now() - started }) };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: message, elapsedMs: Date.now() - started }) };
    }
};
