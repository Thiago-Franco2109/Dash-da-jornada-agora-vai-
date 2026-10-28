import type { GatewaySheetTable } from '../types/gatewaySheet';
import { normalizeEstabId } from './indicadorSheet';
import { cellText, resolveSheetColumn } from './sheetColumnMatch';

export const DIA_SEMANA_LABELS = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
] as const;

/** Ordem de exibição: segunda → domingo */
export const DIA_SEMANA_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type RecessoStatus = 'em_recesso' | 'futuro' | 'encerrado';

export interface HorarioDia {
    diaSemana: number;
    diaLabel: string;
    turno1Inicio: string;
    turno1Fim: string;
    turno2Inicio: string;
    turno2Fim: string;
}

export interface RecessoRecord {
    recessoId: string;
    dataInicio: string;
    dataFim: string;
    descricao: string;
    cadastradoEm: string;
    urlTrello: string;
    diasDuracao: number;
    statusRecesso: RecessoStatus;
    emRecessoAgora: boolean;
}

function orderedHeadersOf(table: GatewaySheetTable): string[] {
    if (table.orderedHeaders?.length) return table.orderedHeaders;
    if (table.headers.length > 0) return table.headers;
    const first = table.rows[0];
    return first ? Object.keys(first) : [];
}

function parseDiaSemana(raw: string): number {
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isNaN(n) || n < 0 || n > 6 ? -1 : n;
}

function parseBool(raw: string): boolean {
    const s = raw.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'sim' || s === 'yes';
}

function normalizePartnerName(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function inferRecessoStatus(
    dataInicio: string,
    dataFim: string,
    emRecessoAgora: boolean,
    rawStatus: string,
): RecessoStatus {
    const fromColumn = rawStatus.trim().toLowerCase();
    if (fromColumn.includes('em_recesso') || fromColumn === 'em recesso') return 'em_recesso';
    if (fromColumn.includes('futuro')) return 'futuro';
    if (fromColumn.includes('encerrado')) return 'encerrado';

    if (emRecessoAgora) return 'em_recesso';

    const now = Date.now();
    const start = Date.parse(dataInicio.replace(' ', 'T'));
    const end = Date.parse(dataFim.replace(' ', 'T'));

    if (!Number.isNaN(start) && start > now) return 'futuro';
    if (!Number.isNaN(end) && end < now) return 'encerrado';
    if (!Number.isNaN(start) && !Number.isNaN(end) && start <= now && end >= now) return 'em_recesso';

    return 'encerrado';
}

function estabMatchesRow(
    rowEstabId: string,
    rowEstabelecimento: string,
    targetEstabId: string,
    targetEstabelecimento?: string,
): boolean {
    const rowNorm = normalizeEstabId(rowEstabId);
    const targetNorm = normalizeEstabId(targetEstabId);
    if (rowNorm.length > 0 && targetNorm.length > 0 && rowNorm === targetNorm) return true;

    if (targetEstabelecimento) {
        const rowName = normalizePartnerName(rowEstabelecimento);
        const targetName = normalizePartnerName(targetEstabelecimento);
        if (rowName.length > 2 && rowName === targetName) return true;
    }

    return false;
}

export function formatHorario(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{1,2}:\d{2})/);
    return match ? match[1] : trimmed;
}

export function formatTurno(inicio: string, fim: string): string {
    const i = formatHorario(inicio);
    const f = formatHorario(fim);
    if (!i && !f) return 'Fechado';
    if (i && f) return `${i} – ${f}`;
    return i || f || '—';
}

function estabMatches(rowEstabId: string, targetEstabId: string, targetEstabelecimento?: string, rowEstabelecimento?: string): boolean {
    return estabMatchesRow(rowEstabId, rowEstabelecimento ?? '', targetEstabId, targetEstabelecimento);
}

/** Completa os dias faltantes (como "Fechado") e ordena segunda → domingo. */
export function normalizeSemana(horarios: HorarioDia[]): HorarioDia[] {
    const byDay = new Map<number, HorarioDia>();
    for (const h of horarios) {
        if (h.diaSemana >= 0 && h.diaSemana <= 6) byDay.set(h.diaSemana, h);
    }
    return DIA_SEMANA_DISPLAY_ORDER.map(dia => byDay.get(dia) ?? {
        diaSemana: dia,
        diaLabel: DIA_SEMANA_LABELS[dia],
        turno1Inicio: '',
        turno1Fim: '',
        turno2Inicio: '',
        turno2Fim: '',
    });
}

