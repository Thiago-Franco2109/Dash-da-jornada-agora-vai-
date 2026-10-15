import { useMemo, useState } from 'react';
import {
    useOkrTrimestre,
    trimestreAtual,
    trimestresRecentes,
    rotuloTrimestre,
    type OkrLojaCd,
    type OkrParceiroNovo,
    type OkrParametros,
} from '../hooks/useOkrTrimestre';
import { useExclusaoOkr, useCriticaOkr, useRecuperacaoOkr, type Marcacao } from '../hooks/marcacoesOkr';
import {
    calcularFiguras,
    identificarNoRecorte,
    type FigurasKr23,
    type FigurasKr41,
    type LinhaCidade,
    type GrupoElegivel,
    type LojaRiscoAvaliada,
} from '../utils/okrFiguras';
import { MOTIVOS_EXCLUSAO, motivoExclusaoDef } from '../config/exclusaoOkr';
import { rotuloOkrDaCidade } from '../config/cidadesOkr';
import { useAuth } from '../context/AuthContext';

/**
 * A aba da OKR do trimestre — os quatro KRs de Sucesso do Cliente.
 *
 * Os dois objetivos medem bases DISJUNTAS, e a tela diz isso o tempo todo: o
 * objetivo 2 é marketplace nas 5 cidades, o objetivo 4 é a base de Cardápio
 * Digital inteira. Misturar os dois num "total da OKR" seria somar laranja com
 * banana — por isso não existe número agregado nesta tela.
 *
 * Cada KR é uma CONTAGEM contra uma meta, e abaixo do cartão vem a LISTA
 * NOMINAL de quem está dentro e de quem falta — é isso que transforma o placar
 * em trabalho. O cartão selecionado manda no painel de baixo.
 *
 * Duas marcações manuais convivem aqui (Supabase, ver marcacoesOkr.ts):
 *   fora da conta → a loja sai de todos os KRs
 *   crítica       → a loja entra no universo do KR 2.3 mesmo sem estar parada
 * As duas aparecem em lista própria, com autor e data: o número vai para o
 * CEO, e mexer no denominador sem deixar rastro é outra coisa.
 */

type KrId = 'kr22' | 'kr23' | 'kr41' | 'kr42';

/** O mínimo para identificar uma loja na hora de marcá-la. */
interface ParceiroAlvo {
    id: number;
    nome: string;
    cidade: string;
}

type ModoMarcacao = 'fora' | 'critica';

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

/** Cidade longa do cadastro → rótulo curto da OKR ("Bom Jesus"). */
function cidadeCurta(cidade: string): string {
    return rotuloOkrDaCidade(cidade) ?? cidade;
}

const TONS = {
    verde: { texto: 'text-emerald-600 dark:text-emerald-400', barra: 'bg-emerald-500', borda: 'border-emerald-300 dark:border-emerald-700' },
    ambar: { texto: 'text-amber-600 dark:text-amber-400', barra: 'bg-amber-500', borda: 'border-amber-300 dark:border-amber-700' },
    vermelho: { texto: 'text-red-600 dark:text-red-400', barra: 'bg-red-500', borda: 'border-red-300 dark:border-red-700' },
    neutro: { texto: 'text-slate-500 dark:text-slate-300', barra: 'bg-slate-400 dark:bg-slate-500', borda: 'border-slate-200 dark:border-slate-700' },
} as const;

type Tom = keyof typeof TONS;

/** Referência de onde o KR deveria estar hoje — checkpoint da OKR ou ritmo. */
interface Referencia {
    valor: number;
    rotulo: string;
}

function tomDoKr(feito: number, meta: number, ref: Referencia | null): Tom {
    if (feito >= meta) return 'verde';
    if (!ref || ref.valor <= 0) return 'neutro';
    if (feito >= ref.valor) return 'verde';
    return feito >= ref.valor * 0.8 ? 'ambar' : 'vermelho';
}

