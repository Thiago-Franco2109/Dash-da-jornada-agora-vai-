/**
 * Formas de dado do Trello compartilhadas entre as duas telas que consomem
 * cards enriquecidos (labels/membros/checklist/etc): a aba Trello
 * (useTrelloTarefas) e o Quadro da Acompanhar Onboarding (useOnboardingTrello).
 */

export interface LabelTrello {
    id: string;
    nome: string;
    cor: string | null;
}

export interface MembroTrello {
    id: string;
    nome: string;
    iniciais: string;
    avatarUrl: string | null;
}

export interface ChecklistTrello {
    total: number;
    feitos: number;
}

/** Campos mínimos que um card precisa ter pra renderizar via CardLabels/MemberAvatars/CardMetaBadges/QuadroCard. */
export interface CartaoTrelloVisual {
    id: string;
    nome: string;
    due: string | null;
    dueComplete: boolean;
    closed: boolean;
    cardUrl: string;
    labels: LabelTrello[];
    membros: MembroTrello[];
    checklist: ChecklistTrello | null;
    comentarios: number;
    anexos: number;
    temDescricao: boolean;
}
