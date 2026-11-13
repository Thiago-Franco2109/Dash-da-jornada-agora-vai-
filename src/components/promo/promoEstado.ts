import type { PromoCampanhaDetalhe, PromoCampanhaStatus, PromoResumo } from '../../hooks/usePromoStatus';
import type { PromoStatus } from '../../hooks/useStatusOverride';

/**
 * Vocabulário único dos 5 estados de campanha por parceiro — a coluna
 * Promoções, o modal e a aba do parceiro falam todos daqui.
 *
 * Regra de cor: cada estado tem UMA cor, e ela diz de quem é a bola.
 *   emerald = no ar (nada a fazer)   amber = bola com o parceiro
 *   slate   = bola com o CS          rose  = o cliente não vê nada hoje
 */
export interface EstadoMeta {
    /** Rótulo curto, usado em badge e legenda. */
    label: string;
    /** O que o estado significa, em uma frase — vira title/legenda. */
    descricao: string;
    /** Próximo passo do CS. Vazio quando não há o que fazer. */
    acao: string;
    icone: string;
    /** Classe de fundo do segmento da trilha. */
    segmento: string;
    /** Texto/badge. */
    texto: string;
    badge: string;
}

export const ESTADO_META: Record<PromoCampanhaStatus, EstadoMeta> = {
    aprovado: {
        label: 'No ar',
        descricao: 'Item aprovado e ativo — o cliente vê a promoção no app.',
        acao: '',
        icone: 'check_circle',
        segmento: 'bg-emerald-500',
        texto: 'text-emerald-700 dark:text-emerald-400',
        badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
    },
    pendente: {
        label: 'Esperando o parceiro',
        descricao: 'Oferta pronta no painel do parceiro, aguardando ele aceitar.',
        acao: 'Falar com o parceiro pra ele aceitar.',
        icone: 'hourglass_top',
        segmento: 'bg-amber-500',
        texto: 'text-amber-700 dark:text-amber-400',
        badge: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20',
    },
    rascunho: {
        label: 'Rascunho',
        descricao: 'Item começado no CMS e nunca publicado — o parceiro nem viu.',
        acao: 'Terminar e publicar o item no CMS.',
        icone: 'edit_note',
        segmento: 'bg-slate-400 dark:bg-slate-500',
        texto: 'text-slate-600 dark:text-slate-300',
        badge: 'bg-slate-100 text-slate-600 ring-slate-300/70 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600',
    },
    caiu: {
        label: 'Saiu do ar',
        descricao: 'Tinha item nesta campanha e ele foi arquivado ou desativado.',
        acao: 'Reativar: o parceiro já aceitou uma vez.',
        icone: 'history_toggle_off',
        segmento: 'bg-rose-400',
        texto: 'text-rose-700 dark:text-rose-400',
        badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20',
    },
    'sem item': {
        label: 'Sem item',
        descricao: 'A campanha roda na cidade e o parceiro não tem nenhum item nela.',
        acao: 'Ofertar a campanha e montar o item.',
        icone: 'radio_button_unchecked',
        segmento: 'bg-slate-200 dark:bg-slate-600',
        texto: 'text-slate-500 dark:text-slate-400',
        badge: 'bg-white text-slate-500 ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600',
    },
};

/** Ordem em que os estados aparecem na legenda e no resumo do modal. */
export const ORDEM_ESTADOS: PromoCampanhaStatus[] = ['aprovado', 'pendente', 'rascunho', 'caiu', 'sem item'];


// ──────────────────────────────────────────────────────────────────────────
// SLOT DA CAMPANHA — o que mostrar numa linha do puxadinho.
//
// Três fontes, nesta ordem:
//   banco  → tem item vivo: o banco manda, ponto.
//   cs     → banco vazio e o CS marcou. É marcação, não item.
//   vazio  → ninguém sabe de nada. Fica EM BRANCO de propósito: slot vazio
//            convida a preencher, e é assim que se enxerga o que falta criar.
//
// A réplica atrasa ~1 dia, então sem a camada `cs` a coluna cobra oferta que
// foi criada hoje de manhã e segue cobrando até amanhã.
// ──────────────────────────────────────────────────────────────────────────

