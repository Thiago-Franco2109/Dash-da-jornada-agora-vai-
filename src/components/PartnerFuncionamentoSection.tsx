import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import { usePartnerFuncionamentoData } from '../hooks/usePartnerFuncionamentoData';
import {
    buildAderencia,
    formatMinutoDoDia,
    formatTurno,
    hasActiveRecesso,
    type AderenciaDia,
    type AderenciaParceiro,
    type AderenciaStatus,
    type Intervalo,
    type RecessoRecord,
    type RecessoStatus,
} from '../utils/partnerFuncionamento';

const RESUMO_DIAS = 14;

/** Altura da área de desenho, em px. O eixo do relógio usa a altura toda. */
const ALTURA_PLOT = 196;
/** Faixa fina demais para ser vista vira isto (em % da altura). */
const ALTURA_MIN_FAIXA = 1.5;

const STATUS_META: Record<AderenciaStatus, { label: string; ponto: string; texto: string }> = {
    cumpriu: { label: 'Cumpriu', ponto: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400' },
    fechou_cedo: { label: 'Fechou cedo', ponto: 'bg-amber-400', texto: 'text-amber-600 dark:text-amber-400' },
    abriu_tarde: { label: 'Abriu tarde', ponto: 'bg-amber-400', texto: 'text-amber-600 dark:text-amber-400' },
    pausa_no_meio: { label: 'Pausa no meio', ponto: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400' },
    fragmentado: { label: 'Dia picado', ponto: 'bg-orange-500', texto: 'text-orange-600 dark:text-orange-400' },
    desistiu: { label: 'Abriu e desistiu', ponto: 'bg-red-500', texto: 'text-red-600 dark:text-red-400' },
    nao_abriu: { label: 'Não abriu', ponto: 'bg-red-500', texto: 'text-red-600 dark:text-red-400' },
    recesso_programado: { label: 'Pausa programada', ponto: 'bg-slate-400', texto: 'text-slate-500 dark:text-slate-400' },
    fechado_grade: { label: 'Fora da grade', ponto: 'bg-slate-200 dark:bg-slate-700', texto: 'text-slate-400' },
};

/** Hachura do tempo prometido e não cumprido. */
const HACHURA_PERDIDO = 'repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 5px)';
const HACHURA_PAUSA = 'repeating-linear-gradient(135deg, transparent 0 5px, currentColor 5px 6px)';

function formatDuracao(min: number): string {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

/** Subtrai as pausas das janelas: o que sobra é o tempo de fato aberto. */
function segmentosAbertos(dia: AderenciaDia): Intervalo[] {
    let abertos = dia.janelas.map(j => ({ ...j }));
    for (const pausa of dia.pausas) {
        const proximo: Intervalo[] = [];
        for (const seg of abertos) {
            if (pausa.fim <= seg.inicio || pausa.inicio >= seg.fim) { proximo.push(seg); continue; }
            if (pausa.inicio > seg.inicio) proximo.push({ inicio: seg.inicio, fim: pausa.inicio });
            if (pausa.fim < seg.fim) proximo.push({ inicio: pausa.fim, fim: seg.fim });
        }
        abertos = proximo;
    }
    return abertos;
}

/**
 * Uma coluna por dia, com o relógio no eixo vertical.
 *
 * O cinza é a janela da grade, o verde é o tempo em que a loja esteve aberta e
 * a hachura é o que ela prometeu e não entregou — desenhada na hora em que
 * aconteceu. É a POSIÇÃO do buraco que separa "fechou 20 min mais cedo" de
 * "abriu e desistiu": no primeiro caso a hachura mora no rodapé da coluna, no
 * segundo ela começa colada no topo e toma quase tudo.
 */
function ColunasDoDia({ aderencia }: { aderencia: AderenciaParceiro }) {
    const todas = aderencia.dias.flatMap(d => d.janelasGrade);
    if (todas.length === 0) return null;

    const eixoIni = Math.min(...todas.map(j => j.inicio));
    const eixoFim = Math.max(...todas.map(j => j.fim));
    const span = Math.max(1, eixoFim - eixoIni);
    const y = (min: number) => ((min - eixoIni) / span) * 100;

    // Uma marca por hora cheia quando a janela é curta; de 3 em 3 quando é longa.
    const passo = span > 600 ? 180 : 60;
    const marcas: number[] = [];
    for (let t = Math.ceil(eixoIni / passo) * passo; t <= eixoFim; t += passo) marcas.push(t);

    return (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
            <div className="relative shrink-0 w-10" style={{ height: ALTURA_PLOT }} aria-hidden="true">
                {marcas.map(t => {
                    const pos = y(t);
                    // Nas pontas a marca desliza pra dentro: o container corta o
                    // que vaza, e meia label cortada no topo parece bug.
                    const ancora = pos < 5 ? 'translate-y-0' : pos > 95 ? '-translate-y-full' : '-translate-y-1/2';
                    return (
                        <span
                            key={t}
                            className={`absolute right-0 ${ancora} text-[10px] tabular-nums text-slate-400 dark:text-slate-500`}
                            style={{ top: `${pos}%` }}
                        >
                            {formatMinutoDoDia(t)}
                        </span>
                    );
                })}
            </div>

            <div className="flex gap-1 flex-1 min-w-[420px]">
                {aderencia.dias.map(dia => {
                    const meta = STATUS_META[dia.status];
                    const dd = format(dia.date, 'dd', { locale: ptBR });
                    const diaSemana = format(dia.date, 'EEEEEE', { locale: ptBR });
                    const temGrade = dia.janelasGrade.length > 0;
                    const hachura = dia.status === 'recesso_programado' ? HACHURA_PAUSA : HACHURA_PERDIDO;
                    const corHachura = dia.status === 'recesso_programado'
                        ? 'text-slate-400 border-slate-400'
                        : 'text-red-500 border-red-500';

                    return (
                        <div key={dia.date.toISOString()} className="relative flex-1 flex flex-col items-center gap-1 group">
                            <div className="relative w-full" style={{ height: ALTURA_PLOT }}>
                                {!temGrade ? (
                                    <div className="absolute inset-0 rounded border border-dashed border-slate-200 dark:border-slate-700 opacity-60" />
                                ) : (
                                    <>
                                        {dia.janelasGrade.map(janela => (
                                            <div
                                                key={`g${janela.inicio}`}
                                                className="absolute inset-x-0 rounded-sm bg-slate-100 dark:bg-slate-700/60"
                                                style={{ top: `${y(janela.inicio)}%`, height: `${y(janela.fim) - y(janela.inicio)}%` }}
                                            />
                                        ))}
                                        {dia.pausas.map(pausa => (
                                            <div
                                                key={`p${pausa.inicio}`}
                                                className={`absolute inset-x-0 rounded-sm border ${corHachura}`}
                                                style={{
                                                    top: `${y(pausa.inicio)}%`,
                                                    height: `${Math.max(ALTURA_MIN_FAIXA, y(pausa.fim) - y(pausa.inicio))}%`,
                                                    backgroundImage: hachura,
                                                }}
                                            />
                                        ))}
                                        {segmentosAbertos(dia).map(seg => (
                                            <div
                                                key={`a${seg.inicio}`}
                                                className="absolute inset-x-0 rounded-sm bg-emerald-500"
                                                style={{
                                                    top: `${y(seg.inicio)}%`,
                                                    height: `${Math.max(ALTURA_MIN_FAIXA, y(seg.fim) - y(seg.inicio))}%`,
                                                }}
                                            />
                                        ))}
                                        {dia.emCurso && dia.janelas.length > 0 && (
                                            <div
                                                className="absolute inset-x-0 border-t-2 border-dotted border-primary"
                                                style={{ top: `${Math.min(100, Math.max(0, y(dia.janelas[dia.janelas.length - 1].fim)))}%` }}
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex flex-col items-center leading-tight">
                                <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{dd}</span>
                                <span className="text-[9px] uppercase tracking-wide text-slate-400">{diaSemana}</span>
                            </div>
                            <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${
                                dia.fechadoMin > 0 && dia.status !== 'recesso_programado'
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-slate-300 dark:text-slate-600'
                            }`}>
                                {dia.status === 'recesso_programado'
                                    ? 'pausa'
                                    : dia.fechadoMin > 0
                                        ? `−${formatDuracao(dia.fechadoMin)}`
                                        : temGrade ? 'ok' : '—'}
                            </span>

                            {/* Detalhe no hover: as bordas ancoram pra não sair do card. */}
                            <div className="pointer-events-none absolute z-20 top-8 w-52 rounded-lg bg-slate-900 text-white p-2.5 shadow-xl ring-1 ring-white/15 opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0 left-1/2 -translate-x-1/2 group-first:left-0 group-first:translate-x-0 group-last:left-auto group-last:right-0 group-last:translate-x-0">
                                <p className="text-[11px] font-semibold">
                                    {format(dia.date, "EEEE, dd/MM", { locale: ptBR })}
                                </p>
                                <p className={`text-xs font-bold mt-0.5 ${meta.texto}`}>{dia.descricao}</p>
                                <p className="text-[10px] text-white/75 mt-1 tabular-nums">
                                    grade {dia.janelasGrade.map(j => `${formatMinutoDoDia(j.inicio)}–${formatMinutoDoDia(j.fim)}`).join(' · ') || 'sem grade'}
                                </p>
                                {dia.pausas.length > 0 && (
                                    <p className="text-[10px] text-white/75 tabular-nums">
                                        fechada {dia.pausas.map(p => `${formatMinutoDoDia(p.inicio)}–${formatMinutoDoDia(p.fim)}`).join(', ')}
                                    </p>
                                )}
                                {dia.programadoMin > 0 && (
                                    <p className="text-[10px] text-white/75 tabular-nums">
                                        {Math.round(dia.pct * 100)}% do previsto · {formatDuracao(dia.abertoMin)} de {formatDuracao(dia.programadoMin)}
                                    </p>
                                )}
                                {dia.antecedenciaMin != null && dia.antecedenciaMin >= 60 && (
                                    <p className="text-[10px] text-white/75 mt-1">
                                        pausa agendada com {formatDuracao(dia.antecedenciaMin)} de antecedência
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ResumoUltimosDias({ aderencia }: { aderencia: AderenciaParceiro }) {
    const { contagem, pct, perdidoMin, abertoMin, programadoMin, temHorario, totalDias, padrao } = aderencia;
    const semAbrir = contagem.desistiu + contagem.nao_abriu;
    const pctTxt = Math.round(pct * 100);

    let headline: { icon: string; title: string; sub: string; wrap: string; iconClass: string };

    if (!temHorario) {
        headline = {
            icon: 'help',
            title: 'Sem horário cadastrado',
            sub: `Não há grade de funcionamento para avaliar os últimos ${totalDias} dias.`,
            wrap: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50',
            iconClass: 'text-slate-400',
        };
    } else if (semAbrir > 0) {
        headline = {
            icon: 'error',
            title: `Não operou em ${semAbrir} ${semAbrir === 1 ? 'dia' : 'dias'} dos últimos ${totalDias}`,
            sub: `Abriu e fechou em minutos ou não abriu em dia previsto. Cumpriu ${pctTxt}% do horário no período.`,
            wrap: 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20',
            iconClass: 'text-red-600 dark:text-red-400',
        };
    } else if (pct < 0.9) {
        headline = {
            icon: 'schedule',
            title: `Cumpriu ${pctTxt}% do horário previsto`,
            sub: `${formatDuracao(abertoMin)} abertas de ${formatDuracao(programadoMin)} na grade — perdeu ${formatDuracao(perdidoMin)}.`,
            wrap: 'border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20',
            iconClass: 'text-orange-600 dark:text-orange-400',
        };
    } else {
        headline = {
            icon: 'check_circle',
            title: `Cumpriu ${pctTxt}% do horário previsto`,
            sub: perdidoMin > 0
                ? `${formatDuracao(abertoMin)} abertas de ${formatDuracao(programadoMin)} na grade — perdeu ${formatDuracao(perdidoMin)}.`
                : `Abriu a grade inteira nos últimos ${totalDias} dias.`,
            wrap: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20',
            iconClass: 'text-emerald-600 dark:text-emerald-400',
        };
    }

    const legenda = (Object.keys(STATUS_META) as AderenciaStatus[])
        .filter(status => status !== 'fechado_grade' && contagem[status] > 0);

    return (
        <div className={`p-4 rounded-xl border ${headline.wrap}`}>
            <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined ${headline.iconClass}`}>{headline.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="font-semibold text-slate-900 dark:text-white">{headline.title}</p>
                        {temHorario && (
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {padrao.label}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{headline.sub}</p>

                    <div className="mt-4">
                        <ColunasDoDia aderencia={aderencia} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-emerald-500" />
                            Aberta
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span
                                className="size-2.5 rounded-sm border border-red-500 text-red-500"
                                style={{ backgroundImage: HACHURA_PERDIDO }}
                            />
                            Prevista e fechada
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-slate-100 dark:bg-slate-700/60" />
                            Janela da grade
                        </span>
                        {legenda.map(status => (
                            <span key={status} className="inline-flex items-center gap-1.5">
                                <span className={`size-2.5 rounded-full ${STATUS_META[status].ponto}`} />
                                {STATUS_META[status].label} ({contagem[status]})
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
    const aderencia = buildAderencia(horarios, recessos, RESUMO_DIAS);
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

            {mostrarResumo && <ResumoUltimosDias aderencia={aderencia} />}

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
