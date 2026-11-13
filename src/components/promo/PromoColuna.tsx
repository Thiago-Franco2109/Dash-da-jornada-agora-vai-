import { useEffect, useRef, useState } from 'react';
import type { PromoCampanhaDetalhe, PromoResumo } from '../../hooks/usePromoStatus';
import {
    ESTADO_META, VEZ_META, STATUS_CS_PROMO, contarSlots, slotDaCampanha,
    textoEspera, textoEsperaCurto, textoIdadeDado, vezDaPromocao,
    type MarcaCampanha,
} from './promoEstado';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import { comemorarPromoAtiva } from './celebracao';
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
 *  2. VEREDITO — responde "tem promoção no ar?" e, quando não tem, "de quem é
 *     a vez?" (ver `vezDaPromocao`). Com a bola do lado do CS o texto é um
 *     VERBO — criar oferta / publicar / reativar — porque a coluna serve pra
 *     achar trabalho, e placar ("0 de 4") não diz o que fazer.
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
    /** Falha ao carregar o `promo-status`. Sem isto a célula só sabe dizer "não sei". */
    erro?: string | null;
    /** Tentar de novo — vale pra tabela inteira (o dado é um fetch só). */
    onRetry?: () => void;
    /** O que o CS marcou em cada campanha (por NOME da campanha). */
    marcas?: Record<string, MarcaCampanha | undefined>;
    /** Até onde o dado da réplica enxerga — define quando a marcação expira. */
    dadoAte?: Date | null;
    /** Idade do dado em minutos, só pra escrever "23h atrás" no rodapé. */
    atrasoMinutos?: number | null;
    /** Grava o status do CS numa campanha. `null` volta pro vazio.
     *  Ausente = célula só leitura. */
    onMarcarCampanha?: (campanha: string, status: PromoStatus | null) => void;
    /** Falha ao gravar a marcação (tabela ausente, RLS, offline). Sem isto a
     *  reversão otimista é indistinguível de "o clique não funcionou". */
    erroMarcacao?: string | null;
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

