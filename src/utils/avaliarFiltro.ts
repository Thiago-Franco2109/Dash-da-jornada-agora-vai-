import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { EnrichedPerformanceRow } from './calculations';
import type { CrmPartnerNote } from '../types/crm';
import {
    condicaoCompleta,
    type CondicaoFiltro,
    type FiltroComposto,
    type GrupoFiltro,
    type Operador,
    type ValorFiltro,
} from '../config/filtrosJornada';
import type { CampoFiltravel, ValorExtraido } from '../config/camposFiltraveis';

/**
 * Motor dos filtros compostos — lógica pura, sem React (igual crmPipeline.ts).
 *
 * A regra central é a lógica de TRÊS valores, e ela existe porque as duas
 * respostas binárias produzem telas plausíveis e erradas:
 *
 *   undefined = "não sei" (a fonte não carregou) → suspende o filtro inteiro.
 *               Se falhasse, "promoções aprovadas = 0" mostraria zero parceiros
 *               e o CS concluiria "está tudo certo". Se casasse, mostraria a
 *               base inteira e ele ligaria pra quem já tem promoção.
 *   null      = "não se aplica" (métrica de jornada em quem não lançou, cidade
 *               de card do Trello, nunca contatado) → condição é falsa, exceto
 *               os operadores de ausência.
 *   valor     = responde normalmente.
 */

export interface ContextoAvaliacao {
    hoje: Date;
    promoPronto: boolean;
    crmPronto: boolean;
    notaPorParceiro: Record<string, CrmPartnerNote>;
    localidadePorEstab: Map<string, string>;
}

export interface ResultadoFiltro {
    linhas: EnrichedPerformanceRow[];
    /** Alguma condição depende de fonte que ainda não chegou → `linhas` NÃO é resultado de filtro. */
    pausado: boolean;
    motivo?: string;
    /** Linhas de onboarding sem cidade/gestor barradas por condição de carteira. */
    excluidosSemCarteira: number;
    totalAvaliado: number;
    /** Condições ignoradas por estarem incompletas. */
    incompletas: number;
}

/** "Não se aplica" — distinto de "não sei" (undefined). */
const NAO_SE_APLICA = null;

/** Operadores que perguntam pela ausência: com `null` eles são verdadeiros. */
const OPERADORES_DE_AUSENCIA: Operador[] = ['vazio', 'nao_e', 'nao_contem', 'nao_e_nenhum_de', 'falso'];