export function parseHorariosForEstab(
    table: GatewaySheetTable,
    estabId: string,
    estabelecimento?: string,
): HorarioDia[] {
    const ordered = orderedHeadersOf(table);
    const estabCol = resolveSheetColumn(ordered, ['ESTAB_ID', 'ESTAB ID', 'ID']);
    const estabNomeCol = resolveSheetColumn(ordered, ['ESTABELECIMENTO', 'LOJA', 'NOME']);
    const diaSemanaCol = resolveSheetColumn(ordered, ['DIA_SEMANA', 'DIA SEMANA']);
    const diaCol = resolveSheetColumn(ordered, ['DIA']);
    const t1InicioCol = resolveSheetColumn(ordered, ['TURNO_1_INICIO', 'TURNO 1 INICIO']);
    const t1FimCol = resolveSheetColumn(ordered, ['TURNO_1_FIM', 'TURNO 1 FIM']);
    const t2InicioCol = resolveSheetColumn(ordered, ['TURNO_2_INICIO', 'TURNO 2 INICIO']);
    const t2FimCol = resolveSheetColumn(ordered, ['TURNO_2_FIM', 'TURNO 2 FIM']);

    const byDay = new Map<number, HorarioDia>();

    for (const row of table.rows) {
        if (!estabMatches(
            cellText(row, estabCol),
            estabId,
            estabelecimento,
            cellText(row, estabNomeCol),
        )) continue;

        const diaSemana = parseDiaSemana(cellText(row, diaSemanaCol));
        if (diaSemana < 0) continue;

        const diaLabel = cellText(row, diaCol) || DIA_SEMANA_LABELS[diaSemana] || `Dia ${diaSemana}`;
        byDay.set(diaSemana, {
            diaSemana,
            diaLabel,
            turno1Inicio: cellText(row, t1InicioCol),
            turno1Fim: cellText(row, t1FimCol),
            turno2Inicio: cellText(row, t2InicioCol),
            turno2Fim: cellText(row, t2FimCol),
        });
    }

    return DIA_SEMANA_DISPLAY_ORDER.map(dia => {
        const existing = byDay.get(dia);
        if (existing) return existing;
        return {
            diaSemana: dia,
            diaLabel: DIA_SEMANA_LABELS[dia],
            turno1Inicio: '',
            turno1Fim: '',
            turno2Inicio: '',
            turno2Fim: '',
        };
    });
}

export function parseRecessosForEstab(
    table: GatewaySheetTable,
    estabId: string,
    estabelecimento?: string,
): RecessoRecord[] {
    const ordered = orderedHeadersOf(table);
    const estabCol = resolveSheetColumn(ordered, ['ESTAB_ID', 'ESTAB ID', 'ID']);
    const estabNomeCol = resolveSheetColumn(ordered, ['ESTABELECIMENTO', 'LOJA', 'NOME']);
    const recessoIdCol = resolveSheetColumn(ordered, ['RECESSO_ID', 'RECESSO ID']);
    const inicioCol = resolveSheetColumn(ordered, ['DATA_INICIO', 'DATA INICIO']);
    const fimCol = resolveSheetColumn(ordered, ['DATA_FIM', 'DATA FIM']);
    const descCol = resolveSheetColumn(ordered, ['DESCRICAO', 'DESCRIÇÃO', 'DESCRICAO']);
    const cadCol = resolveSheetColumn(ordered, ['CADASTRADO_EM', 'CADASTRADO EM']);
    const urlCol = resolveSheetColumn(ordered, ['URL_TRELLO', 'URL TRELLO', 'URL']);
    const diasCol = resolveSheetColumn(ordered, ['DIAS_DURACAO', 'DIAS DURACAO']);
    const statusCol = resolveSheetColumn(ordered, ['STATUS_RECESSO', 'STATUS RECESSO']);
    const emRecessoCol = resolveSheetColumn(ordered, ['EM_RECESSO_AGORA', 'EM RECESSO AGORA']);

    const recessos: RecessoRecord[] = [];

    for (const row of table.rows) {
        if (!estabMatches(
            cellText(row, estabCol),
            estabId,
            estabelecimento,
            cellText(row, estabNomeCol),
        )) continue;

        const diasRaw = cellText(row, diasCol);
        const diasDuracao = parseInt(diasRaw.replace(/\D/g, ''), 10);

        const emRecessoAgora = parseBool(cellText(row, emRecessoCol));
        const statusRaw = cellText(row, statusCol);

        recessos.push({
            recessoId: cellText(row, recessoIdCol),
            dataInicio: cellText(row, inicioCol),
            dataFim: cellText(row, fimCol),
            descricao: cellText(row, descCol),
            cadastradoEm: cellText(row, cadCol),
            urlTrello: cellText(row, urlCol),
            diasDuracao: Number.isNaN(diasDuracao) ? 0 : diasDuracao,
            statusRecesso: inferRecessoStatus(
                cellText(row, inicioCol),
                cellText(row, fimCol),
                emRecessoAgora,
                statusRaw,
            ),
            emRecessoAgora,
        });
    }

    return sortRecessos(recessos);
}

