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
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
): Promise<T> {
    const query = new URLSearchParams({ key, token, ...params }).toString();
    const res = await fetch(`https://api.trello.com/1${path}?${query}`, { method });
    if (!res.ok) {
        throw new Error(`Trello API ${res.status}: ${res.statusText}`);
    }
    return res.json();
}

/**
 * Upload de arquivo pro Trello (multipart/form-data). Não dá pra reaproveitar
 * o trelloFetch porque binário só entra por form-data, não por query string.
 */
export async function trelloUpload<T>(
    path: string,
    key: string,
    token: string,
    arquivo: { bytes: Uint8Array; nome: string; mimeType: string },
    params: Record<string, string> = {},
): Promise<T> {
    const query = new URLSearchParams({ key, token, ...params }).toString();
    const form = new FormData();
    form.append('file', new Blob([arquivo.bytes], { type: arquivo.mimeType }), arquivo.nome);
    const res = await fetch(`https://api.trello.com/1${path}?${query}`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`Trello API ${res.status}: ${res.statusText}`);
    }
    return res.json();
}

/**
 * Baixa os bytes de um anexo do Trello.
 *
 * Só funciona com o header `Authorization: OAuth` — key/token na query string
 * dão 401 nessas URLs de download (testado contra a API real), diferente do
 * resto da API. É por isso que o navegador não consegue carregar a imagem
 * direto: precisa passar por essa function (ver trello-anexo.ts).
 */
export async function trelloBaixarAnexo(
    url: string,
    key: string,
    token: string,
): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await fetch(url, {
        headers: { Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` },
    });
    if (!res.ok) {
        throw new Error(`Trello anexo ${res.status}: ${res.statusText}`);
    }
    return {
        bytes: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
}

/**
 * Mapeamento de campos brutos da API do Trello pro formato que o front
 * consome (ver src/types/trello.ts) — compartilhado entre trello-tarefas.ts
 * e onboarding-trello.ts, que buscam cards enriquecidos da mesma forma.
 */
export interface TrelloLabelBruto {
    id: string;
    name: string;
    color: string | null;
}

export interface TrelloMemberBruto {
    id: string;
    fullName: string;
    initials: string;
    avatarUrl: string | null;
}

export interface TrelloBadgesBruto {
    checkItems: number;
    checkItemsChecked: number;
    comments: number;
    attachments: number;
    description: boolean;
}

export function mapLabels(labels: TrelloLabelBruto[]) {
    return labels.map(l => ({ id: l.id, nome: l.name, cor: l.color }));
}

export function mapMembros(idMembers: string[], membrosPorId: Map<string, TrelloMemberBruto>) {
    return idMembers
        .map(id => membrosPorId.get(id))
        .filter((m): m is TrelloMemberBruto => m != null)
        .map(m => ({ id: m.id, nome: m.fullName, iniciais: m.initials, avatarUrl: m.avatarUrl }));
}

export function mapBadges(badges: TrelloBadgesBruto) {
    return {
        checklist: badges.checkItems > 0
            ? { total: badges.checkItems, feitos: badges.checkItemsChecked }
            : null,
        comentarios: badges.comments,
        anexos: badges.attachments,
        temDescricao: badges.description,
    };
}
