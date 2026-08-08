import { useMemo } from 'react';
import { getStarColor, type EnrichedPerformanceRow } from '../../utils/calculations';
import type { AppView } from '../../types/views';

const BALOO = "'Baloo 2', 'Manrope', sans-serif";

/** Dias em que a jornada prevê contato com o parceiro. */
const CONTACT_DAYS = [7, 14, 21, 28];

/** Últimos dias da jornada — depois disso não há mais janela de correção. */
const RETA_FINAL_FROM = 25;

type UrgencyTone = 'red' | 'amber' | 'emerald';

interface FocusItem {
    row: EnrichedPerformanceRow;
    /** Por que este parceiro está na pauta de hoje. */
    reason: string;
    detail: string;
    icon: string;
}

const TONES: Record<UrgencyTone, { border: string; bar: string; chip: string; icon: string }> = {
    red: {
        border: 'border-red-200 dark:border-red-900/50 hover:border-red-400 dark:hover:border-red-700',
        bar: 'bg-red-500',
        chip: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
        icon: 'text-red-600 dark:text-red-400',
    },
    amber: {
        border: 'border-amber-200 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-700',
        bar: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
        icon: 'text-amber-600 dark:text-amber-400',
    },
    emerald: {
        border: 'border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-700',
        bar: 'bg-emerald-500',
        chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        icon: 'text-emerald-600 dark:text-emerald-400',
    },
};

/** Índice de desempenho: 1 = no ritmo da meta 30x30. */
function performanceLabel(indice: number): { text: string; tone: UrgencyTone } {
    if (indice >= 1) return { text: 'No alvo', tone: 'emerald' };
    if (indice >= 0.7) return { text: 'Perto da meta', tone: 'amber' };
    return { text: 'Abaixo da meta', tone: 'red' };
}

function formatIndice(indice: number): string {
    return `${indice.toFixed(1).replace('.', ',')}x`;
}

/**
 * Monta a pauta do dia. A ordem das regras é a ordem de urgência: contato
 * previsto para hoje vence tudo, depois quem está acabando a jornada mal, e
 * por último a prioridade alta.
 */
function buildFocus(rows: EnrichedPerformanceRow[]): FocusItem[] {
    const items: FocusItem[] = [];
    const taken = new Set<EnrichedPerformanceRow>();

    const add = (row: EnrichedPerformanceRow, item: Omit<FocusItem, 'row'>) => {
        if (taken.has(row)) return;
        taken.add(row);
        items.push({ row, ...item });
    };

    for (const row of rows) {
        if (CONTACT_DAYS.includes(row.dias_desde_lancamento)) {
            add(row, {
                reason: `Contato do dia ${row.dias_desde_lancamento}`,
                detail: 'A jornada prevê falar com este parceiro hoje.',
                icon: 'call',
            });
        }
    }

    for (const row of rows) {
        if (row.dias_desde_lancamento >= RETA_FINAL_FROM && row.indice_desempenho < 1) {
            add(row, {
                reason: `Reta final — dia ${row.dias_desde_lancamento} de 28`,
                detail: 'Última janela para reagir antes de a jornada encerrar.',
                icon: 'timer',
            });
        }
    }

    for (const row of rows) {
        if (row.priority_stars >= 4) {
            add(row, {
                reason: row.priority_stars === 5 ? 'Prioridade máxima' : 'Prioridade alta',
                detail: `${formatIndice(row.indice_desempenho)} do esperado para o dia ${row.dias_desde_lancamento}.`,
                icon: 'priority_high',
            });
        }
    }

    return items;
}

