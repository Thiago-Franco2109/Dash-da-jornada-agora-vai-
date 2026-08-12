import { useState, useRef, useEffect, useMemo } from 'react';
import type { MesAtivacao } from '../../hooks/useAtivacoesMensal';

/**
 * Evolução mensal de ativação de promoções: volume (CS vs parceiro) e a % que
 * o parceiro ativou sozinho.
 *
 * São DOIS gráficos empilhados, não um com dois eixos: contagem e percentual
 * têm escalas diferentes e sobrepor as duas num eixo só é a forma mais comum
 * de mentir num gráfico. Eles compartilham a mesma faixa horizontal, então a
 * leitura mês a mês continua alinhada.
 *
 * Mês sem dado (aprovação sobrescrita por mudança posterior de status) vira
 * LACUNA, nunca barra zero — zero ali significaria "não houve ativação", que
 * é falso.
 */

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(mes: string): string {
    const [ano, m] = mes.split('-');
    return `${MESES_CURTOS[Number(m) - 1]}/${ano.slice(2)}`;
}

/** Largura real do container — o SVG é desenhado em pixels, sem escalar traço. */
function useLargura(ref: React.RefObject<HTMLDivElement | null>): number {
    const [largura, setLargura] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width));
        ro.observe(el);
        setLargura(el.getBoundingClientRect().width);
        return () => ro.disconnect();
    }, [ref]);
    return largura;
}

/** Retângulo com o topo arredondado (data-end) e a base reta. */
function barraPath(x: number, y: number, w: number, h: number, r: number): string {
    const raio = Math.min(r, h, w / 2);
    return `M${x},${y + h} L${x},${y + raio} Q${x},${y} ${x + raio},${y} L${x + w - raio},${y} Q${x + w},${y} ${x + w},${y + raio} L${x + w},${y + h} Z`;
}

const ALT_BARRAS = 208;
const ALT_LINHA = 116;
const M = { top: 22, right: 10, bottom: 26, left: 40 };
const GAP_PILHA = 2;      // 2px de superfície separando os segmentos
const LARGURA_MAX = 24;   // barra fina: nunca preenche a faixa
const TOOLTIP_W = 168;

