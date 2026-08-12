import type { PerformanceRow } from '../components/PerformanceTable';
import { parseGatewayTableRows } from './dataSync';

/**
 * Jornada dos novos parceiros direto do banco (Function `jornada`),
 * substituindo as abas "novos formatado" do Thiago e da Laís.
 *
 * A Function devolve a tabela no formato da aba, então quem transforma em
 * PerformanceRow continua sendo o parser de sempre. O analista não vem no
 * payload: o app resolve pelo mapa de cidades.
 */

const JORNADA_FN_URL = '/.netlify/functions/jornada';

export async function fetchJornadaRowsFromDb(): Promise<PerformanceRow[]> {
    const res = await fetch(JORNADA_FN_URL, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !json?.tabela) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar a jornada.`);
    }

    const tabela = json.tabela as { headers: string[]; rows: Record<string, unknown>[] };
    return parseGatewayTableRows(tabela.rows, tabela.headers);
}