/** Mesma escala de cor por estrela usada nas tabelas do painel. */
function Stars({ count }: { count: number }) {
    const tone = getStarColor(count);
    return (
        <span className="inline-flex" aria-label={`Prioridade ${count} de 5`}>
            {[1, 2, 3, 4, 5].map(i => (
                <span
                    key={i}
                    className={`material-symbols-outlined text-[15px] ${i <= count ? tone : 'text-slate-300 dark:text-slate-700'}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                >
                    star
                </span>
            ))}
        </span>
    );
}

interface AnalystHomeProps {
    rows: EnrichedPerformanceRow[];
    onPartnerClick: (row: EnrichedPerformanceRow) => void;
    onNavigate: (view: AppView) => void;
}

const JOURNEY_PREVIEW_SIZE = 6;

export default function AnalystHome({ rows, onPartnerClick, onNavigate }: AnalystHomeProps) {
    const focus = useMemo(() => buildFocus(rows).slice(0, 3), [rows]);

    /** A jornada é a lista de trabalho: pior desempenho primeiro. */
    const journey = useMemo(
        () => [...rows].sort((a, b) => a.indice_desempenho - b.indice_desempenho).slice(0, JOURNEY_PREVIEW_SIZE),
        [rows]
    );

    return (
        <div className="space-y-10">
            {/* ── Foco de hoje ─────────────────────────────────────── */}
            <section>
                <div className="flex items-end justify-between mb-4 gap-4">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: BALOO }}>
                        <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>
                            local_fire_department
                        </span>
                        Foco de hoje
                    </h2>
                    {focus.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onNavigate('contacts')}
                            className="flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                            Ver contatos do dia
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                    )}
                </div>

                {focus.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
                        <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">task_alt</span>
                        <p className="font-bold text-slate-700 dark:text-slate-200">Nada pendente na sua carteira hoje.</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Nenhum contato previsto, ninguém na reta final atrasado e nenhuma prioridade alta em aberto.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {focus.map(({ row, reason, detail, icon }) => {
                            // A cor do card fala da saúde do parceiro, não do motivo:
                            // um contato agendado com quem está no alvo não é alarme.
                            const perf = performanceLabel(row.indice_desempenho);
                            const t = TONES[perf.tone];
                            return (
                                <button
                                    key={`${row.estabelecimento}-${row.cidade}`}
                                    type="button"
                                    onClick={() => onPartnerClick(row)}
                                    className={`relative overflow-hidden text-left rounded-2xl border bg-white dark:bg-slate-800/60 p-5 shadow-sm transition-colors ${t.border}`}
                                >
                                    <span className={`absolute top-0 right-0 h-full w-1.5 ${t.bar}`} aria-hidden="true" />

                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div className="min-w-0">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider mb-2 ${t.chip}`}>
                                                <span className="material-symbols-outlined text-[12px]">{icon}</span>
                                                {reason}
                                            </span>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate" style={{ fontFamily: BALOO }}>
                                                {row.estabelecimento}
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.cidade}</p>
                                        </div>
                                        {row.logo_url ? (
                                            <img src={row.logo_url} alt="" className="size-10 rounded-lg object-cover shrink-0" />
                                        ) : (
                                            <span className={`material-symbols-outlined shrink-0 ${t.icon}`}>storefront</span>
                                        )}
                                    </div>

                                    <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">{detail}</p>

                                    <dl className="space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <dt className="text-slate-500 dark:text-slate-400">Prioridade</dt>
                                            <dd><Stars count={row.priority_stars} /></dd>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <dt className="text-slate-500 dark:text-slate-400">Desempenho</dt>
                                            <dd className={`rounded px-2 py-0.5 text-xs font-bold ${t.chip}`}>
                                                {formatIndice(row.indice_desempenho)} · {perf.text}
                                            </dd>
                                        </div>
                                    </dl>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── Parceiros em jornada ─────────────────────────────── */}
            <section>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: BALOO }}>
                        <span className="material-symbols-outlined text-emerald-600">route</span>
                        Parceiros em jornada
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">(primeiros 28 dias)</span>
                    </h2>
                    <button
                        type="button"
                        onClick={() => onNavigate('dashboard')}
                        className="self-start sm:self-auto flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                        Abrir o dashboard
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </div>

                {rows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
                        <p className="font-bold text-slate-700 dark:text-slate-200">Nenhum parceiro em jornada na sua carteira.</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Assim que uma loja for lançada nas suas cidades, ela aparece aqui.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        <th className="p-4 font-bold">Parceiro</th>
                                        <th className="p-4 font-bold">Dia da jornada</th>
                                        <th className="p-4 font-bold">Desempenho</th>
                                        <th className="p-4 font-bold">Prioridade</th>
                                        <th className="p-4 font-bold text-right">Pedidos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-sm">
                                    {journey.map(row => {
                                        const perf = performanceLabel(row.indice_desempenho);
                                        const pct = Math.min(100, (row.dias_desde_lancamento / 28) * 100);
                                        return (
                                            <tr
                                                key={`${row.estabelecimento}-${row.cidade}`}
                                                onClick={() => onPartnerClick(row)}
                                                className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                            >
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {row.logo_url ? (
                                                            <img src={row.logo_url} alt="" className="size-8 rounded object-cover shrink-0" />
                                                        ) : (
                                                            <span className="size-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 shrink-0">
                                                                {row.estabelecimento.charAt(0)}
                                                            </span>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                                                                {row.estabelecimento}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.cidade}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                                                            <span className={`block h-full ${TONES[perf.tone].bar}`} style={{ width: `${pct}%` }} />
                                                        </span>
                                                        <span className="text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                            {row.dias_desde_lancamento}/28
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <p className="font-bold text-slate-900 dark:text-white">{formatIndice(row.indice_desempenho)}</p>
                                                    <span className={`inline-block mt-1 rounded px-2 py-0.5 text-[10px] font-bold ${TONES[perf.tone].chip}`}>
                                                        {perf.text}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <Stars count={row.priority_stars} />
                                                </td>
                                                <td className="p-4 text-right">
                                                    <p className="font-bold text-slate-900 dark:text-white tabular-nums">{row.total_pedidos}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                                        de {Math.round(row.pedidos_esperados)} esperados
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                                {rows.length <= JOURNEY_PREVIEW_SIZE
                                    ? `${rows.length} ${rows.length === 1 ? 'parceiro' : 'parceiros'} em jornada`
                                    : `Os ${JOURNEY_PREVIEW_SIZE} mais atrasados de ${rows.length} em jornada`}
                            </span>
                            <button
                                type="button"
                                onClick={() => onNavigate('dashboard')}
                                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                                Ver todos
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
