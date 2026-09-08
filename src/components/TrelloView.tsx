import { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, format, isPast, isToday, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useTrelloTarefas, type TarefaTrello, type LabelTrello, type MembroTrello } from '../hooks/useTrelloTarefas';
import { useTrelloAtividadeHoje, type AtividadeTrelloHoje, type MovimentacaoTrello } from '../hooks/useTrelloAtividadeHoje';

// Paleta de cores de label do Trello (aproximação visual dos tokens atuais
// do produto — não crítico ser pixel-perfect, só "parecido").
const TRELLO_LABEL_COLORS: Record<string, string> = {
    green: '#4BCE97', green_dark: '#1F845A', green_light: '#BAF3DB',
    yellow: '#F5CD47', yellow_dark: '#946F00', yellow_light: '#F8E6A0',
    orange: '#FEA362', orange_dark: '#C25100', orange_light: '#FFDCC7',
    red: '#F87168', red_dark: '#C9372C', red_light: '#FFD5D2',
    purple: '#9F8FEF', purple_dark: '#6E5DC6', purple_light: '#DFD8FD',
    blue: '#579DFF', blue_dark: '#0C66E4', blue_light: '#CCE0FF',
    sky: '#6CC3E0', sky_dark: '#227D9B', sky_light: '#C6EDFB',
    lime: '#94C748', lime_dark: '#4C6B1F', lime_light: '#D3F1A7',
    pink: '#E774BB', pink_dark: '#AE4787', pink_light: '#FDD0EC',
    black: '#8590A2', black_dark: '#626F86', black_light: '#DCDFE4',
};

function corDoLabel(cor: string | null): string {
    return (cor && TRELLO_LABEL_COLORS[cor]) || '#94A3B8';
}

/** Cor de texto legível sobre os tons "_light" (claros) — os demais já são escuros o bastante pra texto branco. */
function corDoTextoDoLabel(cor: string | null): string {
    return cor?.endsWith('_light') ? '#1F2937' : '#FFFFFF';
}

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
const STORAGE_KEY_MODO = 'trello_view_modo_v1';

type ModoVisualizacao = 'tabela' | 'quadro';

function loadModo(): ModoVisualizacao {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_MODO);
        if (raw === 'tabela' || raw === 'quadro') return raw;
    } catch { /* ignore */ }
    return 'tabela';
}

function saveModo(modo: ModoVisualizacao) {
    try {
        localStorage.setItem(STORAGE_KEY_MODO, modo);
    } catch { /* ignore */ }
}

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
    const { data: atividadeHoje, isLoading: loadingAtividade, error: erroAtividade } = useTrelloAtividadeHoje();
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [boardsOcultos, setBoardsOcultos] = useState<Set<string>>(() => loadSet(STORAGE_KEY_BOARDS));
    const [listasOcultas, setListasOcultas] = useState<Set<string>>(() => loadSet(STORAGE_KEY_LISTAS));
    const [arquivadoFiltro, setArquivadoFiltro] = useState<Estado3>(() => loadEstado3(STORAGE_KEY_ARQUIVADO, 'ocultar'));
    const [concluidoFiltro, setConcluidoFiltro] = useState<Estado3>(() => loadEstado3(STORAGE_KEY_CONCLUIDO, 'todos'));
    const [modo, setModo] = useState<ModoVisualizacao>(loadModo);

    const mudarModo = (v: ModoVisualizacao) => { setModo(v); saveModo(v); };

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
    // Ordenada por listaOrdem (posição real no board, vinda da API) — não
    // alfabética — pra bater com a ordem visual das colunas no Trello de
    // verdade (essencial pro modo "Quadro").
    const listas = useMemo(() => {
        const counts = new Map<string, { board: string; lista: string; count: number; ordem: number }>();
        for (const t of tarefasBase) {
            if (boardsOcultos.has(t.board)) continue;
            const key = listaKey(t.board, t.lista);
            const atual = counts.get(key);
            if (atual) atual.count++;
            else counts.set(key, { board: t.board, lista: t.lista, count: 1, ordem: t.listaOrdem });
        }
        return [...counts.values()].sort((a, b) => a.ordem - b.ordem);
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
        <div className={`flex-1 min-h-0 flex flex-col p-4 md:p-8 mx-auto w-full ${modo === 'quadro' ? 'max-w-full' : 'max-w-6xl'}`}>
            <header className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trello</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Cards atribuídos a você em todos os boards — tudo o que está pendente, num lugar só.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <AtividadeHojeResumo atividade={atividadeHoje} isLoading={loadingAtividade} error={erroAtividade} />
                    <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => mudarModo('quadro')}
                                title="Visualização em quadro"
                                className={`flex items-center justify-center w-9 h-[34px] transition-colors ${
                                    modo === 'quadro'
                                        ? 'bg-primary text-white'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">view_column</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => mudarModo('tabela')}
                                title="Visualização em tabela"
                                className={`flex items-center justify-center w-9 h-[34px] border-l border-slate-200 dark:border-slate-700 transition-colors ${
                                    modo === 'tabela'
                                        ? 'bg-primary text-white'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">table_rows</span>
                            </button>
                        </div>
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

                    {modo === 'tabela' ? (
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
                    ) : (
                        <QuadroBoard linhas={linhas} listas={listas} />
                    )}
                </>
            )}
        </div>
    );
}

