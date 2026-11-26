import { useEffect, useRef, useState } from 'react';
import type { PromoCampanhaDetalhe, PromoResumo } from '../../hooks/usePromoStatus';
import {
    ESTADO_META, VEZ_META, STATUS_CS_PROMO, contarSlots, slotDaCampanha,
    textoEspera, textoEsperaCurto, textoIdadeDado, vezDaPromocao,
    type MarcaCampanha,
} from './promoEstado';
import { comemorarPromoAtiva, comemorarParceiroCompleto } from './celebracao';
import { classificarCampanha, motivoDaPrioridade, type EntradaPrioridade } from '../../utils/campanhaPrioridade';

/**
 * Célula da coluna Promoções.
 *
 * Duas leituras na mesma altura de linha:
 *  1. TRILHA — um segmento por campanha que CONTA pra este parceiro, na ordem
 *     global das campanhas (então dentro de uma mesma cidade a posição é
 *     estável). Campanha que não roda na cidade dele, ou que o CS tirou da
 *     conta, simplesmente não aparece.
 *
 *     Antes elas ficavam como um risco fino, pra toda linha ter as mesmas
 *     casas e a coluna poder ser varrida verticalmente. Saiu por dois motivos:
 *     o alinhamento entre linhas comparava pouco (cada cidade roda um conjunto
 *     diferente de campanhas) e o risco não era lido como "não há oportunidade
 *     aqui". Sem ele, a trilha é só o que dá pra fazer — e quem fechou a conta
 *     vê os verdes num bloco contíguo, que é o retorno visual de ter terminado.
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
    /** Grava o valor do campo da campanha no card ("Ativou" / "Não ofertado").
     *  `null` limpa o campo. Ausente = célula só leitura. */
    onMarcarCampanha?: (campanha: string, valor: string | null) => void;
    /** Falha ao gravar a marcação (tabela ausente, RLS, offline). Sem isto a
     *  reversão otimista é indistinguível de "o clique não funcionou". */
    erroMarcacao?: string | null;
    /** Nome do parceiro, pra faixa de comemoração dizer de quem fechou a conta. */
    parceiro?: string;
    /** Card deste parceiro no quadro "[SC] Onboarding e Jornada". É onde o
     *  status da campanha é gravado, então o atalho vive aqui.
     *  Ausente = parceiro sem card: não há onde salvar, e a marcação some. */
    cardTrello?: { url: string; lista: string };
    /** Cria o card deste parceiro no quadro. Só aparece quando não há card. */
    onCriarCard?: () => void;
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