function normalizarTexto(v: string): string {
    return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function extrair(
    row: EnrichedPerformanceRow,
    campo: CampoFiltravel,
    ctx: ContextoAvaliacao,
): ValorExtraido {
    // Flag decide, nunca o número: quem não lançou tem dias/pedidos/índice
    // zerados de propósito, e "= 0" não pode casar com "não se aplica".
    if (campo.soLancados && row.pre_lancamento) return NAO_SE_APLICA;

    const bruto = campo.valor(row, ctx);
    if (bruto === undefined) return undefined;
    if (bruto === null) return NAO_SE_APLICA;
    if (typeof bruto === 'number' && !Number.isFinite(bruto)) return NAO_SE_APLICA;
    if (typeof bruto === 'string' && bruto.trim() === '') return NAO_SE_APLICA;
    return bruto;
}

function comparaNumero(valor: number, op: Operador, v: ValorFiltro): boolean {
    if (v.tipo === 'faixa') return op === 'entre' ? valor >= v.de && valor <= v.ate : false;
    const alvo = v.tipo === 'numero' ? v.numero : v.tipo === 'dias' ? v.dias : NaN;
    if (!Number.isFinite(alvo)) return false;
    switch (op) {
        case 'igual': return valor === alvo;
        case 'diferente': return valor !== alvo;
        case 'maior': return valor > alvo;
        case 'maior_ou_igual': return valor >= alvo;
        case 'menor': return valor < alvo;
        case 'menor_ou_igual': return valor <= alvo;
        default: return false;
    }
}

function comparaTexto(valor: string, op: Operador, v: ValorFiltro): boolean {
    const alvoLista = v.tipo === 'lista' ? v.itens : null;
    const alvo = v.tipo === 'texto' ? v.texto : null;
    const n = normalizarTexto(valor);
    switch (op) {
        case 'contem': return alvo != null && n.includes(normalizarTexto(alvo));
        case 'nao_contem': return alvo != null && !n.includes(normalizarTexto(alvo));
        case 'e': return alvo != null && n === normalizarTexto(alvo);
        case 'nao_e': return alvo != null && n !== normalizarTexto(alvo);
        case 'e_um_de': return alvoLista != null && alvoLista.some(i => normalizarTexto(i) === n);
        case 'nao_e_nenhum_de': return alvoLista != null && !alvoLista.some(i => normalizarTexto(i) === n);
        default: return false;
    }
}

/**
 * Datas usam a mesma régua do sino de alertas (`differenceInCalendarDays` +
 * `parseISO`, como `computeFollowUpAlerts`) — se divergirem, "atrasado" no
 * filtro significaria uma coisa e no sino outra, e o usuário perde a confiança
 * nos dois.
 */
function comparaData(iso: string, op: Operador, v: ValorFiltro, hoje: Date): boolean {
    const data = parseISO(iso);
    if (Number.isNaN(data.getTime())) return false;
    const delta = differenceInCalendarDays(data, hoje); // negativo = passado

    switch (op) {
        case 'atrasado': return delta < 0;
        case 'e_hoje': return delta === 0;
        case 'nos_ultimos_dias': {
            const n = v.tipo === 'dias' ? v.dias : NaN;
            return Number.isFinite(n) && delta <= 0 && delta >= -n;
        }
        case 'nos_proximos_dias': {
            const n = v.tipo === 'dias' ? v.dias : NaN;
            return Number.isFinite(n) && delta >= 0 && delta <= n;
        }
        case 'antes_de': return v.tipo === 'data' && data < parseISO(v.iso);
        case 'depois_de': return v.tipo === 'data' && data > parseISO(v.iso);
        case 'no_dia': return v.tipo === 'data' && iso === v.iso;
        default: return false;
    }
}

export function avaliarCondicao(
    row: EnrichedPerformanceRow,
    cond: CondicaoFiltro,
    campo: CampoFiltravel,
    ctx: ContextoAvaliacao,
): boolean | 'nao_sei' {
    const extraido = extrair(row, campo, ctx);

    if (extraido === undefined) return 'nao_sei';

    if (extraido === NAO_SE_APLICA) {
        return OPERADORES_DE_AUSENCIA.includes(cond.operador);
    }

    // Chegou aqui: existe valor. Operadores de presença respondem direto.
    if (cond.operador === 'vazio') return false;
    if (cond.operador === 'preenchido') return true;

    switch (campo.tipo) {
        case 'booleano':
            return cond.operador === 'verdadeiro' ? extraido === true : extraido === false;
        case 'numero':
        case 'contagem':
            return typeof extraido === 'number' && comparaNumero(extraido, cond.operador, cond.valor);
        case 'data':
            return typeof extraido === 'string' && comparaData(extraido, cond.operador, cond.valor, ctx.hoje);
        case 'texto':
        case 'selecao':
            return typeof extraido !== 'boolean' && comparaTexto(String(extraido), cond.operador, cond.valor);
    }
}

export function avaliarGrupo(
    row: EnrichedPerformanceRow,
    grupo: GrupoFiltro,
    campos: Map<string, CampoFiltravel>,
    ctx: ContextoAvaliacao,
): boolean | 'nao_sei' {
    const ativos = grupo.itens.filter(item =>
        item.tipo === 'grupo' || (condicaoCompleta(item) && campos.has(item.campoId)),
    );
    if (ativos.length === 0) return true; // sem condição = passa tudo

    const resultados: (boolean | 'nao_sei')[] = ativos.map(item =>
        item.tipo === 'grupo'
            ? avaliarGrupo(row, item, campos, ctx)
            : avaliarCondicao(row, item, campos.get(item.campoId)!, ctx),
    );

    if (resultados.includes('nao_sei')) return 'nao_sei';
    return grupo.juncao === 'e'
        ? (resultados as boolean[]).every(Boolean)
        : (resultados as boolean[]).some(Boolean);
}

/** Condição de carteira = cidade ou gestor (as que barram card do Trello sem cidade). */
const CAMPOS_DE_CARTEIRA = new Set(['cidade', 'analista']);

export function aplicarFiltroComposto(
    linhas: EnrichedPerformanceRow[],
    filtro: FiltroComposto,
    campos: CampoFiltravel[],
    ctx: ContextoAvaliacao,
): ResultadoFiltro {
    const mapa = new Map(campos.map(c => [c.id, c]));
    const condicoes = filtro.itens.filter((i): i is CondicaoFiltro => i.tipo === 'condicao');
    const incompletas = condicoes.filter(c => !condicaoCompleta(c)).length;

    // Fonte indisponível para alguma condição ativa → não filtra e avisa.
    const pendente = condicoes.find(c => {
        const campo = mapa.get(c.campoId);
        return campo?.disponivel && !campo.disponivel(ctx) && condicaoCompleta(c);
    });
    if (pendente) {
        return {
            linhas,
            pausado: true,
            motivo: mapa.get(pendente.campoId)?.indisponivelMsg ?? 'Carregando os dados do filtro…',
            excluidosSemCarteira: 0,
            totalAvaliado: linhas.length,
            incompletas,
        };
    }

    const temCondicaoDeCarteira = condicoes.some(c => CAMPOS_DE_CARTEIRA.has(c.campoId) && condicaoCompleta(c));
    let excluidosSemCarteira = 0;
    let pausado = false;

    const resultado = linhas.filter(row => {
        const ok = avaliarGrupo(row, filtro, mapa, ctx);
        if (ok === 'nao_sei') { pausado = true; return true; }
        if (!ok && temCondicaoDeCarteira && row.pre_lancamento?.origem === 'trello') {
            excluidosSemCarteira++;
        }
        return ok;
    });

    if (pausado) {
        return {
            linhas,
            pausado: true,
            motivo: 'Carregando os dados do filtro…',
            excluidosSemCarteira: 0,
            totalAvaliado: linhas.length,
            incompletas,
        };
    }

    return { linhas: resultado, pausado: false, excluidosSemCarteira, totalAvaliado: linhas.length, incompletas };
}

/**
 * Qual condição, sozinha, está zerando o resultado (leave-one-out). Alimenta o
 * estado vazio — é o que separa um construtor usável de um beco sem saída.
 */
export function condicaoCulpadaPeloVazio(
    linhas: EnrichedPerformanceRow[],
    filtro: FiltroComposto,
    campos: CampoFiltravel[],
    ctx: ContextoAvaliacao,
): CondicaoFiltro | null {
    const condicoes = filtro.itens.filter(
        (i): i is CondicaoFiltro => i.tipo === 'condicao' && condicaoCompleta(i),
    );
    if (condicoes.length < 2) return condicoes[0] ?? null;

    for (const alvo of condicoes) {
        const semAlvo: FiltroComposto = { ...filtro, itens: filtro.itens.filter(i => i !== alvo) };
        const r = aplicarFiltroComposto(linhas, semAlvo, campos, ctx);
        // Tirando só essa condição o resultado deixa de ser vazio → é a culpada.
        if (!r.pausado && r.linhas.length > 0) return alvo;
    }
    return null;
}

/** Contagem por opção com as OUTRAS condições aplicadas ("se eu escolher X, sobram quantos?"). */
export function contarOpcoes(
    linhas: EnrichedPerformanceRow[],
    filtro: FiltroComposto,
    condicaoId: string,
    campo: CampoFiltravel,
    ctx: ContextoAvaliacao,
    campos: CampoFiltravel[],
): Record<string, number> {
    const semEsta: FiltroComposto = {
        ...filtro,
        itens: filtro.itens.filter(i => !(i.tipo === 'condicao' && i.id === condicaoId)),
    };
    const base = aplicarFiltroComposto(linhas, semEsta, campos, ctx).linhas;

    const contagem: Record<string, number> = {};
    for (const row of base) {
        const v = extrair(row, campo, ctx);
        if (v === undefined || v === null) continue;
        const chave = String(v);
        contagem[chave] = (contagem[chave] ?? 0) + 1;
    }
    return contagem;
}
