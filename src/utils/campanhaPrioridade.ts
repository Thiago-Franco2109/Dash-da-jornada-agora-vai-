/**
 * Régua de prioridade das campanhas de um parceiro.
 *
 * A galeria da aba Promoções usa posição como hierarquia: o que pede ação do
 * CS fica à esquerda, o que não pede nada vai pro fim. Esta régua é quem
 * decide essa ordem — fica separada da tela de propósito, porque é regra de
 * negócio e muda mais do que o layout.
 *
 * A semântica dos estados vem do banco (ver netlify/functions/promo-status.ts):
 *  - rascunho = item criado e não publicado → travado no CS, é ação dele
 *  - pendente = oferta pronta esperando o ok do dono → bola com o parceiro
 *  - aprovado = no ar
 *  - caiu = só restou item arquivado/inativo: já esteve no ar e saiu
 *  - sem item = a campanha roda na cidade e o parceiro não entrou nela
 */

export type ZonaCampanha = 'agir' | 'aguardando' | 'no_ar' | 'parado';

export interface EntradaPrioridade {
    /** Campanha vigente que não roda na cidade do parceiro. */
    foraDaCidade?: boolean;
    /** Parceiro disse não. */
    recusado?: boolean;
    /** Banco confirma a campanha no ar para este parceiro. */
    noAr?: boolean;
    /** Item existe mas não foi publicado — travado do lado do CS. */
    rascunho?: boolean;
    /** Tinha item e ele saiu do ar (arquivado/inativo). Nada aparece pro cliente hoje. */
    caiu?: boolean;
    /** Oferta pronta, esperando resposta do parceiro. */
    aguardandoParceiro?: boolean;
    /** Há quantos dias espera resposta. null quando o banco não tem a data. */
    diasEsperando?: number | null;
    /** Parceiro está numa das cidades de maior GMV. */
    cidadeTop?: boolean;
}

export interface Prioridade {
    zona: ZonaCampanha;
    score: number;
}

/**
 * Teto do bônus de espera. Sem ele, uma oferta parada há 60 dias passaria na
 * frente de um rascunho (90) e trocaria de zona na ordenação — a galeria
 * mostraria "aguardando" antes de "agir agora", que é mentira visual.
 */
const MAX_BONUS_ESPERA = 39;

export function classificarCampanha(e: EntradaPrioridade): Prioridade {
    if (e.foraDaCidade) return { zona: 'parado', score: 0 };
    if (e.recusado) return { zona: 'parado', score: 5 };
    if (e.noAr) return { zona: 'no_ar', score: 20 };
    if (e.rascunho) return { zona: 'agir', score: 90 };
    // Entre o rascunho (travado no CS) e a nunca ofertada: o parceiro já
    // aceitou uma vez, então reativar costuma ser a conversa mais barata.
    if (e.caiu) return { zona: 'agir', score: 80 };
    if (e.aguardandoParceiro) {
        const dias = Math.max(0, Math.min(e.diasEsperando ?? 0, MAX_BONUS_ESPERA));
        return { zona: 'aguardando', score: 50 + dias };
    }
    // Nunca ofertada: é o caso mais acionável que existe, ainda mais em cidade top.
    return { zona: 'agir', score: e.cidadeTop ? 100 : 70 };
}

/**
 * Frase curta que explica por que a campanha caiu nessa zona. Fica junto da
 * régua de propósito: se a regra muda, o texto que a justifica muda no mesmo
 * lugar — em vez de a tela dizer uma coisa e o score fazer outra.
 */
export function motivoDaPrioridade(e: EntradaPrioridade): string {
    if (e.foraDaCidade) return 'Não roda nesta cidade.';
    if (e.recusado) return 'Parceiro recusou.';
    if (e.noAr) return 'No ar.';
    if (e.rascunho) return 'Item em rascunho, nunca publicado.';
    if (e.caiu) return 'O item saiu do ar — arquivado ou desativado.';
    if (e.aguardandoParceiro) {
        const d = e.diasEsperando;
        return d != null && d > 0
            ? `Oferta pronta há ${d} ${d === 1 ? 'dia' : 'dias'}, sem resposta.`
            : 'Oferta pronta, esperando o parceiro.';
    }
    return e.cidadeTop
        ? 'Nunca ofertada, e a cidade é prioritária.'
        : 'Nunca ofertada para este parceiro.';
}

export const ORDEM_ZONAS: ZonaCampanha[] = ['agir', 'aguardando', 'no_ar', 'parado'];

export const ROTULO_ZONA: Record<ZonaCampanha, string> = {
    agir: 'agir agora',
    aguardando: 'aguardando parceiro',
    no_ar: 'no ar',
    parado: 'sem ação agora',
};

/** Maior score primeiro; empate resolve por nome, pra ordem não dançar entre renders. */
export function ordenarPorPrioridade<T extends { prioridade: Prioridade; title: string }>(itens: T[]): T[] {
    return [...itens].sort((a, b) =>
        b.prioridade.score - a.prioridade.score || a.title.localeCompare(b.title, 'pt-BR'),
    );
}

/** Agrupa na ordem das zonas, omitindo zona vazia. */
export function agruparPorZona<T extends { prioridade: Prioridade; title: string }>(
    itens: T[],
): { zona: ZonaCampanha; itens: T[] }[] {
    const ordenados = ordenarPorPrioridade(itens);
    return ORDEM_ZONAS
        .map(zona => ({ zona, itens: ordenados.filter(i => i.prioridade.zona === zona) }))
        .filter(g => g.itens.length > 0);
}
