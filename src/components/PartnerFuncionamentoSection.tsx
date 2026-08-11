import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import { usePartnerFuncionamentoData } from '../hooks/usePartnerFuncionamentoData';
import {
    buildResumoFuncionamento,
    descreverDia,
    formatTurno,
    hasActiveRecesso,
    type DiaResumo,
    type RecessoRecord,
    type RecessoStatus,
    type ResumoFuncionamento,
} from '../utils/partnerFuncionamento';

const RESUMO_DIAS = 14;

const DIA_STATUS_META: Record<DiaResumo['status'], { label: string; dot: string; cell: string }> = {
    operou: {
        label: 'Funcionou',
        dot: 'bg-emerald-500',
        cell: 'bg-emerald-500/90 text-white',
    },
    fechou_cedo: {
        label: 'Fechou cedo',
        dot: 'bg-lime-500',
        cell: 'bg-lime-500/90 text-white',
    },
    parcial: {
        label: 'Parcial',
        dot: 'bg-orange-500',
        cell: 'bg-orange-500/90 text-white',
    },
    nao_operou: {
        label: 'Não operou',
        dot: 'bg-red-500',
        cell: 'bg-red-500 text-white',
    },
    recesso: {
        label: 'Recesso',
        dot: 'bg-amber-500',
        cell: 'bg-amber-500/90 text-white',
    },
    fechado: {
        label: 'Fechado (grade)',
        dot: 'bg-slate-300 dark:bg-slate-600',
        cell: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
    },
};