const RECESSO_STATUS_ORDER: Record<RecessoStatus, number> = {
    em_recesso: 0,
    futuro: 1,
    encerrado: 2,
};

/** Em recesso agora → futuros → encerrados; dentro de cada grupo, mais recente primeiro. */
export function sortRecessos(recessos: RecessoRecord[]): RecessoRecord[] {
    return [...recessos].sort((a, b) => {
        const byStatus = RECESSO_STATUS_ORDER[a.statusRecesso] - RECESSO_STATUS_ORDER[b.statusRecesso];
        if (byStatus !== 0) return byStatus;
        return b.dataInicio.localeCompare(a.dataInicio);
    });
}

export function hasActiveRecesso(recessos: RecessoRecord[]): RecessoRecord | null {
    return recessos.find(r => r.emRecessoAgora || r.statusRecesso === 'em_recesso') ?? null;
}


// ───────────────────────────────────────────────────────────────────────────
// Aderência ao horário
//
// Duas perguntas caem na mesma conta: quanto do horário prometido a loja
// cumpriu, e EM QUE PARTE do expediente ela sumiu. A segunda é o que separa
// "fechou 20 min mais cedo porque o movimento caiu" de "abriu, viu que não ia
// dar e desistiu" — e só aparece se guardarmos os intervalos, não só o total
// de minutos perdidos.
//
// Tudo aqui trabalha em minutos desde a meia-noite local do dia. Turno que
// atravessa a meia-noite tem fim > 1440; recesso que começou ontem entra com
// início negativo.
// ───────────────────────────────────────────────────────────────────────────

/** Minutos desde a meia-noite local do dia em questão. */
export type Intervalo = { inicio: number; fim: number };

export type AderenciaStatus =
    | 'cumpriu'             // abriu e ficou aberta a janela inteira
    | 'fechou_cedo'         // único buraco encostado no fim da janela
    | 'abriu_tarde'         // único buraco encostado na abertura, mas operou o dia
    | 'pausa_no_meio'       // buraco solto no miolo do expediente
    | 'fragmentado'         // dois ou mais buracos no mesmo dia
    | 'desistiu'            // abriu e fechou em minutos
    | 'nao_abriu'           // janela na grade, loja fechada o dia todo
    | 'recesso_programado'  // pausa longa (férias/reforma) cobrindo o dia
    | 'fechado_grade';      // a grade não prevê funcionamento nesse dia

/** Até aqui depois da abertura, fechar é "abriu e desistiu" e não "abriu tarde" */
const LIMIAR_DESISTIU_MIN = 15;
/** Encostar nessa distância da borda da janela conta como tocar a borda */
const TOLERANCIA_BORDA_MIN = 5;
/**
 * Piso de uma pausa de verdade.
 *
 * O `data_fim` do recesso herda os segundos do clique: quem fecha às 16:23:58
 * gera um recesso que termina 11:00:57, enquanto a grade abre 11:00:00. Sem
 * esse piso, todo dia seguinte a um fechamento noturno nascia com um buraco de
 * meio minuto na abertura — e um dia de buraco único virava "dia picado".
 */
