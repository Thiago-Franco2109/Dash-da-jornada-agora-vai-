import { useEffect, useRef, useState } from 'react';
import type { PromoCampanhaDetalhe, PromoResumo } from '../../hooks/usePromoStatus';
import { ESTADO_META, textoEspera, textoEsperaCurto } from './promoEstado';
import { classificarCampanha, motivoDaPrioridade, type EntradaPrioridade } from '../../utils/campanhaPrioridade';

/**
 * Célula da coluna Promoções.
 *
 * Duas leituras na mesma altura de linha:
 *  1. TRILHA — um segmento por campanha vigente, sempre na MESMA posição
 *     horizontal (a ordem vem da lista global de campanhas). Isso faz a coluna
 *     ser varrida verticalmente: a 3ª casa é "Promo do Dia" em toda a tabela,
 *     tenha o parceiro item nela ou não. Campanha que não roda na cidade dele
 *     vira um risco fino — ausência de oportunidade, não ausência de trabalho.
 *  2. VEREDITO — uma frase curta que responde "tem promoção no ar?" e, quando
 *     não tem, há quanto tempo a oferta está parada.
 *
 * O detalhe abre num puxadinho ancorado na própria célula (mesmo padrão do
 * seletor de relevância): uma linha por campanha, na ordem da régua de
 * prioridade. Cada linha leva pro CMS.
 */

interface PromoColunaProps {
    resumo?: PromoResumo;
    /** Ordem global das campanhas vigentes (nomes), pra trilha alinhar entre linhas. */
    ordemCampanhas: string[];
    /** `localidade_id` do parceiro — filtra o link do CMS na cidade certa. */
    localidadeId?: string | null;
    /** Posição na tabela: as últimas linhas abrem o puxadinho pra cima. */
    rowIndex: number;
    totalRows: number;
}

function cmsCampanhaUrl(campanhaId: number, localidadeId?: string | null): string {
    const base = `https://admin.bigou.com.br/campanha/promocao/cadastro/${campanhaId}`;
    return localidadeId ? `${base}?localidade_id=${localidadeId}` : base;
}

function entradaPrioridade(d: PromoCampanhaDetalhe): EntradaPrioridade {
    switch (d.status) {
        case 'aprovado': return { noAr: true };
        case 'rascunho': return { rascunho: true };
        case 'caiu': return { caiu: true };
        case 'pendente': return { aguardandoParceiro: true, diasEsperando: d.dias ?? null };
        case 'sem item': return {};
    }
}

/** Rótulo curto do estado, pra caber na linha do puxadinho. */
function rotuloCurto(d: PromoCampanhaDetalhe): string {
    switch (d.status) {
        case 'aprovado': return d.itens.aprovado > 1 ? `${d.itens.aprovado} no ar` : 'no ar';
        case 'pendente': return d.dias != null ? `esperando ${textoEsperaCurto(d.dias)}` : 'esperando';
        case 'rascunho': return 'rascunho';
        case 'caiu': return 'saiu do ar';
        case 'sem item': return 'sem item';
    }
}

/** "1 no ar · 2 fora do ar" — o que existe de item, pro title da linha. */
function textoItens(itens: PromoCampanhaDetalhe['itens']): string {
    const partes: string[] = [];
    if (itens.aprovado) partes.push(`${itens.aprovado} no ar`);
    if (itens.pendente) partes.push(`${itens.pendente} pendente${itens.pendente > 1 ? 's' : ''}`);
    if (itens.rascunho) partes.push(`${itens.rascunho} rascunho${itens.rascunho > 1 ? 's' : ''}`);
    if (itens.morto) partes.push(`${itens.morto} fora do ar`);
    return partes.join(' · ') || 'nenhum item criado';
}

