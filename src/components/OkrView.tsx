import { useMemo, useState } from 'react';
import {
    useOkrTrimestre,
    trimestreAtual,
    trimestresRecentes,
    rotuloTrimestre,
    type OkrLojaCd,
    type OkrParametros,
    type OkrParceiroNovo,
} from '../hooks/useOkrTrimestre';
import { useExclusaoOkr, type Marcacao } from '../hooks/marcacoesOkr';
import {
    calcularFiguras,
    identificarNoRecorte,
    type FigurasKr1,
    type FigurasKr2,
    type FigurasKr3,
    type LinhaCidade,
    type LojaEngajamento,
    type TrilhaKr2,
} from '../utils/okrFiguras';
import PerformanceTable, { type SortConfig } from './PerformanceTable';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import { MOTIVOS_EXCLUSAO, motivoExclusaoDef } from '../config/exclusaoOkr';
import { rotuloOkrDaCidade } from '../config/cidadesOkr';
import { formatBRL } from '../utils/crmData';
import { useAuth } from '../context/AuthContext';

/**
 * A aba da OKR do trimestre — os três KRs de Sucesso do Cliente.
 *
 * Os dois objetivos medem bases DISJUNTAS, e a tela diz isso o tempo todo: o
 * Bigou App é marketplace nas 5 cidades da OKR, o Cardápio Digital é a base
 * inteira. Misturar os dois num "total da OKR" seria somar laranja com banana —
 * por isso não existe número agregado nesta tela.
 *
 * Cada KR é uma PORCENTAGEM contra uma meta de patamar, e abaixo do cartão vem
 * a LISTA NOMINAL de quem ainda não conta — é isso que transforma o placar em
 * trabalho. O cartão selecionado manda no painel de baixo.
 *
 * Uma marcação manual convive aqui (Supabase, ver marcacoesOkr.ts): "fora da
 * conta" tira a loja dos três KRs. Ela aparece em lista própria, com autor e
 * data: o número vai para o CEO, e mexer no denominador sem deixar rastro é
 * outra coisa.
 */

type KrId = 'kr1' | 'kr2' | 'kr3';

/** O mínimo para identificar uma loja na hora de marcá-la. */
interface ParceiroAlvo {
    id: number;
    nome: string;
    cidade: string;
}