/** Os status que o CS escolhe por campanha. `null` = vazio (falta criar). */
export const STATUS_CS_PROMO: { valor: PromoStatus; label: string; curto: string; icone: string; texto: string }[] = [
    // `curto` é o que cabe na linha do puxadinho ao lado do nome da campanha;
    // `label` é o do seletor, onde há espaço pra frase inteira.
    { valor: 'ofertei', label: 'Aguardando retorno', curto: 'aguardando', icone: 'hourglass_top', texto: 'text-amber-700 dark:text-amber-400' },
    { valor: 'ativo', label: 'Promo ativa', curto: 'ativa', icone: 'check_circle', texto: 'text-emerald-700 dark:text-emerald-400' },
    { valor: 'negado', label: 'Negado', curto: 'negado', icone: 'block', texto: 'text-slate-500 dark:text-slate-400' },
];

export type Slot =
    | { fonte: 'banco'; status: PromoCampanhaStatus }
    | { fonte: 'cs'; status: PromoStatus }
    | { fonte: 'vazio' };

/** O que o CS marcou numa campanha, com a data pra saber se ainda vale. */
export interface MarcaCampanha {
    status: PromoStatus;
    em?: string | null;
}

/**
 * A marcação do CS vale enquanto o banco não alcançou o momento em que ela foi
 * feita. Depois disso o banco é quem sabe: se ele chegou e não tem item, a
 * oferta não existe (ou foi arquivada) e a cobrança tem que voltar.
 *
 * `negado` é a exceção e NÃO expira: não é afirmação sobre item nenhum, é
 * decisão do parceiro. Expirar isso faria o painel cobrar eternamente uma
 * campanha que já foi recusada.
 */
export function marcaCampanhaVale(marca: MarcaCampanha | undefined, dadoAte?: Date | null): boolean {
    if (!marca) return false;
    if (marca.status === 'negado') return true;
    if (!marca.em) return false;
    const t = Date.parse(marca.em);
    if (Number.isNaN(t)) return false;
    if (!dadoAte) return true;   // idade do dado desconhecida: mantém a marcação (lado seguro)
    return t > dadoAte.getTime();
}

/** Resolve a linha da campanha. `detalhe` ausente = campanha da cidade sem nada. */
export function slotDaCampanha(
    detalhe: PromoCampanhaDetalhe | undefined,
    marca: MarcaCampanha | undefined,
    dadoAte?: Date | null,
): Slot {
    const vivos = detalhe ? detalhe.itens.rascunho + detalhe.itens.pendente + detalhe.itens.aprovado : 0;
    if (detalhe && vivos > 0) return { fonte: 'banco', status: detalhe.status };
    if (marcaCampanhaVale(marca, dadoAte)) return { fonte: 'cs', status: marca!.status };
    // Item morto é informação real ("já esteve no ar e caiu"), e vale mais que
    // o vazio — mas perde pra marcação fresca do CS, que pode ser a recriação.
    if (detalhe && detalhe.itens.morto > 0) return { fonte: 'banco', status: 'caiu' };
    return { fonte: 'vazio' };
}

// ──────────────────────────────────────────────────────────────────────────
// DE QUEM É A VEZ — o estado do parceiro inteiro, não de uma campanha.
//
// Os estados acima respondem "como está esta campanha?". Este responde
// "preciso fazer alguma coisa por este parceiro?", que é outra pergunta e é a
// que transforma a coluna em lista de trabalho.
//
// Por que NÃO é "campanha roda na cidade e ele não tem item": medido no banco
// em 09/11/2026, isso é o estado NORMAL — 1.066 dos 1.294 parceiros ativos
// (82%) e 34 de 34 da jornada 0-28d têm ao menos uma campanha sem item, num
// total de 2.112 lacunas. Marcar isso pinta a tabela toda e não sobra sinal.
// O corte que isola trabalho de verdade é mais estreito: NADA no ar E NADA
// esperando o parceiro — ninguém pode ativar nada porque a oferta não existe.
// Isso dá 134 parceiros na base (10%) e 6 na jornada (18%), que é lista que
// cabe num dia.
// ──────────────────────────────────────────────────────────────────────────

