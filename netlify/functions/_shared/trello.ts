/**
 * Helper compartilhado pra chamar a API do Trello a partir de Netlify
 * Functions server-side. Key/token sempre vêm do caller (env vars
 * TRELLO_API_KEY/TRELLO_TOKEN) — nunca hardcoded aqui, e nunca com prefixo
 * VITE_ (senão vaza pro bundle do navegador).
 */
export async function trelloFetch<T>(
    path: string,
    key: string,
    token: string,
    params: Record<string, string> = {},
): Promise<T> {
    const query = new URLSearchParams({ key, token, ...params }).toString();
    const res = await fetch(`https://api.trello.com/1${path}?${query}`);
    if (!res.ok) {
        throw new Error(`Trello API ${res.status}: ${res.statusText}`);
    }
    return res.json();
}
