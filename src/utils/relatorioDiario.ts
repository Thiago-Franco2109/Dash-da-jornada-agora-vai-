import type { AnotacaoDiario } from '../types/diario';
import type { AtividadeTrelloHoje } from '../hooks/useTrelloAtividadeHoje';
import { CATEGORIAS_DIARIO, getCategoriaDiario } from '../config/diarioCategorias';
import { formatarDiaExtenso } from './diarioDatas';
import { SEPARADOR } from './discordTexto';

/**
 * Monta o texto do relatório diário que o CS cola no Discord do chefe.
 *
 * Formato herdado do relatório semanal que o Ulysses já recebe: cabeçalho com
 * emoji, uma seção por assunto, bullets `•`, seções separadas por `___`. Texto
 * puro, sem markdown — é o que ele já reconhece, e tabela não cola no Discord.
 *
 * Duas fontes entram aqui:
 *   - as anotações do diário, agrupadas por categoria (o que só a pessoa sabe);
 *   - o resumo do Trello do dia (o que já estava registrado sozinho).
 *
 * Função pura de propósito: quem decide o que entra é a tela (checkbox por
 * item), e o mesmo montador serve pro relatório semanal depois.
 */

export interface OpcoesRelatorioDiario {
    /** Quem assina — 'THIAGO' | 'LAÍS'. */
    perfil: string;
    /** YYYY-MM-DD no fuso de Brasília. */
    dia: string;
    /** Anotações já escolhidas pela tela (sem as privadas, sem as desmarcadas). */
    anotacoes: AnotacaoDiario[];
    /** Resumo do Trello; `null` quando falhou ou foi desmarcado. */
    atividade: AtividadeTrelloHoje | null;
    /** estab_id -> cidade, pra escrever "Parceiro (Cidade)" como no semanal. */
    cidadePorParceiro?: Map<string, string>;
}

/** Quantas listas de destino do Trello entram — além disso vira ruído. */
const MAX_LISTAS = 6;

/**
 * Uma anotação vira um bullet de uma linha. Quebra de linha dentro do texto
 * colapsa em espaço: no Discord um bullet multilinha fica torto, e a anotação
 * é curta por natureza.
 */
export function bulletAnotacao(a: AnotacaoDiario, cidadePorParceiro?: Map<string, string>): string {
    const texto = a.texto.replace(/\s+/g, ' ').trim();
    if (!a.partnerNome) return `• ${texto}`;

    const cidade = a.partnerId ? cidadePorParceiro?.get(a.partnerId) : undefined;
    const quem = cidade ? `${a.partnerNome} (${cidade})` : a.partnerNome;
    return `• ${quem} — ${texto}`;
}

export function secaoTrello(atividade: AtividadeTrelloHoje): string {
    const numeros = [
        atividade.cardsMovidos > 0 && `${atividade.cardsMovidos} cards movidos`,
        atividade.comentarios > 0 && `${atividade.comentarios} comentários`,
        atividade.anexos > 0 && `${atividade.anexos} prints anexados`,
    ].filter(Boolean).join(' · ');

    const linhas = ['🗂️ MOVIMENTAÇÃO NO TRELLO', '', numeros || 'Sem movimentação registrada.'];

    const listas = atividade.porLista.slice(0, MAX_LISTAS);
    if (listas.length > 0) {
        linhas.push('');
        for (const l of listas) linhas.push(`• ${l.nome}: ${l.cards}`);
    }

    if (atividade.truncado) {
        linhas.push('', '(o Trello cortou a listagem — os números podem estar abaixo do real)');
    }

    return linhas.join('\n');
}

/**
 * Uma seção por categoria que tem anotação, na ordem de CATEGORIAS_DIARIO:
 * começa pelo que é resultado (captação, onboarding) e termina no bastidor
 * (análise, administrativo). Compartilhado entre o relatório do dia e o da
 * semana, pra não existirem dois formatos divergindo com o tempo.
 */
export function secoesPorCategoria(
    anotacoes: AnotacaoDiario[],
    cidadePorParceiro?: Map<string, string>,
): string[] {
    const secoes: string[] = [];
    for (const categoria of CATEGORIAS_DIARIO) {
        const daCategoria = anotacoes
            .filter(a => getCategoriaDiario(a.categoria).id === categoria.id)
            .sort((x, y) => x.ocorridoEm.localeCompare(y.ocorridoEm));
        if (daCategoria.length === 0) continue;

        secoes.push([
            `${categoria.emoji} ${categoria.secao.toUpperCase()}`,
            '',
            ...daCategoria.map(a => bulletAnotacao(a, cidadePorParceiro)),
        ].join('\n'));
    }
    return secoes;
}

export function montarRelatorioDiario({
    perfil, dia, anotacoes, atividade, cidadePorParceiro,
}: OpcoesRelatorioDiario): string {
    const secoes: string[] = [];

    const cabecalho = [
        `📅 RELATÓRIO DO DIA${perfil ? ` — ${perfil}` : ''}`,
        capitalizarPrimeira(formatarDiaExtenso(dia)),
    ].join('\n');
    secoes.push(cabecalho);

    secoes.push(...secoesPorCategoria(anotacoes, cidadePorParceiro));

    if (atividade) secoes.push(secaoTrello(atividade));

    if (secoes.length === 1) {
        secoes.push('Nada registrado neste dia.');
    }

    return secoes.join(SEPARADOR);
}

/** "quarta-feira, 7 de outubro de 2026" -> "Quarta-feira, 7 de outubro de 2026" */
export function capitalizarPrimeira(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nome do arquivo baixado: relatorio-diario-2026-10-07-thiago.txt */
export function nomeArquivoRelatorio(dia: string, perfil: string, tipo = 'diario'): string {
    const quem = perfil
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `relatorio-${tipo}-${dia}${quem ? `-${quem}` : ''}.txt`;
}
