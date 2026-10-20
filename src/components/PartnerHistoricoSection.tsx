import { useMemo, useState } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import {
    useParceiroHistorico,
    type EventoHistorico,
    type QuemHistorico,
    type TipoHistorico,
} from '../hooks/useParceiroHistorico';

/**
 * Aba Histórico — a curva de pedidos com os eventos em cima dela.
 *
 * A aba Pedidos mostra a curva; a aba "Por que caiu?" dá o veredito de uma
 * janela curta. Faltava o EXTRATO: anos de operação num eixo só, com cada
 * mudança marcada no dia em que aconteceu, para o CS procurar o que quiser.
 *
 * Decisões de leitura:
 *  · a marca fica COLADA no eixo da curva, não numa lista ao lado — o que se
 *    quer ver é "mexeu aqui, caiu a partir daqui". Lista separada obriga a
 *    comparar duas imagens de cabeça, que é exatamente o que ninguém faz;
 *  · por padrão o gráfico marca só o que SAIU DO AR. Item novo e preço
 *    alterado acontecem toda semana e enterrariam o que explica queda — os
 *    dois modos estão a um clique de distância;
 *  · clicar numa marca filtra a linha do tempo por aquele período. O gráfico é
 *    o índice, a lista é o conteúdo;
 *  · os filtros são todos client-side: a consulta é cara (~3-4s em 12 meses) e
 *    trocar chip não pode pagar isso de novo.
 */

interface Props {
    partner: EnrichedPerformanceRow;
    /** Janela com que a aba abre. Só a página de preview passa isto. */
    mesesIniciais?: number;
}

const JANELAS = [
    { meses: 3, label: '3 meses' },
    { meses: 6, label: '6 meses' },
    { meses: 12, label: '12 meses' },
    { meses: 24, label: '24 meses' },
    { meses: 36, label: '36 meses' },
];

type Granularidade = 'dia' | 'semana' | 'mes';

const GRANULARIDADES: { id: Granularidade; label: string }[] = [
    { id: 'dia', label: 'Diário' },
    { id: 'semana', label: 'Semanal' },
    { id: 'mes', label: 'Mensal' },
];

/**
 * Cor e ícone por tipo. A cor é hex e não classe do Tailwind porque ela entra
 * em `fill`/`stroke` de SVG e em `style` de marcador — e porque o mesmo tom
 * precisa valer nos dois temas (todos foram escolhidos com contraste tanto
 * sobre branco quanto sobre slate-900).
 */
const META_TIPO: Record<TipoHistorico, { label: string; icone: string; cor: string }> = {
    cardapio: { label: 'Cardápio', icone: 'restaurant_menu', cor: '#f59e0b' },
    promocao: { label: 'Promoção', icone: 'local_offer', cor: '#8b5cf6' },
    cupom: { label: 'Cupom', icone: 'confirmation_number', cor: '#d946ef' },
    horario: { label: 'Horário', icone: 'schedule', cor: '#0ea5e9' },
    recesso: { label: 'Recesso', icone: 'event_busy', cor: '#64748b' },
    entrega: { label: 'Entrega', icone: 'local_shipping', cor: '#14b8a6' },
    pagamento: { label: 'Pagamento', icone: 'payments', cor: '#6366f1' },
    cancelamento: { label: 'Cancelamento', icone: 'cancel', cor: '#f43f5e' },
};

const ORDEM_TIPO = Object.keys(META_TIPO) as TipoHistorico[];

