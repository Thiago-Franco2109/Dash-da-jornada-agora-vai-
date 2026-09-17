import type { PromoStatus } from '../hooks/useStatusOverride';

/**
 * Desfechos de uma ligação de ativação de campanha.
 *
 * O CS liga pro parceiro pra fechar a oferta que já está pendente. Cada desfecho
 * pede uma volta diferente — por isso o prazo de follow-up vem junto do motivo, e
 * não é fixo. "Não quer" é o único que tira o parceiro da fila.
 *
 * O motivo é gravado em `campanha_status_cs.motivo` (ver supabase/campanha_status_cs.sql).
 * Agregado, ele responde se o gargalo é preço, informação ou recusa — pergunta que
 * hoje ninguém consegue responder.
 */

export type MotivoLigacao =
    | 'sim'
    | 'desconto_alto'
    | 'nao_entendeu_subsidio'
    | 'esqueceu'
    | 'nao_quer'
    | 'outro';

export interface DesfechoLigacao {
    motivo: MotivoLigacao;
    label: string;
    /** Frase curta no card, pra lembrar com que argumento voltar. */
    chip: string;
    icon: string;
    status: PromoStatus;
    /** Dias corridos até voltar a cobrar. null = sai da fila. */
    voltarEmDias: number | null;
    /** Pede texto livre ao escolher. */
    pedeDetalhe?: boolean;
}

export const DESFECHOS_LIGACAO: DesfechoLigacao[] = [
    {
        motivo: 'sim',
        label: 'Disse sim — vou aprovar no CMS',
        chip: 'Disse sim',
        icon: 'check_circle',
        status: 'ofertei',
        voltarEmDias: 1, // lembrete curto: falta o CS fechar no CMS
    },
    {
        motivo: 'esqueceu',
        label: 'Esqueceu / não respondeu',
        chip: 'Esqueceu',
        icon: 'schedule',
        status: 'ofertei',
        voltarEmDias: 2,
    },
    {
        motivo: 'nao_entendeu_subsidio',
        label: 'Não entendeu como funciona o subsídio',
        chip: 'Não entendeu subsídio',
        icon: 'help',
        status: 'ofertei',
        voltarEmDias: 2,
    },
    {
        motivo: 'desconto_alto',
        label: 'Achou o desconto alto pra bancar',
        chip: 'Acha caro',
        icon: 'trending_down',
        status: 'ofertei',
        voltarEmDias: 7, // precisa preparar outra proposta
    },
    {
        motivo: 'nao_quer',
        label: 'Não quer participar de jeito nenhum',
        chip: 'Não quer',
        icon: 'block',
        status: 'negado',
        voltarEmDias: null,
    },
    {
        motivo: 'outro',
        label: 'Outro motivo',
        chip: 'Outro',
        icon: 'more_horiz',
        status: 'ofertei',
        voltarEmDias: 3,
        pedeDetalhe: true,
    },
];

export function getDesfecho(motivo: string | null | undefined): DesfechoLigacao | undefined {
    return DESFECHOS_LIGACAO.find(d => d.motivo === motivo);
}

/** Data ISO (YYYY-MM-DD) de quando voltar, ou null se o desfecho tira da fila. */
export function proximoFollowUp(desfecho: DesfechoLigacao, hoje = new Date()): string | null {
    if (desfecho.voltarEmDias == null) return null;
    const d = new Date(hoje);
    d.setDate(d.getDate() + desfecho.voltarEmDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