function BarraKr({ pct, referenciaPct, tom, titulo }: { pct: number; referenciaPct: number | null; tom: Tom; titulo?: string }) {
    return (
        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${TONS[tom].barra}`} style={{ width: `${pct}%` }} />
            {referenciaPct !== null && (
                <div
                    className="absolute top-0 bottom-0 w-px bg-slate-900/40 dark:bg-white/50"
                    style={{ left: `${Math.min(referenciaPct, 100)}%` }}
                    title={titulo}
                />
            )}
        </div>
    );
}

function KrCard({
    id, rotulo, titulo, feito, meta, progressoPct, referencia, detalhe, foraDaConta, selecionado, onSelect,
}: {
    id: KrId;
    rotulo: string;
    titulo: string;
    feito: number;
    meta: number;
    progressoPct: number;
    referencia: Referencia | null;
    detalhe: string;
    foraDaConta: number;
    selecionado: boolean;
    onSelect: (id: KrId) => void;
}) {
    const tom = tomDoKr(feito, meta, referencia);
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
                <span className={`text-3xl font-black tabular-nums ${TONS[tom].texto}`}>{num(feito)}</span>
                <span className="text-sm font-bold text-slate-400 tabular-nums">/ {num(meta)}</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                {referencia ? `${referencia.rotulo}: ${num(referencia.valor)}` : ' '}
            </p>
            <BarraKr
                pct={progressoPct}
                referenciaPct={referencia && meta > 0 ? (referencia.valor / meta) * 100 : null}
                tom={tom}
                titulo={referencia ? `${referencia.rotulo}: ${num(referencia.valor)}` : undefined}
            />
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

function BotaoLinha({ icone, titulo, tom, onClick }: {
    icone: string;
    titulo: string;
    tom: 'vermelho' | 'ambar' | 'verde';
    onClick: () => void;
}) {
    const cores = {
        vermelho: 'hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
        ambar: 'hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20',
        verde: 'hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            title={titulo}
            className={`p-1 rounded-lg text-slate-300 dark:text-slate-600 transition-colors ${cores[tom]}`}
        >
            <span className="material-symbols-outlined text-[18px]">{icone}</span>
        </button>
    );
}

function LinhaParceiro({ parceiro, direita, acoes }: {
    parceiro: ParceiroAlvo;
    direita: React.ReactNode;
    acoes?: React.ReactNode;
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
                {acoes}
            </div>
        </div>
    );
}

// ── KR 2.2 ───────────────────────────────────────────────────────────────

function PainelSafra({ parceiros, p, onTirar }: {
    parceiros: OkrParceiroNovo[];
    p: OkrParametros;
    onTirar: (alvo: ParceiroAlvo) => void;
}) {
    // Quem já bateu vem primeiro: é a lista que o KR conta.
    const ordenados = [...parceiros].sort((a, b) =>
        Number(b.atingiu) - Number(a.atingiu) || b.lancamento.localeCompare(a.lancamento));

    return (
        <div>
            <TituloLista contagem={parceiros.length}>
                Safra do trimestre — lançados desde o início
            </TituloLista>
            <Lista>
                {ordenados.length === 0 ? (
                    <Vazio texto="Nenhum parceiro lançado no trimestre ainda." />
                ) : ordenados.map(n => (
                    <LinhaParceiro
                        key={n.id}
                        parceiro={n}
                        acoes={<BotaoLinha icone="do_not_disturb_on" titulo="Tirar esta loja da conta da OKR" tom="vermelho" onClick={() => onTirar(n)} />}
                        direita={
                            <>
                                <p className={`font-bold tabular-nums ${n.atingiu
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : n.concluida ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {n.pedidos}/{p.pedidosNovos}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {n.atingiu
                                        ? `conta no KR · lançou ${diaMes(n.lancamento)}`
                                        : n.concluida
                                            ? `janela fechada · lançou ${diaMes(n.lancamento)}`
                                            : `faltam ${n.diasRestantes}d · lançou ${diaMes(n.lancamento)}`}
                                </p>
                            </>
                        }
                    />
                ))}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">
                Conta quem chegou a {p.pedidosNovos} pedidos nos primeiros {p.janelaNovos} dias — bateu é bateu, não
                espera a janela fechar. Quem fecha a janela sem bater não dá para recuperar: o KR depende de novas
                ativações.
            </p>
        </div>
    );
}

// ── KR 2.3 ───────────────────────────────────────────────────────────────

/** As N semanas, da mais antiga (esquerda) para a mais recente (direita). */
function TiraSemanas({ semanas }: { semanas: boolean[] }) {
    return (
        <span className="inline-flex gap-0.5 align-middle" title="Semanas com pedido, da mais antiga para a mais recente">
            {[...semanas].reverse().map((teve, i) => (
                <span
                    key={i}
                    className={`inline-block w-2 h-2 rounded-full ${teve ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600'}`}
                />
            ))}
        </span>
    );
}

type ContextoRisco = 'plano' | 'elegivel' | 'candidata';

/**
 * Os grupos da lista de elegíveis, na ordem em que aparecem. Separar importa:
 * a loja zerada há cinco meses e a que vendeu anteontem e esfriou não são a
 * mesma conversa, e uma lista única ordenada por dias parados misturaria as
 * duas no meio do caminho.
 */
const GRUPOS_ELEGIVEIS: { id: GrupoElegivel; titulo: string; rodape: string }[] = [
    {
        id: 'zerada',
        titulo: 'Zeradas no trimestre',
        rodape: 'Zeradas: nenhum pedido aceito desde o início do trimestre.',
    },
    {
        id: 'esfriando',
        titulo: 'Esfriando — venderam no trimestre e pararam',
        rodape: 'Esfriando: venderam no trimestre e estão paradas há 7+ dias.',
    },
    {
        id: 'lista',
        titulo: 'Na lista de risco — ainda vendendo',
        rodape: 'Lista de risco: elegíveis por marcação, mesmo vendendo.',
    },
    {
        id: 'voltou',
        titulo: 'Já voltaram sozinhas',
        rodape: 'Já voltaram: ficaram 7+ dias paradas antes no trimestre e retomaram — recuperação que aconteceu, e que só conta no KR se entrar no plano.',
    },
];