export default function AtivacoesMensalChart({ series }: { series: MesAtivacao[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const largura = useLargura(ref);
    const [hover, setHover] = useState<number | null>(null);
    const [tabela, setTabela] = useState(false);

    const maxTotal = useMemo(
        () => Math.max(1, ...series.map(s => s.promo.total)),
        [series],
    );

    if (series.length === 0) return null;

    const plotW = Math.max(0, largura - M.left - M.right);
    const banda = series.length > 0 ? plotW / series.length : 0;
    const barraW = Math.min(LARGURA_MAX, Math.max(4, banda - 10));
    const cx = (i: number) => M.left + banda * i + banda / 2;

    const plotBarrasH = ALT_BARRAS - M.top - M.bottom;
    const yBarra = (v: number) => M.top + plotBarrasH * (1 - v / maxTotal);
    const baseBarras = M.top + plotBarrasH;

    const plotLinhaH = ALT_LINHA - M.top - M.bottom;
    const yPct = (p: number) => M.top + plotLinhaH * (1 - p / 100);

    // ticks do eixo de contagem: 0, meio, topo
    const ticks = [0, Math.round(maxTotal / 2), maxTotal];

    // a linha de % quebra nos meses sem dado — não se atravessa uma lacuna
    const trechos: { i: number; pct: number }[][] = [];
    let atual: { i: number; pct: number }[] = [];
    series.forEach((s, i) => {
        if (s.promo.semDado || s.promo.pctParceiro === null) {
            if (atual.length) trechos.push(atual);
            atual = [];
        } else {
            atual.push({ i, pct: s.promo.pctParceiro });
        }
    });
    if (atual.length) trechos.push(atual);

    const ultimo = series.length - 1;
    const mesHover = hover !== null ? series[hover] : null;

    // encosta o tooltip na coluna, do lado que couber — assim ele nunca tapa a
    // barra nem o rótulo direto que o leitor está olhando
    const AFAST = 18;
    const xCol = hover !== null ? cx(hover) : 0;
    const cabeDireita = xCol + AFAST + TOOLTIP_W <= largura;
    const xTooltip = Math.min(
        Math.max(cabeDireita ? xCol + AFAST : xCol - AFAST - TOOLTIP_W, 0),
        Math.max(0, largura - TOOLTIP_W),
    );

    return (
        <div className="ativ-mensal">
            <style>{`
                .ativ-mensal {
                    --serie-parceiro: #eb6834;
                    --serie-cs: #2a78d6;
                    --superficie: #ffffff;
                    --grade: #e2e8f0;
                    --ink-muted: #94a3b8;
                    --ink-secundario: #475569;
                }
                @media (prefers-color-scheme: dark) {
                    .ativ-mensal {
                        --serie-parceiro: #d95926;
                        --serie-cs: #3987e5;
                        --superficie: #1e293b;
                        --grade: #334155;
                        --ink-muted: #64748b;
                        --ink-secundario: #cbd5e1;
                    }
                }
            `}</style>

            {/* LEGENDA — identidade nunca fica só na cor */}
            <div className="flex items-center gap-5 flex-wrap mb-4">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="size-3 rounded-[3px]" style={{ background: 'var(--serie-parceiro)' }} />
                    Parceiro ativou
                </span>
                <span className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="size-3 rounded-[3px]" style={{ background: 'var(--serie-cs)' }} />
                    CS ativou
                </span>
                <button
                    onClick={() => setTabela(t => !t)}
                    className="ml-auto text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 underline underline-offset-4 transition-colors"
                >
                    {tabela ? 'Ver gráfico' : 'Ver tabela'}
                </button>
            </div>

            {tabela ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
                                <th className="text-left font-black py-2 pr-4">Mês</th>
                                <th className="text-right font-black px-3 py-2">Parceiro</th>
                                <th className="text-right font-black px-3 py-2">CS</th>
                                <th className="text-right font-black px-3 py-2">Total</th>
                                <th className="text-right font-black px-3 py-2">% Parceiro</th>
                                <th className="text-right font-black px-3 py-2">Cupons</th>
                                <th className="text-left font-black pl-3 py-2">Confiança</th>
                            </tr>
                        </thead>
                        <tbody>
                            {series.map(s => (
                                <tr key={s.mes} className="border-b border-slate-50 dark:border-slate-700/30">
                                    <td className="py-2 pr-4 font-bold text-slate-900 dark:text-white">
                                        {rotuloMes(s.mes)}{s.parcial && <span className="ml-1 text-[10px] font-bold text-slate-400">parcial</span>}
                                    </td>
                                    {s.promo.semDado ? (
                                        <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-400 italic">sem dado (sobrescrito)</td>
                                    ) : (
                                        <>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{s.promo.parceiro}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{s.promo.cs}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900 dark:text-white">{s.promo.total}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-black text-slate-900 dark:text-white">{s.promo.pctParceiro}%</td>
                                        </>
                                    )}
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{s.cupons.total}</td>
                                    <td className="pl-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                        {s.congelado
                                            ? <span className="font-bold text-emerald-600 dark:text-emerald-400">congelado</span>
                                            : <span className="capitalize">{s.confiabilidade}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div ref={ref} className="relative">
                    {/* ── GRÁFICO 1: volume, empilhado ── */}
                    <svg width={largura} height={ALT_BARRAS} role="img" aria-label="Ativações de promoção por mês, divididas entre parceiro e CS">
                        {ticks.map(t => (
                            <g key={t}>
                                <line x1={M.left} y1={yBarra(t)} x2={largura - M.right} y2={yBarra(t)} stroke="var(--grade)" strokeWidth={1} />
                                <text x={M.left - 8} y={yBarra(t) + 4} textAnchor="end" fontSize={10} fill="var(--ink-muted)" className="tabular-nums">{t}</text>
                            </g>
                        ))}

                        {series.map((s, i) => {
                            const x = cx(i) - barraW / 2;
                            if (s.promo.semDado) {
                                return (
                                    <text key={s.mes} x={cx(i)} y={baseBarras - 6} textAnchor="middle" fontSize={9} fill="var(--ink-muted)"
                                        transform={`rotate(-90 ${cx(i)} ${baseBarras - 6})`}>
                                        sem dado
                                    </text>
                                );
                            }
                            const hP = (s.promo.parceiro / maxTotal) * plotBarrasH;
                            const hCs = (s.promo.cs / maxTotal) * plotBarrasH;
                            const topoEhCs = s.promo.cs > 0;
                            // parceiro na base (é a métrica que se acompanha); CS acima,
                            // separado por 2px da própria superfície
                            const yP = baseBarras - hP;
                            const alturaCs = Math.max(0, hCs - GAP_PILHA);
                            const yCs = yP - GAP_PILHA - alturaCs;
                            return (
                                <g key={s.mes} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: 'opacity 120ms' }}>
                                    {s.promo.parceiro > 0 && (
                                        <path
                                            d={topoEhCs
                                                ? `M${x},${baseBarras} L${x},${yP} L${x + barraW},${yP} L${x + barraW},${baseBarras} Z`
                                                : barraPath(x, yP, barraW, hP, 4)}
                                            fill="var(--serie-parceiro)"
                                        />
                                    )}
                                    {s.promo.cs > 0 && (
                                        <path d={barraPath(x, yCs, barraW, alturaCs, 4)} fill="var(--serie-cs)" />
                                    )}
                                    {/* rótulo direto só no último mês — nunca em todos */}
                                    {i === ultimo && (
                                        <text x={cx(i)} y={yCs - 7} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink-secundario)" className="tabular-nums">
                                            {s.promo.total}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        <line x1={M.left} y1={baseBarras} x2={largura - M.right} y2={baseBarras} stroke="var(--grade)" strokeWidth={1} />
                    </svg>

                    {/* ── GRÁFICO 2: % do parceiro, escala própria 0–100 ── */}
                    <svg width={largura} height={ALT_LINHA} role="img" aria-label="Percentual de ativações feitas pelo parceiro, por mês" className="-mt-1">
                        {[0, 50, 100].map(p => (
                            <g key={p}>
                                <line x1={M.left} y1={yPct(p)} x2={largura - M.right} y2={yPct(p)} stroke="var(--grade)" strokeWidth={1} />
                                <text x={M.left - 8} y={yPct(p) + 4} textAnchor="end" fontSize={10} fill="var(--ink-muted)" className="tabular-nums">{p}%</text>
                            </g>
                        ))}

                        {trechos.map((trecho, k) => (
                            <polyline
                                key={k}
                                points={trecho.map(p => `${cx(p.i)},${yPct(p.pct)}`).join(' ')}
                                fill="none"
                                stroke="var(--serie-parceiro)"
                                strokeWidth={2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        ))}
                        {series.map((s, i) => s.promo.semDado || s.promo.pctParceiro === null ? null : (
                            <circle
                                key={s.mes}
                                cx={cx(i)} cy={yPct(s.promo.pctParceiro)} r={4}
                                fill="var(--serie-parceiro)"
                                stroke="var(--superficie)" strokeWidth={2}
                            />
                        ))}
                        {series[ultimo]?.promo.pctParceiro !== null && !series[ultimo]?.promo.semDado && (
                            <text x={cx(ultimo)} y={yPct(series[ultimo].promo.pctParceiro!) - 11} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink-secundario)" className="tabular-nums">
                                {series[ultimo].promo.pctParceiro}%
                            </text>
                        )}

                        {/* rótulos de mês + faixas de hover cobrindo os dois gráficos */}
                        {series.map((s, i) => (
                            <text key={s.mes} x={cx(i)} y={ALT_LINHA - 8} textAnchor="middle" fontSize={10}
                                fontWeight={s.parcial ? 800 : 500}
                                fill={hover === i ? 'var(--ink-secundario)' : 'var(--ink-muted)'}>
                                {rotuloMes(s.mes)}
                            </text>
                        ))}
                    </svg>

                    {/* camada de hover: uma faixa por mês, altura cheia dos dois gráficos */}
                    <div className="absolute inset-0 flex" style={{ paddingLeft: M.left, paddingRight: M.right }}>
                        {series.map((s, i) => (
                            <div
                                key={s.mes}
                                className="h-full"
                                style={{ width: banda }}
                                onMouseEnter={() => setHover(i)}
                                onMouseLeave={() => setHover(null)}
                            />
                        ))}
                    </div>

                    {/* tooltip — ao LADO da coluna, nunca em cima dela (inverte na borda) */}
                    {mesHover && (
                        <div
                            className="absolute z-10 pointer-events-none rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl px-3 py-2 text-xs"
                            style={{ left: xTooltip, top: 0, width: TOOLTIP_W }}
                        >
                            <p className="font-black text-slate-900 dark:text-white mb-1">
                                {rotuloMes(mesHover.mes)}
                                {mesHover.parcial && <span className="ml-1 text-[10px] font-bold text-slate-400">parcial</span>}
                            </p>
                            {mesHover.promo.semDado ? (
                                <p className="text-slate-500 dark:text-slate-400 leading-snug">Sem dado — as aprovações deste mês foram sobrescritas por mudanças posteriores.</p>
                            ) : (
                                <dl className="space-y-0.5 text-slate-600 dark:text-slate-300">
                                    <div className="flex justify-between gap-3">
                                        <dt className="flex items-center gap-1.5">
                                            <span className="size-2 rounded-[2px]" style={{ background: 'var(--serie-parceiro)' }} />Parceiro
                                        </dt>
                                        <dd className="tabular-nums font-bold">{mesHover.promo.parceiro}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="flex items-center gap-1.5">
                                            <span className="size-2 rounded-[2px]" style={{ background: 'var(--serie-cs)' }} />CS
                                        </dt>
                                        <dd className="tabular-nums font-bold">{mesHover.promo.cs}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-700">
                                        <dt>% parceiro</dt>
                                        <dd className="tabular-nums font-black text-slate-900 dark:text-white">{mesHover.promo.pctParceiro}%</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt>Cupons</dt>
                                        <dd className="tabular-nums">{mesHover.cupons.total}</dd>
                                    </div>
                                </dl>
                            )}
                            <p className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400">
                                {mesHover.congelado
                                    ? <span className="font-bold text-emerald-600 dark:text-emerald-400">congelado — valor real do mês</span>
                                    : <>confiança {mesHover.confiabilidade}</>}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