const META_QUEM: Record<QuemHistorico, { label: string; classe: string }> = {
    loja: { label: 'a loja', classe: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    admin: { label: 'nós', classe: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
    misto: { label: 'loja + nós', classe: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
    sistema: { label: 'sistema', classe: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
};

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10-07' → '07/10'. Sem passar por Date, que puxaria fuso. */
function diaCurto(dia: string): string {
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** '2026-10-07' → '07/10/26'. */
function diaLongo(dia: string): string {
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`;
}

/** Segunda-feira da semana do dia, em UTC (o fuso não entra na conta). */
function inicioDaSemana(dia: string): string {
    const t = Date.parse(`${dia}T00:00:00Z`);
    const desdeSegunda = (new Date(t).getUTCDay() + 6) % 7;
    return new Date(t - desdeSegunda * 86_400_000).toISOString().slice(0, 10);
}

/** Granularidade que a janela pede sozinha: 1.095 pontos diários não se leem. */
function granularidadeSugerida(meses: number): Granularidade {
    if (meses <= 2) return 'dia';
    if (meses <= 6) return 'semana';
    return 'mes';
}

/**
 * Teto de colunas no gráfico.
 *
 * Não é só gosto: cada coluna é um botão clicável mais a faixa de marcas, e
 * em 36 meses no diário seriam 1.095 de cada. A tela engasga e, pior, cada
 * coluna fica com 0,09% da largura — ninguém acerta o clique nem distingue
 * dois dias vizinhos. Acima disso a opção fica desligada, com o porquê no
 * title, em vez de permitir e entregar um borrão.
 */
const MAX_BALDES = 400;

function baldesEstimados(dias: number, g: Granularidade): number {
    if (g === 'dia') return dias;
    if (g === 'semana') return Math.ceil(dias / 7);
    return Math.ceil(dias / 30);
}

/** Dias entre duas datas ISO, inclusive. Aritmética em UTC: o fuso não entra. */
function diasNaJanela(de: string, ate: string): number {
    return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
}

function chaveDoBalde(dia: string, g: Granularidade): string {
    if (g === 'dia') return dia;
    if (g === 'mes') return dia.slice(0, 7);
    return inicioDaSemana(dia);
}

function rotuloDoBalde(chave: string, g: Granularidade): string {
    if (g === 'mes') return `${MES_CURTO[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
    return diaCurto(chave);
}

interface Balde {
    chave: string;
    rotulo: string;
    /** Intervalo real coberto, para filtrar a lista quando a marca é clicada. */
    de: string;
    ate: string;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvLiq: number;
    eventos: EventoHistorico[];
}

/**
 * Junta a série diária e os eventos nos MESMOS baldes.
 *
 * Os dois precisam do mesmo recorte: marca em cima de balde que não existe na
 * curva (evento num dia sem nenhum pedido, que é comum) ficaria pendurada no
 * nada. Por isso os baldes saem da união dos dois, não só da curva.
 */
function montarBaldes(
    serie: { dia: string; aceitos: number; cancelados: number; expirados: number; gmvLiq: number }[],
    eventos: EventoHistorico[],
    granularidade: Granularidade,
    janela: { de: string; ate: string },
): Balde[] {
    const baldes = new Map<string, Balde>();
    const pegar = (dia: string): Balde => {
        const chave = chaveDoBalde(dia, granularidade);
        const b = baldes.get(chave) ?? {
            chave,
            rotulo: rotuloDoBalde(chave, granularidade),
            de: dia, ate: dia,
            aceitos: 0, cancelados: 0, expirados: 0, gmvLiq: 0,
            eventos: [],
        };
        if (dia < b.de) b.de = dia;
        if (dia > b.ate) b.ate = dia;
        baldes.set(chave, b);
        return b;
    };

    // A grade vem primeiro, dia a dia: a function só devolve dias que TIVERAM
    // pedido, e sem isto o período sem venda nenhuma simplesmente não vira
    // coluna — a linha costura por cima do buraco e some justamente com o que
    // o CS está procurando. Varrer 1.095 dias para montar 36 colunas é barato.
    for (let t = Date.parse(`${janela.de}T00:00:00Z`), fim = Date.parse(`${janela.ate}T00:00:00Z`); t <= fim; t += 86_400_000) {
        pegar(new Date(t).toISOString().slice(0, 10));
    }

    for (const d of serie) {
        const b = pegar(d.dia);
        b.aceitos += d.aceitos;
        b.cancelados += d.cancelados;
        b.expirados += d.expirados;
        b.gmvLiq = Math.round((b.gmvLiq + d.gmvLiq) * 100) / 100;
    }
    for (const e of eventos) pegar(e.dia).eventos.push(e);

    return [...baldes.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Rótulo do período de um balde, para tooltip e para o aviso de filtro. */
function periodoDoBalde(b: Balde, g: Granularidade): string {
    if (g === 'dia') return diaLongo(b.de);
    if (g === 'mes') return `${MES_CURTO[Number(b.chave.slice(5, 7)) - 1]}/${b.chave.slice(0, 4)}`;
    return `${diaCurto(b.de)} a ${diaCurto(b.ate)}`;
}

/**
 * Curva de pedidos no estilo do CMS (área preenchida + linha), com os eventos
 * marcados embaixo, no mesmo x.
 *
 * O SVG usa `preserveAspectRatio="none"` e viewBox fixo porque a largura é
 * fluida: a alternativa seria medir o container com ResizeObserver. O preço do
 * atalho é a distorção horizontal, que `vector-effect="non-scaling-stroke"`
 * resolve para o traço — por isso os pontos e as marcas NÃO são SVG, e sim
 * divs posicionados em porcentagem por cima: círculo esticado denuncia na hora.
 */
function Curva({ baldes, granularidade, soNegativos, selecionado, onSelecionar }: {
    baldes: Balde[];
    granularidade: Granularidade;
    soNegativos: boolean;
    selecionado: string | null;
    onSelecionar: (chave: string | null) => void;
}) {
    const n = baldes.length;
    const teto = Math.max(1, ...baldes.map(b => b.aceitos));
    // Um ponto só não tem "entre": centraliza em vez de dividir por zero.
    const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
    const y = (v: number) => 100 - (v / teto) * 100;

    const pontos = baldes.map((b, i) => `${x(i)},${y(b.aceitos)}`).join(' ');
    const area = n > 0 ? `M ${x(0)},100 L ${pontos.split(' ').join(' L ')} L ${x(n - 1)},100 Z` : '';

    // Rótulo de eixo só a cada ~10 colunas: 36 datas lado a lado viram borrão.
    const passo = Math.max(1, Math.round(n / 10));

    return (
        <div>
            <div className="relative h-56 select-none">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                    {[0, 25, 50, 75, 100].map(g => (
                        <line
                            key={g} x1="0" x2="100" y1={g} y2={g}
                            className="stroke-slate-200 dark:stroke-slate-700"
                            strokeWidth="1" vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {n > 0 && (
                        <>
                            <path d={area} className="fill-emerald-500/15 dark:fill-emerald-400/15" />
                            <polyline
                                points={pontos} fill="none"
                                className="stroke-emerald-500 dark:stroke-emerald-400"
                                strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                            />
                        </>
                    )}
                </svg>

                {/* Escala: sem ela a altura da curva não vira número nenhum.
                    Fica DENTRO da área, com fundo, porque o card tem padding
                    curto e o rótulo pendurado para fora era cortado. */}
                <span className="absolute left-0 -top-1 px-1 text-[10px] text-slate-400 tabular-nums bg-white dark:bg-slate-800/50 rounded">{teto}</span>
                <span className="absolute left-0 -bottom-1 px-1 text-[10px] text-slate-400 tabular-nums bg-white dark:bg-slate-800/50 rounded">0</span>

                {/* Pontos + coluna clicável. A coluna inteira é o alvo do clique:
                    acertar um círculo de 6px num gráfico de 36 colunas é tarefa. */}
                <div className="absolute inset-0">
                    {baldes.map((b, i) => {
                        const ativo = selecionado === b.chave;
                        const perdidos = b.cancelados + b.expirados;
                        return (
                            <button
                                key={b.chave}
                                onClick={() => onSelecionar(ativo ? null : b.chave)}
                                className="absolute top-0 bottom-0 -translate-x-1/2 group"
                                style={{ left: `${x(i)}%`, width: `${Math.max(100 / Math.max(n, 1), 1.6)}%` }}
                                title={`${periodoDoBalde(b, granularidade)} — ${b.aceitos} pedido(s)${perdidos > 0 ? ` · ${perdidos} perdido(s)` : ''}${b.eventos.length > 0 ? ` · ${b.eventos.length} evento(s)` : ''}`}
                            >
                                <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${ativo ? 'bg-slate-400 dark:bg-slate-500' : 'bg-transparent group-hover:bg-slate-200 dark:group-hover:bg-slate-700'}`} />
                                <span
                                    className={`absolute size-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 left-1/2 transition-all ${ativo ? 'bg-slate-700 dark:bg-white scale-150' : 'bg-emerald-500 dark:bg-emerald-400 group-hover:scale-150'}`}
                                    style={{ top: `${y(b.aceitos)}%` }}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Faixa de marcas: um ponto por tipo presente no balde, no mesmo x
                da curva. É a resposta ao "o que aconteceu bem aqui?". */}
            <div className="relative h-12 mt-1 border-t border-slate-200 dark:border-slate-700">
                {baldes.map((b, i) => {
                    const tipos = ORDEM_TIPO.filter(t =>
                        b.eventos.some(e => e.tipo === t && (!soNegativos || e.impacto === 'negativo')),
                    );
                    if (tipos.length === 0) return null;
                    const ativo = selecionado === b.chave;
                    return (
                        <button
                            key={b.chave}
                            onClick={() => onSelecionar(ativo ? null : b.chave)}
                            className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-[3px] pt-1.5 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            style={{ left: `${x(i)}%` }}
                            title={`${periodoDoBalde(b, granularidade)} — ${tipos.map(t => `${META_TIPO[t].label} (${b.eventos.filter(e => e.tipo === t).reduce((s, e) => s + e.quantidade, 0)})`).join(' · ')}`}
                        >
                            {tipos.slice(0, 4).map(t => (
                                <span
                                    key={t}
                                    className={`block size-[7px] rounded-full ${ativo ? 'ring-2 ring-slate-400' : ''}`}
                                    style={{ backgroundColor: META_TIPO[t].cor }}
                                />
                            ))}
                            {tipos.length > 4 && (
                                <span className="text-[8px] leading-none font-bold text-slate-400">+{tipos.length - 4}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="relative h-4 mt-1">
                {baldes.map((b, i) => (i % passo === 0 ? (
                    <span
                        key={b.chave}
                        className="absolute -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap"
                        style={{ left: `${x(i)}%` }}
                    >
                        {b.rotulo}
                    </span>
                ) : null))}
            </div>
        </div>
    );
}

function Kpi({ rotulo, valor, nota, tom = 'neutro' }: {
    rotulo: string;
    valor: string;
    nota?: string;
    tom?: 'neutro' | 'ruim' | 'alerta';
}) {
    const cor = tom === 'ruim'
        ? 'text-rose-600 dark:text-rose-400'
        : tom === 'alerta'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-900 dark:text-white';
    return (
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400">{rotulo}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
            {nota && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{nota}</p>}
        </div>
    );
}

export default function PartnerHistoricoSection({ partner, mesesIniciais = 12 }: Props) {
    const [meses, setMeses] = useState(mesesIniciais);
    const [granularidade, setGranularidade] = useState<Granularidade>(granularidadeSugerida(mesesIniciais));
    const [soNegativos, setSoNegativos] = useState(true);
    const [tipos, setTipos] = useState<Set<TipoHistorico>>(new Set());
    const [quem, setQuem] = useState<'' | 'loja' | 'admin'>('');
    const [busca, setBusca] = useState('');
    const [selecionado, setSelecionado] = useState<string | null>(null);

    const { dados, carregando, erro, recarregar } = useParceiroHistorico(partner.estab_id, meses);

    const trocarJanela = (m: number) => {
        setMeses(m);
        setGranularidade(granularidadeSugerida(m));
        setSelecionado(null);
    };

    const baldes = useMemo(
        () => (dados ? montarBaldes(dados.serie, dados.eventos, granularidade, dados.janela) : []),
        [dados, granularidade],
    );

    const baldeSelecionado = useMemo(
        () => baldes.find(b => b.chave === selecionado) ?? null,
        [baldes, selecionado],
    );

    /**
     * A lista obedece a TODOS os filtros ao mesmo tempo, inclusive o período
     * clicado no gráfico. O chip de tipo é aditivo (nenhum marcado = todos),
     * porque a pergunta real costuma ser "cardápio OU promoção", não um só.
     *
     * `ignorarTipo` existe para a contagem do próprio chip: um chip precisa
     * mostrar quantos registros ele TRARIA, e não quantos sobram depois de ele
     * mesmo ser aplicado — senão todo chip não selecionado mostraria o total
     * cheio enquanto a lista mostra outro número.
     */
    const passaFiltros = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return (e: EventoHistorico, ignorarTipo = false) => {
            if (!ignorarTipo && tipos.size > 0 && !tipos.has(e.tipo)) return false;
            if (soNegativos && e.impacto !== 'negativo') return false;
            if (quem === 'loja' && e.quem !== 'loja' && e.quem !== 'misto') return false;
            if (quem === 'admin' && e.quem !== 'admin' && e.quem !== 'misto') return false;
            if (baldeSelecionado && (e.dia < baldeSelecionado.de || e.dia > baldeSelecionado.ate)) return false;
            if (termo && !`${e.titulo} ${e.detalhe} ${e.exemplos.join(' ')}`.toLowerCase().includes(termo)) return false;
            return true;
        };
    }, [tipos, soNegativos, quem, baldeSelecionado, busca]);

    const eventos = useMemo(
        () => (dados ? dados.eventos.filter(e => passaFiltros(e)) : []),
        [dados, passaFiltros],
    );

    /** Quantos registros cada chip traria com os outros filtros de pé. */
    const contagemPorTipo = useMemo(() => {
        const conta = {} as Record<TipoHistorico, number>;
        for (const t of ORDEM_TIPO) conta[t] = 0;
        for (const e of dados?.eventos ?? []) {
            if (passaFiltros(e, true)) conta[e.tipo] += 1;
        }
        return conta;
    }, [dados, passaFiltros]);

    const alternarTipo = (t: TipoHistorico) => {
        setTipos(atual => {
            const novo = new Set(atual);
            if (novo.has(t)) novo.delete(t); else novo.add(t);
            return novo;
        });
    };

    if (!partner.estab_id) {
        return (
            <div className="max-w-3xl mx-auto p-12 text-center text-slate-400 text-sm">
                Este parceiro não tem ID de estabelecimento, então não dá para montar o histórico.
            </div>
        );
    }

    const perdidos = dados ? dados.serie.reduce((s, d) => s + d.cancelados + d.expirados, 0) : 0;
    const totalPedidos = dados ? dados.serie.reduce((s, d) => s + d.aceitos, 0) : 0;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Histórico da loja</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        A curva de pedidos com tudo que mudou na operação marcado no dia em que aconteceu.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {JANELAS.map(j => (
                            <button
                                key={j.meses}
                                onClick={() => trocarJanela(j.meses)}
                                className={`text-xs px-2.5 py-1.5 font-semibold transition-colors ${
                                    meses === j.meses
                                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                {j.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={recarregar}
                        title="Recarregar"
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center"
                    >
                        <span className="material-symbols-outlined text-[16px]">refresh</span>
                    </button>
                </div>
            </div>

            {carregando && !dados ? (
                <p className="text-sm text-slate-400 py-16 text-center">
                    Montando a linha do tempo da loja — o log de auditoria não tem índice por parceiro,
                    então {meses >= 24 ? 'uma janela deste tamanho leva alguns segundos' : 'isto leva uns segundos'}…
                </p>
            ) : erro ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                    Não foi possível montar o histórico: {erro}
                </div>
            ) : !dados ? null : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi rotulo="Pedidos aceitos" valor={totalPedidos.toLocaleString('pt-BR')} nota={`${diaLongo(dados.janela.de)} a ${diaLongo(dados.janela.ate)}`} />
                        <Kpi rotulo="Eventos registrados" valor={dados.resumo.totalEventos.toLocaleString('pt-BR')} nota="mudanças que o CMS gravou" />
                        <Kpi rotulo="Saiu do ar" valor={dados.resumo.negativos.toLocaleString('pt-BR')} tom={dados.resumo.negativos > 0 ? 'alerta' : 'neutro'} nota="desativação, remoção, recesso" />
                        <Kpi rotulo="Pedidos perdidos" valor={perdidos.toLocaleString('pt-BR')} tom={perdidos > 0 ? 'ruim' : 'neutro'} nota="cancelados + expirados" />
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white">Pedidos aceitos e o que mudou</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Clique numa marca para filtrar a lista por aquele período.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setSoNegativos(v => !v)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1 ${
                                        soNegativos
                                            ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]">{soNegativos ? 'filter_alt' : 'filter_alt_off'}</span>
                                    {soNegativos ? 'Só o que saiu do ar' : 'Todos os eventos'}
                                </button>
                                <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                                    {GRANULARIDADES.map(g => {
                                        const colunas = baldesEstimados(diasNaJanela(dados.janela.de, dados.janela.ate), g.id);
                                        const demais = colunas > MAX_BALDES;
                                        return (
                                            <button
                                                key={g.id}
                                                disabled={demais}
                                                title={demais ? `${colunas} colunas numa janela de ${meses} meses — escolha uma janela menor para ver ${g.label.toLowerCase()}` : undefined}
                                                onClick={() => { setGranularidade(g.id); setSelecionado(null); }}
                                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${granularidade === g.id
                                                    ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                    : demais
                                                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                            >
                                                {g.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <Curva
                            baldes={baldes}
                            granularidade={granularidade}
                            soNegativos={soNegativos}
                            selecionado={selecionado}
                            onSelecionar={setSelecionado}
                        />

                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                            {ORDEM_TIPO.map(t => {
                                const n = dados.resumo.porTipo[t] ?? 0;
                                if (n === 0) return null;
                                return (
                                    <span key={t} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        <span className="size-[7px] rounded-full" style={{ backgroundColor: META_TIPO[t].cor }} />
                                        {META_TIPO[t].label} <span className="tabular-nums text-slate-400 dark:text-slate-500">{n}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <h4 className="font-bold text-slate-900 dark:text-white">
                                    Linha do tempo
                                    <span className="ml-2 text-sm font-semibold text-slate-400 tabular-nums">
                                        {eventos.length} {eventos.length === 1 ? 'registro' : 'registros'}
                                    </span>
                                </h4>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-[16px] absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                        <input
                                            value={busca}
                                            onChange={e => setBusca(e.target.value)}
                                            placeholder="Buscar item, cupom, campo…"
                                            className="text-xs pl-7 pr-2 py-1.5 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                        />
                                    </div>
                                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        {([['', 'Todos'], ['loja', 'A loja'], ['admin', 'Nós']] as const).map(([v, label]) => (
                                            <button
                                                key={v}
                                                onClick={() => setQuem(v)}
                                                className={`text-xs px-2.5 py-1.5 font-semibold transition-colors ${
                                                    quem === v
                                                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                                {ORDEM_TIPO.map(t => {
                                    // O chip some quando o tipo não existe na janela; fica
                                    // visível zerado quando é um filtro vigente que o esvaziou,
                                    // senão ele desapareceria no clique e ninguém o desmarcaria.
                                    if ((dados.resumo.porTipo[t] ?? 0) === 0) return null;
                                    const n = contagemPorTipo[t];
                                    const ativo = tipos.has(t);
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => alternarTipo(t)}
                                            className={`text-[11px] px-2 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 border ${
                                                ativo
                                                    ? 'text-white border-transparent'
                                                    : `border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 ${n === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500'}`
                                            }`}
                                            style={ativo ? { backgroundColor: META_TIPO[t].cor } : undefined}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">{META_TIPO[t].icone}</span>
                                            {META_TIPO[t].label}
                                            <span className="tabular-nums opacity-70">{n}</span>
                                        </button>
                                    );
                                })}
                                {(tipos.size > 0 || selecionado || busca || quem) && (
                                    <button
                                        onClick={() => { setTipos(new Set()); setSelecionado(null); setBusca(''); setQuem(''); }}
                                        className="text-[11px] px-2 py-1 rounded-lg font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                                    >
                                        limpar filtros
                                    </button>
                                )}
                            </div>

                            {baldeSelecionado && (
                                <div className="flex items-center gap-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300">
                                    <span className="material-symbols-outlined text-[16px]">filter_list</span>
                                    Mostrando só <strong>{periodoDoBalde(baldeSelecionado, granularidade)}</strong>
                                    <span className="text-slate-400">· {baldeSelecionado.aceitos} pedido(s) aceito(s) no período</span>
                                    <button onClick={() => setSelecionado(null)} className="ml-auto text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center">
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                            {eventos.length === 0 ? (
                                <p className="px-4 py-12 text-sm text-slate-400 text-center max-w-md mx-auto">
                                    {dados.eventos.length === 0
                                        ? 'Nenhuma mudança registrada nesta janela. O log do CMS não guarda tudo desde sempre — janela mais antiga costuma vir vazia mesmo quando a loja mexeu.'
                                        : 'Nenhum evento com esses filtros. Tente “Todos os eventos” ou limpe os filtros.'}
                                </p>
                            ) : eventos.map((e, i) => (
                                <div key={`${e.dia}-${e.tipo}-${e.titulo}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                                    <span className="text-xs text-slate-400 tabular-nums shrink-0 w-16 pt-0.5">{diaLongo(e.dia)}</span>
                                    <span
                                        className="material-symbols-outlined text-[18px] shrink-0 pt-0.5"
                                        style={{ color: META_TIPO[e.tipo].cor }}
                                    >
                                        {META_TIPO[e.tipo].icone}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                                            {e.titulo}
                                            {e.quantidade > 1 && (
                                                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                                                    {e.quantidade}×
                                                </span>
                                            )}
                                            {e.impacto === 'negativo' && (
                                                <span className="material-symbols-outlined text-[14px] text-rose-500" title="Saiu do ar">trending_down</span>
                                            )}
                                        </p>
                                        {e.detalhe && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{e.detalhe}</p>
                                        )}
                                        {e.exemplos.length > 0 && (
                                            <p className="text-xs text-slate-400 dark:text-slate-500 break-words mt-0.5">
                                                ex.: {e.exemplos.join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    {/* O nome de quem assinou vale mais que "nós": é a diferença
                                        entre cobrar o parceiro e descobrir que a mexida foi nossa. */}
                                    <span
                                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${META_QUEM[e.quem].classe}`}
                                        title={e.autores.length > 0 ? `Pelo CMS: ${e.autores.join(', ')}` : undefined}
                                    >
                                        {e.autores.length > 0 ? e.autores.join(', ') : META_QUEM[e.quem].label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                        As mudanças vêm do log de auditoria do CMS
                        {dados.fontes.logDesde && <> — o registro mais antigo desta loja na janela é de {diaLongo(dados.fontes.logDesde)}</>}.
                        Vazio aqui significa “não registrado”, não “não aconteceu”: cada tipo de alteração começou a ser
                        gravado numa data diferente. O log guarda que um item foi desativado, mas não qual — os nomes em
                        “ex.:” saem do cardápio, casados pelo dia, então são amostra e não a lista completa.
                        {dados.fontes.logTruncado && <> <strong>Esta loja passou do teto de linhas do log na janela — há mais mudanças do que as listadas.</strong></>}
                        {' '}Banco de teste, réplica diária. Montado em {dados.elapsedMs ?? '—'}ms.
                    </p>
                </>
            )}
        </div>
    );
}