function AtividadeHojeResumo({ atividade, isLoading, error }: {
    atividade: AtividadeTrelloHoje | null;
    isLoading: boolean;
    error: string | null;
}) {
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!aberto) return;
        const fechar = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [aberto]);

    // Widget secundário — se falhar, não quebra a tela principal.
    if (error) return null;

    const tileClasses = (ativo: boolean) =>
        `flex flex-col items-center px-3 py-1.5 rounded-lg border min-w-[80px] transition-colors ${
            ativo
                ? 'border-primary bg-primary/10'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setAberto(v => !v)}
                className="flex items-center gap-2"
                title="Clique pra ver o detalhe da sua atividade hoje no Trello"
            >
                <div className={tileClasses(aberto)}>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-none tabular-nums">
                        {isLoading || !atividade ? '—' : atividade.totalMovimentacoes}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1 text-center leading-tight">
                        Movimentações hoje
                    </span>
                </div>
                <div className={tileClasses(aberto)}>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-none tabular-nums">
                        {isLoading || !atividade ? '—' : atividade.cardsMovidos}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1 text-center leading-tight">
                        Cards movidos
                    </span>
                </div>
            </button>

            {aberto && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 z-50 text-left">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Atividade de hoje</p>
                        {atividade && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {atividade.comentarios} comentários · {atividade.cardsMovidos} cards movidos
                            </p>
                        )}
                    </div>
                    {!atividade || atividade.movimentacoes.length === 0 ? (
                        <p className="p-6 text-center text-sm text-slate-400">Nenhuma movimentação ainda hoje.</p>
                    ) : (
                        <div className="pb-2">
                            {atividade.movimentacoes.map(m => (
                                <MovimentacaoItem key={m.id} movimentacao={m} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function limparTextoComentario(texto: string): string {
    const semImagens = texto.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
    return semImagens || texto.trim() || '(sem texto)';
}

function MovimentacaoItem({ movimentacao: m }: { movimentacao: MovimentacaoTrello }) {
    const hora = new Date(m.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    return (
        <a
            href={m.cardUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60"
        >
            <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${m.tipo === 'comentario' ? 'text-sky-500' : 'text-violet-500'}`}>
                {m.tipo === 'comentario' ? 'chat_bubble' : 'swap_horiz'}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{m.cardNome}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{hora}</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{m.boardNome}</p>
                {m.tipo === 'comentario' ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {limparTextoComentario(m.texto ?? '')}
                    </p>
                ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {m.listaAntes ?? '?'} → {m.listaDepois ?? '?'}
                    </p>
                )}
            </div>
        </a>
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
                {tarefa.labels.length > 0 && <CardLabels labels={tarefa.labels} compact />}
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
                <CardMetaBadges tarefa={tarefa} className="mt-1" />
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

