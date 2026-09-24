import { differenceInCalendarDays, isToday, parseISO } from 'date-fns';

/**
 * Classificação de urgência por due date — compartilhada por TODO o app (CRM e
 * Trello): sino, alarme estridente, telas de Trello/Onboarding e "Tarefas do dia".
 *
 * Granularidade de HORÁRIO, não só de dia: um prazo hoje às 08:00 já é `overdue`
 * às 14:00, não fica "today" até virar o dia. Antes disso truncava pra meia-noite
 * (`startOfDay`), o que escondia prazo vencido no mesmo dia — exatamente o que o
 * alarme estridente precisa detectar.
 */
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

export function nivelDaTarefa(
    due: string | null,
    agora: Date = new Date(),
): { nivel: Nivel; data: Date | null; diasOffset: number | null } {
    if (!due) return { nivel: 'sem_prazo', data: null, diasOffset: null };
    let data: Date;
    try {
        data = parseISO(due);
        if (Number.isNaN(data.getTime())) throw new Error('data inválida');
    } catch {
        return { nivel: 'sem_prazo', data: null, diasOffset: null };
    }

    const diasOffset = differenceInCalendarDays(data, agora);
    const nivel: Nivel =
        data.getTime() < agora.getTime() ? 'overdue' // já passou do horário — hoje ou antes
            : isToday(data) ? 'today' // ainda não chegou o horário, mas é hoje
                : 'upcoming';

    return { nivel, data, diasOffset };
}

/** Critério de ordenação dos cards — compartilhado entre a aba Trello e o Quadro da Acompanhar Onboarding. */
export type ModoOrdenacao = 'urgencia' | 'prazo_asc' | 'prazo_desc';

export const OPCOES_ORDENACAO: { valor: ModoOrdenacao; label: string }[] = [
    { valor: 'urgencia', label: 'Urgência' },
    { valor: 'prazo_asc', label: 'Prazo — mais próximo primeiro' },
    { valor: 'prazo_desc', label: 'Prazo — mais distante primeiro' },
];

interface ItemOrdenavel {
    nivel: Nivel;
    daysOffset: number | null;
    due?: string | null;
}

/**
 * "Urgência" prioriza atrasado > hoje > próximos > sem prazo, e dentro de
 * cada balde ordena pelo prazo — na prática já coincide com ordenar só pelo
 * prazo (cru) pra cards COM data, porque atrasado sempre vem antes de
 * próximos cronologicamente também. A diferença real aparece só ao inverter
 * ("mais distante primeiro") ou nos cards sem prazo, que ficam sempre por
 * último nos três modos.
 */
export function compararPorModo(a: ItemOrdenavel, b: ItemOrdenavel, modo: ModoOrdenacao): number {
    if (modo === 'urgencia') {
        return NIVEL_INDICE[a.nivel] - NIVEL_INDICE[b.nivel] || (a.daysOffset ?? 0) - (b.daysOffset ?? 0);
    }
    const semPrazoA = a.due == null;
    const semPrazoB = b.due == null;
    if (semPrazoA && semPrazoB) return 0;
    if (semPrazoA) return 1;
    if (semPrazoB) return -1;
    const diff = new Date(a.due!).getTime() - new Date(b.due!).getTime();
    return modo === 'prazo_asc' ? diff : -diff;
}