const MIN_PAUSA_MIN = 2;

/**
 * Pausa programada (férias, reforma) × fechamento do dia.
 *
 * O recesso que a loja cria ao fechar vai até a abertura do dia seguinte, então
 * quase sempre cruza a meia-noite. Comparar as datas de início e fim marcava
 * TODO fechamento noturno como "planejado" — e ainda pintava o dia seguinte
 * junto. O que separa os dois é a duração: fechamento de fim de expediente não
 * chega a 36h, férias passam disso com folga.
 */
const SPAN_RECESSO_PROGRAMADO_MIN = 36 * 60;

export interface AderenciaDia {
    date: Date;
    diaSemana: number;
    /** Janela da grade já cortada no relógio atual quando o dia é hoje. */
    janelas: Intervalo[];
    /** Janela cheia da grade — é o que o desenho mostra como "prometido". */
    janelasGrade: Intervalo[];
    /** Pedaços da janela em que a loja esteve fechada. */
    pausas: Intervalo[];
    programadoMin: number;
    abertoMin: number;
    fechadoMin: number;
    /** 0–1. Dia sem grade conta como 1: não havia promessa a cumprir. */
    pct: number;
    status: AderenciaStatus;
    descricao: string;
    /** Dia de hoje: a janela ainda não terminou. */
    emCurso: boolean;
    /** Recesso que mais pesou no dia. */
    recesso: RecessoRecord | null;
    /** Minutos entre o cadastro do recesso e o início dele. 0 = decidido na hora. */
    antecedenciaMin: number | null;
}

export type PadraoTom = 'ok' | 'atencao' | 'risco';

export interface AderenciaPadrao {
    chave: 'ok' | 'fecha_cedo' | 'abre_tarde' | 'picado' | 'desiste' | 'sumiu' | 'pausa' | 'sem_grade';
    label: string;
    tom: PadraoTom;
}

export interface AderenciaParceiro {
    dias: AderenciaDia[];
    programadoMin: number;
    abertoMin: number;
    perdidoMin: number;
    /** 0–1 do horário previsto que a loja realmente ficou aberta. */
    pct: number;
    temHorario: boolean;
    totalDias: number;
    padrao: AderenciaPadrao;
    contagem: Record<AderenciaStatus, number>;
}

function ymd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDateTime(raw: string): Date | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** "13:00" → 780 minutos. Retorna null se inválido. */
function horaParaMin(raw: string): number | null {
    const h = formatHorario(raw);
    const match = h.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const min = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    return Number.isNaN(min) ? null : min;
}

/** Intervalos programados de um dia; fim pode passar de 1440 (vira madrugada). */
function intervalosProgramados(h: HorarioDia | undefined): Intervalo[] {
    if (!h) return [];
    const intervalos: Intervalo[] = [];
    const turnos: [string, string][] = [
        [h.turno1Inicio, h.turno1Fim],
        [h.turno2Inicio, h.turno2Fim],
    ];
    for (const [ini, fim] of turnos) {
        const i = horaParaMin(ini);
        let f = horaParaMin(fim);
        if (i == null || f == null) continue;
        // No CMS, início igual ao fim ("00:00–00:00") quer dizer fechado — não 24h.
        if (f === i) continue;
        if (f < i) f += 1440; // fecha depois da meia-noite
        intervalos.push({ inicio: i, fim: f });
    }
    return unir(intervalos);
}

/** Junta intervalos que se tocam ou se sobrepõem, em ordem. */
function unir(intervalos: Intervalo[]): Intervalo[] {
    const ordenados = [...intervalos].sort((a, b) => a.inicio - b.inicio);
    const out: Intervalo[] = [];
    for (const iv of ordenados) {
        if (iv.fim <= iv.inicio) continue;
        const ultimo = out[out.length - 1];
        if (ultimo && iv.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, iv.fim);
        else out.push({ ...iv });
    }
    return out;
}

function interseccao(a: Intervalo[], b: Intervalo[]): Intervalo[] {
    const out: Intervalo[] = [];
    for (const x of a) {
        for (const y of b) {
            const inicio = Math.max(x.inicio, y.inicio);
            const fim = Math.min(x.fim, y.fim);
            if (fim > inicio) out.push({ inicio, fim });
        }
    }
    return unir(out);
}

