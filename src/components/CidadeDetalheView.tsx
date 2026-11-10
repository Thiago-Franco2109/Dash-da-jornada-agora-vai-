import { Fragment, useMemo, useState } from 'react';
import type { CarteiraEstabelecimento } from '../types/carteira';
import type { ClasseRelevancia, JanelaCidade, ParceiroCidade } from '../types/cidadeDetalhe';
import { JANELAS_CIDADE } from '../types/cidadeDetalhe';
import { useCidadeDetalhe } from '../hooks/useCidadeDetalhe';

interface CidadeDetalheViewProps {
    cidade: string;
    grupo?: string;
    divisao?: string;
    onVoltar: () => void;
    onNavigateToPartner?: (estabelecimento: CarteiraEstabelecimento) => void;
}

/**
 * Ordem das faixas na tela = ordem de prioridade de trabalho, não alfabética:
 * quem carrega a cidade primeiro, quem parou logo depois (é o que vira ação),
 * e a cauda por último.
 */
const CLASSES: { id: ClasseRelevancia; rotulo: string; explica: string; cor: string }[] = [
    { id: 'ancora', rotulo: 'Âncoras', explica: 'Juntas, a primeira metade dos pedidos da cidade', cor: 'bg-emerald-500' },
    { id: 'peso', rotulo: 'Peso', explica: 'Dos 50% aos 80% acumulados', cor: 'bg-sky-500' },
    { id: 'parada', rotulo: 'Paradas', explica: 'Ativas no app e sem nenhum pedido na janela', cor: 'bg-red-500' },
    { id: 'cauda', rotulo: 'Cauda', explica: 'Últimos 20% dos pedidos', cor: 'bg-slate-400' },
    { id: 'fora', rotulo: 'Suspensos e pendentes', explica: 'Fora da curva: não estão vendendo por outro motivo', cor: 'bg-amber-500' },
];

function Tile({ rotulo, valor, detalhe, tom = 'neutro' }: {
    rotulo: string;
    valor: string | number;
    detalhe?: string;
    tom?: 'neutro' | 'bom' | 'alerta' | 'ruim';
}) {
    const tons = {
        neutro: 'text-slate-900 dark:text-white',
        bom: 'text-emerald-600 dark:text-emerald-400',
        alerta: 'text-amber-600 dark:text-amber-400',
        ruim: 'text-red-600 dark:text-red-400',
    };
    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-3 py-2.5 min-w-[108px]">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
            <p className={`text-2xl font-bold tabular-nums leading-tight ${tons[tom]}`}>
                {typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}
            </p>
            {detalhe && <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{detalhe}</p>}
        </div>
    );
}

