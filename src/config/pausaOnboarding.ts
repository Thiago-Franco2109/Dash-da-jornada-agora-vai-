/**
 * Pausa do onboarding — parceiro que não está operando por problema operacional.
 *
 * A jornada conta dia corrido desde o lançamento e cobra 30 pedidos em 28 dias.
 * Quem parou de trabalhar (cozinha parada, sem entregador, reforma, dono
 * viajou) continua sendo medido: no dia 10 a ficha acusa "0 de 11 esperados,
 * índice 0.00, prioridade 5" e o parceiro reaparece todo dia na fila de
 * ligação. Pausar congela o relógio — os dias em pausa saem de
 * `dias_desde_lancamento`, e com eles caem pedidos esperados, índice e
 * estrelas (ver aplicarPausaOnboarding em utils/pausaOverlay.ts).
 *
 * O estado mora no Supabase (`onboarding_pausa`) e não no localStorage, porque
 * dois CS trabalham a mesma carteira e precisam ver o mesmo número de dias
 * ativos. Ver supabase/onboarding_pausa.sql.
 */

export type MotivoPausa =
    | 'loja_fechada'
    | 'reforma'
    | 'sem_equipe'
    | 'sem_entregador'
    | 'problema_tecnico'
    | 'ferias'
    | 'pessoal'
    | 'regularizacao'
    | 'outro';

export interface MotivoPausaDef {
    motivo: MotivoPausa;
    label: string;
    /** Rótulo curto pro chip da lista e do cabeçalho. */
    chip: string;
    icon: string;
    /** Dias corridos até a previsão de retorno sugerida (o CS pode mudar). */
    voltarEmDias: number;
    /** Pede texto livre ao escolher. */
    pedeDetalhe?: boolean;
}

export const MOTIVOS_PAUSA: MotivoPausaDef[] = [
    {
        motivo: 'loja_fechada',
        label: 'Loja fechada temporariamente',
        chip: 'Loja fechada',
        icon: 'store',
        voltarEmDias: 15,
    },
    {
        motivo: 'sem_equipe',
        label: 'Sem equipe para operar (cozinha/atendimento)',
        chip: 'Sem equipe',
        icon: 'group_off',
        voltarEmDias: 10,
    },
    {
        motivo: 'sem_entregador',
        label: 'Sem entregador',
        chip: 'Sem entregador',
        icon: 'delivery_dining',
        voltarEmDias: 7,
    },
    {
        motivo: 'problema_tecnico',
        label: 'Problema técnico (tablet, internet, impressora)',
        chip: 'Problema técnico',
        icon: 'wifi_off',
        voltarEmDias: 3,
    },
    {
        motivo: 'reforma',
        label: 'Reforma ou mudança de endereço',
        chip: 'Reforma',
        icon: 'construction',
        voltarEmDias: 30,
    },
    {
        motivo: 'ferias',
        label: 'Férias / viagem do proprietário',
        chip: 'Férias',
        icon: 'luggage',
        voltarEmDias: 15,
    },
    {
        motivo: 'pessoal',
        label: 'Motivo de saúde ou familiar',
        chip: 'Motivo pessoal',
        icon: 'health_and_safety',
        voltarEmDias: 15,
    },
    {
        motivo: 'regularizacao',
        label: 'Aguardando regularização (documento, pagamento, alvará)',
        chip: 'Regularização',
        icon: 'gavel',
        voltarEmDias: 7,
    },
    {
        motivo: 'outro',
        label: 'Outro problema operacional',
        chip: 'Pausado',
        icon: 'more_horiz',
        voltarEmDias: 7,
        pedeDetalhe: true,
    },
];

export interface PausaOnboarding {
    partnerId: string;
    pausado: boolean;
    motivo: MotivoPausa;
    observacao: string | null;
    /** YYYY-MM-DD — quando o parceiro disse que volta. */
    previsaoRetorno: string | null;
    /** ISO — início da pausa em curso (ou da última, se já retomada). */
    pausadoEm: string;
    pausadoPor: string | null;
    retomadoEm: string | null;
    /** Dias já descontados por pausas ENCERRADAS (a em curso é calculada na hora). */
    diasAcumulados: number;
}

export type PausaMap = Record<string, PausaOnboarding>;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros entre duas datas, comparando meia-noite local (não erra por hora/fuso). */
function diasEntre(inicio: Date, fim: Date): number {
    const a = new Date(inicio);
    const b = new Date(fim);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_DIA));
}

export function estaPausado(pausa: PausaOnboarding | undefined | null): boolean {
    return !!pausa?.pausado;
}

/** Dias da pausa em curso. 0 quando o parceiro já retomou. */
export function diasNaPausaAtual(pausa: PausaOnboarding | undefined | null, hoje = new Date()): number {
    if (!estaPausado(pausa)) return 0;
    const inicio = new Date(pausa!.pausadoEm);
    if (Number.isNaN(inicio.getTime())) return 0;
    return diasEntre(inicio, hoje);
}

/** Total de dias a descontar da jornada: pausas encerradas + a pausa em curso. */
export function diasPausados(pausa: PausaOnboarding | undefined | null, hoje = new Date()): number {
    if (!pausa) return 0;
    return Math.max(0, pausa.diasAcumulados) + diasNaPausaAtual(pausa, hoje);
}

export function motivoPausaDef(motivo: string | null | undefined): MotivoPausaDef | undefined {
    return MOTIVOS_PAUSA.find(m => m.motivo === motivo);
}

export function motivoPausaLabel(motivo: string | null | undefined): string {
    return motivoPausaDef(motivo)?.label ?? 'Problema operacional';
}

export function motivoPausaChip(motivo: string | null | undefined): string {
    return motivoPausaDef(motivo)?.chip ?? 'Pausado';
}

/** Data local em YYYY-MM-DD (não usar toISOString: converte pra UTC e erra o dia à noite). */
export function dataISOLocal(data: Date): string {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Previsão de retorno sugerida pelo motivo escolhido (YYYY-MM-DD). */
export function previsaoRetornoSugerida(def: MotivoPausaDef, hoje = new Date()): string {
    const d = new Date(hoje);
    d.setDate(d.getDate() + def.voltarEmDias);
    return dataISOLocal(d);
}

/** YYYY-MM-DD → DD/MM/AAAA. Monta a data no fuso local pra não voltar um dia. */
export function formatarDataBR(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return '—';
    return `${d}/${m}/${y}`;
}

/** Previsão de retorno já vencida — o CS precisa ligar e decidir se retoma. */
export function previsaoVencida(pausa: PausaOnboarding | undefined | null, hoje = new Date()): boolean {
    if (!estaPausado(pausa) || !pausa!.previsaoRetorno) return false;
    return pausa!.previsaoRetorno < dataISOLocal(hoje);
}
