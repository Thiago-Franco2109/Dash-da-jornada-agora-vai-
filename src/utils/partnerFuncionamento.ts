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

export type DiaStatus = 'operou' | 'recesso' | 'fechado';

export interface DiaResumo {
    date: Date;
    diaSemana: number;
    status: DiaStatus;
    /** Recesso que cobre este dia, se houver */
    recesso: RecessoRecord | null;
}

export interface ResumoFuncionamento {
    dias: DiaResumo[];
    diasOperou: number;
    diasRecesso: number;
    diasFechado: number;
    temHorario: boolean;
    /** Nº total de dias analisados */
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

function horarioAbreNoDia(horarios: HorarioDia[], diaSemana: number): boolean {
    const h = horarios.find(x => x.diaSemana === diaSemana);
    if (!h) return false;
    return formatTurno(h.turno1Inicio, h.turno1Fim) !== 'Fechado'
        || formatTurno(h.turno2Inicio, h.turno2Fim) !== 'Fechado';
}

function recessoCobreDia(recessos: RecessoRecord[], dayYmd: string): RecessoRecord | null {
    for (const r of recessos) {
        const start = ymdFromRaw(r.dataInicio);
        const end = ymdFromRaw(r.dataFim);
        if (!start && !end) continue;
        const lo = start || end;
        const hi = end || start;
        if (dayYmd >= lo && dayYmd <= hi) return r;
    }
    return null;
}

/**
 * Resumo dos últimos N dias: cruza a grade semanal com os recessos.
 * Regra: em recesso → não operou; senão com horário no dia da semana → operou;
 * senão (dia fechado na grade) → fechado.
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

    const dias: DiaResumo[] = [];
    let diasOperou = 0;
    let diasRecesso = 0;
    let diasFechado = 0;

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const diaSemana = date.getDay();
        const dayYmd = ymd(date);

        const recesso = recessoCobreDia(recessos, dayYmd);
        let status: DiaStatus;
        if (recesso) {
            status = 'recesso';
            diasRecesso++;
        } else if (horarioAbreNoDia(horarios, diaSemana)) {
            status = 'operou';
            diasOperou++;
        } else {
            status = 'fechado';
            diasFechado++;
        }

        dias.push({ date, diaSemana, status, recesso });
    }

    return { dias, diasOperou, diasRecesso, diasFechado, temHorario, totalDias: days };
}