function LinhaRisco({ loja, p, contexto, anoRef, onTirar, onCritica, onPlano }: {
    loja: LojaRiscoAvaliada;
    p: OkrParametros;
    contexto: ContextoRisco;
    /** Ano do trimestre — datas de outro ano ganham o sufixo. */
    anoRef: string;
    onTirar: (alvo: ParceiroAlvo) => void;
    onCritica: (alvo: ParceiroAlvo, marcada: boolean) => void;
    onPlano: (alvo: ParceiroAlvo, dentro: boolean) => void;
}) {
    const taxa = loja.taxaCancelamentoPct;
    const corTaxa = taxa === null ? 'text-slate-400'
        : taxa < p.tetoCancelamentoPct ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

    const acoes = (
        <>
            {contexto === 'plano' ? (
                <BotaoLinha icone="playlist_remove" titulo="Tirar do plano de recuperação" tom="ambar" onClick={() => onPlano(loja, true)} />
            ) : contexto === 'elegivel' ? (
                <BotaoLinha icone="add_circle" titulo="Selecionar para o plano de recuperação" tom="verde" onClick={() => onPlano(loja, false)} />
            ) : null}
            {contexto !== 'plano' && (
                <BotaoLinha
                    icone={loja.critica ? 'bookmark_remove' : 'bookmark_add'}
                    titulo={loja.critica ? 'Tirar da lista de risco de cancelamento' : 'Pôr na lista de risco de cancelamento'}
                    tom={loja.critica ? 'verde' : 'ambar'}
                    onClick={() => onCritica(loja, loja.critica)}
                />
            )}
            <BotaoLinha icone="do_not_disturb_on" titulo="Tirar esta loja da conta da OKR" tom="vermelho" onClick={() => onTirar(loja)} />
        </>
    );

    if (contexto === 'plano') {
        return (
            <LinhaParceiro
                parceiro={loja}
                acoes={acoes}
                direita={
                    <>
                        <p className="flex items-center justify-end gap-2">
                            <TiraSemanas semanas={loja.semanasComPedido} />
                            <span className={`font-bold tabular-nums ${corTaxa}`}>{taxa === null ? '—' : `${taxa}%`}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                            {loja.revertida
                                ? 'revertida · conta no KR'
                                : loja.falta.includes('semanas')
                                    ? `${loja.semanasComPedido.filter(Boolean).length}/${p.semanasReversao} semanas com pedido`
                                    : `cancelamento acima de ${p.tetoCancelamentoPct}%`}
                        </p>
                    </>
                }
            />
        );
    }

    return (
        <LinhaParceiro
            parceiro={loja}
            acoes={acoes}
            direita={
                <>
                    <p className={`font-bold tabular-nums ${corTaxa}`}>{taxa === null ? '—' : `${taxa}%`} </p>
                    <p className="text-xs text-slate-400">
                        {loja.zerada
                            ? (loja.ultimoPedido === null
                                ? 'nunca vendeu'
                                : `zerada há ${loja.diasSemPedido}d · último em ${dataCurta(loja.ultimoPedido, anoRef)}`)
                            : loja.motivoElegivel === 'parada'
                                ? `parada há ${loja.diasSemPedido}d`
                                : loja.motivoElegivel === 'lista'
                                    ? 'na lista de risco'
                                    : loja.motivoElegivel === 'voltou'
                                        ? `esteve ${loja.maiorLacunaDias}d parada · já voltou`
                                        : `cancelamento de ${taxa ?? 0}%`}
                    </p>
                </>
            }
        />
    );
}