/** '2026-10-07' → '07/10'. */
function diaMes(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Como `diaMes`, mas põe o ano quando a data é de outro ano. Loja parada há
 * 348 dias mostrando "01/11" seca o número: lê-se novembro deste ano.
 */
function dataCurta(iso: string, anoRef: string): string {
    return iso.slice(0, 4) === anoRef ? diaMes(iso) : `${diaMes(iso)}/${iso.slice(2, 4)}`;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10' → 'out'. */
function mesCurto(iso: string): string {
    return MESES_CURTOS[Number(iso.slice(5, 7)) - 1] ?? iso;
}

const num = (n: number) => n.toLocaleString('pt-BR');

/** "falta 1 pedido" / "faltam 3 pedidos" — concorda verbo e substantivo. */
function faltamTexto(n: number, singular: string, plural: string): string {
    return n === 1 ? `falta 1 ${singular}` : `faltam ${n} ${plural}`;
}

/** Vírgula decimal: "34,6%". Ponto vira leitura de milhar em português. */
function pctTexto(pct: number | null): string {
    if (pct === null) return '—';
    return `${pct.toFixed(1).replace('.0', '').replace('.', ',')}%`;
}

/** Cidade longa do cadastro → rótulo curto da OKR ("Bom Jesus"). */
function cidadeCurta(cidade: string): string {
    return rotuloOkrDaCidade(cidade) ?? cidade;
}

const TONS = {
    verde: { texto: 'text-emerald-600 dark:text-emerald-400', barra: 'bg-emerald-500', borda: 'border-emerald-300 dark:border-emerald-700' },
    ambar: { texto: 'text-amber-600 dark:text-amber-400', barra: 'bg-amber-500', borda: 'border-amber-300 dark:border-amber-700' },
    vermelho: { texto: 'text-red-600 dark:text-red-400', barra: 'bg-red-500', borda: 'border-red-300 dark:border-red-700' },
    neutro: { texto: 'text-slate-400', barra: 'bg-slate-300 dark:bg-slate-600', borda: 'border-slate-200 dark:border-slate-700' },
} as const;

type Tom = keyof typeof TONS;

function tomDoKr(pct: number | null, metaPct: number): Tom {
    if (pct === null) return 'neutro';
    if (pct >= metaPct) return 'verde';
    // 80% da meta ainda é recuperável no trimestre; abaixo disso o KR precisa
    // de uma decisão, não de mais uma semana de acompanhamento.
    return pct >= metaPct * 0.8 ? 'ambar' : 'vermelho';
}

/**
 * Barra numa escala 0–100 de porcentagem real, com a meta como tique. Para KR
 * de patamar isso lê melhor que normalizar contra a meta: vê-se onde o número
 * está E onde é a linha.
 */
function BarraKr({ pct, metaPct, potencialPct, tom }: {
    pct: number | null;
    metaPct: number;
    potencialPct?: number | null;
    tom: Tom;
}) {
    return (
        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            {/* Teto do KR 1 se todo mundo que ainda está na janela converter —
                impede o cartão de parecer desastre na primeira semana. */}
            {potencialPct != null && potencialPct > (pct ?? 0) && (
                <div className={`absolute inset-y-0 left-0 rounded-full opacity-25 ${TONS[tom].barra}`}
                     style={{ width: `${Math.min(potencialPct, 100)}%` }} />
            )}
            <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${TONS[tom].barra}`}
                 style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
            <div
                className="absolute top-0 bottom-0 w-px bg-slate-900/40 dark:bg-white/50"
                style={{ left: `${Math.min(metaPct, 100)}%` }}
                title={`Meta: ${metaPct}%`}
            />
        </div>
    );
}

function KrCard({
    id, rotulo, titulo, figuras, unidade, detalhe, foraDaConta, potencialPct, selecionado, onSelect,
}: {
    id: KrId;
    rotulo: string;
    titulo: string;
    figuras: { feito: number; base: number; pct: number | null; metaPct: number; faltam: number };
    /** Como chamar o que está sendo contado: "parceiros", "lojas". */
    unidade: string;
    detalhe: string;
    foraDaConta: number;
    potencialPct?: number | null;
    selecionado: boolean;
    onSelect: (id: KrId) => void;
}) {
    const tom = tomDoKr(figuras.pct, figuras.metaPct);
    return (
        <button
            type="button"
            onClick={() => onSelect(id)}
            aria-pressed={selecionado}
            className={`text-left rounded-xl border p-4 bg-white dark:bg-slate-800/50 transition-all ${
                selecionado
                    ? `${TONS[tom].borda} ring-2 ring-primary/30 shadow-sm`
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
        >
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{rotulo}</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5 min-h-[2.5rem]">{titulo}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-3xl font-black tabular-nums ${TONS[tom].texto}`}>{pctTexto(figuras.pct)}</span>
                <span className="text-sm font-bold text-slate-400 tabular-nums">/ {figuras.metaPct}%</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                {num(figuras.feito)} de {num(figuras.base)} {unidade}
                {figuras.faltam > 0 && <> · <strong>{figuras.faltam === 1 ? 'falta 1' : `faltam ${figuras.faltam}`}</strong></>}
            </p>
            <BarraKr pct={figuras.pct} metaPct={figuras.metaPct} potencialPct={potencialPct} tom={tom} />
            <p className="text-[11px] text-slate-400 mt-2">
                {detalhe}
                {foraDaConta > 0 && (
                    <span> · <strong className="font-semibold">{foraDaConta} fora da conta</strong></span>
                )}
            </p>
        </button>
    );
}

function Vazio({ texto }: { texto: string }) {
    return <p className="px-4 py-6 text-sm text-slate-400">{texto}</p>;
}

function Lista({ children, altura = 'max-h-[48vh]' }: { children: React.ReactNode; altura?: string }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
            <div className={`${altura} overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60`}>{children}</div>
        </div>
    );
}

function TituloLista({ children, contagem }: { children: React.ReactNode; contagem?: number }) {
    return (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            {children}
            {contagem !== undefined && <span className="tabular-nums font-black text-slate-300 dark:text-slate-600">{contagem}</span>}
        </p>
    );
}

function BotaoTirar({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title="Tirar esta loja da conta da OKR"
            className="p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
            <span className="material-symbols-outlined text-[18px]">do_not_disturb_on</span>
        </button>
    );
}

function LinhaParceiro({ parceiro, direita, onTirar }: {
    parceiro: ParceiroAlvo;
    direita: React.ReactNode;
    onTirar?: (alvo: ParceiroAlvo) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {parceiro.nome} <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">#{parceiro.id}</span>
                </p>
                <p className="text-xs text-slate-400 truncate">{cidadeCurta(parceiro.cidade)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">{direita}</div>
                {onTirar && <BotaoTirar onClick={() => onTirar(parceiro)} />}
            </div>
        </div>
    );
}

/** Aviso de quanto falta — o número mais acionável da tela. */
function Faltam({ texto }: { texto: string }) {
    return (
        <p className="mb-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 first-letter:uppercase">
            {texto}
        </p>
    );
}

// ── KR 1 — novos parceiros ───────────────────────────────────────────────

function PainelNovos({ coorte, foraPorTroca, kr1, p, anoRef, onTirar }: {
    coorte: OkrParceiroNovo[];
    foraPorTroca: OkrParceiroNovo[];
    kr1: FigurasKr1;
    p: OkrParametros;
    anoRef: string;
    onTirar: (alvo: ParceiroAlvo) => void;
}) {
    // Quem ainda está na janela vem primeiro: é a única parte da coorte onde a
    // porcentagem ainda se move. Dentro dela, quem está a menos pedidos da meta.
    const naJanela = coorte
        .filter(n => !n.concluida && !n.atingiu)
        .sort((a, b) => b.pedidos - a.pedidos);
    const bateram = coorte.filter(n => n.atingiu).sort((a, b) => b.pedidos - a.pedidos);
    const perdidos = coorte.filter(n => n.concluida && !n.atingiu);

    const linha = (n: OkrParceiroNovo, tom: string, sub: string) => (
        <LinhaParceiro
            key={n.id}
            parceiro={n}
            onTirar={onTirar}
            direita={
                <>
                    <p className={`font-bold tabular-nums ${tom}`}>{n.pedidos}/{p.pedidosNovos}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                </>
            }
        />
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista contagem={naJanela.length}>
                    Ainda na janela — dá para converter
                </TituloLista>
                {kr1.faltam > 0 && naJanela.length > 0 && (
                    <Faltam texto={`${faltamTexto(kr1.faltam, 'parceiro', 'parceiros')} para chegar a ${kr1.metaPct}%, e há ${naJanela.length} ainda dentro dos ${p.janelaNovos} dias.`} />
                )}
                <Lista>
                    {naJanela.length === 0 ? (
                        <Vazio texto="Nenhum parceiro na janela agora." />
                    ) : naJanela.map(n => linha(
                        n,
                        'text-slate-700 dark:text-slate-200',
                        `${faltamTexto(Math.max(p.pedidosNovos - n.pedidos, 0), 'pedido', 'pedidos')} · ${n.diasRestantes}d`,
                    ))}
                </Lista>
                <p className="text-[11px] text-slate-400 mt-2">
                    Conta quem chega a {p.pedidosNovos} pedidos nos primeiros {p.janelaNovos} dias — bateu é bateu, não
                    espera a janela fechar.
                </p>
            </div>

            <div className="space-y-6">
                <div>
                    <TituloLista contagem={bateram.length}>Bateram — contam no KR</TituloLista>
                    <Lista altura="max-h-[22vh]">
                        {bateram.length === 0 ? (
                            <Vazio texto="Nenhum parceiro bateu a meta ainda." />
                        ) : bateram.map(n => linha(
                            n,
                            'text-emerald-600 dark:text-emerald-400',
                            `lançou ${dataCurta(n.lancamento, anoRef)}`,
                        ))}
                    </Lista>
                </div>

                <div>
                    <TituloLista contagem={perdidos.length}>Janela fechada sem bater</TituloLista>
                    <Lista altura="max-h-[18vh]">
                        {perdidos.length === 0 ? (
                            <Vazio texto="Nenhuma janela fechou sem bater. 🎉" />
                        ) : perdidos.map(n => linha(
                            n,
                            'text-red-600 dark:text-red-400',
                            `lançou ${dataCurta(n.lancamento, anoRef)}`,
                        ))}
                    </Lista>
                </div>

                {foraPorTroca.length > 0 && (
                    <div>
                        <TituloLista contagem={foraPorTroca.length}>
                            Fora da coorte — relançou com troca de dono
                        </TituloLista>
                        <Lista altura="max-h-[18vh]">
                            {foraPorTroca.map(n => (
                                <LinhaParceiro
                                    key={n.id}
                                    parceiro={n}
                                    direita={
                                        <>
                                            <p className="font-bold tabular-nums text-slate-400">{n.pedidos}/{p.pedidosNovos}</p>
                                            <p className="text-xs text-slate-400">lançou {dataCurta(n.lancamento, anoRef)}</p>
                                        </>
                                    }
                                />
                            ))}
                        </Lista>
                        <p className="text-[11px] text-slate-400 mt-2">
                            O enunciado do KR manda tirar da conta quem relançou trocando de dono. Relançamento pelo
                            mesmo dono continua na coorte — inclusive quem só virou MEI (CPF que vira CNPJ).
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── KR 2 — lojas engajadas ───────────────────────────────────────────────

/**
 * As quatro trilhas, na ordem em que o CSM deve gastar a hora dele.
 *
 * A medição que define essa ordem: nas últimas 14 semanas, 30 das 104 lojas
 * atravessaram a régua dos 14 pedidos — ~5 travessias por semana, e na última
 * janela 5 cruzaram contra 5 que caíram. Com líquido zero, quem só persegue
 * conversão corre numa esteira. Defender é a ordem mais barata do mês.
 */
const TRILHAS: { id: TrilhaKr2; titulo: string; conversa: string }[] = [
    { id: 'defender', titulo: 'Defender', conversa: 'já contam — a ordem mais barata é a que você não perde' },
    { id: 'converter', titulo: 'Converter', conversa: 'a poucos pedidos da régua: é daqui que o KR sobe este mês' },
    { id: 'ressuscitar', titulo: 'Ressuscitar', conversa: 'já passaram de 14 antes — a pergunta é o que quebrou' },
    { id: 'fora', titulo: 'Fora do jogo', conversa: 'nunca passaram de 14: é mudança estrutural, não ligação' },
];

/**
 * A ordem inicial de cada trilha — é a fila de trabalho, não um default neutro.
 *
 * Em Defender o topo é quem tem MENOS pedidos: a loja com folga de 1 é a que
 * cai na semana que vem. Nas outras o topo é quem está mais perto de cruzar.
 */
function ordemDaTrilha(trilha: TrilhaKr2): SortConfig {
    return trilha === 'defender'
        ? { key: 'okr_pedidos28d', direction: 'asc' }
        : { key: 'okr_faltam', direction: 'asc' };
}

function PainelEngajadas({ lojas, kr2, p, carteira, onAbrirParceiro }: {
    lojas: LojaEngajamento[];
    kr2: FigurasKr2;
    p: OkrParametros;
    /** Linhas da carteira (INDICADOR), para a lista ter o mesmo contexto de
     *  "Todos os Parceiros": logo, relevância, evolução, promoções, risco. */
    carteira: EnrichedPerformanceRow[];
    onAbrirParceiro?: (loja: { id: number; nome: string; cidade: string }) => void;
}) {
    const [trilha, setTrilha] = useState<TrilhaKr2>('converter');
    const [ordem, setOrdem] = useState<SortConfig>(ordemDaTrilha('converter'));

    // Trocar de trilha troca a pergunta, e com ela a ordem útil. O CSM pode
    // reordenar por qualquer coluna depois — isto é só o ponto de partida.
    const irPara = (t: TrilhaKr2) => { setTrilha(t); setOrdem(ordemDaTrilha(t)); };

    const porId = useMemo(() => {
        const m = new Map<string, EnrichedPerformanceRow>();
        for (const r of carteira) if (r.estab_id) m.set(String(r.estab_id), r);
        return m;
    }, [carteira]);

    /**
     * A linha da carteira com os números do KR enxertados.
     *
     * Loja da OKR que não está na carteira não some: vira uma linha mínima com
     * o que a OKR sabe. Sumir seria pior que mostrar traço — o CSM contaria
     * uma fila menor do que a real e nunca saberia.
     */
    const linhas = useMemo(() => lojas
        .filter(l => l.trilha === trilha)
        .map(l => {
            const base = porId.get(String(l.id));
            const row = (base ?? {
                estab_id: String(l.id),
                estabelecimento: l.nome,
                cidade: l.cidade,
                status: 'ativo',
            }) as EnrichedPerformanceRow;
            return {
                ...row,
                okr_pedidos28d: l.pedidos28d,
                okr_delta: l.delta,
                okr_faltam: l.faltam,
            } as EnrichedPerformanceRow;
        }), [lojas, trilha, porId]);

    const ordenadas = useMemo(() => {
        if (!ordem) return linhas;
        const { key, direction } = ordem;
        const sinal = direction === 'asc' ? 1 : -1;
        return [...linhas].sort((a, b) => {
            const va = (a as unknown as Record<string, unknown>)[key];
            const vb = (b as unknown as Record<string, unknown>)[key];
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
            return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR') * sinal;
        });
    }, [linhas, ordem]);

    const pedirOrdem = (key: string) => setOrdem(atual =>
        atual && atual.key === key && atual.direction === 'asc'
            ? { key, direction: 'desc' }
            : { key, direction: 'asc' });

    const def = TRILHAS.find(t => t.id === trilha)!;
    const semCarteira = linhas.filter(l => !porId.has(String(l.estab_id))).length;

    return (
        <div>
            <div className="flex items-center gap-1 flex-wrap mb-3">
                {TRILHAS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => irPara(t.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                            trilha === t.id
                                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        {t.titulo}
                        <span className="tabular-nums opacity-60">{kr2.trilhas[t.id]}</span>
                        {t.id === 'defender' && kr2.frageis > 0 && (
                            <span className="text-[10px] px-1 rounded bg-amber-400/90 text-amber-950">{kr2.frageis} por pouco</span>
                        )}
                    </button>
                ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                <strong>{def.titulo}</strong> — {def.conversa}.
                {trilha === 'converter' && kr2.faltam > 0 && (
                    <> Para a meta fechar, <strong>{kr2.faltam === 1 ? '1 delas precisa' : `${kr2.faltam} delas precisam`}</strong> cruzar.</>
                )}
            </p>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <PerformanceTable
                    data={ordenadas}
                    sortConfig={ordem}
                    requestSort={pedirOrdem}
                    onRowClick={row => onAbrirParceiro?.({
                        id: Number(row.estab_id),
                        nome: row.estabelecimento,
                        cidade: row.cidade,
                    })}
                    variant="okr"
                    fillHeight={false}
                    pedidosMesHeader="Faturamento"
                    vazio={{ titulo: 'Nenhuma loja nesta trilha', descricao: 'Troque de trilha acima para ver as outras.' }}
                />
            </div>

            <p className="text-[11px] text-slate-400 mt-2">
                A seta compara com a janela anterior ({diaMes(p.desdeAnterior)} a {diaMes(p.ateAnterior)}).
                Clique na loja para abrir a ficha e ver por que caiu.
                {semCarteira > 0 && ` ${semCarteira} ${semCarteira === 1 ? 'loja ainda não está' : 'lojas ainda não estão'} na carteira (INDICADOR), então as colunas de contexto saem em branco.`}
            </p>
        </div>
    );
}

// ── KR 3 — faturamento no Cardápio Digital ───────────────────────────────

function PainelFaturamento({ lojas, kr3, p, trimestre, onTirar }: {
    lojas: OkrLojaCd[];
    kr3: FigurasKr3;
    p: OkrParametros;
    trimestre: { mesCorrente: string; mesAnterior: string };
    onTirar: (alvo: ParceiroAlvo) => void;
}) {
    const acima = lojas.filter(l => l.acima);
    const quaseLa = lojas
        .filter(l => !l.acima && l.faturamentoMes >= p.faturamentoMinimo / 2)
        .sort((a, b) => b.faturamentoMes - a.faturamentoMes);
    const abaixo = lojas
        .filter(l => !l.acima && l.faturamentoMes < p.faturamentoMinimo / 2)
        .sort((a, b) => b.faturamentoMes - a.faturamentoMes);

    const linha = (l: OkrLojaCd, tom: string, sub: string) => (
        <LinhaParceiro
            key={l.id}
            parceiro={l}
            onTirar={onTirar}
            direita={
                <>
                    <p className={`font-bold tabular-nums ${tom}`}>{formatBRL(l.faturamentoMes)}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                </>
            }
        />
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista contagem={quaseLa.length}>
                    Quase lá — entre {formatBRL(p.faturamentoMinimo / 2)} e {formatBRL(p.faturamentoMinimo)}
                </TituloLista>
                {kr3.faltam > 0 && (
                    <Faltam texto={`${faltamTexto(kr3.faltam, 'loja', 'lojas')} para ${kr3.metaPct}%, e há ${quaseLa.length} nesta faixa.`} />
                )}
                <Lista>
                    {quaseLa.length === 0 ? (
                        <Vazio texto="Nenhuma loja nesta faixa." />
                    ) : quaseLa.map(l => linha(
                        l,
                        'text-amber-600 dark:text-amber-400',
                        `faltam ${formatBRL(p.faturamentoMinimo - l.faturamentoMes)}${l.ligada ? '' : ' · loja desligada'}`,
                    ))}
                </Lista>
                <p className="text-[11px] text-slate-400 mt-2">
                    O KR é mensal e {mesCurto(trimestre.mesCorrente)} ainda está correndo — em{' '}
                    {mesCurto(trimestre.mesAnterior)} fecharam <strong>{kr3.acimaMesAnterior}</strong> lojas
                    ({pctTexto(kr3.pctMesAnterior)}), que é a régua de leitura até o mês virar.
                </p>
            </div>

            <div className="space-y-6">
                <div>
                    <TituloLista contagem={acima.length}>
                        Acima de {formatBRL(p.faturamentoMinimo)} em {mesCurto(trimestre.mesCorrente)}
                    </TituloLista>
                    <Lista altura="max-h-[24vh]">
                        {acima.length === 0 ? (
                            <Vazio texto="Nenhuma loja passou da régua neste mês." />
                        ) : acima.map(l => linha(l, 'text-emerald-600 dark:text-emerald-400', 'conta no KR'))}
                    </Lista>
                    <p className="text-[11px] text-slate-400 mt-2">
                        Faturamento total do mês nas {num(kr3.base)} lojas com contrato vivo: {formatBRL(kr3.faturamentoTotal)}.
                    </p>
                </div>

                <div>
                    <TituloLista contagem={abaixo.length}>
                        Longe — abaixo de {formatBRL(p.faturamentoMinimo / 2)}
                    </TituloLista>
                    <Lista altura="max-h-[20vh]">
                        {abaixo.length === 0 ? (
                            <Vazio texto="Nenhuma loja nesta faixa. 🎉" />
                        ) : abaixo.map(l => linha(
                            l,
                            'text-slate-500 dark:text-slate-400',
                            l.faturamentoMes === 0 ? 'não faturou no mês' : `${l.ligada ? '' : 'loja desligada'}`,
                        ))}
                    </Lista>
                    <p className="text-[11px] text-slate-400 mt-2">
                        {kr3.semFaturamento} com contrato vivo não faturaram nada em {mesCurto(trimestre.mesCorrente)}.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── por cidade (só o Bigou App) ──────────────────────────────────────────

function TabelaCidades({ linhas, krSelecionado }: { linhas: LinhaCidade[]; krSelecionado: KrId }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2 text-left font-semibold">Cidade</th>
                        <th className="px-3 py-2 text-right font-semibold">KR 1 Novos</th>
                        <th className="px-3 py-2 text-right font-semibold">KR 2 Engajadas</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {linhas.map(l => (
                        <tr key={l.cidade}>
                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{cidadeCurta(l.cidade)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${krSelecionado === 'kr1' ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{l.kr1.atingiram}</span>
                                <span className="text-slate-400"> de {l.kr1.coorte} lançados</span>
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${krSelecionado === 'kr2' ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{pctTexto(l.kr2.pct)}</span>
                                <span className="block text-[11px] text-slate-400">{l.kr2.engajadas}/{l.kr2.base}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── marcação "fora da conta" ─────────────────────────────────────────────

/**
 * O motivo é obrigatório de propósito: esse número vai para o CEO, e tirar uma
 * loja sem dizer por quê é a diferença entre limpar a base e maquiar o KR.
 */
function ModalTirarDaConta({ parceiro, salvando, onConfirmar, onFechar }: {
    parceiro: ParceiroAlvo;
    salvando: boolean;
    onConfirmar: (motivo: string, observacao: string) => void;
    onFechar: () => void;
}) {
    const [motivo, setMotivo] = useState('');
    const [observacao, setObservacao] = useState('');
    const def = motivo ? motivoExclusaoDef(motivo) : null;
    const faltaDetalhe = Boolean(def?.pedeDetalhe) && observacao.trim().length === 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onFechar}>
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="font-bold text-slate-900 dark:text-white">Tirar da conta da OKR</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {parceiro.nome} <span className="text-xs text-slate-400 tabular-nums">#{parceiro.id}</span>
                        {parceiro.cidade ? ` · ${cidadeCurta(parceiro.cidade)}` : ''}
                    </p>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sai dos três KRs ao mesmo tempo, para todo mundo que abrir o painel. Continua visível na lista
                        "fora da conta" e dá para devolver quando quiser.
                    </p>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Motivo</span>
                        <select
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                            className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
                        >
                            <option value="">Escolha o motivo…</option>
                            {MOTIVOS_EXCLUSAO.map(m => (
                                <option key={m.motivo} value={m.motivo}>{m.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Observação {def?.pedeDetalhe ? '(obrigatória)' : '(opcional)'}
                        </span>
                        <textarea
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            rows={2}
                            placeholder="O que você apurou sobre essa loja?"
                            className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none resize-none"
                        />
                    </label>
                </div>

                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onFechar}
                        className="text-sm px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={!motivo || faltaDetalhe || salvando}
                        onClick={() => onConfirmar(motivo, observacao)}
                        className="text-sm px-3 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {salvando ? 'Tirando…' : 'Tirar da conta'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PainelForaDaConta({ marcacoes, noRecorte, onDevolver }: {
    marcacoes: Marcacao[];
    noRecorte: (id: number) => { nome: string; cidade: string } | null;
    onDevolver: (id: string) => void;
}) {
    return (
        <div className="mt-6">
            <TituloLista contagem={marcacoes.length}>Fora da conta</TituloLista>
            <Lista altura="max-h-[30vh]">
                {marcacoes.map(m => {
                    const def = m.motivo ? motivoExclusaoDef(m.motivo) : null;
                    const vivo = noRecorte(Number(m.partnerId));
                    const nome = vivo?.nome ?? m.nome ?? `#${m.partnerId}`;
                    const cidade = vivo?.cidade ?? m.cidade ?? '';
                    return (
                        <div key={m.partnerId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium text-slate-600 dark:text-slate-300 truncate">
                                    {nome} <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">#{m.partnerId}</span>
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                    {cidade ? `${cidadeCurta(cidade)} · ` : ''}
                                    {m.quem ? `por ${m.quem}` : 'autor não registrado'} em {diaMes(m.quando.slice(0, 10))}
                                    {m.observacao ? ` · ${m.observacao}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {def && (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 inline-flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">{def.icon}</span>
                                        {def.chip}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onDevolver(m.partnerId)}
                                    title="Devolver esta loja para a conta da OKR"
                                    className="p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">undo</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">
                Estas lojas não entram em nenhum KR. Devolver recalcula os números na hora.
            </p>
        </div>
    );
}

// ── tela ─────────────────────────────────────────────────────────────────

const OBJETIVOS: { titulo: string; escopo: string; krs: KrId[] }[] = [
    {
        titulo: 'Bigou App',
        escopo: 'marketplace, só nas cidades da OKR',
        krs: ['kr1', 'kr2'],
    },
    {
        titulo: 'Cardápio Digital',
        escopo: 'base inteira do CD, sem recorte de cidade',
        krs: ['kr3'],
    },
];

export default function OkrView({ onAbrirParceiro, carteira = [] }: {
    /** Abre a ficha do parceiro a partir da lista — é lá que mora "por que caiu?". */
    onAbrirParceiro?: (loja: { id: number; nome: string; cidade: string }) => void;
    /** Linhas da carteira (INDICADOR) — dão à lista do KR 2 o mesmo contexto
     *  de "Todos os Parceiros". Sem elas a tabela ainda funciona, só sem as
     *  colunas de relevância, evolução, promoções e risco. */
    carteira?: EnrichedPerformanceRow[];
} = {}) {
    const [trimestre, setTrimestre] = useState(trimestreAtual);
    const [kr, setKr] = useState<KrId>('kr2');
    const [alvo, setAlvo] = useState<ParceiroAlvo | null>(null);
    const [salvando, setSalvando] = useState(false);
    const { dados, loading, error, refetch } = useOkrTrimestre(trimestre);
    const fora = useExclusaoOkr();
    const { user } = useAuth();

    const opcoes = useMemo(() => trimestresRecentes(4), []);
    // Vem do trimestre que o servidor realmente calculou, não do estado local:
    // os dois podem discordar, e quem manda no rótulo é o dado que está na tela.
    const ehAtual = (dados?.trimestre.id ?? trimestre) === trimestreAtual();

    const figuras = useMemo(
        () => (dados ? calcularFiguras(dados, fora.ids) : null),
        [dados, fora.ids],
    );

    const listaFora = useMemo(
        () => Object.values(fora.marcacoes).sort((a, b) => b.quando.localeCompare(a.quando)),
        [fora.marcacoes],
    );

    const diasRestantes = dados
        ? Math.max(Math.round((Date.parse(`${dados.trimestre.fim}T00:00:00Z`) - Date.parse(`${dados.trimestre.corte}T00:00:00Z`)) / 86400000), 0)
        : 0;

    const confirmarExclusao = async (motivo: string, observacao: string) => {
        if (!alvo) return;
        setSalvando(true);
        await fora.marcar(alvo.id, {
            motivo,
            observacao,
            nome: alvo.nome,
            cidade: alvo.cidade,
            quem: user?.name || user?.email || null,
        });
        setSalvando(false);
        setAlvo(null);
    };

    const cartoes: Record<KrId, Omit<React.ComponentProps<typeof KrCard>, 'selecionado' | 'onSelect'>> | null =
        dados && figuras ? {
            kr1: {
                id: 'kr1',
                rotulo: 'KR 1 · Novos parceiros',
                titulo: `${dados.parametros.pedidosNovos} pedidos nos primeiros ${dados.parametros.janelaNovos} dias`,
                figuras: figuras.kr1,
                unidade: 'lançados no trimestre',
                detalhe: `${figuras.kr1.naJanela} ainda na janela · ${figuras.kr1.perdidos} fecharam sem bater${
                    figuras.kr1.trocaDono > 0 ? ` · ${figuras.kr1.trocaDono} fora por troca de dono` : ''}`,
                foraDaConta: figuras.foraDaConta.kr1,
                potencialPct: figuras.kr1.potencialPct,
            },
            kr2: {
                id: 'kr2',
                rotulo: 'KR 2 · Lojas engajadas',
                titulo: `${dados.parametros.pedidosEngajada}+ pedidos nos últimos ${dados.parametros.janelaEngajada} dias`,
                figuras: figuras.kr2,
                unidade: 'parceiros ativos',
                detalhe: `${figuras.kr2.trilhas.converter} a converter · ${figuras.kr2.frageis} por pouco · ${figuras.kr2.cairam} caíram`,
                foraDaConta: figuras.foraDaConta.kr2,
            },
            kr3: {
                id: 'kr3',
                rotulo: 'KR 3 · Faturamento Cardápio',
                titulo: `Faturando mais de ${formatBRL(dados.parametros.faturamentoMinimo)} no mês`,
                figuras: figuras.kr3,
                unidade: 'lojas com contrato vivo',
                detalhe: `${mesCurto(dados.trimestre.mesAnterior)} fechou em ${pctTexto(figuras.kr3.pctMesAnterior)} · ${figuras.kr3.quaseLa} quase lá`,
                foraDaConta: figuras.foraDaConta.kr3,
            },
        } : null;

    return (
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-white dark:bg-slate-900">
            <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">flag_circle</span>
                            OKR do trimestre
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {dados
                                ? <>
                                    {diaMes(dados.trimestre.inicio)} a {diaMes(dados.trimestre.fim)}
                                    {ehAtual ? <> · <strong>{diasRestantes} dias</strong> até o fim</> : ' · trimestre encerrado'}
                                    {' · '}cidades da OKR: {dados.cidades.length}
                                </>
                                : 'Carregando os KRs…'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={trimestre}
                            onChange={e => setTrimestre(e.target.value)}
                            className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
                            title="Trimestre"
                        >
                            {opcoes.map(t => <option key={t} value={t}>{rotuloTrimestre(t)}</option>)}
                        </select>
                        <button
                            onClick={refetch}
                            className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[18px]">refresh</span>
                            Atualizar
                        </button>
                    </div>
                </div>
                {dados && <p className="text-xs text-slate-400 mt-2">{dados.cidades.join(' · ')}</p>}
            </div>

            <div className="p-6">
                {loading || fora.carregando ? (
                    <p className="text-sm text-slate-400">Calculando os KRs no banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar a OKR: {error}
                    </div>
                ) : !dados || !figuras || !cartoes ? (
                    <p className="text-sm text-slate-400">Sem dados para este trimestre.</p>
                ) : (
                    <>
                        {fora.erro && (
                            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-amber-700 dark:text-amber-300 text-sm">
                                As marcações não estão sendo salvas ({fora.erro}). Falta a tabela okr_excluido no
                                Supabase — ver supabase/okr_excluido.sql.
                            </div>
                        )}

                        {OBJETIVOS.map(obj => (
                            <div key={obj.titulo} className="mb-6">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{obj.titulo}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">{obj.escopo}</p>
                                <div className={`grid grid-cols-1 gap-4 ${obj.krs.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:max-w-[50%]'}`}>
                                    {obj.krs.map(id => (
                                        <KrCard key={id} {...cartoes[id]} selecionado={kr === id} onSelect={setKr} />
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="mt-6">
                            {kr === 'kr1' && (
                                <PainelNovos
                                    coorte={figuras.coorteKr1}
                                    foraPorTroca={figuras.foraPorTrocaDono}
                                    kr1={figuras.kr1}
                                    p={dados.parametros}
                                    anoRef={dados.trimestre.inicio.slice(0, 4)}
                                    onTirar={setAlvo}
                                />
                            )}
                            {kr === 'kr2' && (
                                <PainelEngajadas
                                    lojas={figuras.engajamento}
                                    kr2={figuras.kr2}
                                    p={dados.parametros}
                                    carteira={carteira}
                                    onAbrirParceiro={onAbrirParceiro}
                                />
                            )}
                            {kr === 'kr3' && (
                                <PainelFaturamento
                                    lojas={figuras.lojasCd}
                                    kr3={figuras.kr3}
                                    p={dados.parametros}
                                    trimestre={dados.trimestre}
                                    onTirar={setAlvo}
                                />
                            )}
                        </div>

                        {(kr === 'kr1' || kr === 'kr2') && (
                            <>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">
                                    Por cidade — Bigou App
                                </p>
                                <TabelaCidades linhas={figuras.porCidade} krSelecionado={kr} />
                            </>
                        )}

                        {listaFora.length > 0 && (
                            <PainelForaDaConta
                                marcacoes={listaFora}
                                noRecorte={id => identificarNoRecorte(dados, id)}
                                onDevolver={fora.desmarcar}
                            />
                        )}

                        {!ehAtual && (
                            <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-6">
                                Trimestre fechado: o KR 2 usa a lista de parceiros ativos de HOJE — suspensão de loja não
                                tem histórico no banco, então quem foi suspenso depois não aparece no denominador de lá.
                            </p>
                        )}
                        <p className="text-xs text-slate-400 mt-6">
                            Bigou App: marketplace nas cidades da OKR. Cardápio Digital: base inteira — são bases
                            disjuntas, por isso não há total somado. Banco de teste, réplica diária — pedidos até
                            {' '}{diaMes(dados.trimestre.dadosAte)}. Cálculo em {dados.elapsedMs ?? '—'}ms.
                        </p>
                    </>
                )}
            </div>

            {alvo && (
                <ModalTirarDaConta
                    parceiro={alvo}
                    salvando={salvando}
                    onConfirmar={confirmarExclusao}
                    onFechar={() => setAlvo(null)}
                />
            )}
        </div>
    );
}
