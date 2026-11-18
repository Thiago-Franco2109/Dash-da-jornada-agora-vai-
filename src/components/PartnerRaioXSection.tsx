import { useMemo, useState } from 'react';
import type { AchadoRaioX, RaioX, VolumeComparado } from '../hooks/useParceiroRaioX';
import { lookupAccessById, type StoreAccessData } from '../hooks/useDailyAccessSync';

/**
 * Raio-x: "qual problema atacar neste parceiro", numa tela só.
 *
 * A ficha do parceiro já dizia que ele está mal (índice 0.00, pedidos
 * esperados 8). O que faltava era ONDE — e isso não se responde contra meta
 * abstrata, se responde contra quem disputa o mesmo cliente na mesma cidade.
 * Toda linha aqui é "ele × a mediana do segmento dele na cidade dele".
 *
 * ── O funil tem DOIS passos, de propósito ────────────────────────────────
 *   visita (GA, planilha de acessos)  →  pedido (banco)
 * O passo do meio — carrinho — existe no GA (`add_to_cart` com
 * `estabelecimento_id`) e foi deliberadamente deixado de fora: o vínculo
 * loja↔carrinho está furado e depende de conserto dos devs. Número que
 * parece plausível e está errado é pior que número ausente. Quando
 * consertarem, o passo entra aqui no meio sem mexer no resto.
 *
 * ── Por que a visita é calculada AQUI e não na function ──────────────────
 * O acesso é do GA e chega pela planilha (`useDailyAccessSync`), não pelo
 * banco. A function devolve a lista `pares` (os concorrentes com id) exatamente
 * para esta tela cruzar os dois lados por id — nunca por nome, que se repete
 * entre cidades.
 *
 * ⚠️ As duas janelas não são a mesma: pedidos vêm de `janela.dias` do banco e
 * acessos cobrem os dias que a planilha tiver. Por isso tudo que mistura os
 * dois é convertido para POR DIA antes de comparar.
 */

interface Props {
    raioX: RaioX | null;
    loading?: boolean;
    error?: string | null;
    /** Mapa inteiro de acessos (indexado por `id:NNN`) — precisa dos concorrentes, não só do parceiro. */
    accessData: Record<string, StoreAccessData>;
    /** Dias distintos que a planilha de acessos cobre. 0 = ainda carregando. */
    diasAcesso: number;
    /**
     * Parceiro que assinou e ainda não abriu. Esconde o funil: visita e pedido
     * de quem não abriu são zero por construção, e "a loja é vista e não vende"
     * seria uma acusação falsa. O que sobra — cardápio, preço, entrega — é
     * justamente o que dá para arrumar ANTES de lançar.
     */
    preLancamento?: boolean;
}

/** Abaixo disto a loja aparece menos que o normal do segmento dela. */
const FATOR_POUCA_VISITA = 0.5;
/** Abaixo disto ela recebe gente e não transforma em pedido. */
const FATOR_CONVERSAO_BAIXA = 0.5;
/** Com menos concorrentes que isso medindo acesso, não há mediana que preste. */
const MIN_PARES_ACESSO = 4;

