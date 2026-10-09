import { useMemo, useState } from 'react';
import {
    useOkrTrimestre,
    trimestreAtual,
    trimestresRecentes,
    rotuloTrimestre,
    type OkrParceiroAdocao,
    type OkrParceiroChurn,
    type OkrParceiroNovo,
} from '../hooks/useOkrTrimestre';
import { useExclusaoOkr } from '../hooks/useExclusaoOkr';
import { calcularFiguras, identificarNoRecorte, type LinhaCidade } from '../utils/okrFiguras';
import { MOTIVOS_EXCLUSAO, motivoExclusaoDef, type ExclusaoOkr, type MotivoExclusao } from '../config/exclusaoOkr';
import { rotuloOkrDaCidade } from '../config/cidadesOkr';
import { useAuth } from '../context/AuthContext';

/**
 * A aba da OKR do trimestre — os três KRs, só nas cidades da OKR.
 *
 * Diferente do chip "Cidades OKR" que liga e desliga o foco no resto do
 * painel, aqui o recorte é a própria tela: uma OKR das cidades X não tem
 * leitura "sem o filtro", e um interruptor sugeriria que tem.
 *
 * Cada KR é um cartão com a porcentagem e, logo abaixo, a LISTA NOMINAL de
 * quem está de fora — é isso que transforma o placar em trabalho. O cartão
 * selecionado manda no painel de baixo.
 *
 * Cada linha pode sair da conta (Supabase `okr_excluido`, ver
 * config/exclusaoOkr.ts). A loja excluída não some: vai para a lista "fora da
 * conta", com motivo e autor, e o número de excluídos aparece ao lado da
 * porcentagem — quem lê precisa saber que o denominador foi mexido.
 */

type KrId = 'kr1' | 'kr2' | 'kr3';

/** O mínimo para identificar uma loja na hora de tirá-la da conta. */
interface ParceiroAlvo {
    id: number;
    nome: string;
    cidade: string;
}

