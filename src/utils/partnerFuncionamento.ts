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

    const statusOrder: Record<RecessoStatus, number> = {
        em_recesso: 0,
        futuro: 1,
        encerrado: 2,
    };

    return recessos.sort((a, b) => {
        const byStatus = statusOrder[a.statusRecesso] - statusOrder[b.statusRecesso];
        if (byStatus !== 0) return byStatus;
        return b.dataInicio.localeCompare(a.dataInicio);
    });
}

export function hasActiveRecesso(recessos: RecessoRecord[]): RecessoRecord | null {
    return recessos.find(r => r.emRecessoAgora || r.statusRecesso === 'em_recesso') ?? null;
}

export type DiaStatus =
    | 'operou'       // operou o horário programado normalmente
    | 'fechou_cedo'  // fechou um pouco antes (normal — pouco movimento)
    | 'parcial'      // fechou uma parte significativa do horário
    | 'nao_operou'   // não abriu ou fechou logo após abrir (crítico)
    | 'recesso'      // pausa planejada (recesso de vários dias)
    | 'fechado';     // dia sem horário na grade

/** Minutos que consideramos "fechar um pouco antes" como comportamento normal */
const LIMIAR_FECHOU_CEDO_MIN = 30;
/** Abaixo disto de operação efetiva no dia = praticamente não operou (crítico) */
const LIMIAR_NAO_OPEROU_MIN = 20;
/** % mínima do horário programado para não ser considerado crítico */
const LIMIAR_NAO_OPEROU_PCT = 0.15;

export interface DiaResumo {
    date: Date;
    diaSemana: number;
    status: DiaStatus;
    /** Minutos programados na grade para o dia */
    programadoMin: number;
    /** Minutos efetivamente aberto (programado - fechado por recesso) */
    operouMin: number;
    /** Minutos fechados dentro do horário programado por recesso do mesmo dia */
    fechadoMin: number;
    /** Recesso relevante (planejado que cobre o dia, ou operacional do dia) */
    recesso: RecessoRecord | null;
}

export interface ResumoFuncionamento {
    dias: DiaResumo[];
    diasOperou: number;
    diasFechouCedo: number;
    diasParcial: number;
    diasNaoOperou: number;
    diasRecesso: number;
    diasFechado: number;
    /** Maior sequência de dias críticos consecutivos (não operou) */
    maiorSequenciaCritica: number;
    temHorario: boolean;
    totalDias: number;
}

function ymd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Extrai a parte YYYY-MM-DD de "2025-07-03 00:00:00" ou "2025-07-03T00:00:00" */
function ymdFromRaw(raw: string): string {
    const trimmed = raw.trim();
    const match = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
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

type Intervalo = { inicio: number; fim: number };

/** Intervalos programados (em minutos a partir da meia-noite) de um dia; fim pode passar de 1440 (vira madrugada). */
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
        if (f <= i) f += 1440; // fecha depois da meia-noite
        if (f > i) intervalos.push({ inicio: i, fim: f });
    }
    return intervalos;
}

function duracao(intervalos: Intervalo[]): number {
    return intervalos.reduce((sum, iv) => sum + (iv.fim - iv.inicio), 0);
}

function overlap(a: Intervalo, b: Intervalo): number {
    return Math.max(0, Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio));
}

function recessoIntervaloNoDia(r: RecessoRecord, diaMeiaNoite: Date): Intervalo | null {
    const start = parseDateTime(r.dataInicio);
    const end = parseDateTime(r.dataFim);
    if (!start || !end) return null;
    const base = diaMeiaNoite.getTime();
    const inicioMin = (start.getTime() - base) / 60000;
    const fimMin = (end.getTime() - base) / 60000;
    if (fimMin <= inicioMin) return null;
    return { inicio: inicioMin, fim: fimMin };
}

/** Recesso "planejado" = cobre mais de um dia de calendário (férias/pausa). */
function isRecessoPlanejado(r: RecessoRecord): boolean {
    const ini = ymdFromRaw(r.dataInicio);
    const fim = ymdFromRaw(r.dataFim);
    if (ini && fim) return ini !== fim;
    return r.diasDuracao >= 2;
}

/**
 * Resumo dos últimos N dias cruzando a grade semanal com os recessos (com horas exatas).
 * - Recesso de vários dias → pausa planejada (não é crítico).
 * - Recesso no mesmo dia → fechamento operacional: compara com o horário programado
 *   para saber se fechou cedo (normal), parcial, ou praticamente não operou (crítico).
 */