function mediana(valores: number[]): number {
    if (valores.length === 0) return 0;
    const s = [...valores].sort((a, b) => a - b);
    const meio = s.length >> 1;
    return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Mediana de contagem sai meio (75,5 bairros) — inteiro quando dá, vírgula quando não. */
const n0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ordinal = (pos: number, total: number) => `${pos}º de ${total}`;

interface Visitas {
    /** Visitantes únicos somados na janela da planilha. */
    total: number;
    porDia: number;
    medianaPorDiaSegmento: number;
    posicao: number;
    totalComparados: number;
    /** Pedidos por 100 visitas, já com as duas janelas normalizadas por dia. */
    conversao: number;
    medianaConversaoSegmento: number;
}

/**
 * Cruza os acessos do GA com os pares da function.
 *
 * Só entram concorrentes que têm acesso na planilha: loja sem linha é loja
 * sem dado, não loja com zero — contá-la como zero rebaixaria a mediana e
 * faria qualquer parceiro parecer bem visitado.
 */
function montarVisitas(
    raioX: RaioX,
    accessData: Record<string, StoreAccessData>,
    diasAcesso: number,
): Visitas | null {
    if (diasAcesso <= 0) return null;

    const meuAcesso = lookupAccessById(accessData, raioX.estabId);
    if (!meuAcesso) return null;

    const diasPedido = raioX.janela.dias;
    const porDia = (acessos: number) => acessos / diasAcesso;
    const conversaoDe = (pedidos: number, acessos: number) => {
        const visitasDia = porDia(acessos);
        if (visitasDia <= 0) return 0;
        return ((pedidos / diasPedido) / visitasDia) * 100;
    };

    const outros = raioX.pares
        .filter(p => !p.ehOParceiro)
        .map(p => ({ par: p, acesso: lookupAccessById(accessData, p.id) }))
        .filter((x): x is { par: typeof raioX.pares[number]; acesso: StoreAccessData } => x.acesso !== null);

    const porDiaOutros = outros.map(o => porDia(o.acesso.acessosUnicos));
    const meuPorDia = porDia(meuAcesso.acessosUnicos);
    const meuPedidos = raioX.pedidos.loja;

    return {
        total: meuAcesso.acessosUnicos,
        porDia: meuPorDia,
        medianaPorDiaSegmento: mediana(porDiaOutros),
        posicao: porDiaOutros.filter(v => v > meuPorDia).length + 1,
        totalComparados: outros.length + 1,
        conversao: conversaoDe(meuPedidos, meuAcesso.acessosUnicos),
        medianaConversaoSegmento: mediana(
            outros.map(o => conversaoDe(o.par.pedidos, o.acesso.acessosUnicos)).filter(v => v > 0),
        ),
    };
}

/**
 * O achado que só a tela sabe montar, porque depende do acesso do GA.
 *
 * A ordem importa: "ninguém abre a loja" e "abrem e não pedem" pedem ações
 * opostas — promoção/vitrine no primeiro caso, cardápio/preço no segundo.
 */
function achadoDeVisita(v: Visitas | null, raioX: RaioX): AchadoRaioX | null {
    if (!v || v.totalComparados < MIN_PARES_ACESSO) return null;

    const med = v.medianaPorDiaSegmento;
    if (med > 0 && v.porDia < med * FATOR_POUCA_VISITA) {
        return {
            id: 'pouca-visita',
            severidade: raioX.pedidos.loja === 0 ? 1 : 2,
            titulo: `Pouca gente abre a loja: ${n1(v.porDia)} visitas por dia`,
            detalhe: `O ${raioX.segmento.nome.toLowerCase()} mediano de ${raioX.parceiro.cidade} recebe ${n1(med)} por dia. Ele é ${ordinal(v.posicao, v.totalComparados)} em visita — o problema começa antes do cardápio.`,
        };
    }

    const medConv = v.medianaConversaoSegmento;
    if (medConv > 0 && v.conversao < medConv * FATOR_CONVERSAO_BAIXA) {
        return {
            id: 'nao-converte',
            severidade: 1,
            titulo: v.conversao === 0
                ? 'A loja é vista e não vende'
                : `Entra gente e não vira pedido: ${n1(v.conversao)} pedidos a cada 100 visitas`,
            detalhe: `A mediana do segmento é ${n1(medConv)} a cada 100. Visita ele tem (${ordinal(v.posicao, v.totalComparados)}); o que trava está dentro da loja — cardápio, preço ou entrega.`,
        };
    }

    return null;
}

function CardBase({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}>
            {children}
        </div>
    );
}

