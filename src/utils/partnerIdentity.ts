import type { EnrichedPerformanceRow } from './calculations';

/**
 * Identidade de parceiro.
 *
 * Nome NÃO identifica loja: trabalhamos com várias cidades e o mesmo nome se
 * repete (há 4 "Mega Lanches" no banco, em cidades diferentes). Quem manda é o
 * `estab_id`. Casar por nome primeiro fazia a busca listar os dois homônimos e
 * abrir sempre o primeiro, e fazia a tela de detalhe trocar o parceiro
 * selecionado pelo homônimo ao reconciliar a linha com o pool.
 *
 * O nome só serve de última saída, para linhas que realmente não têm id (a aba
 * "novos formatado" do dashboard não traz ESTAB_ID em todo cenário).
 */
export function samePartner(a: EnrichedPerformanceRow, b: EnrichedPerformanceRow): boolean {
    const idA = String(a.estab_id ?? '').trim();
    const idB = String(b.estab_id ?? '').trim();
    if (idA && idB) return idA === idB;
    return a.estabelecimento === b.estabelecimento;
}

/**
 * Reencontra `row` dentro de `pool` (para pegar a versão mais recente/enriquecida
 * da linha). Retorna `undefined` quando não está lá — nunca um homônimo.
 */
export function findPartner(
    pool: EnrichedPerformanceRow[],
    row: EnrichedPerformanceRow,
): EnrichedPerformanceRow | undefined {
    return pool.find(r => samePartner(r, row));
}
