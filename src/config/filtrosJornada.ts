/**
 * Vocabulário dos filtros compostos da Lista jornada 28D.
 *
 * Aqui só moram tipos e o catálogo de operadores — quem sabe extrair valor de
 * uma linha é o registro de campos (camposFiltraveis.ts) e quem avalia é o
 * motor (utils/avaliarFiltro.ts).
 */

export type TipoCampo = 'texto' | 'numero' | 'contagem' | 'selecao' | 'booleano' | 'data';

export type Operador =
    // texto
    | 'contem' | 'nao_contem'
    // numero / contagem
    | 'igual' | 'diferente' | 'maior' | 'maior_ou_igual' | 'menor' | 'menor_ou_igual' | 'entre'
    // seleção
    | 'e' | 'nao_e' | 'e_um_de' | 'nao_e_nenhum_de'
    // booleano
    | 'verdadeiro' | 'falso'
    // data (presets relativos — ver o plano: calendário ficou fora)
    | 'no_dia' | 'antes_de' | 'depois_de' | 'nos_ultimos_dias' | 'nos_proximos_dias' | 'atrasado' | 'e_hoje'
    // qualquer campo anulável
    | 'vazio' | 'preenchido';

/**
 * O valor é união discriminada, não escalar solto.
 *
 * Com escalar, um campo numérico ainda vazio na interface vira `''`, e
 * `Number('') === 0` — a condição "promoções aprovadas = ___" viraria "= 0"
 * no meio da digitação e devolveria a base inteira. Com a união, um número
 * ausente é detectável e a condição fica *incompleta* (ignorada pelo motor).
 */
export type ValorFiltro =
    | { tipo: 'nenhum' }
    | { tipo: 'texto'; texto: string }
    | { tipo: 'numero'; numero: number }
    | { tipo: 'faixa'; de: number; ate: number }
    | { tipo: 'lista'; itens: string[] }
    | { tipo: 'data'; iso: string }
    | { tipo: 'dias'; dias: number };

export interface CondicaoFiltro {
    tipo: 'condicao';
    id: string;
    campoId: string;
    operador: Operador;
    valor: ValorFiltro;
    /** Semeada pela sessão do gestor. Só muda o visual do chip; não muda a avaliação. */
    origem?: 'sessao';
}

export interface GrupoFiltro {
    tipo: 'grupo';
    id: string;
    juncao: 'e' | 'ou';
    itens: (CondicaoFiltro | GrupoFiltro)[];
}

/** Raiz do filtro. `itens: []` = sem filtro nenhum. */
export type FiltroComposto = GrupoFiltro;

/** Quantos valores o operador consome. */
export const ARIDADE: Record<Operador, 0 | 1 | 2> = {
    contem: 1, nao_contem: 1,
    igual: 1, diferente: 1, maior: 1, maior_ou_igual: 1, menor: 1, menor_ou_igual: 1, entre: 2,
    e: 1, nao_e: 1, e_um_de: 1, nao_e_nenhum_de: 1,
    verdadeiro: 0, falso: 0,
    no_dia: 1, antes_de: 1, depois_de: 1, nos_ultimos_dias: 1, nos_proximos_dias: 1, atrasado: 0, e_hoje: 0,
    vazio: 0, preenchido: 0,
};

export const ROTULO_OPERADOR: Record<Operador, string> = {
    contem: 'contém', nao_contem: 'não contém',
    igual: 'é', diferente: 'não é', maior: 'mais que', maior_ou_igual: 'pelo menos',
    menor: 'menos que', menor_ou_igual: 'no máximo', entre: 'entre',
    e: 'é', nao_e: 'não é', e_um_de: 'é um de', nao_e_nenhum_de: 'não é nenhum de',
    verdadeiro: 'sim', falso: 'não',
    no_dia: 'no dia', antes_de: 'antes de', depois_de: 'depois de',
    nos_ultimos_dias: 'nos últimos', nos_proximos_dias: 'nos próximos',
    atrasado: 'atrasado', e_hoje: 'é hoje',
    vazio: 'vazio', preenchido: 'preenchido',
};

/** Operadores oferecidos por tipo, na ordem — o primeiro é o default do campo. */
export const OPERADORES_POR_TIPO: Record<TipoCampo, Operador[]> = {
    texto: ['contem', 'nao_contem', 'vazio', 'preenchido'],
    numero: ['igual', 'maior', 'maior_ou_igual', 'menor', 'menor_ou_igual', 'entre'],
    contagem: ['igual', 'maior', 'maior_ou_igual', 'menor', 'entre'],
    selecao: ['e', 'nao_e', 'e_um_de', 'nao_e_nenhum_de', 'vazio', 'preenchido'],
    booleano: ['verdadeiro', 'falso'],
    data: ['atrasado', 'e_hoje', 'nos_ultimos_dias', 'nos_proximos_dias', 'antes_de', 'depois_de', 'no_dia', 'vazio', 'preenchido'],
};

/**
 * Condição só entra na avaliação quando está completa. Incompleta é ignorada —
 * nunca esconde linha, nunca vira "= 0" por acidente.
 */
export function condicaoCompleta(c: CondicaoFiltro): boolean {
    // Operador de aridade 0 (vazio, atrasado, sim/não) não precisa de valor.
    if (ARIDADE[c.operador] === 0) return true;
    const v = c.valor;
    switch (v.tipo) {
        case 'nenhum': return false;
        case 'texto': return v.texto.trim().length > 0;
        case 'numero': return Number.isFinite(v.numero);
        case 'dias': return Number.isFinite(v.dias);
        case 'faixa': return Number.isFinite(v.de) && Number.isFinite(v.ate);
        case 'lista': return v.itens.length > 0;
        case 'data': return /^\d{4}-\d{2}-\d{2}$/.test(v.iso);
    }
}

export function novoId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function grupoVazio(): FiltroComposto {
    return { tipo: 'grupo', id: novoId(), juncao: 'e', itens: [] };
}

/** Condições da raiz (a interface entrega um nível só, mas o tipo é recursivo). */
export function condicoesDe(filtro: FiltroComposto): CondicaoFiltro[] {
    return filtro.itens.filter((i): i is CondicaoFiltro => i.tipo === 'condicao');
}