export type VezDaPromo =
    | 'no_ar'         // tem promoção no ar: nada a fazer
    | 'aguardando_banco' // o CS marcou "já criei" e a réplica ainda não viu
    | 'parceiro'      // oferta pronta, esperando ele aceitar
    | 'cs_publicar'   // rascunho começado e nunca publicado
    | 'cs_reativar'   // já esteve no ar e caiu — ele já aceitou uma vez
    | 'cs_criar'      // a cidade tem campanha e não existe oferta nenhuma
    | 'sem_campanha'  // cidade conhecida e sem campanha vigente: não há o que ofertar
    | 'desconhecido'; // sem localidade mapeada — "não sei", nunca "não tem"

/** Os três `cs_*` colapsados: é o que o filtro oferece como "minha vez". */
export type GrupoVez = 'cs' | 'parceiro' | 'no_ar' | 'sem_campanha' | 'aguardando_banco';

export interface VezMeta {
    /** Verbo curto pra célula. Os estados com contagem própria montam o texto na hora. */
    label: string;
    descricao: string;
    texto: string;
    grupo: GrupoVez | null;
}

export const VEZ_META: Record<VezDaPromo, VezMeta> = {
    no_ar: {
        label: 'no ar',
        descricao: 'Tem promoção no ar — nada a fazer aqui hoje.',
        texto: ESTADO_META.aprovado.texto,
        grupo: 'no_ar',
    },
    aguardando_banco: {
        label: 'criada · aguarda banco',
        descricao: 'Você marcou que criou a oferta e a réplica das Functions ainda não enxerga. Some sozinho quando o banco alcançar — se lá não aparecer item nenhum, a cobrança volta.',
        texto: 'text-sky-700 dark:text-sky-400',
        grupo: 'aguardando_banco',
    },
    parceiro: {
        label: 'esperando',
        descricao: 'A oferta já está no painel do parceiro. A bola é dele: falta aceitar.',
        texto: ESTADO_META.pendente.texto,
        grupo: 'parceiro',
    },
    cs_publicar: {
        label: 'publicar',
        descricao: 'Item começado no CMS e nunca publicado — o parceiro nem viu. Sua vez: terminar e publicar.',
        texto: ESTADO_META.rascunho.texto,
        grupo: 'cs',
    },
    cs_reativar: {
        label: 'reativar',
        descricao: 'Tinha promoção e ela saiu do ar. Sua vez: reativar — ele já aceitou uma vez.',
        texto: ESTADO_META.caiu.texto,
        grupo: 'cs',
    },
    cs_criar: {
        label: 'criar oferta',
        descricao: 'A cidade tem campanha e não existe oferta nenhuma montada: o parceiro não tem o que ativar. Sua vez: gerar a oferta no painel.',
        texto: 'text-rose-600 dark:text-rose-400',
        grupo: 'cs',
    },
    sem_campanha: {
        label: 'sem campanha',
        descricao: 'Cidade conhecida e sem campanha vigente — não há promoção possível hoje.',
        texto: 'text-slate-400 dark:text-slate-500',
        grupo: 'sem_campanha',
    },
    desconhecido: {
        label: '—',
        descricao: 'Cidade do parceiro ainda não mapeada — sem como saber as campanhas dele.',
        texto: 'text-slate-300 dark:text-slate-600',
        grupo: null,
    },
};

/** O que o veredito precisa saber da marcação do CS nesta linha. */
export interface MarcaCs {
    /** Campanhas da cidade ainda sem item e sem marcação. */
    faltaCriar: number;
    /** Campanhas cobertas por marcação do CS. Sem este número, `faltaCriar === 0`
     *  também seria verdade para quem não tem campanha nenhuma — e a célula
     *  dizia "criada · aguarda" pra parceiro sem cidade mapeada. */
    marcadas: number;
}