function subtrair(a: Intervalo[], b: Intervalo[]): Intervalo[] {
    let resto = [...a];
    for (const corte of b) {
        const proximo: Intervalo[] = [];
        for (const iv of resto) {
            if (corte.fim <= iv.inicio || corte.inicio >= iv.fim) { proximo.push(iv); continue; }
            if (corte.inicio > iv.inicio) proximo.push({ inicio: iv.inicio, fim: corte.inicio });
            if (corte.fim < iv.fim) proximo.push({ inicio: corte.fim, fim: iv.fim });
        }
        resto = proximo;
    }
    return resto;
}

function duracao(intervalos: Intervalo[]): number {
    return intervalos.reduce((sum, iv) => sum + (iv.fim - iv.inicio), 0);
}

/** O recesso é longo o bastante para ser pausa programada, e não fim de expediente? */
function isRecessoPlanejado(r: RecessoRecord): boolean {
    const inicio = parseDateTime(r.dataInicio);
    const fim = parseDateTime(r.dataFim);
    if (inicio && fim) {
        return (fim.getTime() - inicio.getTime()) / 60000 >= SPAN_RECESSO_PROGRAMADO_MIN;
    }
    return r.diasDuracao >= 2;
}

function recessoIntervaloNoDia(r: RecessoRecord, diaMeiaNoite: Date): Intervalo | null {
    const start = parseDateTime(r.dataInicio);
    const end = parseDateTime(r.dataFim);
    if (!start || !end) return null;
    const base = diaMeiaNoite.getTime();
    const inicio = (start.getTime() - base) / 60000;
    const fim = (end.getTime() - base) / 60000;
    if (fim <= inicio) return null;
    return { inicio, fim };
}