/** Chip de estado. Sempre ícone + texto: cor sozinha não informa. */
function Chip({ icone, texto, tom, titulo }: {
    icone: string;
    texto: string;
    tom: 'bom' | 'morno' | 'frio' | 'ruim';
    titulo?: string;
}) {
    const tons = {
        bom: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
        morno: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
        frio: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600',
        ruim: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
    };
    return (
        <span title={titulo} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tons[tom]}`}>
            <span className="material-symbols-outlined text-[13px] leading-none">{icone}</span>
            {texto}
        </span>
    );
}

/**
 * Promo e cupom em três estados, porque "não tem" e "nunca teve" pedem ações
 * diferentes: quem já participou é retomada, quem nunca participou é a
 * primeira conversa.
 */
function acaoChips(p: ParceiroCidade) {
    const chips: { icone: string; texto: string; tom: 'bom' | 'morno' | 'frio' | 'ruim'; titulo?: string }[] = [];

    if (p.promoAgora) {
        chips.push({
            icone: 'local_offer',
            texto: p.promoSubsidiadaAgora ? 'Promo subsidiada' : 'Promo da casa',
            tom: 'bom',
            titulo: p.campanhas.length ? `Campanhas: ${p.campanhas.join(', ')}` : undefined,
        });
    } else if (p.jaTevePromo) {
        chips.push({
            icone: 'history',
            texto: p.jaTevePromoSubsidiada ? 'Já teve subsidiada' : 'Já teve promo',
            tom: 'frio',
            titulo: `Campanhas no histórico: ${p.campanhas.join(', ')}`,
        });
    } else {
        chips.push({ icone: 'block', texto: 'Nunca teve promo', tom: 'ruim' });
    }

    if (p.cupomAgora) {
        chips.push({
            icone: 'confirmation_number',
            texto: p.cupomDestaqueAgora ? 'Cupom destaque' : 'Cupom próprio',
            tom: p.cupomDestaqueAgora ? 'bom' : 'morno',
            titulo: p.cupomDestaqueAgora
                ? 'Cupom em destaque (da casa)'
                : 'Cupom do próprio parceiro, sem destaque — nunca subsidiado',
        });
    } else if (p.jaTeveCupom) {
        chips.push({ icone: 'history', texto: 'Já teve cupom', tom: 'frio' });
    } else {
        chips.push({ icone: 'block', texto: 'Nunca teve cupom', tom: 'ruim' });
    }

    return chips;
}

/** Ritmo da última semana contra a média da janela. */
function ritmoChip(ritmo: number | null) {
    if (ritmo === null) return null;
    if (ritmo < 0.6) return <Chip icone="trending_down" texto={`${Math.round(ritmo * 100)}% do ritmo`} tom="ruim" titulo="Última semana bem abaixo da média da janela" />;
    if (ritmo < 0.85) return <Chip icone="trending_down" texto={`${Math.round(ritmo * 100)}%`} tom="morno" titulo="Última semana abaixo da média da janela" />;
    if (ritmo > 1.3) return <Chip icone="trending_up" texto={`${Math.round(ritmo * 100)}%`} tom="bom" titulo="Última semana acima da média da janela" />;
    return null;
}

export default function CidadeDetalheView({ cidade, grupo, divisao, onVoltar, onNavigateToPartner }: CidadeDetalheViewProps) {
    const [dias, setDias] = useState<JanelaCidade>(28);
    const [busca, setBusca] = useState('');
    const [classesOcultas, setClassesOcultas] = useState<Set<ClasseRelevancia>>(new Set());
    const [soSemAcao, setSoSemAcao] = useState(false);

    const { data, isLoading, error } = useCidadeDetalhe(cidade, dias);

    const porClasse = useMemo(() => {
        if (!data) return [];
        const termo = busca.trim().toLowerCase();
        return CLASSES.map(c => ({
            ...c,
            parceiros: data.parceiros
                .filter(p => p.classe === c.id)
                .filter(p => !termo || p.nome.toLowerCase().includes(termo))
                .filter(p => !soSemAcao || (!p.promoAgora && !p.cupomAgora))
                .sort((a, b) => b.pedidos - a.pedidos || a.nome.localeCompare(b.nome, 'pt-BR')),
        })).filter(c => c.parceiros.length > 0);
    }, [data, busca, soSemAcao]);

    const maiorShare = useMemo(
        () => (data ? Math.max(1, ...data.parceiros.map(p => p.share)) : 1),
        [data],
    );

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            {/* ── cabeçalho ───────────────────────────────────────────── */}
            <div className="shrink-0 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <button
                    type="button"
                    onClick={onVoltar}
                    className="cursor-pointer inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary transition-colors mb-2"
                >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Cidades
                </button>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight">
                            {cidade}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {[divisao, grupo].filter(Boolean).join(' · ') || 'Marketplace'}
                            {data && (
                                <span className="text-slate-400">
                                    {' '}· janela de {data.dias} dias, {data.de.split('-').reverse().join('/')} a {data.ate.split('-').reverse().join('/')}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {JANELAS_CIDADE.map(d => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDias(d)}
                                className={`cursor-pointer px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                                    dias === d
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {isLoading && !data ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                    <p className="text-slate-500 text-sm">Lendo {cidade}...</p>
                </div>
            ) : data ? (
                <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-6">
                    {/* ── carteira e atividade ────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Carteira</h2>
                        <div className="flex flex-wrap gap-2">
                            <Tile rotulo="Ativos" valor={data.carteira.ativos} detalhe={`de ${data.carteira.total} na carteira`} />
                            {/* Vendendo mora aqui, e não na Atividade, porque a conta que
                                importa é ativos x vendendo — separadas por uma seção, você
                                tinha que fazer a subtração de cabeça. Leva a janela no
                                rótulo: este bloco não está sob o título que a anuncia. */}
                            <Tile
                                rotulo="Vendendo"
                                valor={data.atividade.comPedido}
                                detalhe={`receberam pedido em ${data.dias}d`}
                                tom="bom"
                            />
                            <Tile rotulo="Suspensos" valor={data.carteira.suspenso} tom={data.carteira.suspenso > 0 ? 'alerta' : 'neutro'} />
                            <Tile rotulo="Pendentes" valor={data.carteira.pendente} detalhe="contrato sem lançamento" />
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                            Atividade · {data.dias} dias
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            <Tile
                                rotulo="Pedidos"
                                valor={data.atividade.pedidos}
                                detalhe={data.dias > 7 ? `${data.atividade.pedidos7.toLocaleString('pt-BR')} na última semana` : undefined}
                            />
                            {/* Sub-janela só entra quando é menor que a janela: com 7 dias
                                selecionados, "em 7 dias" repetiria o bloco de Vendendo. */}
                            {data.dias > 14 && (
                                <Tile rotulo="Em 14 dias" valor={data.atividade.comPedido14} detalhe="receberam pedido" />
                            )}
                            {data.dias > 7 && (
                                <Tile rotulo="Em 7 dias" valor={data.atividade.comPedido7} detalhe="receberam pedido" />
                            )}
                            <Tile
                                rotulo="Paradas"
                                valor={data.atividade.semPedido}
                                detalhe={`ativas, zero pedido em ${data.dias}d`}
                                tom={data.atividade.semPedido > 0 ? 'ruim' : 'neutro'}
                            />
                        </div>
                    </section>

                    {/* ── marketing ───────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                            Ações de marketing · entre os {data.carteira.ativos} ativos
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            <Tile rotulo="Com promo" valor={data.marketing.promoAgora} detalhe={`${data.marketing.promoSubsidiadaAgora} subsidiadas`} />
                            <Tile rotulo="Com cupom" valor={data.marketing.cupomAgora} />
                            <Tile
                                rotulo="Sem ação"
                                valor={data.marketing.semAcaoNenhuma}
                                detalhe="sem promo e sem cupom agora"
                                tom={data.marketing.semAcaoNenhuma > 0 ? 'alerta' : 'neutro'}
                            />
                            <Tile
                                rotulo="Nunca teve promo"
                                valor={data.marketing.nuncaTevePromo}
                                detalhe="em toda a história"
                                tom={data.marketing.nuncaTevePromo > 0 ? 'ruim' : 'neutro'}
                            />
                            <Tile
                                rotulo="Nunca teve cupom"
                                valor={data.marketing.nuncaTeveCupom}
                                detalhe="em toda a história"
                                tom={data.marketing.nuncaTeveCupom > 0 ? 'ruim' : 'neutro'}
                            />
                        </div>
                    </section>

                    {/* ── curva ───────────────────────────────────────── */}
                    <section>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                Parceiros por relevância
                            </h2>
                            <label className="flex items-center gap-1.5 text-sm">
                                <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
                                <input
                                    type="search"
                                    value={busca}
                                    onChange={e => setBusca(e.target.value)}
                                    placeholder="Filtrar parceiro..."
                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-sm w-48"
                                />
                            </label>
                            <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={soSemAcao}
                                    onChange={e => setSoSemAcao(e.target.checked)}
                                    className="rounded border-slate-300"
                                />
                                Só quem está sem ação
                            </label>
                            <div className="flex flex-wrap gap-1 ml-auto">
                                {CLASSES.map(c => {
                                    const oculta = classesOcultas.has(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setClassesOcultas(prev => {
                                                const next = new Set(prev);
                                                if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                                return next;
                                            })}
                                            className={`cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                                                oculta
                                                    ? 'border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                                                    : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${oculta ? 'bg-slate-300' : c.cor}`} />
                                            {c.rotulo}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <table className="min-w-full border-collapse">
                                <thead className="bg-slate-100 dark:bg-slate-800">
                                    <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                        <th scope="col" className="px-3 py-2 text-left">Parceiro</th>
                                        <th scope="col" className="px-2 py-2 text-right w-20">Pedidos</th>
                                        <th scope="col" className="px-2 py-2 text-left w-44">Participação</th>
                                        <th scope="col" className="px-2 py-2 text-left w-32">Ritmo 7d</th>
                                        <th scope="col" className="px-3 py-2 text-left">Promo e cupom</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {porClasse.filter(c => !classesOcultas.has(c.id)).map(c => (
                                        <Fragment key={c.id}>
                                            <tr className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700">
                                                <td colSpan={5} className="px-3 py-1.5">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${c.cor}`} />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.rotulo}</span>
                                                        <span className="text-[11px] text-slate-400">
                                                            {c.parceiros.length} parceiro{c.parceiros.length !== 1 ? 's' : ''} · {c.explica}
                                                        </span>
                                                    </span>
                                                </td>
                                            </tr>
                                            {c.parceiros.map(p => (
                                                <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="px-3 py-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => onNavigateToPartner?.({ id: p.id, nome: p.nome })}
                                                            disabled={!onNavigateToPartner}
                                                            className="cursor-pointer text-sm text-slate-800 dark:text-slate-100 hover:text-primary hover:underline underline-offset-2 disabled:cursor-default disabled:hover:text-inherit disabled:hover:no-underline text-left"
                                                        >
                                                            {p.nome}
                                                        </button>
                                                        {p.delivery === 4 && <span className="ml-2 text-[10px] uppercase font-bold text-amber-600">suspenso</span>}
                                                        {p.delivery === 0 && <span className="ml-2 text-[10px] uppercase font-bold text-slate-400">pendente</span>}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                                                        {p.pedidos.toLocaleString('pt-BR')}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <span className="flex items-center gap-2">
                                                            <span className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                <span
                                                                    className="block h-full bg-primary rounded-full"
                                                                    style={{ width: `${Math.max(p.share > 0 ? 3 : 0, (p.share / maiorShare) * 100)}%` }}
                                                                />
                                                            </span>
                                                            <span className="text-[11px] tabular-nums text-slate-500 w-10 text-right">{p.share}%</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5">{ritmoChip(p.ritmo)}</td>
                                                    <td className="px-3 py-1.5">
                                                        <span className="flex flex-wrap gap-1">
                                                            {acaoChips(p).map((chip, i) => <Chip key={i} {...chip} />)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                            {porClasse.filter(c => !classesOcultas.has(c.id)).length === 0 && (
                                <p className="p-8 text-center text-sm text-slate-500">Nenhum parceiro nos filtros atuais.</p>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">
                            Participação e curva são sobre os pedidos recebidos na janela. Ritmo compara a última
                            semana com a média semanal da janela — some abaixo de 4 pedidos, onde viraria ruído.
                        </p>
                    </section>
                </div>
            ) : null}
        </div>
    );
}
