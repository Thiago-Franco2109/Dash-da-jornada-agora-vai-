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
const NIVEL_INDICE: Record<Nivel, number> = { overdue: 0, today: 1, upcoming: 2, sem_prazo: 3 };

// Tarja colorida na 1ª coluna da tabela — mesmo código de cor do NIVEL_META,
// só que como borda em vez de fundo (a tabela não tem mais um bloco por nível).
const NIVEL_BORDA: Record<Nivel, string> = {
    overdue: 'border-l-red-400 dark:border-l-red-600',
    today: 'border-l-amber-400 dark:border-l-amber-600',
    upcoming: 'border-l-sky-400 dark:border-l-sky-600',
    sem_prazo: 'border-l-slate-300 dark:border-l-slate-700',
};

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
const STORAGE_KEY_ARQUIVADO = 'trello_view_filtro_arquivado_v1';
const STORAGE_KEY_CONCLUIDO = 'trello_view_filtro_concluido_v1';

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

type Estado3 = 'todos' | 'so' | 'ocultar';

function loadEstado3(key: string, padrao: Estado3): Estado3 {
    try {
        const raw = localStorage.getItem(key);
        if (raw === 'todos' || raw === 'so' || raw === 'ocultar') return raw;
    } catch { /* ignore */ }
    return padrao;
}

function saveEstado3(key: string, valor: Estado3) {
    try {
        localStorage.setItem(key, valor);
    } catch { /* ignore */ }
}

function aplicaEstado3<T>(itens: T[], estado: Estado3, ehVerdadeiro: (item: T) => boolean): T[] {
    if (estado === 'todos') return itens;
    if (estado === 'so') return itens.filter(ehVerdadeiro);
    return itens.filter(item => !ehVerdadeiro(item));
}

