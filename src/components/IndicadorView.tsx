import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useIndicadorGmv } from '../hooks/useIndicadorGmv';
import type { CrmPartner } from '../types/crm';

/**
 * Aba Indicador — espelho da aba INDICADOR da planilha.
 *
 * É a mesma fonte de "Todos os Parceiros" (CrmPartner, vindo do banco ou da
 * aba), mas apresentada como a planilha: 1 linha = 1 parceiro, colunas fixas
 * CIDADE / ESTAB_ID / ESTABELECIMENTO / CONTRATO / campanhas e, da coluna H em
 * diante, GMV mês a mês do mais recente para o mais antigo.
 *
 * O que a planilha faz e aqui também: cabeçalho e as 3 primeiras colunas
 * congelados, filtro por coluna, ordenação por qualquer coluna (inclusive um
 * mês), total por mês no rodapé e exportação do recorte visível.
 *
 * A janela de meses vem da Function `crm-gmv` (ver useIndicadorGmv) porque o
 * pipeline do CRM carrega só 6 meses fechados — a planilha mostra 12+ e inclui
 * o mês corrente. Se a Function falhar, cai para a série de `CrmPartner`.
 */

interface IndicadorViewProps {
    partners: CrmPartner[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    onPartnerClick?: (estabId: string) => void;
}

type SortDir = 'asc' | 'desc';
interface SortState { key: string; dir: SortDir }

const JANELAS = [6, 12, 24] as const;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function normalize(value: string): string {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface Linha {
    partner: CrmPartner;
    valores: number[];
    ofertas: string;
    promos: string;
    cupom: string;
}

const CELULA_FIXA = 'sticky z-10 bg-white dark:bg-slate-900 group-hover:bg-emerald-50/60 dark:group-hover:bg-slate-800';

/**
 * Linha memoizada: com a carteira inteira (~1.5 mil parceiros) na tela, ordenar
 * ou filtrar re-renderizava as 20 mil células a cada tecla. `linhas` só muda
 * quando os dados mudam, então aqui o memo corta o custo para o reordenamento
 * do DOM.
 */
const LinhaIndicador = memo(function LinhaIndicador({
    linha,
    onClick,
}: {
    linha: Linha;
    onClick?: (estabId: string) => void;
}) {
    const { partner } = linha;
    const cancelado = /cancel/i.test(partner.statusParceiro);
    return (
        <tr
            onClick={() => onClick?.(partner.estabId)}
            className="group hover:bg-emerald-50/60 dark:hover:bg-slate-800 cursor-pointer"
        >
            <td className={`px-3 py-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 left-0 ${CELULA_FIXA}`}>{partner.cidade || '—'}</td>
            <td className={`px-3 py-1.5 whitespace-nowrap text-slate-400 tabular-nums border-b border-slate-100 dark:border-slate-800 left-44 ${CELULA_FIXA}`}>{partner.estabId}</td>
            <td className={`px-3 py-1.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100 border-b border-r border-slate-100 dark:border-slate-800 left-[17rem] ${CELULA_FIXA}`}>{partner.estabelecimento}</td>
            <td className={`px-3 py-1.5 whitespace-nowrap border-b border-slate-100 dark:border-slate-800 ${cancelado ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>{partner.statusParceiro || '—'}</td>
            <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">{linha.ofertas}</td>
            <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">{linha.promos}</td>
            <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">{linha.cupom}</td>
            {linha.valores.map((v, i) => (
                <td
                    key={i}
                    className={`px-3 py-1.5 whitespace-nowrap text-right tabular-nums border-b border-slate-100 dark:border-slate-800 ${v < 0
                        ? 'text-red-600 dark:text-red-400'
                        : v === 0
                            ? 'text-slate-300 dark:text-slate-600'
                            : 'text-slate-700 dark:text-slate-200'}`}
                >
                    {v === 0 ? '—' : brl.format(v)}
                </td>
            ))}
        </tr>
    );
});

/** Rótulos de mês do mais recente para o mais antigo, como as colunas da aba. */
function mesesDaSerie(partners: CrmPartner[]): string[] {
    const vistos: string[] = [];
    for (const p of partners) {
        const serie = p.gmvMensal ?? [];
        // gmvMensal é cronológica (antigo → recente); a aba é o contrário.
        for (let i = serie.length - 1; i >= 0; i--) {
            if (!vistos.includes(serie[i].label)) vistos.push(serie[i].label);
        }
        if (vistos.length >= 24) break;
    }
    return vistos;
}

export default function IndicadorView({
    partners,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    onPartnerClick,
}: IndicadorViewProps) {
    const [busca, setBusca] = useState('');
    const [cidadeFiltro, setCidadeFiltro] = useState('');
    const [contratoFiltro, setContratoFiltro] = useState('');
    const [janela, setJanela] = useState<number>(12);
    const [sort, setSort] = useState<SortState>({ key: 'cidade', dir: 'asc' });

    const gmv = useIndicadorGmv(janela, partners.length > 0);

    /** Colunas de mês: preferência para a janela pedida; fallback na série do CRM. */
    const mesesCols = useMemo(() => {
        if (gmv.meses.length > 0) return gmv.meses.map(m => ({ mes: m.mes, label: m.label }));
        return mesesDaSerie(partners).slice(0, janela).map(label => ({ mes: '', label }));
    }, [gmv.meses, partners, janela]);

    /** Uma linha por parceiro com os valores já alinhados às colunas de mês. */
    const linhas = useMemo(() => {
        const usandoFunction = gmv.meses.length > 0;
        return partners.map(p => {
            const porLabel = new Map((p.gmvMensal ?? []).map(d => [d.label, d.value]));
            const porMes = gmv.porEstab[p.estabId] ?? {};
            const valores = mesesCols.map(col =>
                usandoFunction ? (porMes[col.mes] ?? 0) : (porLabel.get(col.label) ?? 0),
            );
            return {
                partner: p,
                valores,
                ofertas: p.campaigns.ofertas_da_casa?.resumo ?? '—',
                promos: p.campaigns.super_promos?.resumo ?? '—',
                cupom: p.campaigns.cupons_destaque?.resumo ?? '—',
            };
        });
    }, [partners, mesesCols, gmv.meses.length, gmv.porEstab]);

    const cidades = useMemo(
        () => Array.from(new Set(partners.map(p => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        [partners],
    );
    const contratos = useMemo(
        () => Array.from(new Set(partners.map(p => p.statusParceiro).filter(Boolean))).sort(),
        [partners],
    );

    // A carteira inteira na tela: deixa o campo responder na hora e a tabela
    // recalcular um passo atrás, em vez de travar a cada tecla.
    const buscaAplicada = useDeferredValue(busca);

    // Identidade estável: quem chama passa uma arrow inline, e um callback novo
    // a cada render invalidaria o memo de todas as linhas.
    const cliqueRef = useRef(onPartnerClick);
    useEffect(() => { cliqueRef.current = onPartnerClick; }, [onPartnerClick]);
    const abrirParceiro = useCallback((estabId: string) => cliqueRef.current?.(estabId), []);

    const filtradas = useMemo(() => {
        const termo = normalize(buscaAplicada.trim());
        const base = linhas.filter(l => {
            if (cidadeFiltro && l.partner.cidade !== cidadeFiltro) return false;
            if (contratoFiltro && l.partner.statusParceiro !== contratoFiltro) return false;
            if (!termo) return true;
            return normalize(l.partner.estabelecimento).includes(termo)
                || l.partner.estabId.includes(termo)
                || normalize(l.partner.cidade).includes(termo);
        });

        const mesIndex = sort.key.startsWith('mes:') ? Number(sort.key.slice(4)) : -1;
        const fator = sort.dir === 'asc' ? 1 : -1;

        const texto = (l: (typeof base)[number]): string => {
            switch (sort.key) {
                case 'estabId': return l.partner.estabId.padStart(10, '0');
                case 'estabelecimento': return l.partner.estabelecimento;
                case 'contrato': return l.partner.statusParceiro;
                case 'ofertas': return l.ofertas;
                case 'promos': return l.promos;
                case 'cupom': return l.cupom;
                default: return `${l.partner.cidade} ${l.partner.estabelecimento}`;
            }
        };

        return [...base].sort((a, b) => {
            if (mesIndex >= 0) return ((a.valores[mesIndex] ?? 0) - (b.valores[mesIndex] ?? 0)) * fator;
            return texto(a).localeCompare(texto(b), 'pt-BR', { sensitivity: 'base' }) * fator;
        });
    }, [linhas, buscaAplicada, cidadeFiltro, contratoFiltro, sort]);

    /** Total por mês do recorte visível — é o que a planilha dá ao filtrar. */
    const totais = useMemo(() => {
        const soma: number[] = new Array(mesesCols.length).fill(0);
        for (const l of filtradas) {
            for (let i = 0; i < soma.length; i++) soma[i] += l.valores[i] ?? 0;
        }
        return soma;
    }, [filtradas, mesesCols.length]);

    const temFiltro = Boolean(busca || cidadeFiltro || contratoFiltro);

    const toggleSort = (key: string) => {
        setSort(prev => prev.key === key
            ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key.startsWith('mes:') ? 'desc' : 'asc' });
    };

    const exportarCsv = () => {
        const cabecalho = [
            'CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'CONTRATO',
            'OFERTAS DA CASA', 'SUPER PROMOS', 'CUPOM PARC.',
            ...mesesCols.map(m => m.label),
        ];
        const celula = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const corpo = filtradas.map(l => [
            l.partner.cidade,
            l.partner.estabId,
            l.partner.estabelecimento,
            l.partner.statusParceiro,
            l.ofertas === '—' ? '' : l.ofertas,
            l.promos === '—' ? '' : l.promos,
            l.cupom === '—' ? '' : l.cupom,
            ...l.valores.map(v => v.toFixed(2).replace('.', ',')),
        ].map(celula).join(';'));
        // BOM para o Excel/Sheets abrir em UTF-8 sem acentos quebrados.
        const csv = '﻿' + [cabecalho.map(celula).join(';'), ...corpo].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `indicador-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const thBase = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap select-none cursor-pointer hover:text-slate-900 dark:hover:text-white';
    const fixa = 'bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700';
    const seta = (key: string) => (sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '');

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Indicador
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base font-normal">
                            A aba INDICADOR da planilha dentro do painel: um parceiro por linha, campanhas por coluna e GMV mês a mês, do mais recente para o mais antigo.
                        </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={exportarCsv}
                                disabled={filtradas.length === 0}
                                className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-lg">download</span>
                                Exportar CSV
                            </button>
                            <button
                                type="button"
                                onClick={() => { onRefresh(); gmv.refresh(); }}
                                disabled={isLoading || isRefreshing}
                                className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className={`material-symbols-outlined text-lg ${(isLoading || isRefreshing || gmv.isLoading) ? 'animate-spin text-primary' : ''}`}>sync</span>
                                {(isLoading || isRefreshing) ? 'Atualizando...' : 'Atualizar agora'}
                            </button>
                        </div>
                        {lastSyncTime && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                Última atualização: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                        )}
                    </div>
                </div>

                {isUsingCache && (
                    <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-400">
                        <span className="material-symbols-outlined shrink-0">cloud_off</span>
                        <div>
                            <p className="text-sm font-semibold">Usando dados em cache</p>
                            <p className="text-sm opacity-90">Exibindo a última versão salva localmente.</p>
                        </div>
                    </div>
                )}

                {(error || gmv.error) && (
                    <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-400">
                        <span className="material-symbols-outlined shrink-0">warning</span>
                        <div>
                            <p className="text-sm font-semibold">{error ? 'Erro ao carregar parceiros' : 'GMV mensal indisponível'}</p>
                            <p className="text-sm opacity-90">
                                {error || `${gmv.error} — mostrando os meses que vieram junto com o CRM.`}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Filtros — equivalem aos menus de filtro do cabeçalho da planilha */}
            <div className="shrink-0 px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar parceiro, ID ou cidade..."
                        className="pl-8 pr-3 py-1.5 w-64 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <select
                    value={cidadeFiltro}
                    onChange={e => setCidadeFiltro(e.target.value)}
                    className="py-1.5 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                    <option value="">Todas as cidades</option>
                    {cidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                    value={contratoFiltro}
                    onChange={e => setContratoFiltro(e.target.value)}
                    className="py-1.5 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                    <option value="">Todo contrato</option>
                    {contratos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {temFiltro && (
                    <button
                        type="button"
                        onClick={() => { setBusca(''); setCidadeFiltro(''); setContratoFiltro(''); }}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
                    >
                        limpar filtros
                    </button>
                )}
                <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs text-slate-400 mr-1">Meses</span>
                    {JANELAS.map(n => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setJanela(n)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${janela === n
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            <div className="shrink-0 px-6 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-200">{filtradas.length}</strong> {filtradas.length === 1 ? 'parceiro' : 'parceiros'}
                    {filtradas.length !== partners.length && <span className="text-slate-400"> · {partners.length} no total</span>}
                </span>
            </div>

            {isLoading && partners.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
                    <p className="text-slate-500 font-medium">Carregando o indicador...</p>
                </div>
            ) : partners.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px] gap-4">
                    <span className="material-symbols-outlined text-5xl text-slate-300">table_chart</span>
                    <p className="text-slate-600 dark:text-slate-300 font-medium text-center max-w-lg">
                        {error || 'Nenhum parceiro carregado.'}
                    </p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <thead className="sticky top-0 z-30">
                            <tr>
                                <th onClick={() => toggleSort('cidade')} className={`${thBase} ${fixa} sticky left-0 z-20 w-44 min-w-[11rem]`}>Cidade {seta('cidade')}</th>
                                <th onClick={() => toggleSort('estabId')} className={`${thBase} ${fixa} sticky left-44 z-20 w-24 min-w-[6rem]`}>Estab_ID {seta('estabId')}</th>
                                <th onClick={() => toggleSort('estabelecimento')} className={`${thBase} ${fixa} border-r sticky left-[17rem] z-20 w-64 min-w-[16rem]`}>Estabelecimento {seta('estabelecimento')}</th>
                                <th onClick={() => toggleSort('contrato')} className={`${thBase} ${fixa}`}>Contrato {seta('contrato')}</th>
                                <th onClick={() => toggleSort('ofertas')} className={`${thBase} ${fixa}`}>Ofertas da casa {seta('ofertas')}</th>
                                <th onClick={() => toggleSort('promos')} className={`${thBase} ${fixa}`}>Super promos {seta('promos')}</th>
                                <th onClick={() => toggleSort('cupom')} className={`${thBase} ${fixa} border-r`}>Cupom parc. {seta('cupom')}</th>
                                {mesesCols.map((m, i) => (
                                    <th
                                        key={`${m.label}-${i}`}
                                        onClick={() => toggleSort(`mes:${i}`)}
                                        className={`${thBase} ${fixa} text-right ${i === 0 ? 'text-slate-700 dark:text-slate-200' : ''}`}
                                    >
                                        {m.label} {seta(`mes:${i}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.map(l => (
                                <LinhaIndicador key={l.partner.estabId} linha={l} onClick={abrirParceiro} />
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-30">
                            <tr className="bg-slate-100 dark:bg-slate-800 font-semibold">
                                <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200 border-t border-slate-300 dark:border-slate-600 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800">Total</td>
                                <td className="border-t border-slate-300 dark:border-slate-600 sticky left-44 z-20 bg-slate-100 dark:bg-slate-800" />
                                <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 border-t border-r border-slate-300 dark:border-slate-600 sticky left-[17rem] z-20 bg-slate-100 dark:bg-slate-800">{filtradas.length} {filtradas.length === 1 ? 'parceiro' : 'parceiros'}</td>
                                <td className="border-t border-slate-300 dark:border-slate-600" />
                                <td className="border-t border-slate-300 dark:border-slate-600" />
                                <td className="border-t border-slate-300 dark:border-slate-600" />
                                <td className="border-t border-r border-slate-300 dark:border-slate-600" />
                                {totais.map((t, i) => (
                                    <td key={i} className={`px-3 py-2 whitespace-nowrap text-right tabular-nums border-t border-slate-300 dark:border-slate-600 ${t < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                                        {t === 0 ? '—' : brl.format(t)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
