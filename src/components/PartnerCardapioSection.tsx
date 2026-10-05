import type { CardapioAnalise, ItemCardapio, PromoNoAr } from '../hooks/useCardapioAnalise';
import type { ParceiroAcesso } from '../hooks/useParceiroAcesso';

/**
 * Diagnóstico do cardápio + como o lojista acessa o painel.
 *
 * A ordem das listas é a ordem da ligação do CS: primeiro o que já vende e está sem
 * foto (conserto de maior retorno — a demanda já existe), depois a promoção no ar que
 * não engata, depois o que não vende nada.
 *
 * Promoção EXPIRADA não entra: decisão de produto, não atuamos nelas por ora.
 */

const LISTA_VISIVEL = 6;

/** "1 venda" / "2 vendas" / "sem venda" — sem o "1 vendas" que aparecia antes. */
function rotuloVendas(n: number): string {
    if (n === 0) return 'sem venda';
    return n === 1 ? '1 venda' : `${n} vendas`;
}

interface Props {
    /** Vem de useCardapioAnalise no PartnerDetailsView — por prop pra não refazer o fetch
     *  e pra permitir preview-*.html com dados mockados, sem passar pelo login. */
    analise: CardapioAnalise | null;
    acesso: ParceiroAcesso | null;
    loading?: boolean;
    error?: string | null;
}

function CardBase({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            {children}
        </div>
    );
}

