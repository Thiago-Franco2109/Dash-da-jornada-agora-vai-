import { useState } from 'react';
import type { TarefaUnificada } from '../hooks/useTarefasPendentes';
import type { CrmPartnerNote } from '../types/crm';
import type { MembroTrello } from '../types/trello';
import { useTrelloCardDetalhe } from '../hooks/useTrelloCardDetalhe';
import { NIVEL_META } from '../utils/trelloNivel';
import { formatCrmDateTime, paraDatetimeLocal } from './crm/crmShared';
import { FiltroMembros } from './trello/TrelloCardVisual';
import CardDetalheModal from './trello/CardDetalheModal';

interface TarefasDoDiaViewProps {
    tarefas: TarefaUnificada[];
    contagemPorNivel: { overdue: number; today: number; upcoming: number };
    ativado: boolean;
    permissao: NotificationPermission | 'unsupported';
    onAtivar: () => void;
    onDesativar: () => void;
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
    contagemPorNivel,
    ativado,
    permissao,
    onAtivar,
    onDesativar,
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
    const cardDetalhe = useTrelloCardDetalhe();

    const grupos = GRUPOS.map(nivel => ({ nivel, itens: tarefas.filter(t => t.nivel === nivel) })).filter(g => g.itens.length > 0);

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
                                {permissao === 'unsupported' ? (
                                    <p className="text-xs text-slate-400">Este navegador não suporta notificações.</p>
                                ) : permissao === 'denied' ? (
                                    <p className="text-xs text-red-600 dark:text-red-400">Notificações bloqueadas nas configurações do navegador.</p>
                                ) : ativado ? (
                                    <button type="button" onClick={onDesativar} className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:underline">
                                        <span className="material-symbols-outlined text-[16px]">notifications_off</span>
                                        Desativar alarme de atrasados
                                    </button>
                                ) : (
                                    <button type="button" onClick={onAtivar} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                                        <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                                        Ativar alarme de atrasados
                                    </button>
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
                                                        {t.nivel === 'overdue' && t.diasOffset < 0 && (
                                                            <span className="text-red-600 font-bold ml-1">({Math.abs(t.diasOffset)}d atraso)</span>
                                                        )}
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
            </div>

            <CardDetalheModal
                key={cardDetalhe.cardIdAberto ?? 'fechado'}
                aberto={cardDetalhe.aberto}
                card={cardDetalhe.card}
                isLoading={cardDetalhe.isLoading}
                error={cardDetalhe.error}
                onFechar={cardDetalhe.fechar}
                onComentar={cardDetalhe.comentar}
                enviandoComentario={cardDetalhe.enviandoComentario}
                erroComentario={cardDetalhe.erroComentario}
                onEditarPrazo={handleEditarPrazoTrello}
                salvandoPrazo={cardDetalhe.salvandoPrazo}
                erroPrazo={cardDetalhe.erroPrazo}
            />
        </div>
    );
}
