/**
 * Tokens visuais compartilhados entre a tabela e a galeria de campanhas
 * (ambas vivem na aba Promoções do parceiro).
 *
 * Convenção que vem da tabela e a galeria mantém:
 *  - cor de ESTADO (TONE_STYLES) aparece num lugar só e forte — a trilha;
 *  - cor de IDENTIDADE da campanha (ACCENT_STYLES) vive no ícone, nunca no estado.
 */

export type CardTone = 'active' | 'pending' | 'denied' | 'idle';

export const TONE_STYLES: Record<CardTone, { rail: string; stamp: string; dot: string }> = {
    active: { rail: 'bg-emerald-500', stamp: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
    pending: { rail: 'bg-amber-500', stamp: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
    denied: { rail: 'bg-rose-500', stamp: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500' },
    idle: { rail: 'bg-slate-400 dark:bg-slate-500', stamp: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400' },
};

export type CampaignAccent = 'amber' | 'violet' | 'indigo' | 'slate';

export const ACCENT_STYLES: Record<CampaignAccent, string> = {
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
    // Campanha descoberta no banco: sem identidade própria definida no app.
    slate: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300',
};
