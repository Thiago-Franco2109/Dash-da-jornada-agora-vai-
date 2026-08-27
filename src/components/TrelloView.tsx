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

const listaKey = (board: string, lista: string) => `${board}::${lista}`;

/** Preferência pessoal de boards/listas ocultos — sobrevive a refresh, não é dado do Trello. */
const STORAGE_KEY_BOARDS = 'trello_view_boards_ocultos_v1';
const STORAGE_KEY_LISTAS = 'trello_view_listas_ocultas_v1';

function loadSet(key: string): Set<string> {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
}

function saveSet(key: string, set: Set<string>) {
    try {
        localStorage.setItem(key, JSON.stringify([...set]));
    } catch { /* ignore */ }
}

export default function TrelloView() {
    const { data: tarefas, isLoading, error, refresh } = useTrelloTarefas();
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [boardsOcultos, setBoardsOcultos] = useState<Set<string>>(() => loadSet(STORAGE_KEY_BOARDS));
    const [listasOcultas, setListasOcultas] = useState<Set<string>>(() => loadSet(STORAGE_KEY_LISTAS));

    const toggleBoard = (board: string) => {
        setBoardsOcultos(prev => {
            const next = new Set(prev);
            if (next.has(board)) next.delete(board); else next.add(board);
            saveSet(STORAGE_KEY_BOARDS, next);
            return next;
        });
    };

    const toggleLista = (key: string) => {
        setListasOcultas(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            saveSet(STORAGE_KEY_LISTAS, next);
            return next;
        });
    };

    const mostrarTodosBoards = () => { setBoardsOcultos(new Set()); saveSet(STORAGE_KEY_BOARDS, new Set()); };
    const mostrarTodasListas = () => { setListasOcultas(new Set()); saveSet(STORAGE_KEY_LISTAS, new Set()); };

    const boards = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of tarefas) counts.set(t.board, (counts.get(t.board) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    }, [tarefas]);

    // Só lista as listas dos boards ainda visíveis, senão a checklist fica com
    // lixo de board que o próprio usuário já ocultou.
    const listas = useMemo(() => {
        const counts = new Map<string, { board: string; lista: string; count: number }>();
        for (const t of tarefas) {
            if (boardsOcultos.has(t.board)) continue;
            const key = listaKey(t.board, t.lista);
            const atual = counts.get(key);
            if (atual) atual.count++;
            else counts.set(key, { board: t.board, lista: t.lista, count: 1 });
        }
        return [...counts.values()].sort((a, b) =>
            a.board.localeCompare(b.board, 'pt-BR') || a.lista.localeCompare(b.lista, 'pt-BR'));
    }, [tarefas, boardsOcultos]);

    const tarefasFiltradas = useMemo(
        () => tarefas.filter(t => !boardsOcultos.has(t.board) && !listasOcultas.has(listaKey(t.board, t.lista))),
        [tarefas, boardsOcultos, listasOcultas],
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

    const totalFiltrosAtivos = boardsOcultos.size + listasOcultas.size;

    return (
        <div className="flex-1 min-h-0 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full overflow-y-auto">
            <header className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trello</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Cards atribuídos a você em todos os boards — tudo o que está pendente, num lugar só.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setFiltrosAbertos(v => !v)}
                        className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                            filtrosAbertos
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filtros
                        {totalFiltrosAtivos > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
                                {totalFiltrosAtivos}
                            </span>
                        )}
                    </button>
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

            {filtrosAbertos && (
                <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Boards ({boards.length - boardsOcultos.size}/{boards.length})
                            </span>
                            {boardsOcultos.size > 0 && (
                                <button type="button" onClick={mostrarTodosBoards} className="text-xs font-medium text-primary hover:underline">
                                    Mostrar todos
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {boards.map(([board, count]) => {
                                const oculto = boardsOcultos.has(board);
                                return (
                                    <button
                                        key={board}
                                        type="button"
                                        onClick={() => toggleBoard(board)}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                            oculto
                                                ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 line-through opacity-60'
                                                : 'border-primary/30 bg-primary/10 text-primary'
                                        }`}
                                    >
                                        {board} ({count})
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {listas.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Listas ({listas.length - listas.filter(l => listasOcultas.has(listaKey(l.board, l.lista))).length}/{listas.length})
                                </span>
                                {listasOcultas.size > 0 && (
                                    <button type="button" onClick={mostrarTodasListas} className="text-xs font-medium text-primary hover:underline">
                                        Mostrar todas
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                                {listas.map(l => {
                                    const key = listaKey(l.board, l.lista);
                                    const oculta = listasOcultas.has(key);
                                    return (
                                        <label
                                            key={key}
                                            className="flex items-center gap-2 text-sm px-1.5 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!oculta}
                                                onChange={() => toggleLista(key)}
                                                className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary/40"
                                            />
                                            <span className={oculta ? 'text-slate-400 dark:text-slate-600 line-through' : 'text-slate-700 dark:text-slate-200'}>
                                                <span className="text-slate-400 dark:text-slate-500">{l.board} · </span>
                                                {l.lista} ({l.count})
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">Carregando cards…</div>
            ) : grupos.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                    {totalFiltrosAtivos > 0 ? 'Nenhum card pendente com os filtros atuais.' : 'Nenhum card pendente atribuído a você.'}
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
