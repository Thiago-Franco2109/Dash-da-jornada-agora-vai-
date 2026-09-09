import { isPast, isToday, parseISO, startOfDay } from 'date-fns';

/** Classificação de urgência por due date — compartilhada entre a aba Trello e o Quadro da Acompanhar Onboarding. */
export type Nivel = 'overdue' | 'today' | 'upcoming' | 'sem_prazo';

export const NIVEL_META: Record<Nivel, { label: string; icon: string; header: string; badge: string }> = {
    overdue: {
        label: 'Atrasados',
        icon: 'error',
        header: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    },
    today: {
        label: 'Hoje',
        icon: 'today',
        header: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    },
    upcoming: {
        label: 'Próximos dias',
        icon: 'schedule',
        header: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/50 text-sky-900 dark:text-sky-200',
        badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    },
    sem_prazo: {
        label: 'Sem prazo',
        icon: 'inbox',
        header: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
        badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    },
};

export const NIVEL_ORDEM: Nivel[] = ['overdue', 'today', 'upcoming', 'sem_prazo'];
export const NIVEL_INDICE: Record<Nivel, number> = { overdue: 0, today: 1, upcoming: 2, sem_prazo: 3 };

// Tarja colorida na 1ª coluna da tabela — mesmo código de cor do NIVEL_META,
// só que como borda em vez de fundo.
export const NIVEL_BORDA: Record<Nivel, string> = {
    overdue: 'border-l-red-400 dark:border-l-red-600',
    today: 'border-l-amber-400 dark:border-l-amber-600',
    upcoming: 'border-l-sky-400 dark:border-l-sky-600',
    sem_prazo: 'border-l-slate-300 dark:border-l-slate-700',
};

export function nivelDaTarefa(due: string | null): { nivel: Nivel; data: Date | null } {
    if (!due) return { nivel: 'sem_prazo', data: null };
    let data: Date;
    try {
        data = startOfDay(parseISO(due));
    } catch {
        return { nivel: 'sem_prazo', data: null };
    }
    if (isToday(data)) return { nivel: 'today', data };
    if (isPast(data)) return { nivel: 'overdue', data };
    return { nivel: 'upcoming', data };
}
