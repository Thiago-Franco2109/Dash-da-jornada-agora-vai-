import { useState } from 'react';
import { addDays, setHours, setMinutes, setSeconds } from 'date-fns';
import type { TarefaUnificada, TarefaSemPrazo } from '../hooks/useTarefasPendentes';
import type { CrmPartnerNote } from '../types/crm';
import type { MembroTrello } from '../types/trello';
import { useTrelloCardDetalhe, salvarPrazoCard } from '../hooks/useTrelloCardDetalhe';
import { NIVEL_META, rotuloPrazo } from '../utils/trelloNivel';
import { formatCrmDateTime, paraDatetimeLocal } from './crm/crmShared';
import { FiltroMembros } from './trello/TrelloCardVisual';
import CardDetalheModal from './trello/CardDetalheModal';

/**
 * Atalhos de triagem pra quem tem dezenas de cards sem data: um clique resolve
 * o caso comum (hoje / amanhã / semana que vem) e o campo de data cobre o resto.
 * "Hoje" cai no fim do expediente; se já passou das 18h, joga pra daqui a 1h —
 * marcar prazo no passado faria o card nascer atrasado e já tocar o alarme.
 */
const HORA_FIM_EXPEDIENTE = 18;
const HORA_INICIO_EXPEDIENTE = 9;

function noHorario(data: Date, hora: number): Date {
    return setSeconds(setMinutes(setHours(data, hora), 0), 0);
}

function prazoAtalho(tipo: 'hoje' | 'amanha' | 'semana', agora: Date = new Date()): Date {
    if (tipo === 'hoje') {
        const fimDoDia = noHorario(agora, HORA_FIM_EXPEDIENTE);
        return fimDoDia.getTime() > agora.getTime() ? fimDoDia : new Date(agora.getTime() + 3_600_000);
    }
    if (tipo === 'amanha') return noHorario(addDays(agora, 1), HORA_INICIO_EXPEDIENTE);
    return noHorario(addDays(agora, 7), HORA_INICIO_EXPEDIENTE);
}

const ATALHOS: { tipo: 'hoje' | 'amanha' | 'semana'; label: string }[] = [
    { tipo: 'hoje', label: 'Hoje' },
    { tipo: 'amanha', label: 'Amanhã' },
    { tipo: 'semana', label: '+7 dias' },
];

interface TarefasDoDiaViewProps {
    tarefas: TarefaUnificada[];
    tarefasSemPrazo: TarefaSemPrazo[];
    contagemPorNivel: { overdue: number; today: number; upcoming: number };
    ativado: boolean;
    permissao: NotificationPermission | 'unsupported';
    onAtivar: () => void;
    onDesativar: () => void;
    volume: number;
    onMudarVolume: (volume: number) => void;
    onTestarSom: () => void;
    membroFiltro: string | null;
    membrosDisponiveis: MembroTrello[];
    onMudarMembro: (id: string | null) => void;
    boardsIgnorados: Set<string>;
    boardsDisponiveis: { id: string; name: string }[];
    onToggleBoardIgnorado: (id: string) => void;
    listasIgnoradas: Set<string>;
    listasPorBoard: Map<string, { id: string; name: string }[]>;
    onToggleListaIgnorada: (id: string) => void;
    upsertCrmNote: (partnerId: string, patch: Partial<Pick<CrmPartnerNote, 'notes' | 'lastContact' | 'nextFollowUp'>>) => Promise<boolean> | void;
    onRefreshTrello: () => void;
}

const GRUPOS = ['overdue', 'today', 'upcoming'] as const;

