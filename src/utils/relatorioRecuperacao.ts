import type { LojaRiscoAvaliada } from './okrFiguras';
import type { OkrParametros } from '../hooks/useOkrTrimestre';

/**
 * As seções de recuperação do relatório — o plano do KR 2.3 em texto.
 *
 * Existe porque o chefe disse, com todas as letras, o que conta pra ele: loja
 * que estava em risco e voltou a vender. Lista de participação ("fechei promo
 * com fulano") não conta. Então o relatório precisa de duas seções que o
 * formato antigo não tinha:
 *
 *   🏆 as que já viraram — o resultado, com a evidência do lado;
 *   🔄 as que estão em andamento — o trabalho em aberto, com o que falta.
 *
 * A segunda é a que o relatório semanal nunca mostrou e é onde está a maior
 * parte do esforço da semana: contato feito, parceiro respondendo, recesso
 * encerrado. Sem ela o relatório só sabe falar do que já fechou.
 *
 * Os números NÃO são calculados aqui. Vêm de `calcularFiguras`, que é o único
 * lugar onde os KRs são somados — duplicar a conta criaria uma segunda verdade
 * pronta pra divergir da aba OKR no dia em que alguém mexesse numa marcação.
 */

/** Quantas lojas em andamento entram antes de a seção virar parede de texto. */
const MAX_EM_ANDAMENTO = 12;

/** Espaço duplo e sobra de borda vêm do cadastro — no relatório viram ruído. */
const limpar = (t: string) => t.replace(/\s+/g, ' ').trim();

function nomeComCidade(loja: LojaRiscoAvaliada): string {
    const nome = limpar(loja.nome);
    const cidade = limpar(loja.cidade ?? '');
    return cidade ? `${nome} (${cidade})` : nome;
}

/** "4 de 4 semanas com pedido" — a régua de reversão, contada do jeito do KR. */
function semanas(loja: LojaRiscoAvaliada): string {
    const com = loja.semanasComPedido.filter(Boolean).length;
    return `${com} de ${loja.semanasComPedido.length} semanas com pedido`;
}

function cancelamento(loja: LojaRiscoAvaliada): string {
    return loja.taxaCancelamentoPct === null
        ? 'sem pedido na janela'
        : `cancelamento ${loja.taxaCancelamentoPct.toFixed(0)}%`;
}

function linhaRevertida(loja: LojaRiscoAvaliada): string {
    const provas = [semanas(loja), `${loja.aceitos4sem} pedidos nas últimas 4 semanas`, cancelamento(loja)];
    return `• ${nomeComCidade(loja)} — ${provas.join(' · ')}`;
}

function linhaEmAndamento(loja: LojaRiscoAvaliada, p: OkrParametros): string {
    const estado: string[] = [];

    // Parada agora é a informação mais importante da linha: diz que a loja
    // ainda não voltou a vender, por mais semanas de plano que tenha.
    if (loja.diasSemPedido === null) estado.push('nunca teve pedido');
    else if (loja.diasSemPedido >= p.diasParado) estado.push(`parada há ${loja.diasSemPedido} dias`);
    else estado.push(semanas(loja));

    if (loja.falta.includes('cancelamento') && loja.taxaCancelamentoPct !== null) {
        estado.push(`${cancelamento(loja)} (teto ${p.tetoCancelamentoPct}%)`);
    }
    if (loja.aceitos4sem > 0 && loja.diasSemPedido !== null && loja.diasSemPedido < p.diasParado) {
        estado.push(`${loja.aceitos4sem} pedidos nas últimas 4 semanas`);
    }

    return `• ${nomeComCidade(loja)} — ${estado.join(' · ')}`;
}

export interface OpcoesRecuperacao {
    /** Lista já avaliada e sem as lojas fora da conta — vem de calcularFiguras. */
    risco: LojaRiscoAvaliada[];
    parametros: OkrParametros;
    /** Meta do KR (30 lojas no trimestre). */
    meta: number;
    /** Rótulo do período do KR, ex.: "4º trimestre". */
    trimestre: string;
}

/**
 * Devolve as seções prontas (0, 1 ou 2), na ordem em que entram no relatório.
 * Plano vazio devolve lista vazia — seção com "nenhuma loja" só ocupa espaço.
 */
export function secoesRecuperacao({ risco, parametros, meta, trimestre }: OpcoesRecuperacao): string[] {
    const plano = risco.filter(l => l.noPlano);
    if (plano.length === 0) return [];

    const secoes: string[] = [];
    const revertidas = plano.filter(l => l.revertida);
    const andamento = plano.filter(l => !l.revertida);

    if (revertidas.length > 0) {
        secoes.push([
            `🏆 LOJAS QUE VIRARAM O JOGO (${revertidas.length} de ${meta} no ${trimestre})`,
            '',
            `Critério: ${parametros.semanasReversao} semanas seguidas com pedido e cancelamento abaixo de ${parametros.tetoCancelamentoPct}%.`,
            '',
            ...revertidas.map(linhaRevertida),
        ].join('\n'));
    }

    if (andamento.length > 0) {
        const mostradas = andamento.slice(0, MAX_EM_ANDAMENTO);
        const linhas = [
            `🔄 EM RECUPERAÇÃO (${andamento.length} ${andamento.length === 1 ? 'loja' : 'lojas'} no plano)`,
            '',
            ...mostradas.map(l => linhaEmAndamento(l, parametros)),
        ];
        if (andamento.length > mostradas.length) {
            linhas.push('', `(+${andamento.length - mostradas.length} no plano, não listadas aqui)`);
        }
        secoes.push(linhas.join('\n'));
    }

    return secoes;
}