function Cabecalho({ icone, cor, titulo, sub }: { icone: string; cor: string; titulo: string; sub?: string }) {
    return (
        <div className="flex items-start gap-3 mb-4">
            <span className={`material-symbols-outlined ${cor}`}>{icone}</span>
            <div>
                <h3 className="font-bold text-slate-900 dark:text-white">{titulo}</h3>
                {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function ListaItens({ itens, vazio }: { itens: ItemCardapio[]; vazio: string }) {
    if (itens.length === 0) {
        return <p className="text-sm text-slate-500 dark:text-slate-400">{vazio}</p>;
    }
    return (
        <ul className="space-y-1.5">
            {itens.slice(0, LISTA_VISIVEL).map(i => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-slate-300 truncate">{i.nome}</span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                        {rotuloVendas(i.vendas)}
                    </span>
                </li>
            ))}
            {itens.length > LISTA_VISIVEL && (
                <li className="text-xs text-slate-400 dark:text-slate-500 pt-1">
                    + {itens.length - LISTA_VISIVEL} outros
                </li>
            )}
        </ul>
    );
}

function BlocoPromos({ promos }: { promos: PromoNoAr[] }) {
    const furadas = promos.filter(p => p.furada);

    if (promos.length === 0) {
        return (
            <CardBase>
                <Cabecalho icone="local_offer" cor="text-slate-400" titulo="Promoções no ar" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma promoção especial vigente neste parceiro.
                </p>
            </CardBase>
        );
    }

    return (
        <CardBase>
            <Cabecalho
                icone="local_offer"
                cor={furadas.length > 0 ? 'text-rose-500' : 'text-emerald-500'}
                titulo="Promoções no ar"
                sub={furadas.length > 0
                    ? `${furadas.length} de ${promos.length} vendendo abaixo do cardápio comum`
                    : `${promos.length} vigente(s), todas com venda saudável`}
            />
            <ul className="space-y-2">
                {promos.slice(0, LISTA_VISIVEL).map(p => (
                    <li
                        key={p.id}
                        className={`flex items-baseline justify-between gap-3 text-sm rounded-lg px-2 py-1.5 ${
                            p.furada ? 'bg-rose-50 dark:bg-rose-900/15' : ''
                        }`}
                    >
                        <span className="text-slate-700 dark:text-slate-300 truncate">
                            {p.nome}
                            {/* O cruzamento que importa: promo fraca E sem foto tem causa provável. */}
                            {!p.temFoto && (
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-tight text-amber-600 dark:text-amber-400">
                                    sem foto
                                </span>
                            )}
                        </span>
                        <span className={`shrink-0 tabular-nums text-xs ${p.furada ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                            {rotuloVendas(p.vendas)}
                        </span>
                    </li>
                ))}
            </ul>
        </CardBase>
    );
}

function BlocoAcesso({ acesso }: { acesso: ParceiroAcesso }) {
    if (acesso.nuncaAcessou) {
        return (
            <CardBase>
                <Cabecalho icone="devices" cor="text-slate-400" titulo="Acesso do lojista" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhum acesso ao painel registrado para o dono desta loja.
                    {/* Acesso do Suporte Bigou não conta: ele é dono de 7.468 lojas. */}
                </p>
            </CardBase>
        );
    }

    const celular = acesso.predominante === 'celular';
    return (
        <CardBase>
            <Cabecalho
                icone={celular ? 'smartphone' : 'computer'}
                cor={celular ? 'text-violet-500' : 'text-sky-500'}
                titulo={celular ? 'Acessa pelo celular' : 'Acessa pelo computador'}
                sub={`${acesso.pctCelular}% celular · ${100 - acesso.pctCelular}% computador`
                    // Logins, não visitas: a sessão do painel dura meses (ver a function).
                    + ` — por ${acesso.totalSessoes} ${acesso.totalSessoes === 1 ? 'login' : 'logins'}`
                    + (acesso.totalSessoes < 3 ? ' (base pequena)' : '')}
            />
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                acesso.sumido
                    ? 'bg-rose-50 dark:bg-rose-900/15 text-rose-700 dark:text-rose-300'
                    : 'text-slate-600 dark:text-slate-400'
            }`}>
                <span className="material-symbols-outlined text-[18px]">
                    {acesso.sumido ? 'warning' : 'schedule'}
                </span>
                <span>
                    {acesso.diasSemAcesso === 0
                        ? 'Usou o painel hoje'
                        : `Última atividade no painel há ${acesso.diasSemAcesso} dia${acesso.diasSemAcesso === 1 ? '' : 's'}`}
                    {acesso.sumido && ' — parceiro sumido do painel'}
                </span>
            </div>
        </CardBase>
    );
}

export default function PartnerCardapioSection({ analise: data, acesso, loading, error }: Props) {
    if (loading) {
        return (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
                <span className="material-symbols-outlined text-slate-400 animate-spin">progress_activity</span>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Analisando o cardápio…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center">
                <span className="material-symbols-outlined text-slate-400">error</span>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
            </div>
        );
    }

    if (!data || data.resumo.totalItens === 0) {
        return (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-4xl">restaurant_menu</span>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300">Cardápio não encontrado</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                    Nenhum item ativo no cardápio deste parceiro no banco do CMS.
                </p>
            </div>
        );
    }

    const { resumo, semFotoLista, zeradosLista, promosNoArLista, janela, pedidos } = data;
    const semFotoQueVendem = semFotoLista.filter(i => i.vendas > 0);

    return (
        <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Análise do cardápio</h2>
                {/* O banco das functions tem ~1 dia de atraso: nunca rotular como "hoje". */}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {pedidos} pedidos nos últimos {janela.dias} dias (até ontem)
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CardBase>
                    <Cabecalho
                        icone="photo_camera"
                        cor={resumo.pctSemFoto > 30 ? 'text-amber-500' : 'text-emerald-500'}
                        titulo={`${resumo.pctSemFoto}% do cardápio sem foto`}
                        sub={`${resumo.semFoto} de ${resumo.totalItens} itens ativos`}
                    />
                    {semFotoQueVendem.length > 0 ? (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400 mb-2">
                                Já vendem e não têm foto — prioridade
                            </p>
                            <ListaItens itens={semFotoQueVendem} vazio="" />
                        </>
                    ) : (
                        <ListaItens itens={semFotoLista} vazio="Todos os itens têm foto." />
                    )}
                </CardBase>

                <BlocoPromos promos={promosNoArLista} />

                <CardBase>
                    <Cabecalho
                        icone="trending_down"
                        cor="text-slate-400"
                        titulo={`${resumo.itensSemVenda} itens sem nenhuma venda`}
                        sub={`Com foto e ainda assim parados: ${zeradosLista.length}`}
                    />
                    <ListaItens
                        itens={zeradosLista.map(z => ({ ...z, vendas: 0 }))}
                        vazio="Todo item com foto vendeu pelo menos uma vez."
                    />
                </CardBase>

                {acesso && <BlocoAcesso acesso={acesso} />}
            </div>
        </div>
    );
}