function PainelRisco({ risco, figuras, p, anoRef, onTirar, onCritica, onPlano, onSelecionarTodas }: {
    risco: LojaRiscoAvaliada[];
    figuras: FigurasKr23;
    p: OkrParametros;
    anoRef: string;
    onTirar: (alvo: ParceiroAlvo) => void;
    onCritica: (alvo: ParceiroAlvo, marcada: boolean) => void;
    onPlano: (alvo: ParceiroAlvo, dentro: boolean) => void;
    onSelecionarTodas: (lojas: ParceiroAlvo[]) => void;
}) {
    const plano = risco.filter(l => l.noPlano);
    const fora = risco.filter(l => l.elegivel && !l.noPlano);
    const elegiveis = GRUPOS_ELEGIVEIS
        .map(g => ({
            ...g,
            lojas: fora
                .filter(l => l.grupoElegivel === g.id)
                // Quem está parada há mais tempo primeiro; quem nunca vendeu no fim.
                .sort((a, b) => (b.diasSemPedido ?? -1) - (a.diasSemPedido ?? -1)),
        }))
        .filter(g => g.lojas.length > 0);
    // Quem não é elegível mas cancela muito: é daqui que sai a lista de risco.
    const candidatas = risco
        .filter(l => !l.elegivel && !l.noPlano && l.taxaCancelamentoPct !== null && l.taxaCancelamentoPct >= p.tetoCancelamentoPct)
        .slice(0, 10);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista contagem={plano.length}>Plano de recuperação — revertidas primeiro</TituloLista>
                {figuras.faltamNoPlano > 0 && (
                    <p className="mb-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        O plano tem {plano.length} {plano.length === 1 ? 'loja' : 'lojas'} e a meta é reverter{' '}
                        {figuras.meta}. Mesmo que todas revertam, faltam <strong>{figuras.faltamNoPlano}</strong> —
                        selecione mais ao lado.
                    </p>
                )}
                <Lista>
                    {plano.length === 0 ? (
                        <Vazio texto="Nenhuma loja selecionada ainda. Escolha ao lado quem entra no plano." />
                    ) : plano.map(l => (
                        <LinhaRisco key={l.id} loja={l} p={p} contexto="plano" anoRef={anoRef} onTirar={onTirar} onCritica={onCritica} onPlano={onPlano} />
                    ))}
                </Lista>
                <p className="text-[11px] text-slate-400 mt-2">
                    Reverte quem tem pedido nas {p.semanasReversao} semanas seguidas (bolinhas, da mais antiga para a
                    mais recente) e cancelamento abaixo de {p.tetoCancelamentoPct}%. A loja fica no plano depois de
                    reverter — é assim que o KR acumula.
                </p>
            </div>

            <div className="space-y-6">
                <div>
                    <TituloLista contagem={fora.length}>Elegíveis fora do plano</TituloLista>
                    <Lista altura="max-h-[46vh]">
                        {elegiveis.length === 0 ? (
                            <Vazio texto={`Nenhuma loja parada há ${p.diasParado}+ dias fora do plano.`} />
                        ) : elegiveis.map(g => (
                            <div key={g.id}>
                                {/* Cabeçalho gruda no topo: a lista é longa e sem isso
                                    some a informação de em qual grupo o olho está. */}
                                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700/60">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {g.titulo} <span className="text-slate-300 dark:text-slate-600 tabular-nums">{g.lojas.length}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onSelecionarTodas(g.lojas)}
                                        className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                                    >
                                        selecionar {g.lojas.length === 1 ? 'esta' : 'estas'}
                                    </button>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {g.lojas.map(l => (
                                        <LinhaRisco key={l.id} loja={l} p={p} contexto="elegivel" anoRef={anoRef} onTirar={onTirar} onCritica={onCritica} onPlano={onPlano} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </Lista>
                    <p className="text-[11px] text-slate-400 mt-2">
                        {GRUPOS_ELEGIVEIS.map(g => g.rodape).join(' ')}
                    </p>
                </div>

                <div>
                    <TituloLista contagem={candidatas.length}>
                        Candidatas à lista de risco — vendendo, mas cancelando muito
                    </TituloLista>
                    <Lista altura="max-h-[22vh]">
                        {candidatas.length === 0 ? (
                            <Vazio texto={`Nenhuma loja ativa passa de ${p.tetoCancelamentoPct}% de cancelamento.`} />
                        ) : candidatas.map(l => (
                            <LinhaRisco key={l.id} loja={l} p={p} contexto="candidata" anoRef={anoRef} onTirar={onTirar} onCritica={onCritica} onPlano={onPlano} />
                        ))}
                    </Lista>
                    <p className="text-[11px] text-slate-400 mt-2">
                        Nenhum corte de taxa reproduz as 18 da apresentação — o banco sugere, o marcador decide. Pôr na
                        lista torna a loja elegível mesmo sem estar parada.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Objetivo 4 ───────────────────────────────────────────────────────────

function PainelPedidosCd({ kr41, lojas, mesDoCorte, onTirar }: {
    kr41: FigurasKr41;
    lojas: OkrLojaCd[];
    /** 'YYYY-MM' do corte — separa mês corrido de mês que ainda não chegou. */
    mesDoCorte: string;
    onTirar: (alvo: ParceiroAlvo) => void;
}) {
    const top = lojas.filter(l => l.pedidosTrimestre > 0).slice(0, 40);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista>Acumulado contra o esperado</TituloLista>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <th className="px-3 py-2 text-left font-semibold">Mês</th>
                                <th className="px-3 py-2 text-right font-semibold">No mês</th>
                                <th className="px-3 py-2 text-right font-semibold">Acumulado</th>
                                <th className="px-3 py-2 text-right font-semibold">Esperado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {kr41.porMes.map(m => {
                                // Mês que ainda não começou não tem acumulado para
                                // julgar — repetir o número de hoje em vermelho diria
                                // que novembro já fracassou em outubro.
                                const futuro = m.mes > mesDoCorte;
                                const bateu = m.acumulado >= m.checkpoint;
                                return (
                                    <tr key={m.mes}>
                                        <td className={`px-3 py-2 font-medium ${futuro ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{mesCurto(m.mes)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{futuro ? '—' : num(m.pedidos)}</td>
                                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${futuro ? 'text-slate-300 dark:text-slate-600'
                                            : bateu ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {futuro ? '—' : num(m.acumulado)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{num(m.checkpoint)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                    Pedido confirmado ou recebido. Cancelado e Pix não pago ficam de fora, como manda o KR. Desafio do
                    trimestre: {num(kr41.desafio)}.
                </p>
            </div>

            <div>
                <TituloLista contagem={top.length}>Quem está gerando os pedidos</TituloLista>
                <Lista>
                    {top.length === 0 ? (
                        <Vazio texto="Nenhum pedido de Cardápio Digital no trimestre." />
                    ) : top.map(l => (
                        <LinhaParceiro
                            key={l.id}
                            parceiro={l}
                            acoes={<BotaoLinha icone="do_not_disturb_on" titulo="Tirar esta loja da conta da OKR" tom="vermelho" onClick={() => onTirar(l)} />}
                            direita={
                                <>
                                    <p className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{num(l.pedidosTrimestre)}</p>
                                    <p className="text-xs text-slate-400">{num(l.pedidos30d)} em 30d{l.ativa ? '' : ' · loja desligada'}</p>
                                </>
                            }
                        />
                    ))}
                </Lista>
            </div>
        </div>
    );
}

function PainelLojasCd({ lojas, p, desde, onTirar }: {
    lojas: OkrLojaCd[];
    p: OkrParametros;
    desde: string;
    onTirar: (alvo: ParceiroAlvo) => void;
}) {
    const ativas = lojas.filter(l => l.pedidos30d >= p.pedidosLojaAtiva);
    const quase = lojas.filter(l => l.pedidos30d < p.pedidosLojaAtiva && l.pedidos30d >= p.pedidosLojaAtiva / 2);

    const linha = (l: OkrLojaCd) => (
        <LinhaParceiro
            key={l.id}
            parceiro={l}
            acoes={<BotaoLinha icone="do_not_disturb_on" titulo="Tirar esta loja da conta da OKR" tom="vermelho" onClick={() => onTirar(l)} />}
            direita={
                <>
                    <p className={`font-bold tabular-nums ${l.pedidos30d >= p.pedidosLojaAtiva ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {num(l.pedidos30d)}
                    </p>
                    <p className="text-xs text-slate-400">
                        {l.pedidos30d >= p.pedidosLojaAtiva
                            ? 'conta no KR'
                            : `faltam ${p.pedidosLojaAtiva - l.pedidos30d} para contar`}
                    </p>
                </>
            }
        />
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista contagem={ativas.length}>
                    Ativas — {p.pedidosLojaAtiva}+ pedidos desde {diaMes(desde)}
                </TituloLista>
                <Lista>{ativas.length === 0 ? <Vazio texto="Nenhuma loja ativa na janela." /> : ativas.map(linha)}</Lista>
            </div>
            <div>
                <TituloLista contagem={quase.length}>
                    Quase lá — entre {Math.ceil(p.pedidosLojaAtiva / 2)} e {p.pedidosLojaAtiva - 1} pedidos
                </TituloLista>
                <Lista>{quase.length === 0 ? <Vazio texto="Nenhuma loja na faixa de empurrão." /> : quase.map(linha)}</Lista>
                <p className="text-[11px] text-slate-400 mt-2">
                    É daqui que o KR cresce: cada uma destas precisa de poucos pedidos a mais por mês para virar ativa.
                </p>
            </div>
        </div>
    );
}

// ── por cidade (só o objetivo 2) ─────────────────────────────────────────

function TabelaCidades({ linhas, krSelecionado }: { linhas: LinhaCidade[]; krSelecionado: KrId }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2 text-left font-semibold">Cidade</th>
                        <th className="px-3 py-2 text-right font-semibold">KR 2.2 Safra</th>
                        <th className="px-3 py-2 text-right font-semibold">KR 2.3 Revertidas</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {linhas.map(l => (
                        <tr key={l.cidade}>
                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{cidadeCurta(l.cidade)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${krSelecionado === 'kr22' ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{l.kr22.atingiram}</span>
                                <span className="text-slate-400"> de {l.kr22.coorte} lançados</span>
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${krSelecionado === 'kr23' ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{l.kr23.revertidas}</span>
                                <span className="text-slate-400"> de {l.kr23.noPlano} no plano</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── marcações ────────────────────────────────────────────────────────────

/**
 * Modal das duas marcações. "Fora da conta" exige motivo: esse número vai para
 * o CEO, e tirar uma loja sem dizer por quê é a diferença entre limpar a base e
 * maquiar o KR. "Crítica" só aumenta o denominador do KR 2.3 — pede contexto,
 * não justificativa.
 */
function ModalMarcar({ parceiro, modo, salvando, onConfirmar, onFechar }: {
    parceiro: ParceiroAlvo;
    modo: ModoMarcacao;
    salvando: boolean;
    onConfirmar: (motivo: string | null, observacao: string) => void;
    onFechar: () => void;
}) {
    const [motivo, setMotivo] = useState('');
    const [observacao, setObservacao] = useState('');
    const ehFora = modo === 'fora';
    const def = ehFora && motivo ? motivoExclusaoDef(motivo) : null;
    const faltaDetalhe = Boolean(def?.pedeDetalhe) && observacao.trim().length === 0;
    const podeSalvar = ehFora ? Boolean(motivo) && !faltaDetalhe : true;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onFechar}>
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="font-bold text-slate-900 dark:text-white">
                        {ehFora ? 'Tirar da conta da OKR' : 'Marcar como crítica de cancelamento'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {parceiro.nome} <span className="text-xs text-slate-400 tabular-nums">#{parceiro.id}</span>
                        {parceiro.cidade ? ` · ${cidadeCurta(parceiro.cidade)}` : ''}
                    </p>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ehFora
                            ? 'Sai de todos os KRs ao mesmo tempo, para todo mundo que abrir o painel. Continua visível na lista "fora da conta" e dá para devolver quando quiser.'
                            : 'Entra no universo do KR 2.3 mesmo sem estar parada, e passa a contar como revertida quando emendar as 4 semanas com cancelamento baixo.'}
                    </p>
                    {ehFora && (
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
                    )}
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
                        disabled={!podeSalvar || salvando}
                        onClick={() => onConfirmar(ehFora ? motivo : null, observacao)}
                        className={`text-sm px-3 py-2 rounded-lg text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                            ehFora ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                    >
                        {salvando ? 'Salvando…' : ehFora ? 'Tirar da conta' : 'Marcar como crítica'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PainelMarcacoes({ titulo, rodape, marcacoes, comMotivo, noRecorte, onDesfazer }: {
    titulo: string;
    rodape: string;
    marcacoes: Marcacao[];
    comMotivo: boolean;
    noRecorte: (id: number) => { nome: string; cidade: string } | null;
    onDesfazer: (id: string) => void;
}) {
    return (
        <div className="mt-6">
            <TituloLista contagem={marcacoes.length}>{titulo}</TituloLista>
            <Lista altura="max-h-[30vh]">
                {marcacoes.map(m => {
                    const def = comMotivo && m.motivo ? motivoExclusaoDef(m.motivo) : null;
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
                                <BotaoLinha icone="undo" titulo="Desfazer esta marcação" tom="verde" onClick={() => onDesfazer(m.partnerId)} />
                            </div>
                        </div>
                    );
                })}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">{rodape}</p>
        </div>
    );
}

// ── tela ─────────────────────────────────────────────────────────────────

const OBJETIVOS: { id: 2 | 4; titulo: string; escopo: string; krs: KrId[] }[] = [
    {
        id: 2,
        titulo: 'Oferta e retenção de parceiros nas 5 cidades',
        escopo: 'marketplace, só nas cidades da OKR',
        krs: ['kr22', 'kr23'],
    },
    {
        id: 4,
        titulo: 'Base do Cardápio Digital',
        escopo: 'base inteira do CD, sem recorte de cidade',
        krs: ['kr41', 'kr42'],
    },
];

export default function OkrView() {
    const [trimestre, setTrimestre] = useState(trimestreAtual);
    const [kr, setKr] = useState<KrId>('kr23');
    const [alvo, setAlvo] = useState<{ parceiro: ParceiroAlvo; modo: ModoMarcacao } | null>(null);
    const [salvando, setSalvando] = useState(false);
    const { dados, loading, error, refetch } = useOkrTrimestre(trimestre);
    const fora = useExclusaoOkr();
    const critica = useCriticaOkr();
    const plano = useRecuperacaoOkr();
    const { user } = useAuth();

    const opcoes = useMemo(() => trimestresRecentes(4), []);
    const ehAtual = (dados?.trimestre.id ?? trimestre) === trimestreAtual();

    const figuras = useMemo(
        () => (dados ? calcularFiguras(dados, fora.ids, critica.ids, plano.ids) : null),
        [dados, fora.ids, critica.ids, plano.ids],
    );

    const porData = (a: Marcacao, b: Marcacao) => b.quando.localeCompare(a.quando);
    const listaFora = useMemo(() => Object.values(fora.marcacoes).sort(porData), [fora.marcacoes]);
    const listaCritica = useMemo(() => Object.values(critica.marcacoes).sort(porData), [critica.marcacoes]);

    const diasRestantes = dados
        ? Math.max(Math.round((Date.parse(`${dados.trimestre.fim}T00:00:00Z`) - Date.parse(`${dados.trimestre.corte}T00:00:00Z`)) / 86400000), 0)
        : 0;

    /** Fração do trimestre já corrida — vira o "ritmo" dos KRs sem checkpoint. */
    const andamento = dados
        ? Math.min(Math.max(
            (Date.parse(`${dados.trimestre.corte}T00:00:00Z`) - Date.parse(`${dados.trimestre.inicio}T00:00:00Z`)) /
            (Date.parse(`${dados.trimestre.fim}T00:00:00Z`) - Date.parse(`${dados.trimestre.inicio}T00:00:00Z`)), 0), 1)
        : 0;

    const quem = user?.name || user?.email || null;

    const confirmarMarcacao = async (motivo: string | null, observacao: string) => {
        if (!alvo) return;
        setSalvando(true);
        const hook = alvo.modo === 'fora' ? fora : critica;
        await hook.marcar(alvo.parceiro.id, {
            motivo,
            observacao,
            nome: alvo.parceiro.nome,
            cidade: alvo.parceiro.cidade,
            quem,
        });
        setSalvando(false);
        setAlvo(null);
    };

    const alternarCritica = (parceiro: ParceiroAlvo, marcada: boolean) => {
        if (marcada) { void critica.desmarcar(parceiro.id); return; }
        setAlvo({ parceiro, modo: 'critica' });
    };

    // Entrar no plano não pede justificativa: é escolher em quem trabalhar, e
    // exigir um formulário a cada loja faria o CS desistir de curar a lista.
    const alternarPlano = (parceiro: ParceiroAlvo, dentro: boolean) => {
        if (dentro) { void plano.desmarcar(parceiro.id); return; }
        void plano.marcar(parceiro.id, { nome: parceiro.nome, cidade: parceiro.cidade, quem });
    };

    const selecionarTodas = (lojas: ParceiroAlvo[]) => {
        void plano.marcarVarios(lojas.map(l => ({
            partnerId: l.id,
            dados: { nome: l.nome, cidade: l.cidade, quem },
        })));
    };

    const cartoes: Record<KrId, Omit<React.ComponentProps<typeof KrCard>, 'selecionado' | 'onSelect'>> | null =
        dados && figuras ? {
            kr22: {
                id: 'kr22',
                rotulo: 'KR 2.2 · Safra 14d',
                titulo: `${dados.parametros.pedidosNovos} pedidos nos primeiros ${dados.parametros.janelaNovos} dias`,
                feito: figuras.kr22.feito,
                meta: figuras.kr22.meta,
                progressoPct: figuras.kr22.progressoPct,
                referencia: { valor: Math.round(figuras.kr22.meta * andamento), rotulo: 'ritmo do trimestre' },
                detalhe: `${figuras.kr22.coorte} lançados · ${figuras.kr22.naJanela} ainda na janela · ${figuras.kr22.perdidos} fecharam sem bater`,
                foraDaConta: figuras.foraDaConta.kr22,
            },
            kr23: {
                id: 'kr23',
                rotulo: 'KR 2.3 · Lojas em risco',
                titulo: `${dados.parametros.semanasReversao} semanas seguidas com pedido e cancelamento < ${dados.parametros.tetoCancelamentoPct}%`,
                feito: figuras.kr23.feito,
                meta: figuras.kr23.meta,
                progressoPct: figuras.kr23.progressoPct,
                referencia: { valor: Math.round(figuras.kr23.meta * andamento), rotulo: 'ritmo do trimestre' },
                detalhe: `${figuras.kr23.noPlano} no plano · ${figuras.kr23.pendentes} a reverter · ${figuras.kr23.elegiveisFora} elegíveis fora`,
                foraDaConta: figuras.foraDaConta.kr23,
            },
            kr41: {
                id: 'kr41',
                rotulo: 'KR 4.1 · Pedidos Cardápio',
                titulo: 'Pedidos confirmados ou recebidos no Cardápio Digital',
                feito: figuras.kr41.feito,
                meta: figuras.kr41.meta,
                progressoPct: figuras.kr41.progressoPct,
                referencia: { valor: figuras.kr41.esperadoAgora, rotulo: 'esperado hoje' },
                detalhe: `${mesCurto(dados.trimestre.corte)} fecha em ${num(figuras.kr41.checkpointAtual)} · desafio ${num(figuras.kr41.desafio)}`,
                foraDaConta: figuras.foraDaConta.cd,
            },
            kr42: {
                id: 'kr42',
                rotulo: 'KR 4.2 · Lojas ativas',
                titulo: `${dados.parametros.pedidosLojaAtiva}+ pedidos nos últimos ${dados.parametros.janelaLojaAtiva} dias`,
                feito: figuras.kr42.feito,
                meta: figuras.kr42.meta,
                progressoPct: figuras.kr42.progressoPct,
                referencia: { valor: figuras.kr42.esperadoAgora, rotulo: 'esperado hoje' },
                detalhe: `${mesCurto(dados.trimestre.corte)} fecha em ${figuras.kr42.checkpointAtual} · partiu de ${figuras.kr42.base} · ${figuras.kr42.quaseLa} quase lá`,
                foraDaConta: figuras.foraDaConta.cd,
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
                {loading || fora.carregando || critica.carregando || plano.carregando ? (
                    <p className="text-sm text-slate-400">Calculando os KRs no banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar a OKR: {error}
                    </div>
                ) : !dados || !figuras || !cartoes ? (
                    <p className="text-sm text-slate-400">Sem dados para este trimestre.</p>
                ) : (
                    <>
                        {(fora.erro || critica.erro || plano.erro) && (
                            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-amber-700 dark:text-amber-300 text-sm">
                                As marcações não estão sendo salvas ({fora.erro ?? critica.erro ?? plano.erro}). Faltam
                                as tabelas okr_excluido / okr_critica / okr_recuperacao no Supabase — ver supabase/.
                            </div>
                        )}

                        {OBJETIVOS.map(obj => (
                            <div key={obj.id} className="mb-6">
                                {/* h2, não h1: o h1 da tela é "OKR do trimestre", e dois
                                    h1 na mesma página quebram a hierarquia para leitor de
                                    tela. O peso visual é de headline do mesmo jeito. */}
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                    Objetivo {obj.id} — {obj.titulo}
                                </h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">{obj.escopo}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {obj.krs.map(id => (
                                        <KrCard key={id} {...cartoes[id]} selecionado={kr === id} onSelect={setKr} />
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="mt-6">
                            {kr === 'kr22' && (
                                <PainelSafra
                                    parceiros={figuras.novos}
                                    p={dados.parametros}
                                    onTirar={parceiro => setAlvo({ parceiro, modo: 'fora' })}
                                />
                            )}
                            {kr === 'kr23' && (
                                <PainelRisco
                                    risco={figuras.risco}
                                    figuras={figuras.kr23}
                                    p={dados.parametros}
                                    anoRef={dados.trimestre.inicio.slice(0, 4)}
                                    onTirar={parceiro => setAlvo({ parceiro, modo: 'fora' })}
                                    onCritica={alternarCritica}
                                    onPlano={alternarPlano}
                                    onSelecionarTodas={selecionarTodas}
                                />
                            )}
                            {kr === 'kr41' && (
                                <PainelPedidosCd
                                    kr41={figuras.kr41}
                                    lojas={figuras.lojasCd}
                                    mesDoCorte={dados.trimestre.corte.slice(0, 7)}
                                    onTirar={parceiro => setAlvo({ parceiro, modo: 'fora' })}
                                />
                            )}
                            {kr === 'kr42' && (
                                <PainelLojasCd
                                    lojas={figuras.lojasCd}
                                    p={dados.parametros}
                                    desde={dados.parametros.desde30d}
                                    onTirar={parceiro => setAlvo({ parceiro, modo: 'fora' })}
                                />
                            )}
                        </div>

                        {(kr === 'kr22' || kr === 'kr23') && (
                            <>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">
                                    Por cidade — objetivo 2
                                </p>
                                <TabelaCidades linhas={figuras.porCidade} krSelecionado={kr} />
                            </>
                        )}

                        {listaCritica.length > 0 && (
                            <PainelMarcacoes
                                titulo="Lista de risco de cancelamento"
                                rodape="Ficam elegíveis ao plano do KR 2.3 mesmo sem estarem paradas. Desfazer só tira a elegibilidade — quem está no plano continua no plano."
                                marcacoes={listaCritica}
                                comMotivo={false}
                                noRecorte={id => identificarNoRecorte(dados, id)}
                                onDesfazer={critica.desmarcar}
                            />
                        )}

                        {listaFora.length > 0 && (
                            <PainelMarcacoes
                                titulo="Fora da conta"
                                rodape="Estas lojas não entram em nenhum KR. Devolver recalcula os números na hora."
                                marcacoes={listaFora}
                                comMotivo
                                noRecorte={id => identificarNoRecorte(dados, id)}
                                onDesfazer={fora.desmarcar}
                            />
                        )}

                        {!ehAtual && (
                            <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-6">
                                Trimestre fechado: o KR 2.3 usa a lista de lojas ativas de HOJE — suspensão de loja não
                                tem histórico no banco, então quem foi suspenso depois não aparece na elegibilidade de lá.
                            </p>
                        )}
                        <p className="text-xs text-slate-400 mt-6">
                            Objetivo 2: marketplace nas cidades da OKR. Objetivo 4: base inteira do Cardápio Digital — são
                            bases disjuntas, por isso não há total somado. Banco de teste, réplica diária — pedidos até
                            {' '}{diaMes(dados.trimestre.dadosAte)}. Cálculo em {dados.elapsedMs ?? '—'}ms.
                        </p>
                    </>
                )}
            </div>

            {alvo && (
                <ModalMarcar
                    parceiro={alvo.parceiro}
                    modo={alvo.modo}
                    salvando={salvando}
                    onConfirmar={confirmarMarcacao}
                    onFechar={() => setAlvo(null)}
                />
            )}
        </div>
    );
}
