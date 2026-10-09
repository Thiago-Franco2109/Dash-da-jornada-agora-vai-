import { useMemo, useState } from 'react';
import {
    useOkrTrimestre,
    trimestreAtual,
    trimestresRecentes,
    rotuloTrimestre,
    type OkrParceiroAdocao,
    type OkrParceiroNovo,
    type OkrPorCidade,
    type OkrSaida,
} from '../hooks/useOkrTrimestre';
import { rotuloOkrDaCidade } from '../config/cidadesOkr';

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
 */

type KrId = 'kr1' | 'kr2' | 'kr3';

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
    id, titulo, rotulo, pct, meta, principal, detalhe, selecionado, onSelect,
}: {
    id: KrId;
    titulo: string;
    rotulo: string;
    pct: number | null;
    meta: number;
    principal: string;
    detalhe: string;
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
            <p className="text-[11px] text-slate-400 mt-2">{detalhe}</p>
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

function LinhaParceiro({ nome, id, cidade, direita }: { nome: string; id: number; cidade: string; direita: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {nome} <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">#{id}</span>
                </p>
                <p className="text-xs text-slate-400 truncate">{cidadeCurta(cidade)}</p>
            </div>
            <div className="shrink-0 text-right">{direita}</div>
        </div>
    );
}

function PainelNovos({ parceiros, meta, janela }: { parceiros: OkrParceiroNovo[]; meta: number; janela: number }) {
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
                            nome={p.nome}
                            id={p.id}
                            cidade={p.cidade}
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
                            nome={p.nome}
                            id={p.id}
                            cidade={p.cidade}
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
 * diário). Separar os dois no tom evita tratar os 47 como a mesma conversa.
 */
const DIAS_ZUMBI = 60;

function PainelAdocao({ parceiros, dias, desde }: { parceiros: OkrParceiroAdocao[]; dias: number; desde: string }) {
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
                        nome={p.nome}
                        id={p.id}
                        cidade={p.cidade}
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

function PainelChurn({ saidas, base, inicio }: { saidas: OkrSaida[]; base: number; inicio: string }) {
    return (
        <div>
            <TituloLista contagem={saidas.length}>
                Contratos encerrados desde {diaMes(inicio)}
            </TituloLista>
            <Lista>
                {saidas.length === 0 ? (
                    <Vazio texto={`Nenhum dos ${base} contratos da virada do trimestre saiu. 🎉`} />
                ) : saidas.map(s => (
                    <LinhaParceiro
                        key={s.id}
                        nome={s.nome}
                        id={s.id}
                        cidade={s.cidade}
                        direita={
                            <>
                                <p className="font-bold tabular-nums text-red-600 dark:text-red-400">{diaMes(s.saida)}</p>
                                <p className="text-xs text-slate-400 max-w-[18rem] truncate" title={s.motivo ?? undefined}>
                                    {s.motivo ?? 'sem motivo registrado'}
                                </p>
                            </>
                        }
                    />
                ))}
            </Lista>
            <p className="text-[11px] text-slate-400 mt-2">
                Base do KR: os {base} contratos vivos em {diaMes(inicio)}. Quem lançou depois não entra —
                o KR mede manter o que já existia.
            </p>
        </div>
    );
}

function TabelaCidades({ linhas, krSelecionado, metas }: {
    linhas: OkrPorCidade[];
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
                            {celula(l.kr1.fechados > 0 ? l.kr1.pct : null, metas.kr1, `${l.kr1.atingiram}/${l.kr1.fechados}`, krSelecionado === 'kr1')}
                            {celula(l.kr2.base > 0 ? l.kr2.pct : null, metas.kr2, `${l.kr2.recebendo}/${l.kr2.base}`, krSelecionado === 'kr2')}
                            {celula(l.kr3.base > 0 ? l.kr3.pct : null, metas.kr3, `${l.kr3.base - l.kr3.perdidos}/${l.kr3.base}`, krSelecionado === 'kr3')}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function OkrView() {
    const [trimestre, setTrimestre] = useState(trimestreAtual);
    const [kr, setKr] = useState<KrId>('kr2');
    const { dados, loading, error, refetch } = useOkrTrimestre(trimestre);

    const opcoes = useMemo(() => trimestresRecentes(4), []);
    const ehAtual = trimestre === trimestreAtual();

    const diasRestantes = dados
        ? Math.max(Math.round((Date.parse(`${dados.trimestre.fim}T00:00:00Z`) - Date.parse(`${dados.trimestre.corte}T00:00:00Z`)) / 86400000), 0)
        : 0;

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
                {loading ? (
                    <p className="text-sm text-slate-400">Calculando os KRs no banco…</p>
                ) : error ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                        Não foi possível carregar a OKR: {error}
                    </div>
                ) : !dados ? (
                    <p className="text-sm text-slate-400">Sem dados para este trimestre.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <KrCard
                                id="kr1"
                                rotulo="KR1 · Novos"
                                titulo={`${dados.parametros.pedidosNovos} pedidos nos primeiros ${dados.parametros.janelaNovos} dias`}
                                pct={dados.kr1.fechados > 0 ? dados.kr1.pct : null}
                                meta={dados.kr1.meta}
                                principal={dados.kr1.fechados > 0
                                    ? `${dados.kr1.atingiram} de ${dados.kr1.fechados} com janela fechada`
                                    : 'nenhuma janela fechou ainda'}
                                detalhe={`${dados.kr1.coorte} lançados no trimestre · ${dados.kr1.coorte - dados.kr1.fechados} ainda na janela`}
                                selecionado={kr === 'kr1'}
                                onSelect={setKr}
                            />
                            <KrCard
                                id="kr2"
                                rotulo="KR2 · Adoção"
                                titulo={`Recebendo pedido nos últimos ${dados.parametros.diasAdocao} dias`}
                                pct={dados.kr2.base > 0 ? dados.kr2.pct : null}
                                meta={dados.kr2.meta}
                                principal={`${dados.kr2.recebendo} de ${dados.kr2.base} parceiros ativos`}
                                detalhe={`${dados.kr2.base - dados.kr2.recebendo} sem nenhum pedido na janela`}
                                selecionado={kr === 'kr2'}
                                onSelect={setKr}
                            />
                            <KrCard
                                id="kr3"
                                rotulo="KR3 · Churn"
                                titulo="Contratos mantidos até o fim do trimestre"
                                pct={dados.kr3.base > 0 ? dados.kr3.pct : null}
                                meta={dados.kr3.meta}
                                principal={`${dados.kr3.base - dados.kr3.perdidos} de ${dados.kr3.base} contratos da virada`}
                                detalhe={dados.kr3.perdidos === 0
                                    ? 'nenhuma saída no trimestre'
                                    : `${dados.kr3.perdidos} saída${dados.kr3.perdidos > 1 ? 's' : ''} no trimestre`}
                                selecionado={kr === 'kr3'}
                                onSelect={setKr}
                            />
                        </div>

                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-2">Por cidade</p>
                        <TabelaCidades
                            linhas={dados.porCidade}
                            krSelecionado={kr}
                            metas={{ kr1: dados.kr1.meta, kr2: dados.kr2.meta, kr3: dados.kr3.meta }}
                        />

                        <div className="mt-6">
                            {kr === 'kr1' && (
                                <PainelNovos
                                    parceiros={dados.kr1.parceiros}
                                    meta={dados.parametros.pedidosNovos}
                                    janela={dados.parametros.janelaNovos}
                                />
                            )}
                            {kr === 'kr2' && (
                                <PainelAdocao
                                    parceiros={dados.kr2.parceiros}
                                    dias={dados.parametros.diasAdocao}
                                    desde={dados.parametros.desdeAdocao}
                                />
                            )}
                            {kr === 'kr3' && (
                                <PainelChurn saidas={dados.kr3.saidas} base={dados.kr3.base} inicio={dados.trimestre.inicio} />
                            )}
                        </div>

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
        </div>
    );
}
