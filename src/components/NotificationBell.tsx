import { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, isPast, isToday, parseISO, startOfDay } from 'date-fns';
import type { CrmFollowUpAlert } from '../types/crm';
import type { TarefaTrello } from '../hooks/useTrelloTarefas';
import type { AppView } from '../types/views';
import { formatCrmDate } from './crm/crmShared';

type AlertLevel = 'overdue' | 'today' | 'upcoming';

interface TrelloAlert {
    tarefa: TarefaTrello;
    level: AlertLevel;
    daysOffset: number;
}

const LEVEL_ORDER: Record<AlertLevel, number> = { overdue: 0, today: 1, upcoming: 2 };

const LEVEL_DOT: Record<AlertLevel, string> = {
    overdue: 'bg-red-500',
    today: 'bg-amber-500',
    upcoming: 'bg-slate-400',
};

function classifyTrelloTarefas(tarefas: TarefaTrello[], upcomingDays = 3): TrelloAlert[] {
    const today = startOfDay(new Date());
    const out: TrelloAlert[] = [];

    for (const tarefa of tarefas) {
        if (!tarefa.due || tarefa.dueComplete) continue;

        let date: Date;
        try {
            date = startOfDay(parseISO(tarefa.due));
        } catch {
            continue;
        }

        const daysOffset = differenceInCalendarDays(date, today);
        let level: AlertLevel | null = null;

        if (isPast(date) && !isToday(date)) level = 'overdue';
        else if (isToday(date)) level = 'today';
        else if (daysOffset <= upcomingDays) level = 'upcoming';

        if (!level) continue;
        out.push({ tarefa, level, daysOffset });
    }

    return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.daysOffset - b.daysOffset);
}

const MAX_ITEMS_PER_SECTION = 6;

interface NotificationBellProps {
    crmAlerts: CrmFollowUpAlert[];
    trelloTasks: TarefaTrello[];
    onNavigate: (view: AppView) => void;
}

export default function NotificationBell({ crmAlerts, trelloTasks, onNavigate }: NotificationBellProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const trelloAlerts = useMemo(() => classifyTrelloTarefas(trelloTasks), [trelloTasks]);

    const urgentCount =
        crmAlerts.filter(a => a.level !== 'upcoming').length +
        trelloAlerts.filter(a => a.level !== 'upcoming').length;

    const hasAnyNotification = crmAlerts.length > 0 || trelloAlerts.length > 0;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                title="Notificações"
            >
                <span className="material-symbols-outlined">notifications</span>
                {urgentCount > 0 && (
                    <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {urgentCount > 9 ? '9+' : urgentCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 z-50 text-left">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Notificações</p>
                    </div>

                    {!hasAnyNotification ? (
                        <p className="p-6 text-center text-sm text-slate-400">Nenhuma notificação pendente.</p>
                    ) : (
                        <>
                            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Follow-ups do CRM</span>
                                <span className="text-[11px] font-bold text-slate-400">{crmAlerts.length}</span>
                            </div>
                            {crmAlerts.length === 0 ? (
                                <p className="px-4 pb-3 text-xs text-slate-400">Nenhum follow-up pendente.</p>
                            ) : (
                                <div className="pb-2">
                                    {crmAlerts.slice(0, MAX_ITEMS_PER_SECTION).map(alert => (
                                        <button
                                            key={alert.partnerId}
                                            type="button"
                                            onClick={() => { onNavigate('crm'); setOpen(false); }}
                                            className="w-full flex items-start gap-2 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                        >
                                            <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${LEVEL_DOT[alert.level]}`} />
                                            <span className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{alert.partner.estabelecimento}</p>
                                                <p className="text-[11px] text-slate-500 truncate">{alert.partner.cidade} · {formatCrmDate(alert.nextFollowUp)}</p>
                                            </span>
                                        </button>
                                    ))}
                                    {crmAlerts.length > MAX_ITEMS_PER_SECTION && (
                                        <button
                                            type="button"
                                            onClick={() => { onNavigate('crm'); setOpen(false); }}
                                            className="w-full px-4 py-1.5 text-left text-[11px] font-bold text-primary hover:underline"
                                        >
                                            Ver todos ({crmAlerts.length}) →
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="px-4 pt-2 pb-1 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tarefas do Trello</span>
                                <span className="text-[11px] font-bold text-slate-400">{trelloAlerts.length}</span>
                            </div>
                            {trelloAlerts.length === 0 ? (
                                <p className="px-4 pb-3 text-xs text-slate-400">Nenhuma tarefa pendente.</p>
                            ) : (
                                <div className="pb-2">
                                    {trelloAlerts.slice(0, MAX_ITEMS_PER_SECTION).map(({ tarefa, level }) => (
                                        <a
                                            key={tarefa.id}
                                            href={tarefa.cardUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => setOpen(false)}
                                            className="flex items-start gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                        >
                                            <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${LEVEL_DOT[level]}`} />
                                            <span className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{tarefa.nome}</p>
                                                <p className="text-[11px] text-slate-500 truncate">{tarefa.board} · {formatCrmDate(tarefa.due)}</p>
                                            </span>
                                        </a>
                                    ))}
                                    {trelloAlerts.length > MAX_ITEMS_PER_SECTION && (
                                        <button
                                            type="button"
                                            onClick={() => { onNavigate('trello'); setOpen(false); }}
                                            className="w-full px-4 py-1.5 text-left text-[11px] font-bold text-primary hover:underline"
                                        >
                                            Ver todos ({trelloAlerts.length}) →
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