function FiltroTresEstados({ label, valor, onChange, labelSo, labelOcultar }: {
    label: string;
    valor: Estado3;
    onChange: (v: Estado3) => void;
    labelSo: string;
    labelOcultar: string;
}) {
    const opcoes: { value: Estado3; label: string }[] = [
        { value: 'todos', label: 'Todos' },
        { value: 'so', label: labelSo },
        { value: 'ocultar', label: labelOcultar },
    ];
    return (
        <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">{label}</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {opcoes.map((op, i) => (
                    <button
                        key={op.value}
                        type="button"
                        onClick={() => onChange(op.value)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''} ${
                            valor === op.value
                                ? 'bg-primary text-white'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        {op.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function TrelloView() {
    const { data: tarefas, isLoading, isRefreshing, error, refresh } = useTrelloTarefas();
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [boardsOcultos, setBoardsOcultos] = useState<Set<string>>(() => loadSet(STORAGE_KEY_BOARDS));
    const [listasOcultas, setListasOcultas] = useState<Set<string>>(() => loadSet(STORAGE_KEY_LISTAS));
    const [arquivadoFiltro, setArquivadoFiltro] = useState<Estado3>(() => loadEstado3(STORAGE_KEY_ARQUIVADO, 'ocultar'));
    const [concluidoFiltro, setConcluidoFiltro] = useState<Estado3>(() => loadEstado3(STORAGE_KEY_CONCLUIDO, 'todos'));

    const mudarArquivadoFiltro = (v: Estado3) => { setArquivadoFiltro(v); saveEstado3(STORAGE_KEY_ARQUIVADO, v); };
    const mudarConcluidoFiltro = (v: Estado3) => { setConcluidoFiltro(v); saveEstado3(STORAGE_KEY_CONCLUIDO, v); };

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

    // Arquivado/concluído são filtros globais (aplicam antes de tudo) — os
    // contadores de board/lista já refletem esse recorte.
    const tarefasBase = useMemo(() => {
        let itens = aplicaEstado3(tarefas, arquivadoFiltro, t => t.closed);
        itens = aplicaEstado3(itens, concluidoFiltro, t => t.dueComplete);
        return itens;
    }, [tarefas, arquivadoFiltro, concluidoFiltro]);

    const boards = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of tarefasBase) counts.set(t.board, (counts.get(t.board) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    }, [tarefasBase]);

    // Só lista as listas dos boards ainda visíveis, senão a checklist fica com
    // lixo de board que o próprio usuário já ocultou.
    const listas = useMemo(() => {
        const counts = new Map<string, { board: string; lista: string; count: number }>();
        for (const t of tarefasBase) {
            if (boardsOcultos.has(t.board)) continue;
            const key = listaKey(t.board, t.lista);
            const atual = counts.get(key);
            if (atual) atual.count++;
            else counts.set(key, { board: t.board, lista: t.lista, count: 1 });
        }
        return [...counts.values()].sort((a, b) =>
            a.board.localeCompare(b.board, 'pt-BR') || a.lista.localeCompare(b.lista, 'pt-BR'));
    }, [tarefasBase, boardsOcultos]);

    const tarefasFiltradas = useMemo(
        () => tarefasBase.filter(t => !boardsOcultos.has(t.board) && !listasOcultas.has(listaKey(t.board, t.lista))),
        [tarefasBase, boardsOcultos, listasOcultas],
    );

    // Uma tabela só (estilo Pipedrive/Notion), ordenada por urgência e depois
    // por prazo — em vez de um bloco vertical por nível.
    const linhas = useMemo(() => {
        const hoje = startOfDay(new Date());
        const comNivel = tarefasFiltradas.map(t => {
            const { nivel, data } = nivelDaTarefa(t.due);
            return { tarefa: t, nivel, daysOffset: data ? differenceInCalendarDays(data, hoje) : null };
        });
        return comNivel.sort((a, b) =>
            NIVEL_INDICE[a.nivel] - NIVEL_INDICE[b.nivel] || (a.daysOffset ?? 0) - (b.daysOffset ?? 0));
    }, [tarefasFiltradas]);

    const contagensPorNivel = useMemo(() => {
        const counts: Record<Nivel, number> = { overdue: 0, today: 0, upcoming: 0, sem_prazo: 0 };
        for (const l of linhas) counts[l.nivel]++;
        return counts;
    }, [linhas]);

    const totalFiltrosAtivos = boardsOcultos.size + listasOcultas.size
        + (arquivadoFiltro !== 'ocultar' ? 1 : 0)
        + (concluidoFiltro !== 'todos' ? 1 : 0);

    return (
        <div className="flex-1 min-h-0 flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full">
            <header className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
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
                        disabled={isLoading || isRefreshing}
                        className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${isLoading || isRefreshing ? 'animate-spin' : ''}`}>sync</span>
                        {isLoading || isRefreshing ? 'Atualizando…' : 'Atualizar'}
                    </button>
                </div>
            </header>

            {filtrosAbertos && (
                <div className="mb-4 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
                    <div className="flex flex-wrap gap-6">
                        <FiltroTresEstados
                            label="Arquivados"
                            valor={arquivadoFiltro}
                            onChange={mudarArquivadoFiltro}
                            labelSo="Só arquivados"
                            labelOcultar="Ocultar arquivados"
                        />
                        <FiltroTresEstados
                            label="Concluídos"
                            valor={concluidoFiltro}
                            onChange={mudarConcluidoFiltro}
                            labelSo="Só concluídos"
                            labelOcultar="Ocultar concluídos"
                        />
                    </div>

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
            ) : linhas.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                    {totalFiltrosAtivos > 0 ? 'Nenhum card pendente com os filtros atuais.' : 'Nenhum card pendente atribuído a você.'}
                </div>
            ) : (
                <>
                    <div className="mb-3 flex flex-wrap gap-2 shrink-0">
                        {NIVEL_ORDEM.filter(n => contagensPorNivel[n] > 0).map(n => {
                            const meta = NIVEL_META[n];
                            return (
                                <span key={n} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${meta.badge}`}>
                                    <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
                                    {meta.label}: {contagensPorNivel[n]}
                                </span>
                            );
                        })}
                    </div>

                    <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                                <tr className="border-b border-slate-100 dark:border-slate-700">
                                    <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Card</th>
                                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Board</th>
                                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Lista</th>
                                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Prazo</th>
                                    <th className="w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                {linhas.map(({ tarefa, nivel, daysOffset }) => (
                                    <TarefaLinha key={tarefa.id} tarefa={tarefa} nivel={nivel} daysOffset={daysOffset} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function TarefaLinha({ tarefa, nivel, daysOffset }: { tarefa: TarefaTrello; nivel: Nivel; daysOffset: number | null }) {
    const abrirCard = () => window.open(tarefa.cardUrl, '_blank', 'noopener,noreferrer');
    return (
        <tr
            onClick={abrirCard}
            className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${tarefa.closed ? 'opacity-60' : ''}`}
        >
            <td className={`px-4 py-2.5 border-l-4 ${NIVEL_BORDA[nivel]}`}>
                <div className="flex items-center gap-1.5 min-w-0 max-w-[260px] sm:max-w-[320px]">
                    <span className={`truncate font-semibold text-slate-900 dark:text-white ${tarefa.dueComplete ? 'line-through opacity-60' : ''}`}>
                        {tarefa.nome}
                    </span>
                    {tarefa.closed && (
                        <span className="material-symbols-outlined text-[15px] text-slate-400 shrink-0" title="Card arquivado no Trello">
                            archive
                        </span>
                    )}
                    {tarefa.dueComplete && (
                        <span className="material-symbols-outlined text-[15px] text-emerald-600 shrink-0" title="Marcado como concluído no Trello">
                            check_circle
                        </span>
                    )}
                </div>
                <div className="text-[11px] text-slate-400 truncate sm:hidden">{tarefa.board} · {tarefa.lista}</div>
            </td>
            <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                <div className="truncate max-w-[220px]">{tarefa.board}</div>
            </td>
            <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 hidden md:table-cell">
                <div className="truncate max-w-[220px]">{tarefa.lista}</div>
            </td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                {tarefa.due ? (
                    <span className={nivel === 'overdue' ? 'text-red-600 font-bold' : 'text-slate-500 dark:text-slate-400'}>
                        {format(parseISO(tarefa.due), 'dd/MM/yyyy', { locale: ptBR })}
                        {nivel === 'overdue' && daysOffset != null && (
                            <span className="block text-[10px] font-normal">{Math.abs(daysOffset)}d atraso</span>
                        )}
                    </span>
                ) : (
                    <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>
                )}
            </td>
            <td className="px-3 py-2.5">
                <span className="material-symbols-outlined text-[16px] text-slate-400">open_in_new</span>
            </td>
        </tr>
    );
}
