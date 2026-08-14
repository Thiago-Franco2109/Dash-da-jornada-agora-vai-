import { useCallback, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Integração com a Netlify Function `promo-item-arte` (banco MySQL).
// Mesma convenção de auth de `useAcoesPromocionaisData.ts`.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/promo-item-arte';

function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '';
    const options: RequestInit = { credentials: 'include' as RequestCredentials };
    if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
    }
    return options;
}

async function fetchFn<T>(query: string): Promise<T> {
    const res = await fetch(`${FN_URL}${query}`, getFetchOptions());
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
        if (res.status === 401) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        throw new Error(json?.error || `Erro ${res.status} ao consultar item promocional.`);
    }
    return json as T;
}

export interface PromoItemArte {
    id: number;
    nome: string;
    precoOriginal: number;
    precoPromocional: number | null;
    imagem: string | null;
    disponibilidadeDiaria: string | null;
    campanha: string | null;
    /** 1=pendente (aguardando aprovação do parceiro) 2=aprovado. */
    status: number;
}

interface PromoItemArteResponse {
    itens: PromoItemArte[];
}

export function fetchPromoItemArte(estabelecimentoId: number): Promise<PromoItemArte[]> {
    const params = new URLSearchParams({ estabelecimentoId: String(estabelecimentoId) });
    return fetchFn<PromoItemArteResponse>(`?${params.toString()}`).then(res => res.itens);
}

/** Mesma formatação de `js/csvParser.js` do gerador (formatDays), pra ficar idêntico ao CSV. */
export function formatDiasAtivos(diasStr: string | null): string {
    if (!diasStr || diasStr === 'NULL' || diasStr.trim() === '') return '';
    const dias = diasStr.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !Number.isNaN(d)).sort();

    if (dias.length === 7) return '';

    const isWeekdays = dias.length === 5 && !dias.includes(0) && !dias.includes(6);
    if (isWeekdays) return 'Apenas de Segunda a Sexta';

    const isWeekend = dias.length === 2 && dias.includes(0) && dias.includes(6);
    if (isWeekend) return 'Apenas Sábado e Domingo';

    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const mapped = dias.map(d => dayNames[d]);

    if (mapped.length === 1) return `Apenas às ${mapped[0]}s`.replace('Domingos', 'Domingo').replace('Sábados', 'Sábado');

    const last = mapped.pop();
    return `Apenas ${mapped.join(', ')} e ${last}`;
}

/** Mesma formatação de `js/csvParser.js` do gerador (formatPrice). */
export function formatPrecoArte(valor: number | null): string {
    if (valor == null) return '';
    return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/**
 * `item_catalogo.imagem` guarda só o nome do arquivo (confirmado contra dados
 * reais: ex. "b21a1ac8-....jpg"). Fica no bucket DigitalOcean da Bigou, pasta
 * `bigou/item/` (confirmado via HEAD request — `bigou/` na raiz e `/uploads/`
 * dão AccessDenied). Usa o domínio do CDN direto, sem redirecionamento.
 */
export function resolveImagemItem(imagem: string | null): string | null {
    if (!imagem) return null;
    if (/^https?:\/\//i.test(imagem)) return imagem;
    return `https://labcinco.nyc3.cdn.digitaloceanspaces.com/bigou/item/${imagem.replace(/^\/+/, '')}`;
}

interface UsePromoItemArteResult {
    itens: PromoItemArte[];
    isLoading: boolean;
    error: string | null;
    load: (estabelecimentoId: number) => void;
}

export function usePromoItemArte(): UsePromoItemArteResult {
    const [itens, setItens] = useState<PromoItemArte[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback((estabelecimentoId: number) => {
        setIsLoading(true);
        setError(null);
        fetchPromoItemArte(estabelecimentoId)
            .then(setItens)
            .catch(err => {
                console.warn('[usePromoItemArte] falha:', err);
                setError(err.message);
            })
            .finally(() => setIsLoading(false));
    }, []);

    return { itens, isLoading, error, load };
}
