import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useAderenciaLote } from '../hooks/useAderenciaLote';
import type {
    AderenciaDia,
    AderenciaParceiro,
    AderenciaStatus,
    PadraoTom,
} from '../utils/partnerFuncionamento';
import type { EnrichedPerformanceRow } from '../utils/calculations';

const DIAS = 14;
/** Quantos parceiros a lista mostra antes do "ver todos". */
const TOPO = 12;
/** Abaixo disso de aderência o parceiro entra na conta do resumo. */
const LIMIAR_ATENCAO = 0.9;

/**
 * Altura mínima da barra: um dia sem abrir precisa ocupar espaço, senão some
 * da leitura justamente no caso que mais importa.
 */
const ALTURA_MIN_PCT = 8;

const COR_BARRA: Record<AderenciaStatus, string> = {
    cumpriu: 'bg-emerald-500',
    fechou_cedo: 'bg-amber-400',
    abriu_tarde: 'bg-amber-400',
    pausa_no_meio: 'bg-amber-500',
    fragmentado: 'bg-orange-500',
    desistiu: 'bg-red-500',
    nao_abriu: 'bg-red-500',
    recesso_programado: 'bg-slate-300 dark:bg-slate-600',
    fechado_grade: 'bg-slate-200 dark:bg-slate-700',
};