/** Um número do parceiro ao lado da mediana do segmento. */
function Kpi({ rotulo, valor, referencia, pior, dica }: {
    rotulo: string;
    valor: string;
    referencia: string;
    /** true quando o parceiro está do lado ruim da mediana. */
    pior?: boolean;
    dica?: string;
}) {
    return (
        <div className="px-4 py-3" title={dica}>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{rotulo}</p>
            <p className={`text-lg font-bold tabular-nums ${pior ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {valor}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">cidade: {referencia}</p>
        </div>
    );
}

function PassoFunil({ icone, rotulo, valor, detalhe, posicao, ausente }: {
    icone: string;
    rotulo: string;
    valor: string;
    detalhe: string;
    posicao?: string;
    ausente?: boolean;
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <span className={`material-symbols-outlined ${ausente ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>{icone}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{rotulo}</p>
                <p className={`text-xl font-bold tabular-nums ${ausente ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                    {valor}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{detalhe}</p>
            </div>
            {posicao && (
                <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 rounded-full px-2.5 py-1">
                    {posicao}
                </span>
            )}
        </div>
    );
}

function TabelaPrecos({ volumes, segmento }: { volumes: VolumeComparado[]; segmento: string }) {
    const [aberto, setAberto] = useState(false);
    if (volumes.length === 0) return null;

    const visiveis = aberto ? volumes : volumes.slice(0, 3);

    return (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700/50">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                Preço contra o {segmento.toLowerCase()} da cidade, no mesmo tamanho
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            <th className="text-left font-medium py-1">Item</th>
                            <th className="text-right font-medium py-1">Dele</th>
                            <th className="text-right font-medium py-1">Cidade</th>
                            <th className="text-right font-medium py-1">Dif.</th>
                            <th className="text-right font-medium py-1 hidden sm:table-cell">Mais barato</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visiveis.map(v => {
                            const caro = v.deltaPct >= 15;
                            return (
                                <tr key={`${v.item}-${v.volume}`} className="border-t border-slate-100 dark:border-slate-700/50">
                                    <td className="py-1.5 pr-2">
                                        <span className="block truncate max-w-[180px] text-slate-700 dark:text-slate-300">{v.item}</span>
                                        <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                                            {v.volume}{v.unidade} · {v.lojasComparadas} lojas
                                        </span>
                                    </td>
                                    <td className={`py-1.5 text-right tabular-nums ${caro ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {brl(v.meuPreco)}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{brl(v.medianaSegmento)}</td>
                                    <td className={`py-1.5 text-right tabular-nums font-semibold ${caro ? 'text-rose-600 dark:text-rose-400' : v.deltaPct <= -10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {v.deltaPct > 0 ? '+' : ''}{v.deltaPct}%
                                    </td>
                                    <td className="py-1.5 text-right text-[11px] text-slate-400 dark:text-slate-500 hidden sm:table-cell">
                                        <span className="block truncate max-w-[140px]">{v.maisBarato.nome}</span>
                                        <span className="tabular-nums">{brl(v.maisBarato.preco)}</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {volumes.length > 3 && (
                <button
                    type="button"
                    onClick={() => setAberto(a => !a)}
                    className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                    {aberto
                        ? 'mostrar menos'
                        : volumes.length - 3 === 1
                            ? 'ver o outro tamanho'
                            : `ver os outros ${volumes.length - 3} tamanhos`}
                </button>
            )}
        </div>
    );
}

export default function PartnerRaioXSection({ raioX, loading, error, accessData, diasAcesso, preLancamento }: Props) {
    const visitas = useMemo(
        () => (raioX && !raioX.semComparacao && !preLancamento ? montarVisitas(raioX, accessData, diasAcesso) : null),
        [raioX, accessData, diasAcesso, preLancamento],
    );

    if (loading) {
        return (
            <CardBase className="p-6">
                <p className="text-sm text-slate-500 dark:text-slate-400">Comparando com os concorrentes da cidade…</p>
            </CardBase>
        );
    }
    if (error) {
        return (
            <CardBase className="p-6">
                <p className="text-sm text-rose-600 dark:text-rose-400">Não foi possível montar o raio-x: {error}</p>
            </CardBase>
        );
    }
    if (!raioX) return null;

    if (raioX.semComparacao) {
        return (
            <CardBase className="p-6">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {raioX.semComparacao === 'sem_cidade'
                        ? 'Parceiro sem cidade no cadastro — sem concorrente com quem comparar.'
                        : 'Parceiro sem segmento no cadastro — sem concorrente com quem comparar.'}
                </p>
            </CardBase>
        );
    }

    const { segmento, pedidos, cardapio, entrega, parceiro, janela } = raioX;

    // O achado de visita é composto aqui (só a tela tem o GA) e disputa a
    // primeira posição com os do banco pela mesma régua de severidade.
    const daVisita = preLancamento ? null : achadoDeVisita(visitas, raioX);
    const achados = [...(daVisita ? [daVisita] : []), ...raioX.achados]
        .sort((a, b) => a.severidade - b.severidade);
    const principal = achados[0];
    const demais = achados.slice(1);

    const corVeredito = principal?.severidade === 1
        ? 'bg-rose-50 dark:bg-rose-900/15 border-rose-200 dark:border-rose-900/40'
        : 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-900/40';

    return (
        <CardBase>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500">compare_arrows</span>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                        Raio-x contra a concorrência
                    </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {segmento.nome} em {parceiro.cidade} · {segmento.lojasNaCidade} lojas
                    {!preLancamento && <> · últimos {janela.dias} dias</>}
                </p>
            </div>

            {segmento.poucosPares && (
                <p className="mx-4 mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-3 py-2">
                    Só {segmento.lojasNaCidade} lojas neste segmento na cidade: a mediana abaixo é referência fraca.
                </p>
            )}

            {principal ? (
                <div className={`mx-4 mt-3 rounded-xl border px-4 py-3 ${corVeredito}`}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Ataque primeiro
                    </p>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">{principal.titulo}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{principal.detalhe}</p>
                </div>
            ) : (
                <div className="mx-4 mt-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/15 px-4 py-3">
                    <p className="font-bold text-slate-900 dark:text-white">Nada fora da curva do segmento</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                        {preLancamento
                            ? 'Cardápio, preço e entrega já estão dentro do que a cidade pratica — nada a corrigir antes de abrir.'
                            : 'Cardápio, preço e entrega estão dentro do que a cidade pratica. Se o volume incomoda, o caminho é demanda — promoção, cupom, vitrine — não conserto de cadastro.'}
                    </p>
                </div>
            )}

            {/* O funil: só dois passos enquanto o carrinho do GA não for confiável. */}
            {!preLancamento && <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700/50 border-y border-slate-100 dark:border-slate-700/50">
                {visitas ? (
                    <PassoFunil
                        icone="storefront"
                        rotulo="Abriram a loja no app"
                        valor={`${n1(visitas.porDia)} / dia`}
                        detalhe={`${visitas.total.toLocaleString('pt-BR')} visitantes na janela · mediana do segmento ${n1(visitas.medianaPorDiaSegmento)}/dia`}
                        posicao={visitas.totalComparados >= MIN_PARES_ACESSO ? ordinal(visitas.posicao, visitas.totalComparados) : undefined}
                    />
                ) : (
                    <PassoFunil
                        icone="storefront"
                        rotulo="Abriram a loja no app"
                        valor="sem dado"
                        detalhe="Esta loja não aparece na planilha de acessos do GA."
                        ausente
                    />
                )}
                <PassoFunil
                    icone="receipt_long"
                    rotulo="Pediram"
                    valor={`${pedidos.loja} ${pedidos.loja === 1 ? 'pedido' : 'pedidos'}`}
                    detalhe={visitas && visitas.conversao > 0
                        ? `${n1(visitas.conversao)} a cada 100 visitas · mediana do segmento ${n1(visitas.medianaConversaoSegmento)}`
                        : `mediana do segmento ${n1(pedidos.medianaSegmento)} · melhor da cidade ${pedidos.melhorSegmento}`}
                    posicao={ordinal(pedidos.posicao, pedidos.totalComparados)}
                />
            </div>}

            {demais.length > 0 && (
                <ul className="px-4 py-3 space-y-2">
                    {demais.map(a => (
                        <li key={a.id} className="flex gap-2 text-sm">
                            <span className={`material-symbols-outlined text-base shrink-0 ${a.severidade === 1 ? 'text-rose-500' : 'text-amber-500'}`}>
                                error
                            </span>
                            <span className="min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{a.titulo}</span>
                                <span className="block text-slate-500 dark:text-slate-400 text-xs">{a.detalhe}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <TabelaPrecos volumes={raioX.volumes} segmento={segmento.nome} />

            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-700/50 border-t border-slate-100 dark:border-slate-700/50">
                <Kpi
                    rotulo="Itens no cardápio"
                    valor={String(cardapio.itens)}
                    referencia={n0(cardapio.medianaItensSegmento)}
                    pior={cardapio.medianaItensSegmento > 0 && cardapio.itens < cardapio.medianaItensSegmento * 0.6}
                    dica="Itens ativos, em categoria viva — o que o cliente realmente vê."
                />
                <Kpi
                    rotulo="Preço médio"
                    valor={brl(cardapio.precoMedio)}
                    referencia={brl(cardapio.medianaPrecoSegmento)}
                    pior={cardapio.medianaPrecoSegmento > 0 && cardapio.precoMedio > cardapio.medianaPrecoSegmento * 1.3}
                    dica="Média do cardápio inteiro. A comparação que vale é a por tamanho, acima."
                />
                <Kpi
                    rotulo="Taxa de entrega"
                    valor={entrega.bairros > 0 ? brl(entrega.taxaMedia) : '—'}
                    referencia={brl(entrega.medianaTaxaSegmento)}
                    pior={entrega.medianaTaxaSegmento > 0 && entrega.taxaMedia > entrega.medianaTaxaSegmento * 1.3}
                    dica="Média entre os bairros que ele atende."
                />
                <Kpi
                    rotulo="Bairros atendidos"
                    valor={String(entrega.bairros)}
                    referencia={n0(entrega.medianaBairrosSegmento)}
                    pior={entrega.medianaBairrosSegmento > 0 && entrega.bairros < entrega.medianaBairrosSegmento * 0.6}
                />
            </div>

            <p className="px-4 py-3 text-[11px] text-slate-400 dark:text-slate-500">
                Comparação só entre lojas Bigou da mesma cidade e segmento — iFood não entra, não temos o dado.
                Pedidos e cardápio vêm do banco (até ontem); visitas vêm do GA.
            </p>
        </CardBase>
    );
}
