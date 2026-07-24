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
