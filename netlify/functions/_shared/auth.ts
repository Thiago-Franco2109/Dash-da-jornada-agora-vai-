import type { HandlerEvent } from '@netlify/functions';

const API_ORIGIN = (process.env.VITE_API_ORIGIN ?? process.env.API_ORIGIN ?? 'https://sheets-api-production-0097.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

export interface AuthedUser {
    email?: string;
    name?: string;
    role?: string;
    [k: string]: unknown;
}

export interface AuthResult {
    ok: boolean;
    status: number;
    user?: AuthedUser;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// STOPGAP: checagem de origem (Referer/Origin).
//
// ⚠️ NÃO é segurança de verdade — o header Referer/Origin é falsificável por
// quem chama a function fora do navegador (ex: curl). Serve apenas para
// bloquear acesso casual enquanto a autenticação definitiva não é decidida
// (opções: token via Gateway, ou Supabase Auth). Ver HANDOFF.
//
// Hosts liberados: env ALLOWED_ORIGIN_HOSTS (CSV) ou o default abaixo.
// Casa o host exato e subdomínios (ex: deploy previews *.netlify.app do site).
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_ALLOWED_HOSTS = ['central-cs-bigou.netlify.app', 'localhost', '127.0.0.1'];

export interface OriginResult {
    ok: boolean;
    status: number;
    host?: string;
    error?: string;
}

/**
 * A extensão de promoções (extensao-promo/) se identifica por um header
 * próprio, X-Extensao-Id, e não por Origin.
 *
 * O motivo é do navegador: fetch que sai do service worker da extensão pra
 * host declarado em `host_permissions` NÃO é requisição CORS, então o Chrome
 * não manda `Origin` nem `Referer` — a function via "Origem ausente"
 * (testado com a extensão real; só com `curl -H Origin:` forjado é que
 * passava). E `Origin` é nome de header proibido no fetch, não dá pra forçar
 * do lado da extensão.
 *
 * O id vem de `chrome.runtime.id` e é conferido contra a env
 * ALLOWED_EXTENSION_IDS (CSV). Liberar pelo allowlist de host não serviria, e
 * aceitar qualquer `chrome-extension://` abriria pra toda extensão instalada.
 *
 * Mesmo nível de garantia do resto daqui: é STOPGAP, não autenticação — um
 * header é tão forjável quanto o Origin que já protegia o resto.
 */
function checkExtensao(id: string): boolean {
    const ids = (process.env.ALLOWED_EXTENSION_IDS || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    return ids.includes(id);
}

export function checkOrigin(event: HandlerEvent): OriginResult {
    const configured = (process.env.ALLOWED_ORIGIN_HOSTS || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    const allowed = configured.length ? configured : DEFAULT_ALLOWED_HOSTS;

    // Antes do Origin: a extensão não manda Origin nenhum (ver checkExtensao).
    const extensaoId = (event.headers?.['x-extensao-id'] || event.headers?.['X-Extensao-Id'] || '').trim();
    if (extensaoId) {
        return checkExtensao(extensaoId)
            ? { ok: true, status: 200, host: extensaoId }
            : { ok: false, status: 403, host: extensaoId, error: `Extensão não permitida: ${extensaoId}` };
    }

    const raw =
        event.headers?.origin || event.headers?.Origin ||
        event.headers?.referer || event.headers?.Referer || '';

    if (!raw) return { ok: false, status: 403, error: 'Origem ausente' };

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, status: 403, error: 'Origem inválida' };
    }
    const host = url.hostname;

    if (url.protocol === 'chrome-extension:') {
        return checkExtensao(host)
            ? { ok: true, status: 200, host }
            : { ok: false, status: 403, host, error: `Extensão não permitida: ${host}` };
    }

    const ok = allowed.some(h => host === h || host.endsWith(`.${h}`));
    return ok
        ? { ok: true, status: 200, host }
        : { ok: false, status: 403, host, error: `Origem não permitida: ${host}` };
}

/**
 * Revalida a sessão do usuário reaproveitando o mesmo Gateway que o front usa.
 *
 * O navegador manda o token Bearer (mesmo esquema do AuthContext) e/ou o
 * cookie de sessão; repassamos ambos para `${API_ORIGIN}/auth/me`. Se o
 * Gateway responder 200, o usuário está logado com e-mail da empresa.
 *
 * Não guardamos segredo próprio — a fonte da verdade continua sendo o Gateway.
 */
export async function verifyAuth(event: HandlerEvent): Promise<AuthResult> {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const cookie = event.headers?.cookie || event.headers?.Cookie;

    if (!authHeader && !cookie) {
        return { ok: false, status: 401, error: 'Não autenticado (sem token nem cookie de sessão)' };
    }

    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (cookie) headers['Cookie'] = cookie;

    try {
        const res = await fetch(`${API_ORIGIN}/auth/me`, { headers });
        if (!res.ok) {
            return { ok: false, status: 401, error: `Sessão inválida ou expirada (${res.status})` };
        }
        const data = await res.json().catch(() => ({}));
        const user: AuthedUser = data.user || data;
        return { ok: true, status: 200, user };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao validar sessão';
        return { ok: false, status: 502, error: message };
    }
}