function ResumoUltimosDias({ resumo }: { resumo: ResumoFuncionamento }) {
    const {
        dias,
        diasOperou,
        diasFechouCedo,
        diasParcial,
        diasNaoOperou,
        diasRecesso,
        maiorSequenciaCritica,
        temHorario,
        totalDias,
    } = resumo;

    let headline: { icon: string; title: string; sub: string; wrap: string; iconClass: string };

    if (!temHorario) {
        headline = {
            icon: 'help',
            title: 'Sem horário cadastrado',
            sub: `Não há grade de funcionamento para avaliar os últimos ${totalDias} dias.`,
            wrap: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50',
            iconClass: 'text-slate-400',
        };
    } else if (maiorSequenciaCritica >= 2) {
        headline = {
            icon: 'error',
            title: `Atenção: fechou logo após abrir / não operou em ${maiorSequenciaCritica} dias seguidos`,
            sub: `${diasNaoOperou} ${diasNaoOperou === 1 ? 'dia crítico' : 'dias críticos'} nos últimos ${totalDias} dias. Vale investigar.`,
            wrap: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
            iconClass: 'text-red-600 dark:text-red-400',
        };
    } else if (diasNaoOperou > 0) {
        headline = {
            icon: 'warning',
            title: `Não operou em ${diasNaoOperou} ${diasNaoOperou === 1 ? 'dia' : 'dias'} dos últimos ${totalDias}`,
            sub: 'Loja fechou logo após abrir ou não abriu em dia(s) previsto(s).',
            wrap: 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20',
            iconClass: 'text-red-600 dark:text-red-400',
        };
    } else if (diasParcial > 0) {
        headline = {
            icon: 'schedule',
            title: `Fechou parte do horário em ${diasParcial} ${diasParcial === 1 ? 'dia' : 'dias'}`,
            sub: `${diasOperou} ${diasOperou === 1 ? 'dia' : 'dias'} normais no período.`,
            wrap: 'border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20',
            iconClass: 'text-orange-600 dark:text-orange-400',
        };
    } else {
        const extra = diasFechouCedo > 0
            ? ` (${diasFechouCedo} com fechamento um pouco antes — normal)`
            : '';
        const recessoTxt = diasRecesso > 0 ? ` · ${diasRecesso} em recesso planejado` : '';
        headline = {
            icon: 'check_circle',
            title: `Funcionou normalmente nos últimos ${totalDias} dias`,
            sub: `${diasOperou} ${diasOperou === 1 ? 'dia de funcionamento' : 'dias de funcionamento'}${extra}${recessoTxt}.`,
            wrap: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20',
            iconClass: 'text-emerald-600 dark:text-emerald-400',
        };
    }

    const legenda: { status: DiaResumo['status']; count: number }[] = [
        { status: 'operou', count: diasOperou },
        { status: 'fechou_cedo', count: diasFechouCedo },
        { status: 'parcial', count: diasParcial },
        { status: 'nao_operou', count: diasNaoOperou },
        { status: 'recesso', count: diasRecesso },
    ];

    return (
        <div className={`p-4 rounded-xl border ${headline.wrap}`}>
            <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined ${headline.iconClass}`}>{headline.icon}</span>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{headline.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{headline.sub}</p>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {dias.map(dia => {
                            const meta = DIA_STATUS_META[dia.status];
                            const dd = format(dia.date, 'dd/MM', { locale: ptBR });
                            const diaSemana = format(dia.date, 'EEEEEE', { locale: ptBR });
                            const title = `${dd} (${diaSemana}) — ${descreverDia(dia)}`;
                            return (
                                <div
                                    key={dia.date.toISOString()}
                                    title={title}
                                    className={`flex flex-col items-center justify-center rounded-md w-10 h-11 text-[10px] font-medium ${meta.cell}`}
                                >
                                    <span className="uppercase opacity-80">{diaSemana}</span>
                                    <span className="text-[11px] font-semibold">{format(dia.date, 'dd', { locale: ptBR })}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {legenda.filter(l => l.count > 0).map(l => (
                            <span key={l.status} className="inline-flex items-center gap-1.5">
                                <span className={`size-2.5 rounded-full ${DIA_STATUS_META[l.status].dot}`} />
                                {DIA_STATUS_META[l.status].label} ({l.count})
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface PartnerFuncionamentoSectionProps {
    partner: EnrichedPerformanceRow;
}

function formatDateTime(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '—';
    const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const date = parseISO(iso);
    if (!isValid(date)) return trimmed;
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function formatDateRange(inicio: string, fim: string): string {
    const start = formatDateTime(inicio);
    const end = formatDateTime(fim);
    if (start === '—' && end === '—') return '—';
    if (start === end) return start;
    return `${start} → ${end}`;
}

const RECESSO_STATUS_META: Record<RecessoStatus, { label: string; badge: string; icon: string }> = {
    em_recesso: {
        label: 'Em recesso',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        icon: 'pause_circle',
    },
    futuro: {
        label: 'Agendado',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        icon: 'event_upcoming',
    },
    encerrado: {
        label: 'Encerrado',
        badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        icon: 'check_circle',
    },
};

function RecessoRow({ recesso }: { recesso: RecessoRecord }) {
    const meta = RECESSO_STATUS_META[recesso.statusRecesso];

    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className={`material-symbols-outlined text-[22px] mt-0.5 ${recesso.emRecessoAgora ? 'text-amber-500' : 'text-slate-400'}`}>
                    {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                            {meta.label}
                        </span>
                        {recesso.diasDuracao > 0 && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {recesso.diasDuracao} {recesso.diasDuracao === 1 ? 'dia' : 'dias'}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatDateRange(recesso.dataInicio, recesso.dataFim)}
                    </p>
                    {recesso.descricao && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{recesso.descricao}</p>
                    )}
                    {recesso.cadastradoEm && (
                        <p className="text-xs text-slate-400 mt-2">
                            Cadastrado em {formatDateTime(recesso.cadastradoEm)}
                        </p>
                    )}
                </div>
            </div>
            {recesso.urlTrello && (
                <a
                    href={recesso.urlTrello}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    Trello
                </a>
            )}
        </div>
    );
}

export default function PartnerFuncionamentoSection({ partner }: PartnerFuncionamentoSectionProps) {
    const estabId = String(partner.estab_id ?? '').trim();
    const estabelecimento = String(partner.estabelecimento ?? '').trim();

    const {
        horarios,
        recessos,
        fonte,
        sheetHorariosCount,
        sheetRecessosCount,
        hasPartnerHorarios,
        isLoading,
        isRefreshing,
        error,
        isUsingCache,
        lastSyncTime,
        hasFetchedOnce,
        refreshData,
    } = usePartnerFuncionamentoData({
        estabId,
        estabelecimento,
        enabled: !!(estabId || estabelecimento),
    });

    const recessoAtivo = hasActiveRecesso(recessos);
    const doBanco = fonte === 'banco';
    const sheetVazia = !isLoading && !doBanco && sheetHorariosCount === 0 && sheetRecessosCount === 0;
    const parceiroSemDados = !isLoading && !sheetVazia && !hasPartnerHorarios && recessos.length === 0;
    const resumo = buildResumoFuncionamento(horarios, recessos, RESUMO_DIAS);
    const mostrarResumo = hasFetchedOnce && !sheetVazia && (hasPartnerHorarios || recessos.length > 0);

    if (!estabId && !estabelecimento) {
        return (
            <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">store</span>
                    <p className="text-slate-600 dark:text-slate-300">
                        Este parceiro não possui ESTAB_ID — horários e recessos não estão disponíveis.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Horários e recessos</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Grade semanal cadastrada no CMS e pausas programadas (últimos 3 meses)
                    </p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1">
                    <button
                        type="button"
                        onClick={refreshData}
                        disabled={isLoading || isRefreshing}
                        className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
                            sync
                        </span>
                        {isRefreshing ? 'Atualizando…' : 'Atualizar'}
                    </button>
                    {lastSyncTime && (
                        <span className="text-xs text-slate-400">
                            {doBanco ? 'Direto do CMS · ' : isUsingCache ? 'Cache · ' : 'Planilha · '}
                            {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                    {error}
                    {isUsingCache && ' — exibindo dados em cache.'}
                </div>
            )}

            {sheetVazia && !error && (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-900 dark:text-amber-200">
                    As abas <strong>HORARIOS_FUNCIONAMENTO</strong> e <strong>RECESSOS_ESTABELECIMENTO</strong> ainda
                    estão vazias ou o sync do Apps Script não terminou. Rode <code className="text-xs">syncFuncAtualizarTodasAbas</code> na
                    planilha mestre e clique em Atualizar.
                </div>
            )}

            {parceiroSemDados && !error && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
                    Nenhum horário ou recesso para este parceiro
                    {estabId ? ` (ESTAB_ID ${estabId})` : ''}.
                    {doBanco
                        ? ' A loja não tem grade cadastrada no CMS (aba Horários).'
                        : ' O sync filtra parceiros com contrato nos últimos 90 dias — lojas fora desse filtro não aparecem na planilha.'}
                </div>
            )}

            {mostrarResumo && <ResumoUltimosDias resumo={resumo} />}

            {recessoAtivo && (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">pause_circle</span>
                    <div>
                        <p className="font-semibold text-amber-900 dark:text-amber-200">Parceiro em recesso agora</p>
                        <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                            {formatDateRange(recessoAtivo.dataInicio, recessoAtivo.dataFim)}
                            {recessoAtivo.descricao ? ` — ${recessoAtivo.descricao}` : ''}
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px]">schedule</span>
                    <h4 className="font-semibold text-slate-900 dark:text-white">Grade semanal</h4>
                </div>

                {isLoading && !hasFetchedOnce ? (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                        Carregando horários…
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <th className="px-5 py-3 font-medium w-32">Dia</th>
                                    <th className="px-5 py-3 font-medium">Turno 1</th>
                                    <th className="px-5 py-3 font-medium">Turno 2</th>
                                </tr>
                            </thead>
                            <tbody>
                                {horarios.map(dia => {
                                    const turno1 = formatTurno(dia.turno1Inicio, dia.turno1Fim);
                                    const turno2 = formatTurno(dia.turno2Inicio, dia.turno2Fim);
                                    const fechado = turno1 === 'Fechado' && turno2 === 'Fechado';

                                    return (
                                        <tr
                                            key={dia.diaSemana}
                                            className="border-b border-slate-100 dark:border-slate-700/80 last:border-0"
                                        >
                                            <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                                                {dia.diaLabel}
                                            </td>
                                            <td className={`px-5 py-3 ${fechado ? 'text-slate-400 italic' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {turno1}
                                            </td>
                                            <td className={`px-5 py-3 ${turno2 === 'Fechado' ? 'text-slate-400 italic' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {turno2 === 'Fechado' && turno1 !== 'Fechado' ? '—' : turno2}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div>
                <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-slate-500 text-[20px]">event_busy</span>
                    <h4 className="font-semibold text-slate-900 dark:text-white">
                        Recessos
                        {recessos.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-slate-500">({recessos.length})</span>
                        )}
                    </h4>
                </div>

                {isLoading && !hasFetchedOnce ? (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        Carregando recessos…
                    </div>
                ) : recessos.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        Nenhum recesso registrado nos últimos 3 meses.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {recessos.map(recesso => (
                            <RecessoRow key={recesso.recessoId || `${recesso.dataInicio}-${recesso.dataFim}`} recesso={recesso} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