export default function PromoColuna({ resumo, ordemCampanhas, localidadeId, rowIndex, totalRows, erro, onRetry, marcas, dadoAte, atrasoMinutos, onMarcarCampanha, erroMarcacao }: PromoColunaProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    /** Qual linha do puxadinho está com o seletor aberto. */
    const [editando, setEditando] = useState<string | null>(null);

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

    // Os três estados sem dado precisam ser DIFERENTES entre si. Antes os três
    // saíam como o mesmo tracinho cinza, e "a coluna quebrou" ficava
    // indistinguível de "essa loja não tem cidade mapeada" — foi o que fez uma
    // falha de carregamento passar por bug de dado.
    if (!resumo) {
        if (erro) {
            return (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onRetry?.(); }}
                    disabled={!onRetry}
                    title={`Não foi possível carregar o status de promoções.\n${erro}${onRetry ? '\n\nClique pra tentar de novo.' : ''}`}
                    aria-label="Falha ao carregar promoções. Tentar de novo."
                    className="inline-flex w-[116px] items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-default dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                    <span className="material-symbols-outlined text-[14px] leading-none">sync_problem</span>
                    falhou
                </button>
            );
        }
        // Carregando: esqueleto da trilha, na largura final, pra ler como
        // "ainda vem" e não como um valor.
        return (
            <span className="inline-flex w-[116px] animate-pulse justify-center gap-[3px] py-1" title="Carregando status de promoções…" aria-label="Carregando promoções">
                {Array.from({ length: Math.max(ordemCampanhas.length, 4) }).map((_, i) => (
                    <span key={i} className="h-[11px] w-[9px] rounded-[2px] bg-slate-200 dark:bg-slate-700" />
                ))}
            </span>
        );
    }

    const porCampanha = new Map(resumo.detalhe.map(d => [d.campanha, d]));
    // Fallback pra quando a lista global ainda não chegou: usa o que o parceiro
    // tem, em ordem alfabética, pra a célula nunca ficar vazia.
    const ordem = ordemCampanhas.length > 0
        ? ordemCampanhas
        : [...porCampanha.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Veredito: a pergunta nº 1 é "tem promoção no ar?", e quando a resposta é
    // não, a segunda é "de quem é a vez?" (ver vezDaPromocao). Quando a bola é
    // do CS o veredito é um VERBO, não um placar — "0 de 4" dizia o tamanho do
    // buraco e não dizia o que fazer com ele.
    const marcasDaLinha = marcas ?? {};
    const slots = contarSlots(resumo, marcasDaLinha, dadoAte);
    const faltaCriar = slots.faltaCriar;
    const vez = vezDaPromocao(resumo, slots);
    const vezMeta = VEZ_META[vez];

    if (vez === 'desconhecido') {
        // Sem localidade mapeada (card do Trello): "0 campanhas" seria invenção.
        return (
            <span className={`text-[13px] ${vezMeta.texto}`} title={vezMeta.descricao}>—</span>
        );
    }

    const totalCampanhas = resumo.campanhasCidade || resumo.detalhe.length;
    const textoVeredito =
        vez === 'no_ar' ? `${resumo.noAr}/${totalCampanhas} no ar`
        : vez === 'parceiro' ? `${resumo.pendente} esperando`
        : vez === 'cs_publicar' ? (resumo.rascunho > 1 ? `publicar ${resumo.rascunho}` : 'publicar')
        : vez === 'aguardando_banco' ? 'criada · aguarda'
        // Verbo + quantos slots continuam vazios: diz o que fazer E o tamanho.
        : vez === 'cs_criar' && faltaCriar > 1 ? `criar ${faltaCriar}`
        : vezMeta.label;
    const veredito = { texto: textoVeredito, classe: vezMeta.texto };

    // Maior score primeiro: agir agora no topo, no ar no fim.
    const linhas = resumo.detalhe
        .map(d => ({ d, score: classificarCampanha(entradaPrioridade(d)).score, motivo: motivoDaPrioridade(entradaPrioridade(d)) }))
        .sort((a, b) => b.score - a.score || a.d.campanha.localeCompare(b.d.campanha, 'pt-BR'));

    const openUpward = totalRows > 3 && rowIndex >= totalRows - 3;
    const idadeDado = textoIdadeDado(atrasoMinutos ?? null);

    return (
        <div ref={wrapperRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                title={`${vezMeta.descricao}\n\n${totalCampanhas} campanha${totalCampanhas === 1 ? '' : 's'} na cidade · ${resumo.noAr} no ar · ${resumo.pendente} esperando o parceiro · ${resumo.semItem} sem item\n\nClique pra ver campanha a campanha.`}
                aria-label={`Promoções: ${veredito.texto}. ${vezMeta.descricao} Ver campanhas.`}
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
                    className={`absolute left-1/2 z-50 w-[268px] -translate-x-1/2 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'} rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10`}
                    onClick={e => e.stopPropagation()}
                >
                    {linhas.length === 0 && (
                        <p className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                            Nenhuma campanha vigente nesta cidade.
                        </p>
                    )}
                    {linhas.map(({ d, motivo }) => {
                        const slot = slotDaCampanha(d, marcasDaLinha[d.campanha], dadoAte);
                        const aberto = editando === d.campanha;
                        const opcaoCs = slot.fonte === 'cs'
                            ? STATUS_CS_PROMO.find(o => o.valor === slot.status)
                            : undefined;
                        const metaBanco = slot.fonte === 'banco' ? ESTADO_META[slot.status] : undefined;

                        const title = slot.fonte === 'banco'
                            ? `${motivo}\n${textoItens(d.itens)}${slot.status === 'pendente' && d.dias != null ? `\nParada há ${textoEspera(d.dias)}` : ''}${metaBanco?.acao ? `\n→ ${metaBanco.acao}` : ''}`
                            : slot.fonte === 'cs'
                                ? `Você marcou "${opcaoCs?.label}". O banco ainda não enxerga — some sozinho quando ele alcançar.`
                                : 'Sem item no banco e sem marcação: falta criar esta oferta no painel.';

                        return (
                            <div key={d.campanha} className="relative">
                                <div className="flex w-full items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-50 dark:hover:bg-slate-700/60">
                                    {/* Quadradinho da trilha. Vazio = contorno tracejado:
                                        slot por preencher, não um estado a mais. */}
                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${
                                        slot.fonte === 'banco' ? metaBanco!.segmento
                                        : slot.fonte === 'cs' ? 'bg-sky-400/70'
                                        : 'border border-dashed border-slate-300 dark:border-slate-600'
                                    }`} />

                                    {/* O nome leva pro CMS, que é onde a oferta nasce. */}
                                    {d.campanhaId != null ? (
                                        <a
                                            href={cmsCampanhaUrl(d.campanhaId, localidadeId)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={`${title}\n\nAbrir no CMS`}
                                            className="flex-1 truncate text-left text-[11px] font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                                        >
                                            {d.campanha}
                                        </a>
                                    ) : (
                                        <span title={title} className="flex-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                            {d.campanha}
                                        </span>
                                    )}

                                    {/* O estado. Vindo do banco é só leitura — ele manda.
                                        Vazio ou marcação do CS vira botão: é o que o CS controla. */}
                                    {slot.fonte === 'banco' ? (
                                        <span title={title} className={`shrink-0 text-[10px] font-bold tabular-nums ${metaBanco!.texto}`}>
                                            {rotuloCurto({ ...d, status: slot.status })}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={!onMarcarCampanha}
                                            onClick={e => { e.stopPropagation(); setEditando(aberto ? null : d.campanha); }}
                                            title={onMarcarCampanha ? `${title}\n\nClique pra marcar em que pé está.` : title}
                                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                                                slot.fonte === 'cs'
                                                    ? `${opcaoCs?.texto} hover:bg-slate-100 dark:hover:bg-slate-700`
                                                    : 'border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                            } disabled:cursor-default`}
                                        >
                                            {slot.fonte === 'cs' ? opcaoCs?.curto ?? slot.status : 'marcar'}
                                        </button>
                                    )}
                                </div>

                                {aberto && onMarcarCampanha && (
                                    <div className="mt-0.5 rounded-lg bg-slate-50 p-1 dark:bg-slate-900/60">
                                        {STATUS_CS_PROMO.map(o => (
                                            <button
                                                key={o.valor}
                                                type="button"
                                                onClick={e => {
                                                    onMarcarCampanha(d.campanha, o.valor);
                                                    setEditando(null);
                                                    // Só "Promo ativa" comemora: é o estado que fecha a
                                                    // tarefa. Comemorar "aguardando retorno" premiaria
                                                    // o meio do caminho.
                                                    if (o.valor === 'ativo') comemorarPromoAtiva(e.currentTarget, d.campanha);
                                                }}
                                                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:bg-white dark:hover:bg-slate-700 ${o.texto}`}
                                            >
                                                <span className="material-symbols-outlined text-[13px] leading-none">{o.icone}</span>
                                                {o.label}
                                            </button>
                                        ))}
                                        {slot.fonte === 'cs' && (
                                            <button
                                                type="button"
                                                onClick={() => { onMarcarCampanha(d.campanha, null); setEditando(null); }}
                                                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-slate-400 transition hover:bg-white dark:hover:bg-slate-700"
                                            >
                                                <span className="material-symbols-outlined text-[13px] leading-none">backspace</span>
                                                Limpar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* A idade do dado fica à vista: a réplica atrasa ~1 dia (medido:
                        23h em 10/11/2026), e sem isso a coluna apresenta ontem como
                        agora. É também o que faz a marcação do CS expirar sozinha. */}
                    {idadeDado && (
                        <p className="mt-1 border-t border-slate-100 px-2 pb-0.5 pt-1.5 text-[10px] leading-tight text-slate-400 dark:border-slate-700 dark:text-slate-500">
                            Estado do banco: {idadeDado}.
                        </p>
                    )}
                    {erroMarcacao && (
                        <p
                            className="mt-1 flex items-start gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-semibold leading-tight text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                            title={erroMarcacao}
                        >
                            <span className="material-symbols-outlined text-[13px] leading-none">error</span>
                            <span>Não salvou a marcação — ela volta ao recarregar. {erroMarcacao}</span>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