/** '2026-10-07' → '07/10'. */
function diaMes(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function pctTexto(pct: number | null): string {
    return pct === null ? '—' : `${pct.toFixed(1).replace('.0', '')}%`;
}

/** Cidade longa do cadastro → rótulo curto da OKR ("Bom Jesus"). */
function cidadeCurta(cidade: string): string {
    return rotuloOkrDaCidade(cidade) ?? cidade;
}

function tomDaMeta(pct: number | null, meta: number): 'verde' | 'ambar' | 'vermelho' | 'neutro' {
    if (pct === null) return 'neutro';
    if (pct >= meta) return 'verde';
    // 10 pontos abaixo da meta ainda é recuperável no trimestre; abaixo disso
    // o KR precisa de uma decisão, não de mais uma semana de acompanhamento.
    return pct >= meta - 10 ? 'ambar' : 'vermelho';
}

const TONS = {
    verde: { texto: 'text-emerald-600 dark:text-emerald-400', barra: 'bg-emerald-500', borda: 'border-emerald-300 dark:border-emerald-700' },
    ambar: { texto: 'text-amber-600 dark:text-amber-400', barra: 'bg-amber-500', borda: 'border-amber-300 dark:border-amber-700' },
    vermelho: { texto: 'text-red-600 dark:text-red-400', barra: 'bg-red-500', borda: 'border-red-300 dark:border-red-700' },
    neutro: { texto: 'text-slate-400', barra: 'bg-slate-300 dark:bg-slate-600', borda: 'border-slate-200 dark:border-slate-700' },
} as const;

function BarraMeta({ pct, meta, tom }: { pct: number | null; meta: number; tom: keyof typeof TONS }) {
    return (
        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${TONS[tom].barra}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
            {/* Risco da meta: a leitura é "passou ou não passou", não o valor absoluto. */}
            <div
                className="absolute top-0 bottom-0 w-px bg-slate-900/40 dark:bg-white/50"
                style={{ left: `${meta}%` }}
                title={`Meta: ${meta}%`}
            />
        </div>
    );
}

function KrCard({
    id, titulo, rotulo, pct, meta, principal, detalhe, foraDaConta, selecionado, onSelect,
}: {
    id: KrId;
    titulo: string;
    rotulo: string;
    pct: number | null;
    meta: number;
    principal: string;
    detalhe: string;
    foraDaConta: number;
    selecionado: boolean;
    onSelect: (id: KrId) => void;
}) {
    const tom = tomDaMeta(pct, meta);
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
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{rotulo}</span>
                <span className="text-[10px] font-semibold text-slate-400">meta {meta}%</span>
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{titulo}</p>
            <p className={`text-3xl font-black tabular-nums mt-2 ${TONS[tom].texto}`}>{pctTexto(pct)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{principal}</p>
            <BarraMeta pct={pct} meta={meta} tom={tom} />
            <p className="text-[11px] text-slate-400 mt-2">
                {detalhe}
                {foraDaConta > 0 && (
                    <span className="text-slate-400"> · <strong className="font-semibold">{foraDaConta} fora da conta</strong></span>
                )}
            </p>
        </button>
    );
}

function Vazio({ texto }: { texto: string }) {
    return <p className="px-4 py-6 text-sm text-slate-400">{texto}</p>;
}

function Lista({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
            <div className="max-h-[48vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">{children}</div>
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

function LinhaParceiro({ parceiro, direita, onTirar }: {
    parceiro: ParceiroAlvo;
    direita: React.ReactNode;
    onTirar?: (p: ParceiroAlvo) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm group">
            <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {parceiro.nome} <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">#{parceiro.id}</span>
                </p>
                <p className="text-xs text-slate-400 truncate">{cidadeCurta(parceiro.cidade)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">{direita}</div>
                {onTirar && (
                    <button
                        type="button"
                        onClick={() => onTirar(parceiro)}
                        title="Tirar esta loja da conta da OKR"
                        className="p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">do_not_disturb_on</span>
                    </button>
                )}
            </div>
        </div>
    );
}

function PainelNovos({ parceiros, meta, janela, onTirar }: {
    parceiros: OkrParceiroNovo[];
    meta: number;
    janela: number;
    onTirar: (p: ParceiroAlvo) => void;
}) {
    const fechados = parceiros.filter(p => p.concluida);
    const andamento = parceiros.filter(p => !p.concluida);
    const falharam = fechados.filter(p => !p.atingiu);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <TituloLista contagem={andamento.length}>
                    Ainda dá tempo — dentro dos {janela} dias
                </TituloLista>
                <Lista>
                    {andamento.length === 0 ? (
                        <Vazio texto="Nenhum parceiro na janela agora." />
                    ) : andamento.map(p => (
                        <LinhaParceiro
                            key={p.id}
                            parceiro={p}
                            onTirar={onTirar}
                            direita={
                                <>
                                    <p className={`font-bold tabular-nums ${p.atingiu ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {p.pedidos}/{meta}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        lançou {diaMes(p.lancamento)} · faltam {p.diasRestantes}d
                                    </p>
                                </>
                            }
                        />
                    ))}
                </Lista>
                <p className="text-[11px] text-slate-400 mt-2">
                    Estes ainda não entram na conta do KR — a janela deles não fechou.
                </p>
            </div>

            <div>
                <TituloLista contagem={falharam.length}>
                    Janela fechada sem bater os {meta} pedidos
                </TituloLista>
                <Lista>
                    {fechados.length === 0 ? (
                        <Vazio texto="Nenhuma janela de 14 dias fechou neste trimestre ainda." />
                    ) : falharam.length === 0 ? (
                        <Vazio texto="Todos os parceiros do trimestre bateram a meta. 🎉" />
                    ) : falharam.map(p => (
                        <LinhaParceiro
                            key={p.id}
                            parceiro={p}
                            onTirar={onTirar}
                            direita={
                                <>
                                    <p className="font-bold tabular-nums text-red-600 dark:text-red-400">{p.pedidos}/{meta}</p>
                                    <p className="text-xs text-slate-400">
                                        lançou {diaMes(p.lancamento)}{p.cancelado ? ' · já cancelou' : ''}
                                    </p>
                                </>
                            }
                        />
                    ))}
                </Lista>
                {fechados.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-2">
                        {fechados.length - falharam.length} de {fechados.length} bateram a meta.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Parceiro "ativo" parado há mais de dois meses não é adoção fria: é loja que
 * sumiu do app e continua contando no denominador (ver a memória do recesso
 * diário). É daqui que costuma sair o botão de tirar da conta.
 */
const DIAS_ZUMBI = 60;

function PainelAdocao({ parceiros, dias, desde, onTirar }: {
    parceiros: OkrParceiroAdocao[];
    dias: number;
    desde: string;
    onTirar: (p: ParceiroAlvo) => void;
}) {
    const parados = parceiros.filter(p => !p.recebendo);
    const sumidos = parados.filter(p => p.diasSemPedido === null || p.diasSemPedido > DIAS_ZUMBI).length;
    return (
        <div>
            <TituloLista contagem={parados.length}>
                Ativos sem nenhum pedido desde {diaMes(desde)} ({dias} dias)
            </TituloLista>
            <Lista>
                {parados.length === 0 ? (
                    <Vazio texto="Todos os parceiros ativos receberam pedido na janela. 🎉" />
                ) : parados.map(p => (
                    <LinhaParceiro
                        key={p.id}
                        parceiro={p}
                        onTirar={onTirar}
                        direita={
                            p.diasSemPedido === null ? (
                                <>
                                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">nunca recebeu pedido</p>
                                    <p className="text-xs text-slate-400">lançou {diaMes(p.lancamento)}</p>
                                </>
                            ) : (
                                <>
                                    <p className={`font-bold tabular-nums ${p.diasSemPedido > DIAS_ZUMBI ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {p.diasSemPedido}d
                                    </p>
                                    <p className="text-xs text-slate-400">último em {diaMes(p.ultimoPedido!)}</p>
                                </>
                            )
                        }
                    />
                ))}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">
                Quem está parado há mais tempo vem primeiro.{' '}
                {sumidos > 0 && (
                    <>
                        <strong className="text-red-600/80 dark:text-red-400/80">{sumidos} em vermelho</strong> estão sem
                        pedido há mais de {DIAS_ZUMBI} dias — esses puxam o KR para baixo todo mês e não voltam com follow-up.
                    </>
                )}
            </p>
        </div>
    );
}

function PainelChurn({ parceiros, inicio, onTirar }: {
    parceiros: OkrParceiroChurn[];
    inicio: string;
    onTirar: (p: ParceiroAlvo) => void;
}) {
    const saidas = parceiros.filter(p => p.saida);
    return (
        <div>
            <TituloLista contagem={saidas.length}>
                Contratos encerrados desde {diaMes(inicio)}
            </TituloLista>
            <Lista>
                {saidas.length === 0 ? (
                    <Vazio texto={`Nenhum dos ${parceiros.length} contratos da virada do trimestre saiu. 🎉`} />
                ) : saidas.map(s => (
                    <LinhaParceiro
                        key={s.id}
                        parceiro={s}
                        onTirar={onTirar}
                        direita={
                            <>
                                <p className="font-bold tabular-nums text-red-600 dark:text-red-400">{diaMes(s.saida!)}</p>
                                <p className="text-xs text-slate-400 max-w-[18rem] truncate" title={s.motivo ?? undefined}>
                                    {s.motivo ?? 'sem motivo registrado'}
                                </p>
                            </>
                        }
                    />
                ))}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">
                Base do KR: os {parceiros.length} contratos vivos em {diaMes(inicio)}. Quem lançou depois não entra —
                o KR mede manter o que já existia.
            </p>
        </div>
    );
}

function TabelaCidades({ linhas, krSelecionado, metas }: {
    linhas: LinhaCidade[];
    krSelecionado: KrId;
    metas: { kr1: number; kr2: number; kr3: number };
}) {
    const celula = (pct: number | null, meta: number, detalhe: string, destaque: boolean) => {
        const tom = tomDaMeta(pct, meta);
        return (
            <td className={`px-3 py-2 text-right ${destaque ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                <span className={`font-bold tabular-nums ${TONS[tom].texto}`}>{pctTexto(pct)}</span>
                <span className="block text-[11px] text-slate-400 tabular-nums">{detalhe}</span>
            </td>
        );
    };
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2 text-left font-semibold">Cidade</th>
                        <th className="px-3 py-2 text-right font-semibold">KR1 Novos</th>
                        <th className="px-3 py-2 text-right font-semibold">KR2 Adoção</th>
                        <th className="px-3 py-2 text-right font-semibold">KR3 Churn</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {linhas.map(l => (
                        <tr key={l.cidade}>
                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{cidadeCurta(l.cidade)}</td>
                            {celula(l.kr1.pct, metas.kr1, `${l.kr1.atingiram}/${l.kr1.fechados}`, krSelecionado === 'kr1')}
                            {celula(l.kr2.pct, metas.kr2, `${l.kr2.recebendo}/${l.kr2.base}`, krSelecionado === 'kr2')}
                            {celula(l.kr3.pct, metas.kr3, `${l.kr3.base - l.kr3.perdidos}/${l.kr3.base}`, krSelecionado === 'kr3')}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Modal de "tirar da conta". O motivo é obrigatório de propósito: esse número
 * vai para o CEO, e tirar uma loja sem dizer por quê é a diferença entre
 * limpar a base e maquiar o KR.
 */
function ModalTirarDaConta({ parceiro, salvando, onConfirmar, onFechar }: {
    parceiro: ParceiroAlvo;
    salvando: boolean;
    onConfirmar: (motivo: MotivoExclusao, observacao: string) => void;
    onFechar: () => void;
}) {
    const [motivo, setMotivo] = useState<MotivoExclusao | ''>('');
    const [observacao, setObservacao] = useState('');
    const def = motivo ? motivoExclusaoDef(motivo) : null;
    const faltaDetalhe = Boolean(def?.pedeDetalhe) && observacao.trim().length === 0;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={onFechar}
        >
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="font-bold text-slate-900 dark:text-white">Tirar da conta da OKR</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {parceiro.nome} <span className="text-xs text-slate-400 tabular-nums">#{parceiro.id}</span> · {cidadeCurta(parceiro.cidade)}
                    </p>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sai dos <strong>três KRs</strong> ao mesmo tempo, para todo mundo que abrir o painel. Continua
                        visível na lista "fora da conta" e dá para devolver quando quiser.
                    </p>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Motivo</span>
                        <select
                            value={motivo}
                            onChange={e => setMotivo(e.target.value as MotivoExclusao)}
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
                        onClick={() => motivo && onConfirmar(motivo, observacao)}
                        className="text-sm px-3 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {salvando ? 'Tirando…' : 'Tirar da conta'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PainelForaDaConta({ exclusoes, noRecorte, onDevolver }: {
    exclusoes: ExclusaoOkr[];
    noRecorte: (id: number) => { nome: string; cidade: string } | null;
    onDevolver: (id: string) => void;
}) {
    return (
        <div className="mt-6">
            <TituloLista contagem={exclusoes.length}>Fora da conta</TituloLista>
            <Lista>
                {exclusoes.map(e => {
                    const def = motivoExclusaoDef(e.motivo);
                    const vivo = noRecorte(Number(e.partnerId));
                    const nome = vivo?.nome ?? e.nome ?? `#${e.partnerId}`;
                    const cidade = vivo?.cidade ?? e.cidade ?? '';
                    return (
                        <div key={e.partnerId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium text-slate-600 dark:text-slate-300 truncate">
                                    {nome} <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">#{e.partnerId}</span>
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                    {cidade ? `${cidadeCurta(cidade)} · ` : ''}
                                    {e.excluidoPor ? `por ${e.excluidoPor}` : 'autor não registrado'} em {diaMes(e.excluidoEm.slice(0, 10))}
                                    {e.observacao ? ` · ${e.observacao}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">{def.icon}</span>
                                    {def.chip}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onDevolver(e.partnerId)}
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
                Estas lojas não entram em nenhum dos três KRs. Devolver recalcula os números na hora.
            </p>
        </div>
    );
}

export default function OkrView() {
    const [trimestre, setTrimestre] = useState(trimestreAtual);
    const [kr, setKr] = useState<KrId>('kr2');
    const [alvo, setAlvo] = useState<ParceiroAlvo | null>(null);
    const [salvando, setSalvando] = useState(false);
    const { dados, loading, error, refetch } = useOkrTrimestre(trimestre);
    const { exclusoes, idsExcluidos, carregando: carregandoExclusoes, erro: erroExclusao, excluir, reincluir } = useExclusaoOkr();
    const { user } = useAuth();

    const opcoes = useMemo(() => trimestresRecentes(4), []);
    // Vem do trimestre que o servidor realmente calculou, não do estado local:
    // os dois podem discordar (a function cai no trimestre corrente quando o
    // parâmetro não resolve), e quem manda no rótulo é o dado que está na tela.
    const ehAtual = (dados?.trimestre.id ?? trimestre) === trimestreAtual();

    const figuras = useMemo(
        () => (dados ? calcularFiguras(dados, idsExcluidos) : null),
        [dados, idsExcluidos],
    );

    const listaExcluidos = useMemo(
        () => Object.values(exclusoes).sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm)),
        [exclusoes],
    );

    const diasRestantes = dados
        ? Math.max(Math.round((Date.parse(`${dados.trimestre.fim}T00:00:00Z`) - Date.parse(`${dados.trimestre.corte}T00:00:00Z`)) / 86400000), 0)
        : 0;

    const confirmarExclusao = async (motivo: MotivoExclusao, observacao: string) => {
        if (!alvo) return;
        setSalvando(true);
        await excluir(alvo.id, {
            motivo,
            observacao,
            nome: alvo.nome,
            cidade: alvo.cidade,
            excluidoPor: user?.name || user?.email || null,
        });
        setSalvando(false);
        setAlvo(null);
    };

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
                                    {dados.cidades.length} cidades da OKR · {diaMes(dados.trimestre.inicio)} a {diaMes(dados.trimestre.fim)}
                                    {ehAtual ? <> · <strong>{diasRestantes} dias</strong> até o fim</> : ' · trimestre encerrado'}
                                </>
                                : 'Carregando o recorte da OKR…'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={trimestre}
                            onChange={e => setTrimestre(e.target.value)}
                            className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none"
                            title="Trimestre"
                        >
                            {opcoes.map(t => (
                                <option key={t} value={t}>{rotuloTrimestre(t)}</option>
                            ))}
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
                {dados && (
                    <p className="text-xs text-slate-400 mt-2">{dados.cidades.join(' · ')}</p>
                )}
            </div>

            <div className="p-6">
                {loading || carregandoExclusoes ? (
                    <p className="text-sm text-slate-400">Calculando os KRs no banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar a OKR: {error}
                    </div>
                ) : !dados || !figuras ? (
                    <p className="text-sm text-slate-400">Sem dados para este trimestre.</p>
                ) : (
                    <>
                        {erroExclusao && (
                            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-amber-700 dark:text-amber-300 text-sm">
                                As exclusões não estão sendo salvas ({erroExclusao}). Falta criar a tabela okr_excluido no
                                Supabase — ver supabase/okr_excluido.sql.
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <KrCard
                                id="kr1"
                                rotulo="KR1 · Novos"
                                titulo={`${dados.parametros.pedidosNovos} pedidos nos primeiros ${dados.parametros.janelaNovos} dias`}
                                pct={figuras.kr1.pct}
                                meta={dados.kr1.meta}
                                principal={figuras.kr1.fechados > 0
                                    ? `${figuras.kr1.atingiram} de ${figuras.kr1.fechados} com janela fechada`
                                    : 'nenhuma janela fechou ainda'}
                                detalhe={`${figuras.kr1.coorte} lançados no trimestre · ${figuras.kr1.naJanela} ainda na janela`}
                                foraDaConta={figuras.foraDaConta.kr1}
                                selecionado={kr === 'kr1'}
                                onSelect={setKr}
                            />
                            <KrCard
                                id="kr2"
                                rotulo="KR2 · Adoção"
                                titulo={`Recebendo pedido nos últimos ${dados.parametros.diasAdocao} dias`}
                                pct={figuras.kr2.pct}
                                meta={dados.kr2.meta}
                                principal={`${figuras.kr2.recebendo} de ${figuras.kr2.base} parceiros ativos`}
                                detalhe={`${figuras.kr2.base - figuras.kr2.recebendo} sem nenhum pedido na janela`}
                                foraDaConta={figuras.foraDaConta.kr2}
                                selecionado={kr === 'kr2'}
                                onSelect={setKr}
                            />
                            <KrCard
                                id="kr3"
                                rotulo="KR3 · Churn"
                                titulo="Contratos mantidos até o fim do trimestre"
                                pct={figuras.kr3.pct}
                                meta={dados.kr3.meta}
                                principal={`${figuras.kr3.base - figuras.kr3.perdidos} de ${figuras.kr3.base} contratos da virada`}
                                detalhe={figuras.kr3.perdidos === 0
                                    ? 'nenhuma saída no trimestre'
                                    : `${figuras.kr3.perdidos} saída${figuras.kr3.perdidos > 1 ? 's' : ''} no trimestre`}
                                foraDaConta={figuras.foraDaConta.kr3}
                                selecionado={kr === 'kr3'}
                                onSelect={setKr}
                            />
                        </div>

                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">Por cidade</p>
                        <TabelaCidades
                            linhas={figuras.porCidade}
                            krSelecionado={kr}
                            metas={{ kr1: dados.kr1.meta, kr2: dados.kr2.meta, kr3: dados.kr3.meta }}
                        />

                        <div className="mt-6">
                            {kr === 'kr1' && (
                                <PainelNovos
                                    parceiros={figuras.novos}
                                    meta={dados.parametros.pedidosNovos}
                                    janela={dados.parametros.janelaNovos}
                                    onTirar={setAlvo}
                                />
                            )}
                            {kr === 'kr2' && (
                                <PainelAdocao
                                    parceiros={figuras.adocao}
                                    dias={dados.parametros.diasAdocao}
                                    desde={dados.parametros.desdeAdocao}
                                    onTirar={setAlvo}
                                />
                            )}
                            {kr === 'kr3' && (
                                <PainelChurn
                                    parceiros={figuras.churn}
                                    inicio={dados.trimestre.inicio}
                                    onTirar={setAlvo}
                                />
                            )}
                        </div>

                        {listaExcluidos.length > 0 && (
                            <PainelForaDaConta
                                exclusoes={listaExcluidos}
                                noRecorte={id => identificarNoRecorte(dados, id)}
                                onDevolver={reincluir}
                            />
                        )}

                        {!ehAtual && (
                            <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-6">
                                Trimestre fechado: o KR2 usa a lista de ativos de HOJE com a janela de 7 dias no fim do
                                trimestre — suspensão de loja não tem histórico no banco, então quem foi suspenso depois
                                não aparece no denominador de lá.
                            </p>
                        )}
                        <p className="text-xs text-slate-400 mt-6">
                            Só marketplace (Cardápio Digital é base separada). Banco de teste, réplica diária —
                            pedidos até {diaMes(dados.trimestre.dadosAte)}. Cálculo em {dados.elapsedMs ?? '—'}ms.
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