export function buildResumoFuncionamento(
    horarios: HorarioDia[],
    recessos: RecessoRecord[],
    days = 14,
    now: Date = new Date(),
): ResumoFuncionamento {
    const temHorario = horarios.some(h =>
        formatTurno(h.turno1Inicio, h.turno1Fim) !== 'Fechado'
        || formatTurno(h.turno2Inicio, h.turno2Fim) !== 'Fechado',
    );

    const planejados = recessos.filter(isRecessoPlanejado);
    const operacionais = recessos.filter(r => !isRecessoPlanejado(r));

    const dias: DiaResumo[] = [];
    let diasOperou = 0;
    let diasFechouCedo = 0;
    let diasParcial = 0;
    let diasNaoOperou = 0;
    let diasRecesso = 0;
    let diasFechado = 0;
    let maiorSequenciaCritica = 0;
    let sequenciaAtual = 0;

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const diaSemana = date.getDay();
        const dayYmd = ymd(date);

        const grade = horarios.find(h => h.diaSemana === diaSemana);
        const programados = intervalosProgramados(grade);
        const programadoMin = duracao(programados);

        // Recesso planejado (férias) cobrindo o dia?
        const planejadoCobre = planejados.find(r => {
            const ini = ymdFromRaw(r.dataInicio) || ymdFromRaw(r.dataFim);
            const fim = ymdFromRaw(r.dataFim) || ymdFromRaw(r.dataInicio);
            return dayYmd >= ini && dayYmd <= fim;
        }) ?? null;

        let status: DiaStatus;
        let operouMin = programadoMin;
        let fechadoMin = 0;
        let recesso: RecessoRecord | null = planejadoCobre;

        if (planejadoCobre) {
            status = 'recesso';
            operouMin = 0;
            fechadoMin = programadoMin;
            diasRecesso++;
        } else if (programadoMin === 0) {
            status = 'fechado';
            operouMin = 0;
            diasFechado++;
        } else {
            // Recessos operacionais (mesmo dia) que caem neste dia
            const doDia = operacionais.filter(r => ymdFromRaw(r.dataInicio) === dayYmd || ymdFromRaw(r.dataFim) === dayYmd);
            const recessoIntervalos = doDia
                .map(r => recessoIntervaloNoDia(r, date))
                .filter((iv): iv is Intervalo => iv != null);

            for (const prog of programados) {
                for (const rec of recessoIntervalos) {
                    fechadoMin += overlap(prog, rec);
                }
            }
            fechadoMin = Math.min(fechadoMin, programadoMin);
            operouMin = Math.max(0, programadoMin - fechadoMin);
            if (doDia.length) recesso = doDia[0];

            const pctOperou = programadoMin > 0 ? operouMin / programadoMin : 1;

            if (fechadoMin <= 0) {
                status = 'operou';
                diasOperou++;
            } else if (operouMin <= LIMIAR_NAO_OPEROU_MIN || pctOperou <= LIMIAR_NAO_OPEROU_PCT) {
                status = 'nao_operou';
                diasNaoOperou++;
            } else if (fechadoMin <= LIMIAR_FECHOU_CEDO_MIN) {
                status = 'fechou_cedo';
                diasFechouCedo++;
            } else {
                status = 'parcial';
                diasParcial++;
            }
        }

        if (status === 'nao_operou') {
            sequenciaAtual++;
            maiorSequenciaCritica = Math.max(maiorSequenciaCritica, sequenciaAtual);
        } else {
            sequenciaAtual = 0;
        }

        dias.push({ date, diaSemana, status, programadoMin, operouMin, fechadoMin, recesso });
    }

    return {
        dias,
        diasOperou,
        diasFechouCedo,
        diasParcial,
        diasNaoOperou,
        diasRecesso,
        diasFechado,
        maiorSequenciaCritica,
        temHorario,
        totalDias: days,
    };
}

/** "Fechou 45 min antes", "Operou 20 min de 8h", etc. */
export function descreverDia(dia: DiaResumo): string {
    switch (dia.status) {
        case 'operou':
            return 'Operou o horário normalmente';
        case 'fechou_cedo':
            return `Fechou ${Math.round(dia.fechadoMin)} min antes do previsto`;
        case 'parcial':
            return `Ficou fechado ${formatDuracaoMin(dia.fechadoMin)} do horário previsto`;
        case 'nao_operou':
            return dia.operouMin <= 1
                ? 'Não operou no horário previsto'
                : `Abriu e fechou logo (só ${Math.round(dia.operouMin)} min de ${formatDuracaoMin(dia.programadoMin)})`;
        case 'recesso':
            return dia.recesso?.descricao ? `Recesso: ${dia.recesso.descricao}` : 'Recesso planejado';
        case 'fechado':
            return 'Sem horário na grade';
        default:
            return '';
    }
}

function formatDuracaoMin(min: number): string {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}
