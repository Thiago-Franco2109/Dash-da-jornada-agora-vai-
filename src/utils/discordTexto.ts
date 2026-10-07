/**
 * Fatiamento de texto para o Discord.
 *
 * O Discord recusa mensagem acima de 2000 caracteres. O relatório semanal de
 * 02/10/2026 tinha 3.584 bytes, ou seja, não cabia em uma mensagem — e sem
 * fatiar automaticamente a pessoa acaba editando na mão toda semana, que é
 * justo o trabalho que o gerador existe pra tirar.
 *
 * Nada é injetado no texto (nem "parte 1/2"): quem lê é o chefe, e marcação de
 * ferramenta no meio do relatório suja a leitura. Quem mostra a divisão é a
 * tela, com um botão de copiar por parte.
 */

export const LIMITE_DISCORD = 2000;

/** Separador de seção usado pelos relatórios (linha isolada com três sublinhados). */
export const SEPARADOR = '\n\n___\n\n';

/**
 * Quebra `texto` em pedaços de no máximo `limite` caracteres, preferindo cortar
 * em borda de seção; depois em quebra de linha; e só em último caso no meio de
 * uma linha. Texto que já cabe volta inteiro, numa parte só.
 */
export function fatiarParaDiscord(texto: string, limite = LIMITE_DISCORD): string[] {
    const inteiro = texto.trim();
    if (inteiro.length <= limite) return [inteiro];

    const partes: string[] = [];
    let atual = '';

    const fechar = () => {
        if (atual.trim()) partes.push(atual.trim());
        atual = '';
    };

    /** Encaixa um trecho no pedaço atual, abrindo outro quando não couber. */
    const encaixar = (trecho: string, cola: string) => {
        // Linha vazia no meio de uma seção é parágrafo, e tem que sobreviver;
        // só se descarta quando não há nada antes dela no pedaço.
        if (!trecho && !atual) return;
        const candidato = atual ? atual + cola + trecho : trecho;
        if (candidato.length <= limite) {
            atual = candidato;
            return;
        }
        fechar();
        if (trecho.length <= limite) {
            atual = trecho;
            return;
        }
        // Trecho sozinho estoura: desce um nível de granularidade.
        if (cola !== '\n') {
            for (const linha of trecho.split('\n')) encaixar(linha, '\n');
            return;
        }
        // Linha única maior que o limite — corta na força, sem perder caractere.
        for (let i = 0; i < trecho.length; i += limite) {
            fechar();
            atual = trecho.slice(i, i + limite);
        }
    };

    for (const secao of inteiro.split(SEPARADOR)) encaixar(secao, SEPARADOR);
    fechar();

    return partes;
}

/** "1.247" — milhar com ponto, como o resto do painel mostra número. */
export function formatarContagem(n: number): string {
    return n.toLocaleString('pt-BR');
}
