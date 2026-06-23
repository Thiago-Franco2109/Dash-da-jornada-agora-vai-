import { useMemo, useState } from 'react';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CrmPartner, CrmPartnerNote } from '../../types/crm';
import { PartnerAvatar } from './crmShared';

interface CrmCalendarViewProps {
    partners: CrmPartner[];
    getNote: (id: string) => CrmPartnerNote | undefined;
    onEditPartner: (partnerId: string) => void;
}

interface CalendarEvent {
    partner: CrmPartner;
    date: string;
    note?: string;
}

export default function CrmCalendarView({ partners, getNote, onEditPartner }: CrmCalendarViewProps) {
    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);

    const events = useMemo(() => {
        const list: CalendarEvent[] = [];
        for (const partner of partners) {
            const note = getNote(partner.partnerId);
            if (!note?.nextFollowUp) continue;
            list.push({ partner, date: note.nextFollowUp, note: note.notes });
        }
        return list;
    }, [partners, getNote]);

    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
        return eachDayOfInterval({ start: calStart, end: calEnd });
    }, [currentMonth]);

    const eventsForDay = (day: Date) =>
        events.filter(e => {
            try {
                return isSameDay(parseISO(e.date), day);
            } catch {
                return false;
            }
        });

    const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={() => setCurrentMonth(m => addMonths(m, -1))}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>

                <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
                    {weekDays.map(d => (
                        <div key={d} className="py-2 text-center text-[10px] font-bold uppercase text-slate-500">
                            {d}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7">
                    {calendarDays.map(day => {
                        const dayEvents = eventsForDay(day);
                        const inMonth = isSameMonth(day, currentMonth);
                        const isSelected = selectedDay && isSameDay(day, selectedDay);
                        const isToday = isSameDay(day, new Date());

                        return (
                            <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => setSelectedDay(day)}
                                className={`min-h-[72px] p-1 border-b border-r border-slate-100 dark:border-slate-800 text-left transition-colors ${
                                    !inMonth ? 'bg-slate-50/50 dark:bg-slate-900/30 opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                } ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}
                            >
                                <span className={`inline-flex size-6 items-center justify-center text-xs font-semibold rounded-full ${
                                    isToday ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-300'
                                }`}>
                                    {format(day, 'd')}
                                </span>
                                {dayEvents.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                        {dayEvents.slice(0, 2).map(ev => (
                                            <div
                                                key={ev.partner.partnerId}
                                                className="text-[9px] font-medium truncate px-1 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                                            >
                                                {ev.partner.estabelecimento}
                                            </div>
                                        ))}
                                        {dayEvents.length > 2 && (
                                            <p className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 2}</p>
                                        )}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                    {selectedDay
                        ? format(selectedDay, "dd 'de' MMMM", { locale: ptBR })
                        : 'Selecione um dia'}
                </h4>
                {selectedDay && selectedEvents.length === 0 && (
                    <p className="text-xs text-slate-500">Nenhum follow-up neste dia.</p>
                )}
                <ul className="space-y-2">
                    {selectedEvents.map(ev => (
                        <li key={ev.partner.partnerId}>
                            <button
                                type="button"
                                onClick={() => onEditPartner(ev.partner.partnerId)}
                                className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                            >
                                <PartnerAvatar row={ev.partner} size="sm" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                        {ev.partner.estabelecimento}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{ev.partner.cidade}</p>
                                    {ev.note && (
                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{ev.note}</p>
                                    )}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
                {!selectedDay && events.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                        {events.length} follow-up(s) agendado(s) no mês visível.
                    </p>
                )}
            </div>
        </div>
    );
}
