import { useEffect, useMemo, useRef, useState } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import {
    ARIDADE,
    OPERADORES_POR_TIPO,
    ROTULO_OPERADOR,
    condicaoCompleta,
    novoId,
    type CondicaoFiltro,
    type FiltroComposto,
    type Operador,
    type ValorFiltro,
} from '../config/filtrosJornada';
import {
    SITUACOES_COMUNS,
    type CampoFiltravel,
    type OpcaoCampo,
} from '../config/camposFiltraveis';
import type { ContextoAvaliacao } from '../utils/avaliarFiltro';

/**
 * Construtor de filtros da Lista jornada 28D.
 *
 * Duas regras que governam o componente:
 *  1. Condição NASCE COMPLETA — todo campo tem operador e valor padrão. Nunca
 *     existe chip pela metade nem um instante com a tabela filtrada por nada.
 *  2. O que está escrito é o que filtra — nada de exceção implícita. Por isso
 *     a carteira da sessão aparece como chip, e não como filtro invisível.
 */

interface FilterBarProps {
    filtro: FiltroComposto;
    setFiltro: (f: FiltroComposto) => void;
    campos: CampoFiltravel[];
    pool: EnrichedPerformanceRow[];
    ctx: ContextoAvaliacao;
    /** Quantos passaram (já com a aba de período) e o total do mesmo recorte. */
    exibidos: number;
    total: number;
    abaLabel?: string;
    pausado?: boolean;
    motivoPausa?: string;
    incompletas?: number;
    excluidosSemCarteira?: number;
    onIncluirSemCarteira?: () => void;
}

