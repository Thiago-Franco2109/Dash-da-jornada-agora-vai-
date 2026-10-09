import type { AnotacaoDiario } from '../types/diario';
import type { AtividadeTrelloHoje } from '../hooks/useTrelloAtividadeHoje';
import { secoesPorCategoria, secaoTrello, capitalizarPrimeira } from './relatorioDiario';
import { rotuloPeriodo, type Janela } from './diarioDatas';
import { SEPARADOR } from './discordTexto';

/**
 * Relatório da semana, no mesmo formato do diário — mais o comparativo com a
 * semana anterior.
 *
 * O comparativo sai SÓ de número do Trello (cards, comentários, anexos,
 * parceiros distintos tocados). Esses não passam pela curadoria da tela, então
 * as duas semanas são medidas com a mesma régua. Contar as anotações aqui
 * misturaria "o que eu escrevi" com "o que escolhi mandar" e as duas colunas
 * deixariam de ser comparáveis.
 *
 * As janelas sempre têm o mesmo número de dias (ver semanaAnterior em
 * diarioDatas): mandando na sexta, compara segunda-a-sexta contra
 * segunda-a-sexta — nunca contra uma semana inteira, que faria o presente
 * parecer sempre pior.
 */

export interface OpcoesRelatorioSemanal {
    perfil: string;
    janela: Janela;
    /** Anotações já escolhidas pela tela (sem as privadas, sem as desmarcadas). */
    anotacoes: AnotacaoDiario[];
    atividade: AtividadeTrelloHoje | null;
    /** Mesma janela sete dias antes; `null` quando não foi carregada. */
    janelaAnterior?: Janela;
    atividadeAnterior?: AtividadeTrelloHoje | null;
    cidadePorParceiro?: Map<string, string>;
}

/** "28509 - Sublime Açaí Express" -> "28509"; sem o padrão, devolve null. */
function estabIdDoCard(nome: string): string | null {
    const m = nome.match(/^\s*(\d+)\s*-/);
    return m ? m[1] : null;
}

/**
 * Parceiros distintos tocados na janela, pelo id no começo do nome do card.
 * Id, não nome: o mesmo nome se repete entre cidades.
 */
export function parceirosTocados(atividade: AtividadeTrelloHoje | null): number {
    if (!atividade) return 0;
    const ids = new Set<string>();
    for (const m of atividade.movimentacoes) {
        const id = estabIdDoCard(m.cardNome);
        if (id) ids.add(id);
    }
    return ids.size;
}

interface Comparacao {
    rotulo: string;
    antes: number;
    agora: number;
}

function linhaComparativo({ rotulo, antes, agora }: Comparacao): string {
    const delta = agora - antes;
    const sinal = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : 'igual';
    return `• ${rotulo}: ${antes} → ${agora} (${sinal})`;
}

export function montarRelatorioSemanal({
    perfil, janela, anotacoes, atividade, janelaAnterior, atividadeAnterior, cidadePorParceiro,
}: OpcoesRelatorioSemanal): string {
    const secoes: string[] = [];

    secoes.push([
        `📅 RELATÓRIO DA SEMANA${perfil ? ` — ${perfil}` : ''}`,
        capitalizarPrimeira(rotuloPeriodo(janela)),
    ].join('\n'));

    secoes.push(...secoesPorCategoria(anotacoes, cidadePorParceiro));

    if (atividade) secoes.push(secaoTrello(atividade));

    if (atividadeAnterior && janelaAnterior) {
        const comparacoes: Comparacao[] = [
            { rotulo: 'Cards movidos', antes: atividadeAnterior.cardsMovidos, agora: atividade?.cardsMovidos ?? 0 },
            { rotulo: 'Comentários', antes: atividadeAnterior.comentarios, agora: atividade?.comentarios ?? 0 },
            { rotulo: 'Prints anexados', antes: atividadeAnterior.anexos, agora: atividade?.anexos ?? 0 },
            { rotulo: 'Parceiros tocados', antes: parceirosTocados(atividadeAnterior), agora: parceirosTocados(atividade) },
        ];
        secoes.push([
            '📊 COMPARATIVO COM A SEMANA ANTERIOR',
            `(${rotuloPeriodo(janelaAnterior)})`,
            '',
            ...comparacoes.map(linhaComparativo),
        ].join('\n'));
    }

    if (secoes.length === 1) secoes.push('Nada registrado nesta semana.');

    return secoes.join(SEPARADOR);
}
