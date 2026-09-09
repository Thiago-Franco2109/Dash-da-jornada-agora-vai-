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