function semAcento(v: string): string {
    return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function opcoesDoCampo(campo: CampoFiltravel, pool: EnrichedPerformanceRow[]): OpcaoCampo[] {
    if (!campo.opcoes) return [];
    return typeof campo.opcoes === 'function' ? campo.opcoes(pool) : campo.opcoes;
}

function valorPadraoDe(campo: CampoFiltravel, pool: EnrichedPerformanceRow[]): ValorFiltro {
    if (campo.valorPadrao) return campo.valorPadrao;
    if (campo.tipo === 'selecao') {
        const o = opcoesDoCampo(campo, pool);
        return { tipo: 'texto', texto: o[0]?.valor ?? '' };
    }
    if (campo.tipo === 'texto') return { tipo: 'texto', texto: '' };
    if (campo.tipo === 'data') return { tipo: 'nenhum' };
    return { tipo: 'numero', numero: 0 };
}

/** Número vira palavra em 0 e 1 — é como o CS fala. */
function numeroLegivel(n: number, op: Operador, genero: 'm' | 'f' = 'm'): string {
    if (op === 'igual' && n === 0) return genero === 'f' ? 'nenhuma' : 'nenhum';
    if (op === 'maior_ou_igual' && n === 1) return 'pelo menos 1';
    return String(n);
}

function rotuloValor(cond: CondicaoFiltro, campo: CampoFiltravel, pool: EnrichedPerformanceRow[]): string {
    const v = cond.valor;
    switch (v.tipo) {
        case 'nenhum': return '';
        case 'texto': {
            const o = opcoesDoCampo(campo, pool).find(x => x.valor === v.texto);
            return o?.rotulo ?? v.texto;
        }
        case 'numero': return numeroLegivel(v.numero, cond.operador, campo.genero);
        case 'dias': return `${v.dias} dias`;
        case 'faixa': return `${v.de} e ${v.ate}`;
        case 'lista': return v.itens.length === 1 ? v.itens[0] : `${v.itens.length} selecionadas`;
        case 'data': return v.iso.split('-').reverse().join('/');
    }
}

/** O operador some quando é o padrão do campo; aparece quando não é. */
export function rotuloCondicao(cond: CondicaoFiltro, campo: CampoFiltravel, pool: EnrichedPerformanceRow[]): string {
    const aridade = ARIDADE[cond.operador];
    if (aridade === 0) return `${campo.rotulo}: ${ROTULO_OPERADOR[cond.operador]}`;

    const valor = rotuloValor(cond, campo, pool);
    const ehPadrao = cond.operador === campo.operadores[0];
    const numeroJaDiz = cond.valor.tipo === 'numero'
        && ((cond.operador === 'igual' && cond.valor.numero === 0)
            || (cond.operador === 'maior_ou_igual' && cond.valor.numero === 1));

    if (ehPadrao || numeroJaDiz) return `${campo.rotulo}: ${valor}`;
    return `${campo.rotulo}: ${ROTULO_OPERADOR[cond.operador]} ${valor}`;
}

export default function FilterBar({
    filtro, setFiltro, campos, pool, ctx,
    exibidos, total, abaLabel, pausado, motivoPausa,
    incompletas = 0, excluidosSemCarteira = 0, onIncluirSemCarteira,
}: FilterBarProps) {
    const [aberto, setAberto] = useState<'novo' | string | null>(null);
    const [busca, setBusca] = useState('');
    const barraRef = useRef<HTMLDivElement>(null);

    const mapaCampos = useMemo(() => new Map(campos.map(c => [c.id, c])), [campos]);
    const condicoes = filtro.itens.filter((i): i is CondicaoFiltro => i.tipo === 'condicao');

    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => {
            if (barraRef.current && !barraRef.current.contains(e.target as Node)) {
                setAberto(null); setBusca('');
            }
        };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(null); setBusca(''); } };
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [aberto]);

    const atualizar = (itens: FiltroComposto['itens']) => setFiltro({ ...filtro, itens });

    const adicionar = (cond: CondicaoFiltro) => {
        atualizar([...filtro.itens, cond]);
        setAberto(null); setBusca('');
    };

    const adicionarCampo = (campo: CampoFiltravel) => {
        adicionar({
            tipo: 'condicao',
            id: novoId(),
            campoId: campo.id,
            operador: campo.operadores[0],
            valor: valorPadraoDe(campo, pool),
        });
    };

    const editar = (id: string, patch: Partial<CondicaoFiltro>) => {
        atualizar(filtro.itens.map(i => (i.tipo === 'condicao' && i.id === id ? { ...i, ...patch } : i)));
    };

    const remover = (id: string) => atualizar(filtro.itens.filter(i => !(i.tipo === 'condicao' && i.id === id)));

    /** `Limpar` não mexe na carteira da sessão — senão a proteção voltaria pela porta dos fundos. */
    const limpar = () => atualizar(filtro.itens.filter(i => i.tipo === 'condicao' && i.origem === 'sessao'));

    const camposVisiveis = useMemo(() => {
        const q = semAcento(busca);
        if (!q) return campos;
        return campos.filter(c => semAcento(c.rotulo).includes(q) || semAcento(c.grupo).includes(q) || semAcento(c.ajuda ?? '').includes(q));
    }, [campos, busca]);

    const situacoesVisiveis = useMemo(() => {
        const q = semAcento(busca);
        if (!q) return SITUACOES_COMUNS;
        return SITUACOES_COMUNS.filter(s => semAcento(s.rotulo).includes(q));
    }, [busca]);

    const porGrupo = useMemo(() => {
        const m = new Map<string, CampoFiltravel[]>();
        for (const c of camposVisiveis) {
            if (!m.has(c.grupo)) m.set(c.grupo, []);
            m.get(c.grupo)!.push(c);
        }
        return [...m.entries()];
    }, [camposVisiveis]);

    const temGestor = condicoes.some(c => c.campoId === 'analista' && condicaoCompleta(c));

    return (
        <div ref={barraRef} className="shrink-0 px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="flex items-start gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    {condicoes.map((cond, idx) => {
                        const campo = mapaCampos.get(cond.campoId);
                        if (!campo) return null;
                        const ehSessao = cond.origem === 'sessao';
                        return (
                            <div key={cond.id} className="flex items-center gap-2">
                                {idx > 0 && (
                                    idx === 1 ? (
                                        <button
                                            onClick={() => setFiltro({ ...filtro, juncao: filtro.juncao === 'e' ? 'ou' : 'e' })}
                                            className="text-[11px] font-bold text-slate-400 hover:text-primary px-1"
                                            title={filtro.juncao === 'e'
                                                ? 'Precisa passar em todas as condições. Clique para trocar para "ou".'
                                                : 'Basta passar em uma das condições. Clique para trocar para "e".'}
                                        >
                                            {filtro.juncao}
                                        </button>
                                    ) : <span className="text-[11px] text-slate-300 px-1">{filtro.juncao}</span>
                                )}
                                <div className={`group/chip relative flex items-center h-7 rounded-lg border text-xs ${
                                    ehSessao
                                        ? 'border-primary/20 bg-primary/5 text-primary'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                }`}>
                                    <button
                                        onClick={() => setAberto(aberto === cond.id ? null : cond.id)}
                                        className="px-2.5 h-full font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-l-lg"
                                        title={campo.ajuda}
                                    >
                                        {rotuloCondicao(cond, campo, pool)}
                                    </button>
                                    <button
                                        onClick={() => remover(cond.id)}
                                        className="px-1.5 h-full text-slate-400 hover:text-red-500 rounded-r-lg"
                                        title="Remover filtro"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                    {aberto === cond.id && (
                                        <EditorValor
                                            cond={cond} campo={campo} pool={pool}
                                            onChange={patch => editar(cond.id, patch)}
                                            onTrocarCampo={() => setAberto('novo')}
                                            onFechar={() => setAberto(null)}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <div className="relative">
                        <button
                            onClick={() => { setAberto(aberto === 'novo' ? null : 'novo'); setBusca(''); }}
                            className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-500 hover:text-primary hover:border-primary transition-colors"
                            title="Adicionar filtro"
                        >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            {condicoes.length === 0 && 'Filtro'}
                        </button>

                        {aberto === 'novo' && (
                            <div className="absolute z-40 left-0 top-9 w-80 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
                                <div className="sticky top-0 bg-white dark:bg-slate-800 p-2 border-b border-slate-100 dark:border-slate-700">
                                    <input
                                        autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                                        placeholder="Buscar campo…"
                                        className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>

                                {situacoesVisiveis.length > 0 && (
                                    <div className="p-1.5">
                                        <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Situações comuns</p>
                                        {situacoesVisiveis.map(s => (
                                            <button key={s.id} onClick={() => adicionar(s.condicao())}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                                                <span className="material-symbols-outlined text-[16px] text-slate-400">{s.icone}</span>
                                                {s.rotulo}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {porGrupo.map(([grupo, lista]) => (
                                    <div key={grupo} className="p-1.5 border-t border-slate-100 dark:border-slate-700">
                                        <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{grupo}</p>
                                        {lista.map(campo => {
                                            const indisponivel = campo.disponivel ? !campo.disponivel(ctx) : false;
                                            return (
                                                <button key={campo.id} disabled={indisponivel}
                                                    onClick={() => adicionarCampo(campo)}
                                                    className={`w-full px-2 py-1.5 rounded-lg text-left text-xs ${
                                                        indisponivel
                                                            ? 'opacity-50 cursor-not-allowed text-slate-400'
                                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                    }`}>
                                                    <span className="block font-medium">{campo.rotulo}</span>
                                                    {(indisponivel ? campo.indisponivelMsg : campo.ajuda) && (
                                                        <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">
                                                            {indisponivel ? campo.indisponivelMsg : campo.ajuda}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}

                                {porGrupo.length === 0 && situacoesVisiveis.length === 0 && (
                                    <div className="p-6 text-center">
                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nenhum campo com esse nome</p>
                                        <p className="text-[11px] text-slate-400 mt-1">Tente "promoção", "cidade", "prioridade" ou "contato".</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {condicoes.length === 0 && (
                        <span className="text-xs text-slate-400">Filtre por promoções, cidade, prioridade…</span>
                    )}
                    {condicoes.filter(c => c.origem !== 'sessao').length >= 2 && (
                        <button onClick={limpar} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Limpar</button>
                    )}
                </div>

                <div className="shrink-0 text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {pausado ? (
                            <span className="text-slate-400">{motivoPausa ?? 'Carregando…'}</span>
                        ) : (
                            <>
                                <strong className="text-slate-700 dark:text-slate-200">{exibidos}</strong>
                                {exibidos !== total && <> de {total}</>} parceiros
                                {abaLabel && <span className="text-slate-400"> · {abaLabel}</span>}
                            </>
                        )}
                    </p>
                    {!temGestor && !pausado && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">Mostrando parceiros de todos os gestores</p>
                    )}
                    {incompletas > 0 && (
                        <p className="text-[11px] text-slate-400">{incompletas} condição sem valor, ignorada</p>
                    )}
                    {excluidosSemCarteira > 0 && onIncluirSemCarteira && (
                        <p className="text-[11px] text-slate-400">
                            {excluidosSemCarteira} em onboarding sem cidade ficaram de fora —{' '}
                            <button onClick={onIncluirSemCarteira} className="text-primary font-semibold hover:underline">incluir</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function EditorValor({ cond, campo, pool, onChange, onTrocarCampo, onFechar }: {
    cond: CondicaoFiltro;
    campo: CampoFiltravel;
    pool: EnrichedPerformanceRow[];
    onChange: (patch: Partial<CondicaoFiltro>) => void;
    onTrocarCampo: () => void;
    onFechar: () => void;
}) {
    const opcoes = opcoesDoCampo(campo, pool);
    const operadores = campo.operadores.length ? campo.operadores : OPERADORES_POR_TIPO[campo.tipo];
    const aridade = ARIDADE[cond.operador];

    return (
        <div className="absolute z-40 left-0 top-9 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{campo.rotulo}</span>
                <button onClick={onTrocarCampo} className="text-[11px] text-primary hover:underline">Trocar campo</button>
            </div>
            {campo.ajuda && <p className="text-[10px] text-slate-400 leading-tight">{campo.ajuda}</p>}

            <select
                value={cond.operador}
                onChange={e => onChange({ operador: e.target.value as Operador })}
                className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none"
            >
                {operadores.map(op => <option key={op} value={op}>{ROTULO_OPERADOR[op]}</option>)}
            </select>

            {aridade > 0 && campo.tipo === 'selecao' && (
                <select
                    value={cond.valor.tipo === 'texto' ? cond.valor.texto : ''}
                    onChange={e => onChange({ valor: { tipo: 'texto', texto: e.target.value } })}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none"
                >
                    {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
            )}

            {aridade > 0 && (campo.tipo === 'numero' || campo.tipo === 'contagem') && (
                <input
                    type="number" autoFocus
                    value={cond.valor.tipo === 'numero' ? cond.valor.numero : ''}
                    onChange={e => onChange({ valor: { tipo: 'numero', numero: e.target.value === '' ? NaN : Number(e.target.value) } })}
                    onKeyDown={e => { if (e.key === 'Enter') onFechar(); }}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none"
                />
            )}

            {aridade > 0 && campo.tipo === 'data' && (
                <input
                    type="number" autoFocus placeholder="dias"
                    value={cond.valor.tipo === 'dias' ? cond.valor.dias : ''}
                    onChange={e => onChange({ valor: { tipo: 'dias', dias: e.target.value === '' ? NaN : Number(e.target.value) } })}
                    onKeyDown={e => { if (e.key === 'Enter') onFechar(); }}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none"
                />
            )}

            {aridade > 0 && campo.tipo === 'texto' && (
                <input
                    autoFocus
                    value={cond.valor.tipo === 'texto' ? cond.valor.texto : ''}
                    onChange={e => onChange({ valor: { tipo: 'texto', texto: e.target.value } })}
                    onKeyDown={e => { if (e.key === 'Enter') onFechar(); }}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none"
                />
            )}
        </div>
    );
}