export default function PromoColuna({ resumo, ordemCampanhas, localidadeId, rowIndex, totalRows, erro, onRetry, marcas, dadoAte, atrasoMinutos, onMarcarCampanha, erroMarcacao, parceiro, cardTrello, onCriarCard }: PromoColunaProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    /** Qual linha do puxadinho está com o seletor aberto. */
    const [editando, setEditando] = useState<string | null>(null);
    /** As campanhas ocultas na cidade ficam escondidas por padrão — mostrá-las é
     *  justamente o que a marcação evita. O botão existe pra desfazer. */
    const [verOcultas, setVerOcultas] = useState(false);

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

    // Sem card no quadro não há onde gravar. Oferecer "marcar" aqui seria um
    // botão que sempre falha — pior que não ter botão. A marcação some e o
    // rodapé passa a oferecer criar o card, que é o conserto de verdade.
    const podeMarcar = Boolean(onMarcarCampanha && cardTrello);

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
                        // Campanha que não conta pra este parceiro (não roda na cidade,
                        // ou o CS tirou da conta) não ocupa espaço: some. O lugar
                        // guardado virava um risco que ninguém lia como ausência de
                        // oportunidade — lia como sujeira. Sem ele, a trilha mostra só
                        // o que dá pra fazer aqui, e quem fechou a conta vê os verdes
                        // encostados num bloco só.
                        if (!d) return null;
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
                            {resumo.naoOfertadas.length > 0
                                // Com tudo marcado como não ofertado, "nenhuma campanha
                                // vigente" seria mentira: elas existem, foi o CS que as
                                // tirou da conta — e isso tem que ficar dito.
                                ? 'Todas as campanhas desta cidade estão fora da conta.'
                                : 'Nenhuma campanha vigente nesta cidade.'}
                        </p>
                    )}
                    {linhas.map(({ d, motivo }) => {
                        const slot = slotDaCampanha(d, marcasDaLinha[d.campanha], dadoAte);
                        const aberto = editando === d.campanha;
                        const opcaoCs = slot.fonte === 'cs'
                            ? STATUS_CS_PROMO.find(o => o.valor === slot.status)
                            : undefined;
                        const metaBanco = slot.fonte === 'banco' ? ESTADO_META[slot.status] : undefined;

                        // Marcar esta campanha como não ofertada deixaria o parceiro
                        // com tudo no ar? É o que decide se há conclusão a comemorar
                        // (e o selo "fecha" no botão, pra ele ver antes de clicar).
                        const fecharia = resumo.noAr > 0
                            && resumo.detalhe.every(x => x.campanha === d.campanha || x.status === 'aprovado');

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
                                        // Item vivo no banco: só leitura — "saiu do ar" e "sem item"
                                        // continuam clicáveis porque é olhando um deles que se
                                        // percebe que a campanha não vai acontecer ali.
                                        podeMarcar ? (
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); setEditando(aberto ? null : d.campanha); }}
                                                title={`${title}\n\nClique pra marcar no card.`}
                                                className={`shrink-0 rounded-md px-1 py-0.5 text-[10px] font-bold tabular-nums transition hover:bg-slate-100 dark:hover:bg-slate-700 ${metaBanco!.texto}`}
                                            >
                                                {rotuloCurto({ ...d, status: slot.status })}
                                            </button>
                                        ) : (
                                            <span title={title} className={`shrink-0 text-[10px] font-bold tabular-nums ${metaBanco!.texto}`}>
                                                {rotuloCurto({ ...d, status: slot.status })}
                                            </span>
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={!podeMarcar}
                                            onClick={e => { e.stopPropagation(); setEditando(aberto ? null : d.campanha); }}
                                            title={podeMarcar
                                                ? `${title}\n\nClique pra marcar no card do Trello.`
                                                : `${title}\n\nSem card no quadro: não há onde salvar a marcação.`}
                                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                                                slot.fonte === 'cs'
                                                    ? `${opcaoCs?.texto} hover:bg-slate-100 dark:hover:bg-slate-700`
                                                    : 'border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                            } disabled:cursor-default`}
                                        >
                                            {slot.fonte === 'cs' ? opcaoCs?.curto ?? slot.status : podeMarcar ? 'marcar' : '—'}
                                        </button>
                                    )}
                                </div>

                                {aberto && podeMarcar && onMarcarCampanha && (
                                    <div className="mt-0.5 rounded-lg bg-slate-50 p-1 dark:bg-slate-900/60">
                                        {/* As opções são as do campo do card — o painel não pode
                                            oferecer estado que o Trello não sabe guardar. */}
                                        {STATUS_CS_PROMO.map(o => (
                                            <button
                                                key={o.valor}
                                                type="button"
                                                onClick={e => {
                                                    onMarcarCampanha(d.campanha, o.valor);
                                                    setEditando(null);
                                                    if (o.valor === 'Ativou') {
                                                        comemorarPromoAtiva(e.currentTarget, d.campanha);
                                                    } else if (o.tiraDaConta && fecharia) {
                                                        // Só "Não roda na cidade" pode fechar a conta.
                                                        // "Não ofertado" é trabalho pendente — comemorar
                                                        // ali premiaria marcar o que ainda falta fazer.
                                                        comemorarParceiroCompleto(e.currentTarget, parceiro ?? 'Parceiro', resumo.noAr);
                                                    }
                                                }}
                                                title={o.ajuda}
                                                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:bg-white dark:hover:bg-slate-700 ${o.texto}`}
                                            >
                                                <span className="material-symbols-outlined text-[13px] leading-none">{o.icone}</span>
                                                <span className="flex-1">{o.label}</span>
                                                {o.tiraDaConta && (
                                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                                        tira da conta
                                                    </span>
                                                )}
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

                    {/* Campanhas marcadas como "Não roda na cidade" no card. Ficam recolhidas
                        — o ponto da marcação é sumir — mas nunca invisíveis: sem um
                        jeito de desfazer, uma marcação errada vira dado permanente que
                        ninguém sabe de onde veio. */}
                    {resumo.naoOfertadas.length > 0 && (
                        <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setVerOcultas(v => !v); }}
                                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[10px] font-semibold text-slate-400 transition hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-700/60"
                            >
                                <span className="material-symbols-outlined text-[12px] leading-none">location_off</span>
                                <span className="flex-1">
                                    {resumo.naoOfertadas.length} fora da conta
                                </span>
                                <span className="material-symbols-outlined text-[13px] leading-none">
                                    {verOcultas ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                            {verOcultas && resumo.naoOfertadas.map(nome => (
                                <div key={nome} className="flex items-center gap-2 rounded-md px-2 py-1">
                                    <span className="h-2.5 w-0.5 shrink-0 rounded-full bg-slate-200 dark:bg-slate-600" />
                                    <span className="flex-1 truncate text-[11px] text-slate-400 line-through dark:text-slate-500">
                                        {nome}
                                    </span>
                                    {onMarcarCampanha && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); onMarcarCampanha(nome, null); }}
                                            title={`Limpa o campo "${nome}" no card e devolve a campanha à conta deste parceiro.`}
                                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                                        >
                                            voltar
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Sem card não há onde gravar. Em vez de um botão de marcar que
                        falha no clique, o rodapé diz o que está faltando e oferece o
                        conserto. */}
                    {!cardTrello && (
                        <div className="mt-1 border-t border-slate-100 px-2 pb-0.5 pt-1.5 dark:border-slate-700">
                            <p className="text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                                Sem card no quadro da jornada — não há onde salvar a marcação.
                            </p>
                            {onCriarCard && (
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onCriarCard(); }}
                                    title={`Cria o card de ${parceiro ?? 'parceiro'} na lista de entrada do quadro, no padrão "{id} - {nome}".`}
                                    className="mt-1 flex w-full items-center gap-1.5 rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40"
                                >
                                    <span className="material-symbols-outlined text-[13px] leading-none">add_card</span>
                                    Criar card no Trello
                                </button>
                            )}
                        </div>
                    )}

                    {/* Atalho pro card. O status das campanhas também é mantido à mão
                        nos campos personalizados dele, então ir pra lá é a
                        continuação natural do que se faz aqui. */}
                    {cardTrello && (
                        <a
                            href={cardTrello.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title={`Abrir o card de ${parceiro ?? 'parceiro'} no Trello${cardTrello.lista ? ` — hoje na lista "${cardTrello.lista}"` : ''}.`}
                            className="mt-1 flex items-center gap-1.5 rounded-lg border-t border-slate-100 px-2 pb-0.5 pt-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-slate-700 dark:text-sky-400 dark:hover:bg-sky-900/20"
                        >
                            <span className="material-symbols-outlined text-[13px] leading-none">open_in_new</span>
                            <span className="flex-1 truncate">Abrir card no Trello</span>
                            {cardTrello.lista && (
                                <span className="shrink-0 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                    {cardTrello.lista}
                                </span>
                            )}
                        </a>
                    )}

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