export default function TarefasDoDiaView({
    tarefas,
    tarefasSemPrazo,
    contagemPorNivel,
    ativado,
    permissao,
    onAtivar,
    onDesativar,
    volume,
    onMudarVolume,
    onTestarSom,
    membroFiltro,
    membrosDisponiveis,
    onMudarMembro,
    boardsIgnorados,
    boardsDisponiveis,
    onToggleBoardIgnorado,
    listasIgnoradas,
    listasPorBoard,
    onToggleListaIgnorada,
    upsertCrmNote,
    onRefreshTrello,
}: TarefasDoDiaViewProps) {
    const [configAberta, setConfigAberta] = useState(false);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [valorEdicao, setValorEdicao] = useState('');
    const [semPrazoAberto, setSemPrazoAberto] = useState(false);
    const [definindoId, setDefinindoId] = useState<string | null>(null);
    const [valorNovoPrazo, setValorNovoPrazo] = useState('');
    const [salvandoId, setSalvandoId] = useState<string | null>(null);
    const [erroPrazoSemData, setErroPrazoSemData] = useState<string | null>(null);
    const cardDetalhe = useTrelloCardDetalhe();

    const grupos = GRUPOS.map(nivel => ({ nivel, itens: tarefas.filter(t => t.nivel === nivel) })).filter(g => g.itens.length > 0);

    const definirPrazo = async (t: TarefaSemPrazo, quando: Date) => {
        setSalvandoId(t.id);
        setErroPrazoSemData(null);
        try {
            await salvarPrazoCard(t.trelloCardId, quando.toISOString());
            setDefinindoId(null);
            onRefreshTrello(); // tira o card do "sem prazo" e joga no balde certo
        } catch (err) {
            setErroPrazoSemData(err instanceof Error ? err.message : 'Falha ao definir o prazo');
        } finally {
            setSalvandoId(null);
        }
    };

    const abrirEdicaoCrm = (t: TarefaUnificada) => {
        setEditandoId(t.id);
        setValorEdicao(paraDatetimeLocal(t.due));
    };

    const salvarReagendamentoCrm = async (partnerId: string) => {
        if (!valorEdicao) return;
        await upsertCrmNote(partnerId, { nextFollowUp: new Date(valorEdicao).toISOString() });
        setEditandoId(null);
    };

    const handleEditarPrazoTrello = async (due: string | null) => {
        await cardDetalhe.editarPrazo(due);
        onRefreshTrello(); // sem isso o card reagendado continua tocando alarme até o próximo poll de 60s
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Tarefas do dia</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Follow-ups do CRM e tarefas do Trello num só lugar
                        {(contagemPorNivel.overdue > 0 || contagemPorNivel.today > 0) && (
                            <> — <span className="font-bold text-red-600 dark:text-red-400">{contagemPorNivel.overdue} atrasadas</span>, {contagemPorNivel.today} pra hoje</>
                        )}
                        .
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setConfigAberta(v => !v)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                            <span className="material-symbols-outlined text-[18px]">tune</span>
                            Alarme e filtros
                        </span>
                        <span className="material-symbols-outlined text-slate-400">{configAberta ? 'expand_less' : 'expand_more'}</span>
                    </button>

                    {configAberta && (
                        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                            <div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={ativado}
                                    onClick={ativado ? onDesativar : onAtivar}
                                    className={`inline-flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors ${
                                        ativado
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                >
                                    <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${ativado ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${ativado ? 'left-[18px]' : 'left-0.5'}`} />
                                    </span>
                                    <span className="material-symbols-outlined text-[18px]">{ativado ? 'notifications_active' : 'notifications_off'}</span>
                                    {ativado ? 'Alarme ligado — avisa a cada 10s' : 'Alarme desligado — clique para ligar'}
                                </button>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400">volume_up</span>
                                    <input
                                        type="range"
                                        min={0.05}
                                        max={1}
                                        step={0.05}
                                        value={volume}
                                        onChange={e => onMudarVolume(Number(e.target.value))}
                                        aria-label="Volume do alarme"
                                        className="h-1.5 w-40 cursor-pointer accent-primary"
                                    />
                                    <span className="w-9 text-xs font-bold tabular-nums text-slate-500">{Math.round(volume * 100)}%</span>
                                    <button
                                        type="button"
                                        onClick={onTestarSom}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                        Testar som
                                    </button>
                                </div>

                                {/* Sem permissão do SO o alarme continua: o sino treme e o som toca
                                    enquanto a aba estiver aberta. Só o balão do sistema é que não aparece. */}
                                {ativado && permissao !== 'granted' && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                                        {permissao === 'unsupported'
                                            ? 'Este navegador não mostra notificações do sistema — o aviso fica no sino aqui em cima, que treme a cada 10s, e no som.'
                                            : 'Notificações do sistema bloqueadas no navegador — o aviso fica no sino aqui em cima, que treme a cada 10s, e no som.'}
                                    </p>
                                )}
                            </div>

                            {membrosDisponiveis.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Board de onboarding — só cards atribuídos a</p>
                                    <FiltroMembros membros={membrosDisponiveis} selecionado={membroFiltro} onSelecionar={onMudarMembro} />
                                    <p className="text-[11px] text-slate-400 mt-1.5">
                                        Vale só pro board de onboarding, que vem inteiro. Nos outros boards o Trello já entrega só os cards do token.
                                    </p>
                                </div>
                            )}

                            {boardsDisponiveis.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Trello — ignorar boards/listas</p>
                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-1.5">
                                        {boardsDisponiveis.map(board => (
                                            <div key={board.id}>
                                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                    <input type="checkbox" checked={boardsIgnorados.has(board.id)} onChange={() => onToggleBoardIgnorado(board.id)} className="rounded" />
                                                    {board.name}
                                                </label>
                                                {(listasPorBoard.get(board.id) ?? []).map(lista => (
                                                    <label key={lista.id} className="flex items-center gap-2 pl-6 mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                                                        <input type="checkbox" checked={listasIgnoradas.has(lista.id)} onChange={() => onToggleListaIgnorada(lista.id)} className="rounded" />
                                                        {lista.name}
                                                    </label>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Ter atrasado e alarme desligado é o pior dos mundos: a pessoa
                    acha que está sendo avisada e não está. Ver useTarefasPendentes. */}
                {!ativado && contagemPorNivel.overdue > 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/25">
                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">notifications_off</span>
                        <p className="flex-1 min-w-[200px] text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {contagemPorNivel.overdue === 1 ? '1 tarefa atrasada' : `${contagemPorNivel.overdue} tarefas atrasadas`} e o alarme está desligado — nada vai te avisar.
                        </p>
                        <button
                            type="button"
                            onClick={onAtivar}
                            className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700"
                        >
                            Ligar alarme
                        </button>
                    </div>
                )}

                {tarefas.length === 0 ? (
                    <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">task_alt</span>
                        <p className="text-sm text-slate-500">Nenhuma tarefa pendente — tudo em dia.</p>
                    </div>
                ) : (
                    grupos.map(grupo => {
                        const meta = NIVEL_META[grupo.nivel];
                        return (
                            <div key={grupo.nivel} className={`rounded-xl border p-4 ${meta.header}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">{meta.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${meta.badge}`}>{grupo.itens.length}</span>
                                </div>
                                <ul className="space-y-2">
                                    {grupo.itens.map(t => (
                                        <li key={t.id} className="rounded-lg bg-white/70 dark:bg-slate-900/50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t.titulo}</p>
                                                    <p className="text-[11px] text-slate-500 truncate">
                                                        {t.subtitulo} · {formatCrmDateTime(t.due)}
                                                        <span className={`ml-1 font-bold ${
                                                            t.nivel === 'overdue' ? 'text-red-600 dark:text-red-400'
                                                                : t.nivel === 'today' ? 'text-amber-700 dark:text-amber-400'
                                                                    : 'text-slate-500 dark:text-slate-400'
                                                        }`}>
                                                            ({rotuloPrazo(t.due)})
                                                        </span>
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${t.tipo === 'crm' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                                                    {t.tipo === 'crm' ? 'CRM' : 'Trello'}
                                                </span>
                                            </div>

                                            {t.tipo === 'crm' && t.crm && (
                                                editandoId === t.id ? (
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        <input
                                                            type="datetime-local"
                                                            value={valorEdicao}
                                                            onChange={e => setValorEdicao(e.target.value)}
                                                            className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => salvarReagendamentoCrm(t.crm!.partnerId)}
                                                            disabled={!valorEdicao}
                                                            title="Salvar"
                                                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-40"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">check</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditandoId(null)}
                                                            title="Cancelar"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirEdicaoCrm(t)}
                                                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">event_repeat</span>
                                                        Reagendar
                                                    </button>
                                                )
                                            )}

                                            {t.tipo === 'trello' && t.trelloCardId && (
                                                <button
                                                    type="button"
                                                    onClick={() => cardDetalhe.abrir(t.trelloCardId!)}
                                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">event_repeat</span>
                                                    Reagendar
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })
                )}

                {/* Sem prazo não entra nos baldes do dia (não tem quando), mas
                    precisa de um lugar pra receber data — senão o card fica
                    invisível aqui pra sempre. Fechado por padrão: é backlog,
                    não é o que vence hoje. */}
                {tarefasSemPrazo.length > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setSemPrazoAberto(v => !v)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        >
                            <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                                <span className="material-symbols-outlined text-[18px]">inbox</span>
                                Sem prazo
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    {tarefasSemPrazo.length}
                                </span>
                                <span className="font-medium text-[11px] text-slate-400 hidden sm:inline">
                                    — defina uma data pra entrarem no seu dia
                                </span>
                            </span>
                            <span className="material-symbols-outlined text-slate-400">{semPrazoAberto ? 'expand_less' : 'expand_more'}</span>
                        </button>

                        {semPrazoAberto && (
                            <div className="border-t border-slate-100 dark:border-slate-800">
                                {erroPrazoSemData && (
                                    <p className="px-4 pt-3 text-xs text-red-600 dark:text-red-400">{erroPrazoSemData}</p>
                                )}
                                <ul className="max-h-[28rem] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60">
                                    {tarefasSemPrazo.map(t => (
                                        <li key={t.id} className="px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => cardDetalhe.abrir(t.trelloCardId)}
                                                    className="min-w-0 flex-1 text-left group"
                                                >
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-primary">{t.titulo}</p>
                                                    <p className="text-[11px] text-slate-500 truncate">{t.subtitulo}</p>
                                                </button>
                                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                                    Trello
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {ATALHOS.map(atalho => (
                                                    <button
                                                        key={atalho.tipo}
                                                        type="button"
                                                        onClick={() => definirPrazo(t, prazoAtalho(atalho.tipo))}
                                                        disabled={salvandoId === t.id}
                                                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary disabled:opacity-40 transition-colors"
                                                    >
                                                        {atalho.label}
                                                    </button>
                                                ))}

                                                {definindoId === t.id ? (
                                                    <>
                                                        <input
                                                            type="datetime-local"
                                                            value={valorNovoPrazo}
                                                            onChange={e => setValorNovoPrazo(e.target.value)}
                                                            disabled={salvandoId === t.id}
                                                            className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => definirPrazo(t, new Date(valorNovoPrazo))}
                                                            disabled={!valorNovoPrazo || salvandoId === t.id}
                                                            title="Salvar"
                                                            className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-40"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">check</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDefinindoId(null)}
                                                            disabled={salvandoId === t.id}
                                                            title="Cancelar"
                                                            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDefinindoId(t.id);
                                                            setValorNovoPrazo(paraDatetimeLocal(prazoAtalho('amanha').toISOString()));
                                                        }}
                                                        disabled={salvandoId === t.id}
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline disabled:opacity-40"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">event</span>
                                                        Outra data
                                                    </button>
                                                )}

                                                {salvandoId === t.id && (
                                                    <span className="material-symbols-outlined text-[16px] text-slate-400 animate-spin">progress_activity</span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <CardDetalheModal
                key={cardDetalhe.cardIdAberto ?? 'fechado'}
                aberto={cardDetalhe.aberto}
                card={cardDetalhe.card}
                meuId={cardDetalhe.meuId}
                isLoading={cardDetalhe.isLoading}
                error={cardDetalhe.error}
                onFechar={cardDetalhe.fechar}
                onComentar={cardDetalhe.comentar}
                onEditarComentario={cardDetalhe.editarComentario}
                onExcluirComentario={cardDetalhe.excluirComentario}
                enviandoComentario={cardDetalhe.enviandoComentario}
                erroComentario={cardDetalhe.erroComentario}
                onEditarPrazo={handleEditarPrazoTrello}
                salvandoPrazo={cardDetalhe.salvandoPrazo}
                erroPrazo={cardDetalhe.erroPrazo}
            />
        </div>
    );
}