const TOM_PADRAO: Record<PadraoTom, string> = {
    ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    atencao: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    risco: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatDuracaoMin(min: number): string {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

function alturaDaBarra(dia: AderenciaDia): number {
    if (dia.status === 'fechado_grade') return 4;
    if (dia.status === 'recesso_programado') return 100;
    return Math.max(ALTURA_MIN_PCT, Math.round(dia.pct * 100));
}

function classeAderencia(pct: number): string {
    if (pct >= 0.95) return 'text-emerald-600 dark:text-emerald-400';
    if (pct >= LIMIAR_ATENCAO) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
}

/** As 14 barrinhas: altura = quanto do horário do dia a loja cumpriu. */
function BarrasAderencia({ aderencia }: { aderencia: AderenciaParceiro }) {
    return (
        <div className="flex items-end gap-[3px] h-8" role="img" aria-label={`Aderência dos últimos ${aderencia.totalDias} dias`}>
            {aderencia.dias.map(dia => {
                const dd = format(dia.date, 'dd/MM', { locale: ptBR });
                const diaSemana = format(dia.date, 'EEEEEE', { locale: ptBR });
                return (
                    <span
                        key={dia.date.toISOString()}
                        title={`${dd} (${diaSemana}) — ${dia.descricao}`}
                        className={`w-[9px] rounded-sm ${COR_BARRA[dia.status]} ${dia.emCurso ? 'opacity-70' : ''}`}
                        style={{ height: `${alturaDaBarra(dia)}%` }}
                    />
                );
            })}
        </div>
    );
}

interface AderenciaHorarioPanelProps {
    /** Parceiros já filtrados pela tela. */
    rows: EnrichedPerformanceRow[];
    onRowClick?: (row: EnrichedPerformanceRow) => void;
}

/**
 * Aderência ao horário da lista: quanto do horário prometido cada parceiro
 * cumpriu nas duas últimas semanas, do pior para o melhor.
 *
 * É a leitura comprimida da aba Funcionamento — serve para achar quem está
 * sumindo do app antes de o pedido cair, já que uma loja que fecha cedo todo
 * dia continua "ativa" em qualquer métrica de pedido.
 */
export default function AderenciaHorarioPanel({ rows, onRowClick }: AderenciaHorarioPanelProps) {
    const [expandido, setExpandido] = useState(false);

    const estabIds = useMemo(
        () => rows.map(r => String(r.estab_id ?? '').trim()).filter(Boolean),
        [rows],
    );

    const { porEstab, isLoading, error, carregados, total, refresh } = useAderenciaLote({
        estabIds,
        dias: DIAS,
    });

    const linhas = useMemo(() => {
        const out: { row: EnrichedPerformanceRow; aderencia: AderenciaParceiro }[] = [];
        for (const row of rows) {
            const id = String(row.estab_id ?? '').trim();
            const aderencia = id ? porEstab.get(id) : undefined;
            if (aderencia) out.push({ row, aderencia });
        }
        return out.sort((a, b) => {
            if (a.aderencia.pct !== b.aderencia.pct) return a.aderencia.pct - b.aderencia.pct;
            return b.aderencia.perdidoMin - a.aderencia.perdidoMin;
        });
    }, [rows, porEstab]);

    const abaixoDoLimiar = linhas.filter(l => l.aderencia.pct < LIMIAR_ATENCAO).length;
    const visiveis = expandido ? linhas : linhas.slice(0, TOPO);
    const carregando = isLoading && linhas.length === 0;

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
            <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-slate-400">schedule</span>
                        Aderência ao horário
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Quanto do horário cadastrado no CMS a loja cumpriu nos últimos {DIAS} dias.
                        {abaixoDoLimiar > 0 && (
                            <>
                                {' '}
                                <strong className="text-slate-700 dark:text-slate-200">
                                    {abaixoDoLimiar} {abaixoDoLimiar === 1 ? 'parceiro abaixo' : 'parceiros abaixo'} de 90%
                                </strong>.
                            </>
                        )}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>sync</span>
                        {isLoading ? 'Carregando…' : 'Atualizar'}
                    </button>
                    <span className="text-[11px] text-slate-400">
                        {linhas.length} com grade no CMS de {rows.length} na lista
                        {isLoading && total > 0 ? ` · lendo ${carregados}/${total}` : ''}
                    </span>
                </div>
            </header>

            {error && (
                <div className="px-5 py-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/40">
                    {error}
                </div>
            )}

            {carregando ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Lendo horários e recessos no CMS…
                </div>
            ) : linhas.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhum parceiro desta lista tem grade de funcionamento cadastrada no CMS.
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left font-medium px-5 py-2.5 text-xs uppercase tracking-wider">Parceiro</th>
                                    <th className="text-left font-medium px-3 py-2.5 text-xs uppercase tracking-wider">{DIAS} dias</th>
                                    <th className="text-right font-medium px-3 py-2.5 text-xs uppercase tracking-wider">Aderência</th>
                                    <th className="text-right font-medium px-3 py-2.5 text-xs uppercase tracking-wider">Perdeu</th>
                                    <th className="text-left font-medium px-5 py-2.5 text-xs uppercase tracking-wider">Padrão</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiveis.map(({ row, aderencia }) => (
                                    <tr
                                        key={row.estab_id || `${row.estabelecimento}-${row.cidade}`}
                                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                                        className={`border-b border-slate-100 dark:border-slate-700/60 last:border-0 ${
                                            onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors' : ''
                                        }`}
                                    >
                                        <td className="px-5 py-3">
                                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]" title={row.estabelecimento}>
                                                {row.estabelecimento}
                                            </div>
                                            <div className="text-xs text-slate-400">{row.cidade}</div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <BarrasAderencia aderencia={aderencia} />
                                        </td>
                                        <td className={`px-3 py-3 text-right font-bold tabular-nums ${classeAderencia(aderencia.pct)}`}>
                                            {Math.round(aderencia.pct * 100)}%
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                            {aderencia.perdidoMin > 0 ? `−${formatDuracaoMin(aderencia.perdidoMin)}` : '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TOM_PADRAO[aderencia.padrao.tom]}`}>
                                                {aderencia.padrao.label}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <footer className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> cumpriu</span>
                            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-400" /> fechou cedo / abriu tarde</span>
                            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-orange-500" /> dia picado</span>
                            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-500" /> não abriu</span>
                            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /> pausa programada</span>
                        </div>
                        {linhas.length > TOPO && (
                            <button
                                type="button"
                                onClick={() => setExpandido(v => !v)}
                                className="text-xs font-semibold text-primary hover:underline"
                            >
                                {expandido ? 'Mostrar só os piores' : `Ver todos (${linhas.length})`}
                            </button>
                        )}
                    </footer>
                </>
            )}
        </section>
    );
}