/**
 * A ordem é a mesma do veredito da coluna, e é deliberada: "tem promoção no
 * ar?" vem antes de tudo. Parceiro com promo rodando E uma segunda oferta
 * esperando não é trabalho pendente — o "+N" na célula dá o recado sem roubar
 * a leitura principal.
 */
export function vezDaPromocao(r: PromoResumo, marca?: MarcaCs): VezDaPromo {
    if (r.noAr > 0) return 'no_ar';
    if (r.pendente > 0) return 'parceiro';

    // A partir daqui a bola seria do CS. `faltaCriar` conta os slots que
    // continuam VAZIOS — campanha sem item no banco e sem marcação do CS. É
    // essa a contagem que vira trabalho; o que ele já marcou sai da fila.
    if (marca && marca.marcadas > 0 && marca.faltaCriar === 0) return 'aguardando_banco';

    if (r.rascunho > 0) return 'cs_publicar';
    if (r.caiu > 0) return 'cs_reativar';
    if (r.campanhasCidade > 0) return 'cs_criar';
    if (r.cidadeConhecida) return 'sem_campanha';
    return 'desconhecido';
}

/**
 * Conta os slots da linha: quantos continuam VAZIOS (nem item no banco, nem
 * marcação do CS) e quantos o CS já marcou. `faltaCriar` é o que vira trabalho
 * e o que o veredito mostra ("criar 3").
 */
export function contarSlots(
    r: PromoResumo,
    marcas: Record<string, MarcaCampanha | undefined>,
    dadoAte?: Date | null,
): MarcaCs {
    let faltaCriar = 0, marcadas = 0;
    for (const d of r.detalhe) {
        const fonte = slotDaCampanha(d, marcas[d.campanha], dadoAte).fonte;
        if (fonte === 'vazio') faltaCriar++;
        else if (fonte === 'cs') marcadas++;
    }
    return { faltaCriar, marcadas };
}

/** "23h atrás" / "2 dias atrás" — a idade do dado, pro rodapé do puxadinho. */
export function textoIdadeDado(atrasoMinutos: number | null): string | null {
    if (atrasoMinutos == null) return null;
    if (atrasoMinutos < 90) return `${Math.max(atrasoMinutos, 0)} min atrás`;
    const horas = Math.round(atrasoMinutos / 60);
    if (horas < 36) return `${horas}h atrás`;
    const dias = Math.round(horas / 24);
    return `${dias} ${dias === 1 ? 'dia' : 'dias'} atrás`;
}

/**
 * A partir de quantos dias uma oferta pendente deixa de ser "esperando
 * resposta" e vira inventário morto.
 *
 * NÃO é um alarme vermelho: medido no banco em 28/10/2026, 993 dos 1.020
 * parceiros com item pendente estão parados há 30+ dias (799 há 90+). Pintar
 * isso de vermelho pintaria a coluna inteira e não diria nada. Aqui o número
 * é mostrado cru e o vermelho fica pro estado que é de fato raro e grave:
 * nenhuma promoção no ar.
 */
export const DIAS_OFERTA_ESQUECIDA = 90;

export function textoEspera(dias: number | null | undefined): string | null {
    if (dias == null) return null;
    if (dias <= 0) return 'hoje';
    if (dias >= 365) {
        const anos = Math.floor(dias / 365);
        return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
    }
    if (dias >= 60) return `${Math.floor(dias / 30)} meses`;
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Forma curta pra caber na célula da tabela: 20d, 4m, 2a. */
export function textoEsperaCurto(dias: number | null | undefined): string | null {
    if (dias == null) return null;
    if (dias >= 365) return `${Math.floor(dias / 365)}a`;
    if (dias >= 60) return `${Math.floor(dias / 30)}m`;
    return `${dias}d`;
}
