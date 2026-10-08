import { useMemo, useState } from 'react';
import { addDays, endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { formatarMoedaBRL } from '../config/cdContracts';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import {
    usePedidoRelatorio,
    type PedidoRelatorio,
    type PedidoRelatorioDia,
    type PedidoRelatorioItem,
    type PeriodoRelatorio,
} from '../hooks/usePedidoRelatorio';

/**
 * Aba Pedidos — o que a loja vendeu na janela, quanto vazou e o que sai mais.
 *
 * Os atalhos de período são os mesmos do CMS oficial (Últimos 12 meses … Mês atual,
 * Ontem, Hoje), mais o intervalo manual — o CS usa os dois lados no mesmo dia e tinha
 * que traduzir "mês passado" pra "últimos 30 dias" de cabeça.
 *
 * ⚠️ O banco das functions não é tempo real: fecha o dia anterior e o dia corrente vem
 * pela metade. Por isso os atalhos "Últimos N" terminam ONTEM, e quando o período
 * pedido passa do último pedido que chegou ao banco a tela avisa, em vez de deixar o
 * CS achar que a loja parou.
 *
 * Decisões de leitura dos gráficos:
 *  · uma série por gráfico, sem segundo eixo — GMV não entra junto da contagem de
 *    pedidos, vive no cartão de cima;
 *  · a curva diária mostra TODOS os dias da janela, inclusive os zerados: o buraco de
 *    três dias é justamente o que o CS procura;
 *  · dia da semana é média por dia operado, não total — uma janela de 60 dias tem 9
 *    sábados e 8 segundas, e o total faria sábado parecer melhor do que é.
 */

/** Granularidade da curva. Acima de ~60 barras o diário vira borrão. */
type Granularidade = 'dia' | 'semana' | 'mes';

const GRANULARIDADES: { id: Granularidade; label: string }[] = [
    { id: 'dia', label: 'Diário' },
    { id: 'semana', label: 'Semanal' },
    { id: 'mes', label: 'Mensal' },
];

const iso = (d: Date): string => format(d, 'yyyy-MM-dd');

/** Últimos `n` dias TERMINANDO ONTEM — o último dia fechado no banco. */
function ultimosDias(n: number): PeriodoRelatorio {
    const ontem = subDays(new Date(), 1);
    return { de: iso(subDays(ontem, n - 1)), ate: iso(ontem) };
}

/** Últimos `n` meses de calendário, também terminando ontem. */
function ultimosMeses(n: number): PeriodoRelatorio {
    const ontem = subDays(new Date(), 1);
    return { de: iso(addDays(subMonths(ontem, n), 1)), ate: iso(ontem) };
}

/** Os mesmos atalhos do CMS oficial, na mesma ordem. */
const PRESETS: { id: string; label: string; calc: () => PeriodoRelatorio }[] = [
    { id: '12m', label: 'Últimos 12 meses', calc: () => ultimosMeses(12) },
    { id: '6m', label: 'Últimos 6 meses', calc: () => ultimosMeses(6) },
    { id: '3m', label: 'Últimos 3 meses', calc: () => ultimosMeses(3) },
    { id: '91d', label: 'Últimos 91 dias', calc: () => ultimosDias(91) },
    { id: '28d', label: 'Últimos 28 dias', calc: () => ultimosDias(28) },
    { id: '14d', label: 'Últimos 14 dias', calc: () => ultimosDias(14) },
    { id: '7d', label: 'Últimos 7 dias', calc: () => ultimosDias(7) },
    { id: 'mes-anterior', label: 'Mês anterior', calc: () => {
        const m = subMonths(new Date(), 1);
        return { de: iso(startOfMonth(m)), ate: iso(endOfMonth(m)) };
    } },
    { id: 'mes-atual', label: 'Mês atual', calc: () => ({ de: iso(startOfMonth(new Date())), ate: iso(new Date()) }) },
    { id: 'ontem', label: 'Ontem', calc: () => ({ de: iso(subDays(new Date(), 1)), ate: iso(subDays(new Date(), 1)) }) },
    { id: 'hoje', label: 'Hoje', calc: () => ({ de: iso(new Date()), ate: iso(new Date()) }) },
];

const PRESET_PADRAO = '28d';
const DIA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIA_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10-07' → '07/10' sem passar por Date (que puxaria fuso). */
function diaCurto(dia: string): string {
    const [, mes, d] = dia.split('-');
    return `${d}/${mes}`;
}

/** '2026-10-07' → '07/10/26'. */
function diaLongo(dia: string): string {
    const [ano, mes, d] = dia.split('-');
    return `${d}/${mes}/${ano.slice(2)}`;
}

/** '2026-10-08 01:21' (como vem da function) → '08/10/26 01:21'. */
function dataHoraBR(valor: string | null | undefined): string {
    if (!valor) return '—';
    const [dia, hora] = valor.split(' ');
    return hora ? `${diaLongo(dia)} ${hora}` : diaLongo(dia);
}

/** Segunda-feira da semana do dia, em UTC (o fuso não entra na conta). */
function inicioDaSemana(dia: string): string {
    const t = Date.parse(`${dia}T00:00:00Z`);
    const desdeSegunda = (new Date(t).getUTCDay() + 6) % 7;
    return new Date(t - desdeSegunda * 86_400_000).toISOString().slice(0, 10);
}

interface Balde {
    chave: string;
    rotulo: string;
    periodo: string;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvLiq: number;
}

/**
 * Junta a série diária em dia, semana ou mês. A function sempre manda o dia — agrupar
 * aqui evita uma segunda chamada quando o CS troca a granularidade.
 */
function agrupaSerie(serie: PedidoRelatorioDia[], granularidade: Granularidade): Balde[] {
    if (granularidade === 'dia') {
        return serie.map(d => ({
            chave: d.dia,
            rotulo: diaCurto(d.dia),
            periodo: diaLongo(d.dia),
            aceitos: d.aceitos,
            cancelados: d.cancelados,
            expirados: d.expirados,
            gmvLiq: d.gmvLiq,
        }));
    }

    const baldes = new Map<string, Balde & { ultimoDia: string }>();
    for (const d of serie) {
        const chave = granularidade === 'mes' ? d.dia.slice(0, 7) : inicioDaSemana(d.dia);
        const atual = baldes.get(chave) ?? {
            chave,
            rotulo: granularidade === 'mes'
                ? `${MES_CURTO[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
                : diaCurto(chave),
            // O balde pode começar antes do início da janela (semana cortada no meio):
            // o período mostrado é o que realmente entrou na conta.
            periodo: diaLongo(d.dia),
            aceitos: 0, cancelados: 0, expirados: 0, gmvLiq: 0,
            ultimoDia: d.dia,
        };
        atual.aceitos += d.aceitos;
        atual.cancelados += d.cancelados;
        atual.expirados += d.expirados;
        atual.gmvLiq = Math.round((atual.gmvLiq + d.gmvLiq) * 100) / 100;
        atual.ultimoDia = d.dia;
        baldes.set(chave, atual);
    }

    return [...baldes.values()].map(b => ({
        chave: b.chave,
        rotulo: b.rotulo,
        periodo: b.periodo === diaLongo(b.ultimoDia) ? b.periodo : `${b.periodo} a ${diaLongo(b.ultimoDia)}`,
        aceitos: b.aceitos,
        cancelados: b.cancelados,
        expirados: b.expirados,
        gmvLiq: b.gmvLiq,
    }));
}

/** Granularidade que a janela pede sozinha: 365 barras diárias não se leem. */
function granularidadeSugerida(dias: number): Granularidade {
    if (dias <= 62) return 'dia';
    if (dias <= 190) return 'semana';
    return 'mes';
}

function CardBase({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm ${className}`}>
            {children}
        </div>
    );
}

function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
    return (
        <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">{titulo}</h3>
            {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );
}

/**
 * Número de destaque. `tom` só muda a cor do valor e é reservado pra estado
 * (vazamento), nunca pra diferenciar uma métrica da outra.
 */
function Kpi({ rotulo, valor, nota, tom = 'neutro' }: {
    rotulo: string;
    valor: string;
    nota?: string;
    tom?: 'neutro' | 'alerta' | 'ruim';
}) {
    const cor = tom === 'ruim'
        ? 'text-rose-600 dark:text-rose-400'
        : tom === 'alerta'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-900 dark:text-white';
    // GMV de seis dígitos ("R$ 119.231,04") estoura o cartão de 148px no grid de 6
    // colunas — medido. O corpo do número cede antes da coluna.
    const tamanho = valor.length > 12 ? 'text-lg' : valor.length > 9 ? 'text-xl' : 'text-2xl';
    return (
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400">{rotulo}</p>
            <p className={`mt-1 font-bold tabular-nums ${tamanho} ${cor}`}>{valor}</p>
            {nota && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{nota}</p>}
        </div>
    );
}

/** Barras verticais de uma série só. `rotuloBarra` vira o tooltip nativo. */
function Barras({ valores, rotuloBarra, altura = 'h-28', destaque }: {
    valores: { chave: string; valor: number; eixo?: string }[];
    rotuloBarra: (v: { chave: string; valor: number }) => string;
    altura?: string;
    /** Índice que recebe rótulo direto — o pico. Os outros ficam no tooltip. */
    destaque?: number;
}) {
    const max = Math.max(1, ...valores.map(v => v.valor));
    return (
        <div>
            <div className={`flex items-end gap-[2px] ${altura}`}>
                {valores.map((v, i) => (
                    <div key={v.chave} className="flex-1 h-full flex items-end group relative" title={rotuloBarra(v)}>
                        {i === destaque && v.valor > 0 && (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {v.valor}
                            </span>
                        )}
                        <div
                            className={`w-full rounded-t ${v.valor > 0
                                ? 'bg-emerald-500 dark:bg-emerald-400 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-700'}`}
                            style={{ height: v.valor > 0 ? `${Math.max(3, (100 * v.valor) / max)}%` : '2px' }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex gap-[2px] mt-1">
                {valores.map(v => (
                    <div key={v.chave} className="flex-1 text-center text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        {v.eixo ?? ''}
                    </div>
                ))}
            </div>
        </div>
    );
}

function BlocoCurva({ serie, granularidade, onGranularidade }: {
    serie: PedidoRelatorioDia[];
    granularidade: Granularidade;
    onGranularidade: (g: Granularidade) => void;
}) {
    const baldes = useMemo(() => agrupaSerie(serie, granularidade), [serie, granularidade]);
    // Rótulo de eixo só a cada ~8 barras: 60 datas lado a lado viram borrão.
    const passo = Math.max(1, Math.round(baldes.length / 8));
    const zerados = serie.filter(d => d.aceitos === 0).length;
    const porBalde = new Map(baldes.map(b => [b.chave, b]));

    return (
        <CardBase>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <Cabecalho
                    titulo="Pedidos aceitos"
                    sub={zerados > 0
                        ? `${zerados} dia(s) sem nenhum pedido no período`
                        : 'A loja vendeu todos os dias do período'}
                />
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                    {GRANULARIDADES.map(g => (
                        <button
                            key={g.id}
                            onClick={() => onGranularidade(g.id)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${granularidade === g.id
                                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            {g.label}
                        </button>
                    ))}
                </div>
            </div>
            <Barras
                altura="h-32"
                valores={baldes.map((b, i) => ({
                    chave: b.chave,
                    valor: b.aceitos,
                    eixo: i % passo === 0 ? b.rotulo : '',
                }))}
                rotuloBarra={v => {
                    const b = porBalde.get(v.chave)!;
                    const perdas = [
                        b.cancelados > 0 ? `${b.cancelados} cancelado(s)` : '',
                        b.expirados > 0 ? `${b.expirados} expirado(s)` : '',
                    ].filter(Boolean).join(' · ');
                    return `${b.periodo} — ${b.aceitos} pedido(s) · ${formatarMoedaBRL(b.gmvLiq)}${perdas ? ` · ${perdas}` : ''}`;
                }}
            />
        </CardBase>
    );
}

function BlocoHorarios({ dados }: { dados: PedidoRelatorio }) {
    const { porHora, porDiaSemana, pico } = dados;
    const horaPico = porHora.reduce((a, b) => (b.aceitos > a.aceitos ? b : a), porHora[0]);
    const maxSemana = Math.max(1, ...porDiaSemana.map(d => d.media));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardBase>
                <Cabecalho
                    titulo="Hora do pedido"
                    sub={horaPico && horaPico.aceitos > 0
                        ? `Mais movimento às ${String(horaPico.hora).padStart(2, '0')}h — ${horaPico.aceitos} pedidos somando o período`
                        : 'Sem pedidos no período'}
                />
                <Barras
                    valores={porHora.map(h => ({
                        chave: String(h.hora),
                        valor: h.aceitos,
                        eixo: h.hora % 6 === 0 ? `${h.hora}h` : '',
                    }))}
                    destaque={horaPico?.hora}
                    rotuloBarra={v => `${String(v.chave).padStart(2, '0')}h — ${v.valor} pedido(s)`}
                />
            </CardBase>

            <CardBase>
                <Cabecalho titulo="Dia da semana" sub="Média de pedidos por dia em que a loja operou" />
                <ul className="space-y-1.5">
                    {porDiaSemana.map(d => (
                        <li key={d.dow} className="flex items-center gap-3 text-sm">
                            <span className="w-10 shrink-0 text-xs text-slate-500 dark:text-slate-400">{DIA_SEMANA_CURTO[d.dow]}</span>
                            <div className="flex-1 h-2.5 rounded bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                                <div
                                    className="h-full rounded bg-emerald-500 dark:bg-emerald-400"
                                    style={{ width: `${(100 * d.media) / maxSemana}%` }}
                                    title={`${DIA_SEMANA[d.dow]} — ${d.media} pedido(s)/dia em ${d.dias} dia(s)`}
                                />
                            </div>
                            <span className="w-12 shrink-0 text-right tabular-nums text-xs text-slate-600 dark:text-slate-300">
                                {d.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            </span>
                        </li>
                    ))}
                </ul>
                {pico && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                        Hora mais cheia do período: {DIA_SEMANA[pico.dow].toLowerCase()} às{' '}
                        {String(pico.hora).padStart(2, '0')}h — {pico.aceitos} pedidos somando
                        todos os {DIA_SEMANA[pico.dow].toLowerCase()}s.
                    </p>
                )}
            </CardBase>
        </div>
    );
}

function BlocoItens({ itens, comVenda, aceitos }: { itens: PedidoRelatorioItem[]; comVenda: number; aceitos: number }) {
    if (itens.length === 0) {
        return (
            <CardBase>
                <Cabecalho titulo="Itens mais pedidos" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum item vendido no período.</p>
            </CardBase>
        );
    }

    const max = Math.max(...itens.map(i => i.qtd));

    return (
        <CardBase>
            <Cabecalho
                titulo="Itens mais pedidos"
                sub="Por quantidade vendida — inclui item de campanha e item que já saiu do cardápio"
            />
            <ul className="space-y-2.5">
                {itens.map((i, idx) => (
                    <li key={i.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate text-slate-700 dark:text-slate-300">
                                <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500 mr-2">{idx + 1}.</span>
                                {i.nome}
                                {i.campanha && (
                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-tight text-violet-600 dark:text-violet-400">
                                        campanha
                                    </span>
                                )}
                                {i.foraDoCardapio && (
                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500">
                                        fora do cardápio
                                    </span>
                                )}
                                {i.temFoto === false && (
                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-tight text-amber-600 dark:text-amber-400">
                                        sem foto
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                                {i.qtd} un · {formatarMoedaBRL(i.receita)}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                                <div
                                    className="h-full rounded bg-emerald-500 dark:bg-emerald-400"
                                    style={{ width: `${(100 * i.qtd) / max}%` }}
                                />
                            </div>
                            <span
                                className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500"
                                title={`Apareceu em ${i.pedidos} de ${aceitos} pedidos aceitos`}
                            >
                                em {i.pctPedidos}% dos pedidos
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
            {comVenda > itens.length && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                    Mostrando {itens.length} dos {comVenda} itens que venderam no período.
                </p>
            )}
        </CardBase>
    );
}

function BlocoVazamento({ dados }: { dados: PedidoRelatorio }) {
    const { totais, cancelamentos } = dados;
    if (totais.cancelados === 0 && totais.expirados === 0) {
        return (
            <CardBase>
                <Cabecalho titulo="Pedidos que não viraram venda" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhum pedido cancelado ou expirado no período.
                </p>
            </CardBase>
        );
    }

    const maior = Math.max(1, ...cancelamentos.map(c => c.n));

    return (
        <CardBase>
            <Cabecalho
                titulo="Pedidos que não viraram venda"
                sub={`${totais.cancelados} cancelado(s) e ${totais.expirados} expirado(s) de ${totais.recebidos} recebidos`}
            />
            {totais.expirados > 0 && (
                <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 mb-3 bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300">
                    <span className="material-symbols-outlined text-[18px]">timer_off</span>
                    <span>
                        {totais.pctExpirado}% dos pedidos expiraram sem a loja aceitar
                        {' '}({totais.expirados} de {totais.recebidos}).
                    </span>
                </div>
            )}
            {cancelamentos.length > 0 && (
                <>
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400 mb-2">
                        Motivo do cancelamento
                    </p>
                    <ul className="space-y-1.5">
                        {cancelamentos.map(c => (
                            <li key={c.codigo} className="flex items-center gap-3 text-sm">
                                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{c.motivo}</span>
                                <div className="w-24 h-1.5 rounded bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                                    <div className="h-full rounded bg-rose-500 dark:bg-rose-400" style={{ width: `${(100 * c.n) / maior}%` }} />
                                </div>
                                <span className="w-8 shrink-0 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">{c.n}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </CardBase>
    );
}

export default function PartnerPedidosSection({ partner }: { partner: EnrichedPerformanceRow }) {
    const [preset, setPreset] = useState<string>(PRESET_PADRAO);
    const [periodo, setPeriodo] = useState<PeriodoRelatorio>(() => PRESETS.find(p => p.id === PRESET_PADRAO)!.calc());
    // null = acompanha o tamanho da janela; o CS pode forçar no botão.
    const [granManual, setGranManual] = useState<Granularidade | null>(null);

    const { data, loading, error } = usePedidoRelatorio(partner.estab_id, periodo);

    const aplicarPreset = (id: string) => {
        setPreset(id);
        setPeriodo(PRESETS.find(p => p.id === id)!.calc());
        setGranManual(null);
    };

    const aplicarData = (campo: 'de' | 'ate', valor: string) => {
        if (!valor) return;
        setPreset('manual');
        setGranManual(null);
        // Data invertida é erro de digitação, não consulta: puxa a outra ponta junto em
        // vez de mandar pro banco um intervalo que ele recusa.
        setPeriodo(atual => {
            const novo = { ...atual, [campo]: valor };
            return novo.de > novo.ate ? { de: valor, ate: valor } : novo;
        });
    };

    // Tamanho pedido, não o que voltou: durante o loading ainda não existe resposta.
    const diasDoPeriodo = Math.round(
        (Date.parse(`${periodo.ate}T00:00:00Z`) - Date.parse(`${periodo.de}T00:00:00Z`)) / 86_400_000,
    ) + 1;
    const granularidade = granManual ?? granularidadeSugerida(data?.janela.dias ?? diasDoPeriodo);

    // O banco fecha o dia anterior; pedir até hoje devolve um dia pela metade.
    const ultimoFechado = data?.janela.ultimoPedidoNoBanco?.slice(0, 10) ?? null;
    const periodoPassaDoBanco = !!(ultimoFechado && data && data.janela.ate >= ultimoFechado);

    const seletor = (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                    <button
                        key={p.id}
                        onClick={() => aplicarPreset(p.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${preset === p.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    De
                    <input
                        type="date"
                        value={periodo.de}
                        max={periodo.ate}
                        onChange={e => aplicarData('de', e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                    />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    Até
                    <input
                        type="date"
                        value={periodo.ate}
                        min={periodo.de}
                        onChange={e => aplicarData('ate', e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                    />
                </label>
                {data && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {data.janela.dias} dia(s) no período
                    </span>
                )}
            </div>
        </div>
    );

    if (!partner.estab_id) {
        return (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-4xl">receipt_long</span>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300">Parceiro sem ESTAB_ID</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                    Este parceiro veio só da planilha, então não dá pra ler os pedidos dele no banco do CMS.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Relatório de pedidos</h2>
                    {data && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {diaLongo(data.janela.de)} a {diaLongo(data.janela.ate)}
                        </span>
                    )}
                </div>
                {seletor}
            </div>

            {/* O banco das functions fecha o dia anterior. Sem este aviso, pedir "hoje"
                mostra uma loja quase parada e o CS liga cobrando um problema que não existe. */}
            {periodoPassaDoBanco && (
                <div className="flex items-start gap-2 text-sm rounded-xl px-3 py-2 bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300">
                    <span className="material-symbols-outlined text-[18px]">update</span>
                    <span>
                        O banco desta tela não é tempo real: o pedido mais recente que chegou aqui é de{' '}
                        {dataHoraBR(data?.janela.ultimoPedidoNoBanco)}. O fim do período pedido ainda está incompleto.
                    </span>
                </div>
            )}

            {loading && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
                    <span className="material-symbols-outlined text-slate-400 animate-spin">progress_activity</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Lendo os pedidos no banco…</p>
                    {/* 12 meses levam ~6s: sem este aviso parece travado e o CS clica de novo. */}
                    {diasDoPeriodo > 120 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            Período longo ({diasDoPeriodo} dias) — isso leva alguns segundos.
                        </p>
                    )}
                </div>
            )}

            {!loading && error && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center">
                    <span className="material-symbols-outlined text-slate-400">error</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
                </div>
            )}

            {!loading && !error && data && data.totais.recebidos === 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
                    <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-4xl">receipt_long</span>
                    <h3 className="font-semibold text-slate-700 dark:text-slate-300">
                        Nenhum pedido de {diaLongo(data.janela.de)} a {diaLongo(data.janela.ate)}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                        A loja não recebeu nenhum pedido no período — nem aceito, nem cancelado, nem expirado.
                    </p>
                </div>
            )}

            {!loading && !error && data && data.totais.recebidos > 0 && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        <Kpi
                            rotulo="Pedidos aceitos"
                            valor={String(data.totais.aceitos)}
                            nota={`${data.totais.mediaDiaAtivo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia em ${data.totais.diasComPedido} de ${data.totais.diasNaJanela} dias`}
                        />
                        <Kpi rotulo="Ticket médio" valor={formatarMoedaBRL(data.totais.ticketMedio)} nota="GMV líquido ÷ aceitos" />
                        <Kpi rotulo="GMV líquido" valor={formatarMoedaBRL(data.totais.gmvLiq)} nota={`Comissão ${formatarMoedaBRL(data.totais.comissao)}`} />
                        <Kpi
                            rotulo="Cancelamento"
                            valor={`${data.totais.pctCancelamento}%`}
                            nota={`${data.totais.cancelados} pedido(s)`}
                            tom={data.totais.pctCancelamento >= 10 ? 'ruim' : 'neutro'}
                        />
                        <Kpi
                            rotulo="Expirados"
                            valor={`${data.totais.pctExpirado}%`}
                            nota={`${data.totais.expirados} sem a loja aceitar`}
                            tom={data.totais.pctExpirado >= 10 ? 'alerta' : 'neutro'}
                        />
                        <Kpi
                            rotulo="Clientes novos"
                            valor={`${data.totais.pctNovosNaLoja}%`}
                            nota={`${data.totais.novosNaLoja} primeira compra na loja`}
                        />
                    </div>

                    <BlocoCurva
                        serie={data.serieDiaria}
                        granularidade={granularidade}
                        onGranularidade={setGranManual}
                    />
                    <BlocoHorarios dados={data} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <BlocoItens itens={data.itens} comVenda={data.itensComVenda} aceitos={data.totais.aceitos} />
                        <div className="space-y-4">
                            <BlocoVazamento dados={data} />
                            <CardBase>
                                <Cabecalho titulo="Como pagaram e de onde veio" />
                                <ul className="space-y-1.5 text-sm">
                                    <li className="flex items-baseline justify-between gap-3">
                                        <span className="text-slate-700 dark:text-slate-300">Pagamento online</span>
                                        <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                                            {data.totais.pctOnline}% dos aceitos
                                        </span>
                                    </li>
                                    <li className="flex items-baseline justify-between gap-3">
                                        <span className="text-slate-700 dark:text-slate-300">Com cupom da Bigou</span>
                                        <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">{data.totais.cupomBigou} pedido(s)</span>
                                    </li>
                                    <li className="flex items-baseline justify-between gap-3">
                                        <span className="text-slate-700 dark:text-slate-300">Com cupom da loja</span>
                                        <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">{data.totais.cupomLoja} pedido(s)</span>
                                    </li>
                                    {/* CD e marketplace são bases disjuntas — a linha só aparece
                                        quando existe pedido de cardápio digital nesta loja. */}
                                    {data.totais.cardapioDigital > 0 && (
                                        <li className="flex items-baseline justify-between gap-3">
                                            <span className="text-slate-700 dark:text-slate-300">Pelo cardápio digital</span>
                                            <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                                                {data.totais.cardapioDigital} ({data.totais.pctCardapioDigital}%)
                                            </span>
                                        </li>
                                    )}
                                </ul>
                            </CardBase>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
