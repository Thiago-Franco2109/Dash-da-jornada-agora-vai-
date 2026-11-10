/**
 * Quais campanhas são subsidiadas pela Bigou.
 *
 * Regra confirmada com o Thiago (ver cabeçalho de `acoes-promocionais.ts`):
 * "Ofertas da Casa" é campanha especial mas o desconto sai do bolso do
 * parceiro — nunca é subsidiada. Qualquer outra campanha (Super Bigou, Tudo
 * por R$9,99, Promo do Dia, Black Friday...) é.
 *
 * Mora aqui porque mais de uma function depende dela e, se cada uma tiver a
 * sua cópia, "promo subsidiada" passa a significar coisas diferentes em telas
 * diferentes — que é exatamente o tipo de divergência que ninguém percebe até
 * o número ir pro relatório.
 */

/** Normaliza pra comparar nome de campanha: sem acento, sem caixa, sem pontuação final. */
function normalizar(nome: string): string {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[!?.]+$/g, '')
        .trim();
}

/** "Ofertas da Casa" — a única campanha não subsidiada. */
export function isOfertasDaCasa(nomeCampanha: string): boolean {
    return normalizar(nomeCampanha).includes('ofertas da casa');
}

/** O complemento de `isOfertasDaCasa`, escrito do jeito que a chamada lê melhor. */
export function isCampanhaSubsidiada(nomeCampanha: string): boolean {
    return !isOfertasDaCasa(nomeCampanha);
}
