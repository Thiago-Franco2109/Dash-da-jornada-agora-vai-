/**
 * Qual índice usar ao varrer `pedido` de UMA loja numa janela de datas.
 *
 * `pedido` tem índice em `estabelecimento_id` e em `data`, SEPARADOS — não existe o
 * composto `(estabelecimento_id, data)`. Sobram três planos possíveis, e o melhor
 * depende do tamanho do histórico da loja em relação ao tamanho da janela:
 *
 *   · `estabelecimento_id` puro → varre o histórico INTEIRO da loja e joga fora por
 *     data. É o plano que o otimizador do MySQL 5.5 escolhe sozinho em algumas lojas,
 *     e é o pior de todos (7s numa loja de 40k pedidos).
 *   · range no PRIMARY (via `id >= idMin`) → varredura sequencial da janela inteira do
 *     SISTEMA. Custo fixo, independente da loja: ótimo pra loja grande, desperdício pra
 *     loja pequena, e insuportável em janela longa (655k pedidos em 12 meses).
 *   · index merge dos dois → o otimizador faz isso sozinho quando a conta fecha, e aí
 *     ganha de lavada (150ms).
 *
 * MEDIDO (query de itens vendidos por loja, ms, melhor de 2):
 *
 *   janela 60 dias (~117k pedidos no sistema)
 *     estab 19892 hist 40.643 (razão 0,35): livre 7.084 · forçando PRIMARY   903  → forçar
 *     estab 25166 hist 36.464 (razão 0,31): livre 2.816 · forçando PRIMARY   883  → forçar
 *     estab 23404 hist 54.772 (razão 0,47): livre   941 · forçando PRIMARY   857  → forçar
 *     estab 16611 hist 13.857 (razão 0,12): livre   152 · forçando PRIMARY   750  → livre
 *     estab 26171 hist  4.430 (razão 0,04): livre   137 · forçando PRIMARY   710  → livre
 *
 *   janela 365 dias (~659k pedidos no sistema)
 *     estab 19892 (razão 0,06): livre 1.323 · forçando PRIMARY 4.187 → livre
 *     estab 23404 (razão 0,08): livre 2.989 · forçando PRIMARY 5.383 → livre
 *     estab 26171 (razão 0,01): livre   193 · forçando PRIMARY 4.413 → livre
 *
 * Ou seja: forçar PRIMARY só compensa quando o histórico da loja é da ordem da janela.
 * Em janela longa NUNCA compensa — e foi exatamente o erro da primeira versão da aba
 * Pedidos, que forçava sempre: comparei PRIMARY contra `estabelecimento_id` forçado e
 * concluí "PRIMARY sempre ganha", sem nunca ter medido o planner livre, que faz index
 * merge e ganha dos dois.
 *
 * ⚠️ Não forçar `estabelecimento_id` em hipótese nenhuma: é o plano ruim nos dois
 * extremos (medido também em `cardapio-analise` e na aba Pedidos).
 */

/** Acima desta razão histórico/janela, a varredura sequencial compensa. */
const RAZAO_PARA_FORCAR = 0.25;

/**
 * Devolve o hint pra interpolar logo depois de `FROM pedido` (string literal nossa,
 * nunca entrada do usuário).
 *
 * @param historicoLoja total de pedidos que a loja já teve
 * @param pedidosNaJanela quantos pedidos o SISTEMA teve na janela (idMax - idMin serve)
 */
export function hintIndicePedido(historicoLoja: number, pedidosNaJanela: number): string {
    if (!Number.isFinite(historicoLoja) || !Number.isFinite(pedidosNaJanela) || pedidosNaJanela <= 0) return '';
    return historicoLoja / pedidosNaJanela > RAZAO_PARA_FORCAR ? 'FORCE INDEX (PRIMARY)' : '';
}
