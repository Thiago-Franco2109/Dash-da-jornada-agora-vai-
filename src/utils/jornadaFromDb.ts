import type { PerformanceRow } from '../components/PerformanceTable';
import { parseGatewayTableRows, parseCDDesempenhoRows } from './dataSync';

/**
 * Parceiros e pedidos por semana direto do banco (Function `jornada`),
 * substituindo as abas "novos formatado" (Thiago e Laís),
 * CD_TODOS_NOVOS_FORMATADO e CD_TODOS_DESEMPENHO.
 *
 * A Function devolve a tabela no formato da aba, então quem transforma em
 * PerformanceRow continua sendo o parser de sempre — inclusive o de CD, que
 * lê 12 semanas por cabeçalho em vez das 4 posicionais da jornada.
 *
 * O analista não vem no payload: o app resolve pelo mapa de cidades.
 */

const JORNADA_FN_URL = '/.netlify/functions/jornada';

interface JornadaOpcoes {
    /** 'cd' traz só assinantes do Cardápio Digital */
    produto?: 'marketplace' | 'cd';
    /** 'desempenho' = 12 semanas corridas de todos; padrão = jornada dos novos */
    modo?: 'jornada' | 'desempenho';
}

export async function fetchJornadaRowsFromDb(opcoes: JornadaOpcoes = {}): Promise<PerformanceRow[]> {
    const params = new URLSearchParams();
    if (opcoes.produto === 'cd') params.set('produto', 'cd');
    if (opcoes.modo === 'desempenho') params.set('modo', 'desempenho');

    const url = params.toString() ? `${JORNADA_FN_URL}?${params}` : JORNADA_FN_URL;
    const res = await fetch(url, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.tabela) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar a jornada.`);
    }

    const tabela = json.tabela as { headers: string[]; rows: Record<string, unknown>[] };
    return opcoes.modo === 'desempenho'
        ? parseCDDesempenhoRows(tabela.rows, tabela.headers)
        : parseGatewayTableRows(tabela.rows, tabela.headers);
}

/** Novos parceiros do marketplace — abas "novos formatado". */
export const fetchJornadaMarketplace = () => fetchJornadaRowsFromDb();

/** Novos assinantes do Cardápio Digital — aba CD_TODOS_NOVOS_FORMATADO. */
export const fetchJornadaCd = () => fetchJornadaRowsFromDb({ produto: 'cd' });

/** Todas as lojas do CD, 12 semanas — aba CD_TODOS_DESEMPENHO. */
export const fetchCdDesempenho = () => fetchJornadaRowsFromDb({ produto: 'cd', modo: 'desempenho' });