function formatDuracaoMin(min: number): string {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

/** 980 → "16:20". Aceita minutos acima de 1440 (madrugada do dia seguinte). */
export function formatMinutoDoDia(min: number): string {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function descreverAderencia(
    status: AderenciaStatus,
    dia: { pausas: Intervalo[]; fechadoMin: number; abertoMin: number; programadoMin: number; emCurso: boolean },
): string {
    const primeira = dia.pausas[0];
    switch (status) {
        case 'cumpriu':
            return dia.emCurso ? 'Aberta até agora' : 'Cumpriu o horário';
        case 'fechou_cedo':
            return `Fechou ${formatDuracaoMin(dia.fechadoMin)} antes (${formatMinutoDoDia(primeira.inicio)})`;
        case 'abriu_tarde':
            return `Abriu ${formatDuracaoMin(dia.fechadoMin)} depois (${formatMinutoDoDia(primeira.fim)})`;
        case 'pausa_no_meio':
            return `Pausa de ${formatDuracaoMin(dia.fechadoMin)} às ${formatMinutoDoDia(primeira.inicio)}`;
        case 'fragmentado':
            return `${dia.pausas.length} pausas, ${formatDuracaoMin(dia.fechadoMin)} fechada`;
        case 'desistiu':
            return `Abriu e fechou em ${formatDuracaoMin(dia.abertoMin)}`;
        case 'nao_abriu':
            return 'Não abriu no horário previsto';
        case 'recesso_programado':
            return 'Pausa programada';
        case 'fechado_grade':
            return 'Sem horário na grade';
        default:
            return '';
    }
}

/**
 * Aderência dos últimos N dias: cruza a grade semanal com os recessos, com hora
 * exata, e guarda os intervalos de cada dia.
 *
 * O dia de hoje entra cortado no relógio atual — senão a loja é cobrada por
 * horas que ainda não aconteceram.
 */
export function buildAderencia(
    horarios: HorarioDia[],
    recessos: RecessoRecord[],
    days = 14,
    now: Date = new Date(),
): AderenciaParceiro {
    const temHorario = horarios.some(h =>
        formatTurno(h.turno1Inicio, h.turno1Fim) !== 'Fechado'
        || formatTurno(h.turno2Inicio, h.turno2Fim) !== 'Fechado',
    );

    const programados = recessos.filter(isRecessoPlanejado);
    const hojeYmd = ymd(now);

    const dias: AderenciaDia[] = [];
    const contagem = {
        cumpriu: 0, fechou_cedo: 0, abriu_tarde: 0, pausa_no_meio: 0, fragmentado: 0,
        desistiu: 0, nao_abriu: 0, recesso_programado: 0, fechado_grade: 0,
    } as Record<AderenciaStatus, number>;

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const base = date.getTime();
        const diaSemana = date.getDay();
        const emCurso = ymd(date) === hojeYmd;
        const agoraMin = (now.getTime() - base) / 60000;

        const grade = horarios.find(h => h.diaSemana === diaSemana);
        const janelasGrade = intervalosProgramados(grade);
        // Hoje só vale o que já passou do relógio.
        const janelas = emCurso
            ? subtrair(janelasGrade, [{ inicio: agoraMin, fim: Number.MAX_SAFE_INTEGER }])
            : janelasGrade;
        const programadoMin = duracao(janelas);

        const doDia = recessos
            .map(r => ({ r, iv: recessoIntervaloNoDia(r, date) }))
            .filter((x): x is { r: RecessoRecord; iv: Intervalo } => x.iv != null)
            .filter(x => x.iv.fim > 0 && x.iv.inicio < 1440 + 720);

        const pausas = interseccao(janelas, unir(doDia.map(x => x.iv)))
            .filter(p => p.fim - p.inicio >= MIN_PAUSA_MIN);
        const fechadoMin = duracao(pausas);
        const abertoMin = Math.max(0, programadoMin - fechadoMin);
        const pct = programadoMin > 0 ? abertoMin / programadoMin : 1;

        // Recesso que mais pesou no dia — é dele que saem descrição e antecedência.
        const principal = doDia
            .map(x => ({ ...x, peso: duracao(interseccao(janelas, [x.iv])) }))
            .sort((a, b) => b.peso - a.peso)[0] ?? null;
        const recesso = principal?.peso ? principal.r : null;

        let antecedenciaMin: number | null = null;
        if (recesso) {
            const cad = parseDateTime(recesso.cadastradoEm);
            const ini = parseDateTime(recesso.dataInicio);
            if (cad && ini) antecedenciaMin = Math.round((ini.getTime() - cad.getTime()) / 60000);
        }

        const cobertoPorProgramado = programadoMin > 0
            && duracao(interseccao(
                janelas,
                unir(programados.map(r => recessoIntervaloNoDia(r, date)).filter((iv): iv is Intervalo => iv != null)),
            )) >= programadoMin - 1;

        const primeira = pausas[0];
        const ultima = pausas[pausas.length - 1];
        const aberturaGrade = janelas.length ? janelas[0].inicio : 0;
        const fechamentoGrade = janelas.length ? janelas[janelas.length - 1].fim : 0;
        const tocaInicio = !!primeira && primeira.inicio - aberturaGrade <= TOLERANCIA_BORDA_MIN;
        const tocaFim = !!ultima && fechamentoGrade - ultima.fim <= TOLERANCIA_BORDA_MIN;

        let status: AderenciaStatus;
        if (janelasGrade.length === 0) status = 'fechado_grade';
        else if (programadoMin === 0) status = 'cumpriu';            // hoje, antes de abrir
        else if (cobertoPorProgramado) status = 'recesso_programado';
        else if (fechadoMin === 0) status = 'cumpriu';
        else if (tocaInicio && abertoMin <= LIMIAR_DESISTIU_MIN) status = 'desistiu';
        else if (abertoMin <= 1) status = 'nao_abriu';
        else if (pausas.length > 1) status = 'fragmentado';
        else if (tocaInicio) status = 'abriu_tarde';
        else if (tocaFim) status = 'fechou_cedo';
        else status = 'pausa_no_meio';

        contagem[status]++;

        dias.push({
            date,
            diaSemana,
            janelas,
            janelasGrade,
            pausas,
            programadoMin,
            abertoMin,
            fechadoMin,
            pct,
            status,
            descricao: descreverAderencia(status, { pausas, fechadoMin, abertoMin, programadoMin, emCurso }),
            emCurso,
            recesso,
            antecedenciaMin,
        });
    }

    // Pausa programada sai da conta: é período declarado como não-operante, não
    // promessa quebrada. Uma loja de férias marcaria 50% sem ter feito nada
    // errado — e some do ranking quem de fato está deixando de abrir.
    const contados = dias.filter(d => d.status !== 'recesso_programado');
    const programadoMin = contados.reduce((s, d) => s + d.programadoMin, 0);
    const abertoMin = contados.reduce((s, d) => s + d.abertoMin, 0);
    const diasComGrade = contados.filter(d => d.programadoMin > 0).length;

    return {
        dias,
        programadoMin,
        abertoMin,
        perdidoMin: Math.max(0, programadoMin - abertoMin),
        pct: programadoMin > 0 ? abertoMin / programadoMin : 1,
        temHorario,
        totalDias: days,
        padrao: inferirPadrao(contagem, temHorario, diasComGrade, programadoMin > 0 ? abertoMin / programadoMin : 1),
        contagem,
    };
}

/**
 * O rótulo da coluna "Padrão": o comportamento dominante das duas semanas, do
 * mais grave para o mais brando. Serve para a pessoa saber o que perguntar
 * antes de abrir o parceiro.
 */
function inferirPadrao(
    contagem: Record<AderenciaStatus, number>,
    temHorario: boolean,
    diasComGrade: number,
    pct: number,
): AderenciaPadrao {
    const padrao = escolherPadrao(contagem, temHorario, diasComGrade);
    return { ...padrao, tom: comPisoDeTom(padrao.tom, pct) };
}

function escolherPadrao(
    contagem: Record<AderenciaStatus, number>,
    temHorario: boolean,
    diasComGrade: number,
): AderenciaPadrao {
    if (!temHorario || diasComGrade === 0) {
        return { chave: 'sem_grade', label: 'sem grade no CMS', tom: 'atencao' };
    }
    const sumiu = contagem.nao_abriu + contagem.desistiu;
    // Conta em vez de rótulo seco: "abriu e desistiu" num dia de catorze e em
    // dez dias pedem conversas diferentes.
    if (contagem.desistiu >= 1) {
        const n = contagem.desistiu;
        return { chave: 'desiste', label: `desistiu em ${n} ${n === 1 ? 'dia' : 'dias'}`, tom: 'risco' };
    }
    if (contagem.nao_abriu >= 1) {
        const n = contagem.nao_abriu;
        return { chave: 'sumiu', label: `${n} ${n === 1 ? 'dia' : 'dias'} sem abrir`, tom: 'risco' };
    }
    if (contagem.fragmentado >= 2) {
        return { chave: 'picado', label: 'dias picados', tom: 'risco' };
    }
    // Grade de um ou dois dias explica uma aderência estranha — e é problema
    // por si só: a loja fica invisível no app no resto da semana.
    if (diasComGrade <= 3) {
        return {
            chave: 'sem_grade',
            label: `grade de ${diasComGrade} ${diasComGrade === 1 ? 'dia' : 'dias'}`,
            tom: 'atencao',
        };
    }
    if (contagem.fechou_cedo >= 5) {
        return { chave: 'fecha_cedo', label: 'fecha cedo toda semana', tom: 'atencao' };
    }
    if (contagem.abriu_tarde >= 3) {
        return { chave: 'abre_tarde', label: 'abre atrasada', tom: 'atencao' };
    }
    if (contagem.recesso_programado >= 3) {
        return { chave: 'pausa', label: 'pausa programada', tom: 'ok' };
    }
    if (contagem.pausa_no_meio >= 2) {
        return { chave: 'picado', label: 'pausas no meio do dia', tom: 'atencao' };
    }
    if (contagem.fechou_cedo >= 2) {
        return { chave: 'fecha_cedo', label: 'fecha cedo às vezes', tom: 'atencao' };
    }
    if (contagem.fechou_cedo + contagem.pausa_no_meio + contagem.fragmentado + sumiu === 0) {
        return { chave: 'ok', label: 'cumpre a grade', tom: 'ok' };
    }
    return { chave: 'ok', label: 'perda pontual', tom: 'ok' };
}

/** Um chip verde ao lado de 13% de aderência é pior que nenhum chip. */
function comPisoDeTom(tom: PadraoTom, pct: number): PadraoTom {
    if (pct < 0.6) return 'risco';
    if (pct < 0.9 && tom === 'ok') return 'atencao';
    return tom;
}
