import { useState } from 'react';
import type { AtividadeTrelloHoje } from '../../hooks/useTrelloAtividadeHoje';
import { formatarHora } from '../../utils/diarioDatas';

/**
 * O que o Trello já registrou no dia — a metade automática do diário.
 *
 * Fica no topo da aba de propósito: o diário não é um bloco de notas vazio. Um
 * bloco vazio tem que ser alimentado; um dia já meio preenchido só precisa ser
 * completado. Vendo que o Trello já contou as movimentações, a pessoa escreve
 * só o que ele não sabe — a ligação que não virou card, a análise, a reunião.
 *
 * Entra RESUMIDO, não item a item: são ~190 ações por dia, e numa timeline
 * única as 4 ou 5 anotações escritas à mão sumiriam no meio delas.
 *
 * A busca mora na DiarioView, não aqui: o relatório do dia consome o mesmo
 * resumo, e duas instâncias do hook fariam duas chamadas à API do Trello pro
 * mesmo dia — além de poderem divergir entre si.
 */

interface ResumoTrelloDiaProps {
    /** Já filtrado pelo dia certo pela DiarioView; `null` enquanto carrega. */
    atividade: AtividadeTrelloHoje | null;
    carregando: boolean;
    erro: string | null;
    onAtualizar: () => void;
}

const MAX_LISTAS = 5;

export default function ResumoTrelloDia({ atividade, carregando, erro, onAtualizar }: ResumoTrelloDiaProps) {
    const [aberto, setAberto] = useState(false);

    const doDia = atividade;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4">
                <div className="p-2 bg-sky-500/10 rounded-xl">
                    <span className="material-symbols-outlined text-sky-600 dark:text-sky-400 text-[20px]">sync</span>
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">O que o Trello já registrou</h2>
                    <p className="text-[11px] font-semibold text-slate-400">
                        Automático — você não precisa anotar isso de novo
                    </p>
                </div>
                <button
                    onClick={onAtualizar}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-colors"
                    title="Atualizar"
                >
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
            </div>

            {erro ? (
                <div className="px-6 pb-5">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">
                        Não deu pra ler o Trello: {erro}. Suas anotações abaixo continuam valendo.
                    </p>
                </div>
            ) : carregando || !doDia ? (
                <div className="px-6 pb-5 flex gap-2">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-16 flex-1 bg-slate-100 dark:bg-slate-700/40 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <>
                    <div className="px-6 pb-4 grid grid-cols-3 gap-2">
                        <Numero valor={doDia.cardsMovidos} rotulo="cards movidos" icon="drag_indicator" />
                        <Numero valor={doDia.comentarios} rotulo="comentários" icon="chat" />
                        <Numero valor={doDia.anexos} rotulo="anexos" icon="attach_file" />
                    </div>

                    {doDia.porLista.length > 0 && (
                        <div className="px-6 pb-4 flex flex-wrap gap-1.5">
                            {doDia.porLista.slice(0, MAX_LISTAS).map(l => (
                                <span
                                    key={l.nome}
                                    className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900/60 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300"
                                >
                                    {l.nome} <span className="text-primary">{l.cards}</span>
                                </span>
                            ))}
                            {doDia.porLista.length > MAX_LISTAS && (
                                <span className="px-2.5 py-1 text-[11px] font-bold text-slate-400">
                                    +{doDia.porLista.length - MAX_LISTAS}
                                </span>
                            )}
                        </div>
                    )}

                    {doDia.truncado && (
                        <div className="px-6 pb-4">
                            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                O Trello cortou a resposta em 1000 ações — este resumo está incompleto.
                            </p>
                        </div>
                    )}

                    {doDia.movimentacoes.length === 0 ? (
                        <div className="px-6 pb-5">
                            <p className="text-xs font-semibold text-slate-400">Nenhuma atividade no Trello neste dia.</p>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setAberto(a => !a)}
                                className="w-full flex items-center justify-center gap-1 py-2.5 border-t border-slate-100 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                            >
                                {aberto ? 'Esconder detalhe' : `Ver as ${doDia.movimentacoes.length} ações`}
                                <span className="material-symbols-outlined text-[16px]">
                                    {aberto ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                            {aberto && (
                                <div className="max-h-80 overflow-y-auto border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {doDia.movimentacoes.map(m => (
                                        <a
                                            key={m.id}
                                            href={m.cardUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-start gap-3 px-6 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                        >
                                            <span className="text-[10px] font-black text-slate-400 tabular-nums pt-0.5 w-10 shrink-0">
                                                {formatarHora(m.quando)}
                                            </span>
                                            <span className="material-symbols-outlined text-[15px] text-slate-400 pt-0.5 shrink-0">
                                                {m.tipo === 'comentario' ? 'chat' : m.tipo === 'anexo' ? 'attach_file' : 'drag_indicator'}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                                    {m.cardNome}
                                                </span>
                                                <span className="block text-[10px] font-semibold text-slate-400 truncate">
                                                    {m.tipo === 'movido' && m.listaDepois
                                                        ? `${m.listaAntes ?? '—'} → ${m.listaDepois}`
                                                        : m.tipo === 'anexo'
                                                            ? `anexou ${m.anexoNome ?? 'arquivo'}`
                                                            : (m.texto ?? 'comentou')}
                                                </span>
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function Numero({ valor, rotulo, icon }: { valor: number; rotulo: string; icon: string }) {
    return (
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                <span className="material-symbols-outlined text-[14px]">{icon}</span>
                <span className="text-[10px] font-black uppercase tracking-wider">{rotulo}</span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{valor}</div>
        </div>
    );
}
