import type { OkrLojaEngajada } from '../hooks/useOkrTrimestre';
import type { OkrParametros } from '../hooks/useOkrTrimestre';

/**
 * As seções de engajamento do relatório — o KR 2 em texto.
 *
 * Existe porque o chefe disse, com todas as letras, o que conta pra ele: loja
 * que estava fraca e voltou a vender. Lista de participação ("fechei promo com
 * fulano") não conta. O que vale é o antes→depois no MESMO parceiro.
 *
 * Isto nasceu em cima do plano de recuperação do KR 2.3. Quando a OKR mudou e
 * o 2.3 saiu, a régua nova entregou o mesmo resultado de forma mais direta: a
 * loja que cruzou de 9 para 18 pedidos em 28 dias é exatamente o caso revertido
 * — e a comparação vem de duas janelas iguais do banco, não de uma lista curada
 * à mão. De quebra apareceu a seção que faltava: quem CAIU da régua, o
 * vazamento que o formato antigo nunca mostrou.
 *
 *   🏆 as que viraram  — cruzaram a régua nesta janela, com o antes do lado;
 *   🔄 as quase lá     — o trabalho em aberto, com quantos pedidos faltam;
 *   ⚠️ as que caíram   — saíram da régua e ninguém viu.
 *
 * Os números NÃO são calculados aqui. Vêm de `calcularFiguras`, que é o único
 * lugar onde os KRs são somados — duplicar a conta criaria uma segunda verdade
 * pronta pra divergir da aba OKR no dia em que alguém mexesse numa marcação.
 *
 * O relatório é colado no Discord, que corta em 2000 caracteres: por isso cada
 * seção tem teto de linhas e o resto vira "(+N não listadas)".
 */

/** Quantas lojas entram por seção antes de virar parede de texto no Discord. */
const MAX_POR_SECAO = 10;

/** Espaço duplo e sobra de borda vêm do cadastro — no relatório viram ruído. */
const limpar = (t: string) => t.replace(/\s+/g, ' ').trim();

function nomeComCidade(loja: OkrLojaEngajada): string {
    const nome = limpar(loja.nome);
    const cidade = limpar(loja.cidade ?? '');
    return cidade ? `${nome} (${cidade})` : nome;
}

/** Corta a lista no teto e devolve a linha de resto, quando houver. */
function comTeto(linhas: string[], total: number): string[] {
    if (total <= MAX_POR_SECAO) return linhas;
    return [...linhas, '', `(+${total - MAX_POR_SECAO} não listadas aqui)`];
}

export interface OpcoesEngajamento {
    /** Lista já sem as lojas fora da conta — vem de calcularFiguras. */
    lojas: OkrLojaEngajada[];
    parametros: OkrParametros;
    /** Quantas estão engajadas e qual a base, para o cabeçalho da primeira seção. */
    engajadas: number;
    base: number;
    pct: number | null;
}

/**
 * Devolve as seções prontas, na ordem em que entram no relatório. Seção sem
 * nenhuma loja não entra — "nenhuma loja virou o jogo" só ocupa espaço.
 */
export function secoesEngajamento({ lojas, parametros, engajadas, base, pct }: OpcoesEngajamento): string[] {
    const secoes: string[] = [];
    const regua = parametros.pedidosEngajada;
    const dias = parametros.janelaEngajada;

    const viraram = lojas.filter(l => l.cruzou).sort((a, b) => b.pedidos28d - a.pedidos28d);
    const quaseLa = lojas
        .filter(l => !l.engajada && l.pedidos28d >= regua / 2)
        .sort((a, b) => b.pedidos28d - a.pedidos28d);
    const cairam = lojas.filter(l => l.caiu).sort((a, b) => a.pedidos28d - b.pedidos28d);

    if (viraram.length > 0) {
        secoes.push([
            `🏆 LOJAS QUE VIRARAM O JOGO (${viraram.length})`,
            '',
            `Cruzaram os ${regua} pedidos em ${dias} dias nesta janela.`,
            `Hoje: ${engajadas} de ${base} lojas engajadas${pct === null ? '' : ` (${pct.toFixed(1).replace('.0', '').replace('.', ',')}%)`}.`,
            '',
            ...comTeto(
                viraram.slice(0, MAX_POR_SECAO).map(l =>
                    `• ${nomeComCidade(l)} — ${l.pedidos28d} pedidos (eram ${l.pedidos28dAnterior})`),
                viraram.length,
            ),
        ].join('\n'));
    }

    if (quaseLa.length > 0) {
        secoes.push([
            `🔄 QUASE LÁ (${quaseLa.length} ${quaseLa.length === 1 ? 'loja' : 'lojas'})`,
            '',
            `Entre ${Math.ceil(regua / 2)} e ${regua - 1} pedidos em ${dias} dias — são essas que movem o número.`,
            '',
            ...comTeto(
                quaseLa.slice(0, MAX_POR_SECAO).map(l =>
                    `• ${nomeComCidade(l)} — ${l.pedidos28d} pedidos, faltam ${regua - l.pedidos28d}`),
                quaseLa.length,
            ),
        ].join('\n'));
    }

    if (cairam.length > 0) {
        secoes.push([
            `⚠️ CAÍRAM DA RÉGUA (${cairam.length})`,
            '',
            `Estavam acima de ${regua} pedidos na janela anterior e não estão mais.`,
            '',
            ...comTeto(
                cairam.slice(0, MAX_POR_SECAO).map(l =>
                    `• ${nomeComCidade(l)} — ${l.pedidos28d} pedidos (eram ${l.pedidos28dAnterior})`),
                cairam.length,
            ),
        ].join('\n'));
    }

    return secoes;
}
