import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, isPast, isToday, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useTrelloTarefas, type TarefaTrello } from '../hooks/useTrelloTarefas';

type Nivel = 'overdue' | 'today' | 'upcoming' | 'sem_prazo';

const NIVEL_META: Record<Nivel, { label: string; icon: string; header: string; badge: string }> = {
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

const NIVEL_ORDEM: Nivel[] = ['overdue', 'today', 'upcoming', 'sem_prazo'];

function nivelDaTarefa(due: string | null): { nivel: Nivel; data: Date | null } {
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

export default function TrelloView() {
    const { data: tarefas, isLoading, error, refresh } = useTrelloTarefas();
    const [boardFilter, setBoardFilter] = useState('');

    const boards = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of tarefas) counts.set(t.board, (counts.get(t.board) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    }, [tarefas]);

    const tarefasFiltradas = useMemo(
        () => (boardFilter ? tarefas.filter(t => t.board === boardFilter) : tarefas),
        [tarefas, boardFilter],
    );

    const grupos = useMemo(() => {
        const hoje = startOfDay(new Date());
        const comNivel = tarefasFiltradas.map(t => {
            const { nivel, data } = nivelDaTarefa(t.due);
            return { tarefa: t, nivel, daysOffset: data ? differenceInCalendarDays(data, hoje) : null };
        });

        return NIVEL_ORDEM.map(nivel => ({
            nivel,
            itens: comNivel
                .filter(c => c.nivel === nivel)
                .sort((a, b) => (a.daysOffset ?? 0) - (b.daysOffset ?? 0)),
        })).filter(g => g.itens.length > 0);
    }, [tarefasFiltradas]);

    return (
        <div className="flex-1 min-h-0 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full overflow-y-auto">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trello</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Cards atribuídos a você em todos os boards — tudo o que está pendente, num lugar só.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {boards.length > 0 && (
                        <select
                            value={boardFilter}
                            onChange={e => setBoardFilter(e.target.value)}
                            className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
                            title="Filtrar por board"
                        >
                            <option value="">Todos os boards ({tarefas.length})</option>
                            {boards.map(([board, count]) => (
                                <option key={board} value={board}>
                                    {board} ({count})
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>sync</span>
                        {isLoading ? 'Atualizando…' : 'Atualizar'}
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">Carregando cards…</div>
            ) : grupos.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                    {boardFilter ? `Nenhum card pendente no board "${boardFilter}".` : 'Nenhum card pendente atribuído a você.'}
                </div>
            ) : (
                <div className="space-y-4">
                    {grupos.map(grupo => {
                        const meta = NIVEL_META[grupo.nivel];
                        return (
                            <div key={grupo.nivel} className={`rounded-xl border p-3 ${meta.header}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">{meta.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${meta.badge}`}>
                                        {grupo.itens.length}
                                    </span>
                                </div>
                                <ul className="space-y-1.5">
                                    {grupo.itens.map(({ tarefa, daysOffset }) => (
                                        <TarefaItem
                                            key={tarefa.id}
                                            tarefa={tarefa}
                                            mostrarAtraso={grupo.nivel === 'overdue'}
                                            daysOffset={daysOffset}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function TarefaItem({ tarefa, mostrarAtraso, daysOffset }: { tarefa: TarefaTrello; mostrarAtraso: boolean; daysOffset: number | null }) {
    return (
        <li>
            <a
                href={tarefa.cardUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg bg-white/70 dark:bg-slate-900/50 px-3 py-2 hover:opacity-80 transition-opacity"
            >
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-slate-900 dark:text-white truncate ${tarefa.dueComplete ? 'line-through opacity-60' : ''}`}>
                        {tarefa.nome}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                        {tarefa.board} · {tarefa.lista}
                        {tarefa.due && (
                            <>
                                {' · '}
                                {format(parseISO(tarefa.due), 'dd/MM/yyyy', { locale: ptBR })}
                                {mostrarAtraso && daysOffset != null && (
                                    <span className="text-red-600 font-bold ml-1">({Math.abs(daysOffset)}d atraso)</span>
                                )}
                            </>
                        )}
                    </p>
                </div>
                {tarefa.dueComplete && (
                    <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0" title="Marcado como concluído no Trello">
                        check_circle
                    </span>
                )}
                <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">open_in_new</span>
            </a>
        </li>
    );
}
