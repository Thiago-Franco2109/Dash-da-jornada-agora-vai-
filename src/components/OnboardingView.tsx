import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { cityBelongsToManager, type Manager, type ProductModeKey } from '../config/managerMapping';
import type { ParceiroPendente } from '../hooks/useOnboardingPendente';
import type { EtapaTrello, CardTrelloOnboarding, ListaTrelloOnboarding } from '../hooks/useOnboardingTrello';
import { QuadroBoard, type ColunaQuadro } from './trello/TrelloCardVisual';
import { nivelDaTarefa } from '../utils/trelloNivel';

interface OnboardingViewProps {
    pendentes: ParceiroPendente[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
    /** No Cardápio Digital a cidade quase nunca diz quem gerencia — ver useAtribuicaoCs. */
    mode?: ProductModeKey;
    /** Etapa atual no board do Trello, casada por estabId — ver useOnboardingTrello. */
    etapasTrello?: Map<string, EtapaTrello>;
    /** Todos os cards + listas do board de onboarding — alimenta o modo "Quadro". */
    cardsTrello?: CardTrelloOnboarding[];
    listasTrello?: ListaTrelloOnboarding[];
}

type ModoVisualizacao = 'tabela' | 'quadro';
const STORAGE_KEY_MODO = 'onboarding_view_modo_v1';

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

/** Sem cor de alarme antes de uma semana — atraso de verdade só começa depois disso. */
function urgenciaClasse(dias: number): string {
    if (dias >= 14) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (dias >= 7) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

export default function OnboardingView({
    pendentes,
    isLoading,
    isRefreshing = false,
    error,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
    mode = 'marketplace',
    etapasTrello,
    cardsTrello = [],
    listasTrello = [],
}: OnboardingViewProps) {
    const [busca, setBusca] = useState('');
    const [modo, setModo] = useState<ModoVisualizacao>(loadModo);

    const mudarModo = (v: ModoVisualizacao) => { setModo(v); saveModo(v); };

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return pendentes.filter(p => {
            if (managerFilter && !cityBelongsToManager(p.cidade, managerFilter as Manager, mode)) return false;
            if (!termo) return true;
            return p.estabelecimento.toLowerCase().includes(termo) || p.cidade.toLowerCase().includes(termo);
        });
    }, [pendentes, busca, managerFilter, mode]);

    const atrasados7 = filtrados.filter(p => p.diasPendente >= 7).length;
    const atrasados14 = filtrados.filter(p => p.diasPendente >= 14).length;

    // Colunas do Quadro: TODAS as listas do board (mesmo vazias), na ordem
    // real das colunas — espelha o board de onboarding inteiro, não só os
    // parceiros que já viraram linha na tabela de pendentes.
    const colunasQuadro: ColunaQuadro<CardTrelloOnboarding>[] = useMemo(() => {
        const hoje = startOfDay(new Date());
        const porLista = new Map<string, { tarefa: CardTrelloOnboarding; nivel: ReturnType<typeof nivelDaTarefa>['nivel']; daysOffset: number | null }[]>();
        for (const card of cardsTrello) {
            const { nivel, data } = nivelDaTarefa(card.due);
            const item = { tarefa: card, nivel, daysOffset: data ? differenceInCalendarDays(data, hoje) : null };
            const atual = porLista.get(card.listId);
            if (atual) atual.push(item); else porLista.set(card.listId, [item]);
        }
        return listasTrello.map(l => ({
            key: l.id,
            titulo: l.nome,
            itens: porLista.get(l.id) ?? [],
        }));
    }, [cardsTrello, listasTrello]);

    return (
        <div className={`flex-1 min-h-0 flex flex-col p-4 md:p-8 mx-auto w-full ${modo === 'quadro' ? 'max-w-full' : 'max-w-6xl'}`}>
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Acompanhar Onboarding</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Parceiros que assinaram contrato mas ainda não lançaram — não aparecem na Jornada até ativar.
                    </p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1">
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
                            onClick={onRefresh}
                            disabled={isLoading || isRefreshing}
                            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                            <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
                            {isRefreshing ? 'Atualizando…' : 'Atualizar'}
                        </button>
                    </div>
                    {lastSyncTime && (
                        <span className="text-xs text-slate-400">
                            {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                    )}
                </div>
            </header>

            {error && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {modo === 'tabela' && (
                <>
                    <div className="mb-4 flex flex-wrap gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-medium">
                            Total pendente: <strong>{filtrados.length}</strong>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 font-medium">
                            7+ dias: <strong>{atrasados7}</strong>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 font-medium">
                            14+ dias: <strong>{atrasados14}</strong>
                        </span>
                    </div>

                    <div className="relative max-w-md mb-4">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar loja ou cidade..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                        />
                    </div>
                </>
            )}

            {modo === 'quadro' ? (
                <QuadroBoard colunas={colunasQuadro} itemVazioLabel="Nenhum card nessa lista" />
            ) : isLoading ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">Carregando pendentes…</div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                            <tr className="border-b border-slate-100 dark:border-slate-700">
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loja</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cidade</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assinado em</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dias pendente</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Etapa (Trello)</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">CMS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {filtrados.map(p => (
                                <tr key={p.estabId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        {p.estabelecimento}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                        {p.cidade || <span className="italic text-slate-300 dark:text-slate-600">sem cidade</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                        {p.dataAdesao ? format(new Date(`${p.dataAdesao}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${urgenciaClasse(p.diasPendente)}`}>
                                            {p.diasPendente} {p.diasPendente === 1 ? 'dia' : 'dias'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const etapa = etapasTrello?.get(p.estabId);
                                            if (!etapa) {
                                                return <span className="text-xs italic text-slate-300 dark:text-slate-600">sem card</span>;
                                            }
                                            return (
                                                <a
                                                    href={etapa.cardUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400 hover:underline"
                                                    title="Abrir card no Trello"
                                                >
                                                    {etapa.etapa}
                                                    {etapa.diasNaEtapa != null && (
                                                        <span className="opacity-70">
                                                            · {etapa.diasNaEtapa === 0 ? 'hoje' : `${etapa.diasNaEtapa}d`}
                                                        </span>
                                                    )}
                                                </a>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <a
                                            href={`https://admin.bigou.com.br/estabelecimento/cadastro/${p.estabId}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1"
                                        >
                                            Ver
                                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            {filtrados.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-sm">
                                        {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum parceiro pendente de ativação.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