function CardLabels({ labels, compact = false }: { labels: LabelTrello[]; compact?: boolean }) {
    return (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mb-1' : 'mb-1.5'}`}>
            {labels.map(l => (
                <span
                    key={l.id}
                    className={`inline-flex items-center rounded font-bold ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
                    style={{ backgroundColor: corDoLabel(l.cor), color: corDoTextoDoLabel(l.cor) }}
                    title={l.nome}
                >
                    {l.nome}
                </span>
            ))}
        </div>
    );
}

function MemberAvatars({ membros }: { membros: MembroTrello[] }) {
    if (membros.length === 0) return null;
    const visiveis = membros.slice(0, 3);
    const resto = membros.length - visiveis.length;
    return (
        <div className="flex items-center -space-x-1.5 shrink-0">
            {visiveis.map(m => (
                m.avatarUrl ? (
                    <img
                        key={m.id}
                        src={`${m.avatarUrl}/30.png`}
                        alt={m.nome}
                        title={m.nome}
                        className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 object-cover"
                    />
                ) : (
                    <span
                        key={m.id}
                        title={m.nome}
                        className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-400 text-white text-[9px] font-bold flex items-center justify-center"
                    >
                        {m.iniciais}
                    </span>
                )
            ))}
            {resto > 0 && (
                <span className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-bold flex items-center justify-center">
                    +{resto}
                </span>
            )}
        </div>
    );
}

/** Descrição / checklist / comentários / anexos / avatares — os "badges" do card, igual ao Trello real. */
function CardMetaBadges({ tarefa, className = '' }: { tarefa: TarefaTrello; className?: string }) {
    const nada = !tarefa.temDescricao && !tarefa.checklist && tarefa.comentarios === 0 && tarefa.anexos === 0 && tarefa.membros.length === 0;
    if (nada) return null;
    return (
        <div className={`flex items-center flex-wrap gap-2 text-[11px] text-slate-400 dark:text-slate-500 ${className}`}>
            {tarefa.temDescricao && (
                <span className="material-symbols-outlined text-[14px]" title="Tem descrição">subject</span>
            )}
            {tarefa.checklist && (
                <span
                    className={`inline-flex items-center gap-0.5 ${tarefa.checklist.feitos === tarefa.checklist.total ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                    title="Checklist"
                >
                    <span className="material-symbols-outlined text-[14px]">check_box</span>
                    {tarefa.checklist.feitos}/{tarefa.checklist.total}
                </span>
            )}
            {tarefa.comentarios > 0 && (
                <span className="inline-flex items-center gap-0.5" title="Comentários">
                    <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                    {tarefa.comentarios}
                </span>
            )}
            {tarefa.anexos > 0 && (
                <span className="inline-flex items-center gap-0.5" title="Anexos">
                    <span className="material-symbols-outlined text-[14px]">attach_file</span>
                    {tarefa.anexos}
                </span>
            )}
            {tarefa.membros.length > 0 && <MemberAvatars membros={tarefa.membros} />}
        </div>
    );
}

type LinhaTarefa = { tarefa: TarefaTrello; nivel: Nivel; daysOffset: number | null };

/** Réplica do quadro do Trello: uma coluna por lista (board+lista), na mesma ordem visual do board real. */
function QuadroBoard({ linhas, listas }: {
    linhas: LinhaTarefa[];
    listas: { board: string; lista: string; count: number; ordem: number }[];
}) {
    const porColuna = useMemo(() => {
        const map = new Map<string, LinhaTarefa[]>();
        for (const linha of linhas) {
            const key = listaKey(linha.tarefa.board, linha.tarefa.lista);
            const atual = map.get(key);
            if (atual) atual.push(linha); else map.set(key, [linha]);
        }
        return map;
    }, [linhas]);

    return (
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl">
            <div className="flex items-start gap-3 h-full pb-2">
                {listas.map(l => {
                    const key = listaKey(l.board, l.lista);
                    const itens = porColuna.get(key) ?? [];
                    return (
                        <div key={key} className="w-72 shrink-0 flex flex-col rounded-xl bg-slate-100 dark:bg-slate-800/60 max-h-full">
                            <div className="px-3 py-2.5 shrink-0">
                                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 truncate">{l.board}</p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={l.lista}>
                                    {l.lista} <span className="font-normal text-slate-400">({itens.length})</span>
                                </p>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
                                {itens.length === 0 ? (
                                    <p className="px-1 py-2 text-xs text-slate-400 italic">Nenhum card seu aqui</p>
                                ) : (
                                    itens.map(({ tarefa, nivel, daysOffset }) => (
                                        <QuadroCard key={tarefa.id} tarefa={tarefa} nivel={nivel} daysOffset={daysOffset} />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function QuadroCard({ tarefa, nivel, daysOffset }: { tarefa: TarefaTrello; nivel: Nivel; daysOffset: number | null }) {
    const abrirCard = () => window.open(tarefa.cardUrl, '_blank', 'noopener,noreferrer');
    return (
        <div
            onClick={abrirCard}
            className={`cursor-pointer rounded-lg bg-white dark:bg-slate-900 shadow-sm hover:shadow-md ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2.5 transition-shadow ${tarefa.closed ? 'opacity-60' : ''}`}
        >
            {tarefa.labels.length > 0 && <CardLabels labels={tarefa.labels} />}
            <p className={`text-sm font-semibold text-slate-800 dark:text-slate-100 ${tarefa.dueComplete ? 'line-through opacity-60' : ''}`}>
                {tarefa.nome}
            </p>
            {(tarefa.due || tarefa.closed || tarefa.dueComplete) && (
                <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                    {tarefa.due && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${NIVEL_META[nivel].badge}`}>
                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                            {format(parseISO(tarefa.due), 'dd/MM', { locale: ptBR })}
                            {nivel === 'overdue' && daysOffset != null && ` · ${Math.abs(daysOffset)}d atraso`}
                        </span>
                    )}
                    {tarefa.closed && (
                        <span className="material-symbols-outlined text-[14px] text-slate-400" title="Card arquivado no Trello">archive</span>
                    )}
                    {tarefa.dueComplete && (
                        <span className="material-symbols-outlined text-[14px] text-emerald-600" title="Marcado como concluído no Trello">check_circle</span>
                    )}
                </div>
            )}
            <CardMetaBadges tarefa={tarefa} className="mt-2 justify-between" />
        </div>
    );
}
