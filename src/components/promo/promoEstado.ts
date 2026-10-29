import type { PromoCampanhaStatus } from '../../hooks/usePromoStatus';

/**
 * Vocabulário único dos 5 estados de campanha por parceiro — a coluna
 * Promoções, o modal e a aba do parceiro falam todos daqui.
 *
 * Regra de cor: cada estado tem UMA cor, e ela diz de quem é a bola.
 *   emerald = no ar (nada a fazer)   amber = bola com o parceiro
 *   slate   = bola com o CS          rose  = o cliente não vê nada hoje
 */
export interface EstadoMeta {
    /** Rótulo curto, usado em badge e legenda. */
    label: string;
    /** O que o estado significa, em uma frase — vira title/legenda. */
    descricao: string;
    /** Próximo passo do CS. Vazio quando não há o que fazer. */
    acao: string;
    icone: string;
    /** Classe de fundo do segmento da trilha. */
    segmento: string;
    /** Texto/badge. */
    texto: string;
    badge: string;
}

export const ESTADO_META: Record<PromoCampanhaStatus, EstadoMeta> = {
    aprovado: {
        label: 'No ar',
        descricao: 'Item aprovado e ativo — o cliente vê a promoção no app.',
        acao: '',
        icone: 'check_circle',
        segmento: 'bg-emerald-500',
        texto: 'text-emerald-700 dark:text-emerald-400',
        badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
    },
    pendente: {
        label: 'Esperando o parceiro',
        descricao: 'Oferta pronta no painel do parceiro, aguardando ele aceitar.',
        acao: 'Falar com o parceiro pra ele aceitar.',
        icone: 'hourglass_top',
        segmento: 'bg-amber-500',
        texto: 'text-amber-700 dark:text-amber-400',
        badge: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20',
    },
    rascunho: {
        label: 'Rascunho',
        descricao: 'Item começado no CMS e nunca publicado — o parceiro nem viu.',
        acao: 'Terminar e publicar o item no CMS.',
        icone: 'edit_note',
        segmento: 'bg-slate-400 dark:bg-slate-500',
        texto: 'text-slate-600 dark:text-slate-300',
        badge: 'bg-slate-100 text-slate-600 ring-slate-300/70 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600',
    },
    caiu: {
        label: 'Saiu do ar',
        descricao: 'Tinha item nesta campanha e ele foi arquivado ou desativado.',
        acao: 'Reativar: o parceiro já aceitou uma vez.',
        icone: 'history_toggle_off',
        segmento: 'bg-rose-400',
        texto: 'text-rose-700 dark:text-rose-400',
        badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20',
    },
    'sem item': {
        label: 'Sem item',
        descricao: 'A campanha roda na cidade e o parceiro não tem nenhum item nela.',
        acao: 'Ofertar a campanha e montar o item.',
        icone: 'radio_button_unchecked',
        segmento: 'bg-slate-200 dark:bg-slate-600',
        texto: 'text-slate-500 dark:text-slate-400',
        badge: 'bg-white text-slate-500 ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600',
    },
};

/** Ordem em que os estados aparecem na legenda e no resumo do modal. */
export const ORDEM_ESTADOS: PromoCampanhaStatus[] = ['aprovado', 'pendente', 'rascunho', 'caiu', 'sem item'];

/**
 * A partir de quantos dias uma oferta pendente deixa de ser "esperando
 * resposta" e vira inventário morto.
 *
 * NÃO é um alarme vermelho: medido no banco em 28/10/2026, 993 dos 1.020
 * parceiros com item pendente estão parados há 30+ dias (799 há 90+). Pintar
 * isso de vermelho pintaria a coluna inteira e não diria nada. Aqui o número
 * é mostrado cru e o vermelho fica pro estado que é de fato raro e grave:
 * nenhuma promoção no ar.
 */
export const DIAS_OFERTA_ESQUECIDA = 90;

export function textoEspera(dias: number | null | undefined): string | null {
    if (dias == null) return null;
    if (dias <= 0) return 'hoje';
    if (dias >= 365) {
        const anos = Math.floor(dias / 365);
        return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
    }
    if (dias >= 60) return `${Math.floor(dias / 30)} meses`;
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Forma curta pra caber na célula da tabela: 20d, 4m, 2a. */
export function textoEsperaCurto(dias: number | null | undefined): string | null {
    if (dias == null) return null;
    if (dias >= 365) return `${Math.floor(dias / 365)}a`;
    if (dias >= 60) return `${Math.floor(dias / 30)}m`;
    return `${dias}d`;
}