export default function PromoColuna({ resumo, ordemCampanhas, localidadeId, rowIndex, totalRows }: PromoColunaProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!resumo) {
        return <span className="text-[13px] text-slate-300 dark:text-slate-600" title="Carregando status de promoções…">…</span>;
    }

    const porCampanha = new Map(resumo.detalhe.map(d => [d.campanha, d]));
    // Fallback pra quando a lista global ainda não chegou: usa o que o parceiro
    // tem, em ordem alfabética, pra a célula nunca ficar vazia.
    const ordem = ordemCampanhas.length > 0
        ? ordemCampanhas
        : [...porCampanha.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Veredito: a pergunta nº 1 é "tem promoção no ar?". Só quando a resposta é
    // não é que a coluna conta o que travou.
    let veredito: { texto: string; classe: string };
    if (resumo.noAr > 0) {
        veredito = {
            texto: `${resumo.noAr}/${resumo.campanhasCidade || resumo.detalhe.length} no ar`,
            classe: ESTADO_META.aprovado.texto,
        };
    } else if (resumo.pendente > 0) {
        veredito = { texto: `${resumo.pendente} esperando`, classe: ESTADO_META.pendente.texto };
    } else if (resumo.rascunho > 0) {
        veredito = { texto: `${resumo.rascunho} rascunho`, classe: ESTADO_META.rascunho.texto };
    } else if (resumo.caiu > 0) {
        veredito = { texto: 'saiu do ar', classe: ESTADO_META.caiu.texto };
    } else if (resumo.campanhasCidade > 0) {
        veredito = { texto: `0 de ${resumo.campanhasCidade}`, classe: 'text-rose-600 dark:text-rose-400' };
    } else if (resumo.cidadeConhecida) {
        // Cidade conhecida e sem campanha vigente: não há promoção possível hoje.
        veredito = { texto: 'sem campanha', classe: 'text-slate-400 dark:text-slate-500' };
    } else {
        // Sem localidade mapeada (card do Trello): "0 campanhas" seria invenção.
        return (
            <span className="text-[13px] text-slate-300 dark:text-slate-600" title="Cidade do parceiro ainda não mapeada — sem como saber as campanhas dele.">
                —
            </span>
        );
    }

    // Maior score primeiro: agir agora no topo, no ar no fim.
    const linhas = resumo.detalhe
        .map(d => ({ d, score: classificarCampanha(entradaPrioridade(d)).score, motivo: motivoDaPrioridade(entradaPrioridade(d)) }))
        .sort((a, b) => b.score - a.score || a.d.campanha.localeCompare(b.d.campanha, 'pt-BR'));

    const openUpward = totalRows > 3 && rowIndex >= totalRows - 3;

    return (
        <div ref={wrapperRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                title="Ver as campanhas deste parceiro"
                aria-label={`Promoções: ${veredito.texto}. Ver campanhas.`}
                aria-expanded={open}
                className="flex w-[116px] flex-col items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800"
            >
                <span className="flex items-end gap-[3px]" aria-hidden="true">
                    {ordem.map(nome => {
                        const d = porCampanha.get(nome);
                        if (!d) {
                            // Campanha vigente que não roda nesta cidade.
                            return <span key={nome} className="h-[3px] w-[9px] rounded-full bg-slate-200/70 dark:bg-slate-700/60" />;
                        }
                        const meta = ESTADO_META[d.status];
                        return (
                            <span
                                key={nome}
                                className={`h-[11px] w-[9px] rounded-[2px] ${meta.segmento} ${d.status === 'sem item' ? 'ring-1 ring-inset ring-slate-300 dark:ring-slate-600' : ''}`}
                            />
                        );
                    })}
                </span>
                <span className="flex items-center gap-1 leading-none">
                    <span className={`text-[11px] font-bold tabular-nums ${veredito.classe}`}>{veredito.texto}</span>
                    {/* Já tem campanha no ar e ainda há oferta esperando: o "+N" diz
                        que sobrou trabalho, sem roubar a leitura principal. */}
                    {resumo.pendente > 0 && resumo.noAr > 0 && (
                        <span className={`text-[10px] font-bold tabular-nums ${ESTADO_META.pendente.texto}`}>
                            +{resumo.pendente}
                        </span>
                    )}
                    {/* Nada no ar e algo pendente: a idade da oferta é o que diz se
                        vale uma ligação (dias) ou se já é letra morta (meses/anos). */}
                    {resumo.noAr === 0 && resumo.pendente > 0 && resumo.pendenteDiasMax != null && (
                        <span className="text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                            {textoEsperaCurto(resumo.pendenteDiasMax)}
                        </span>
                    )}
                </span>
            </button>

            {open && (
                <div
                    className={`absolute left-1/2 z-50 w-[244px] -translate-x-1/2 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'} rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10`}
                    onClick={e => e.stopPropagation()}
                >
                    {linhas.length === 0 && (
                        <p className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                            Nenhuma campanha vigente nesta cidade.
                        </p>
                    )}
                    {linhas.map(({ d, motivo }) => {
                        const meta = ESTADO_META[d.status];
                        const conteudo = (
                            <>
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${meta.segmento} ${d.status === 'sem item' ? 'ring-1 ring-inset ring-slate-300 dark:ring-slate-600' : ''}`} />
                                <span className="flex-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                    {d.campanha}
                                </span>
                                <span className={`shrink-0 text-[10px] font-bold tabular-nums ${meta.texto}`}>
                                    {rotuloCurto(d)}
                                </span>
                            </>
                        );
                        const title = `${motivo}\n${textoItens(d.itens)}${d.status === 'pendente' && d.dias != null ? `\nParada há ${textoEspera(d.dias)}` : ''}${meta.acao ? `\n→ ${meta.acao}` : ''}`;
                        const classe = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/60';
                        return d.campanhaId != null ? (
                            <a
                                key={d.campanha}
                                href={cmsCampanhaUrl(d.campanhaId, localidadeId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${title}\n\nAbrir no CMS`}
                                className={classe}
                            >
                                {conteudo}
                            </a>
                        ) : (
                            <div key={d.campanha} title={title} className={classe}>{conteudo}</div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
