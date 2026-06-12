import { format, isValid, parse, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

const PT_MONTH_NAMES: Record<string, number> = {
    janeiro: 0, jan: 0,
    fevereiro: 1, fev: 1,
    marco: 2, mar: 2,
    abril: 3, abr: 3,
    maio: 4, mai: 4,
    junho: 5, jun: 5,
    julho: 6, jul: 6,
    agosto: 7, ago: 7,
    setembro: 8, set: 8,
    outubro: 9, out: 9,
    novembro: 10, nov: 10,
    dezembro: 11, dez: 11,
};

/** Chave de mês no fuso local — evita deslocar jun/2025 para mai ao usar parseISO. */
export function sheetMonthKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function formatSheetMonthLabel(d: Date, pattern: 'MMM/yyyy' | 'MMM/yy' = 'MMM/yyyy'): string {
    return format(d, pattern, { locale: ptBR });
}

function normalizeSheetDateText(s: string): string {
    return s
        .replace(/\u00a0/g, ' ')
        .replace(/[\u2013\u2014]/g, '-')
        .trim();
}

function parseLocalIsoDate(s: string): Date | null {
    const m = normalizeSheetDateText(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isValid(d) ? d : null;
}

function parseSheetSerialDate(val: number): Date | null {
    if (!Number.isFinite(val) || val < 1) return null;
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + Math.round(val * 86_400_000));
    return isValid(d) ? d : null;
}

function parsePortugueseMonthYear(s: string): Date | null {
    const cleaned = normalizeSheetDateText(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*-\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return null;

    const named = cleaned.match(/^([a-z]+)\s+(\d{4})$/);
    if (named) {
        const monthIdx = PT_MONTH_NAMES[named[1]];
        if (monthIdx !== undefined) {
            const d = new Date(Number(named[2]), monthIdx, 1);
            if (isValid(d)) return d;
        }
    }

    for (const fmt of ['MMMM yyyy', 'MMM yyyy', 'MMMM/yyyy', 'MMM/yyyy'] as const) {
        const d = parse(cleaned, fmt, new Date(), { locale: ptBR });
        if (isValid(d)) return d;
    }
    return null;
}

function parseSlashDate(s: string): Date | null {
    const m = normalizeSheetDateText(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;

    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);

    // BR (dd/mm) vs US (mm/dd)
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
        day = a;
        month = b;
    } else if (b > 12 && a <= 12) {
        month = a;
        day = b;
    } else {
        day = a;
        month = b;
    }

    const d = new Date(year, month - 1, day);
    return isValid(d) ? d : null;
}

function parseNumericMonthValue(val: number): Date | null {
    const serial = parseSheetSerialDate(val);
    if (serial) return serial;
    if (val >= 190001 && val <= 210012 && val % 1 === 0) {
        const year = Math.floor(val / 100);
        const month = val % 100;
        if (month >= 1 && month <= 12) {
            const d = new Date(year, month - 1, 1);
            return isValid(d) ? d : null;
        }
    }
    return null;
}

/** Interpreta datas de planilha sempre como calendário local (não UTC). */
export function parseSheetMonthDate(val: unknown): Date | null {
    if (val == null || val === '') return null;
    if (val instanceof Date && isValid(val)) return val;

    if (typeof val === 'object') {
        const obj = val as { year?: unknown; month?: unknown; day?: unknown };
        if (typeof obj.year === 'number' && typeof obj.month === 'number') {
            const d = new Date(obj.year, obj.month - 1, typeof obj.day === 'number' ? obj.day : 1);
            if (isValid(d)) return d;
        }
    }

    if (typeof val === 'number') return parseNumericMonthValue(val);

    const s = normalizeSheetDateText(String(val));
    if (!s) return null;

    if (/^\d+(\.\d+)?$/.test(s)) {
        const numeric = parseNumericMonthValue(parseFloat(s));
        if (numeric) return numeric;
    }

    const localIso = parseLocalIsoDate(s);
    if (localIso) return localIso;

    const pt = parsePortugueseMonthYear(s);
    if (pt) return pt;

    const ym = s.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
        const d = new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
        return isValid(d) ? d : null;
    }

    const my = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (my) {
        const d = new Date(Number(my[2]), Number(my[1]) - 1, 1);
        return isValid(d) ? d : null;
    }

    const slash = parseSlashDate(s);
    if (slash) return slash;

    if (s.length > 10) {
        const iso = parseISO(s);
        if (isValid(iso)) return iso;
    }

    return null;
}

export function inferSheetMonthKey(val: unknown): string | null {
    const d = parseSheetMonthDate(val);
    return d ? sheetMonthKey(d) : null;
}

export function matchesSheetMonthFilter(date: Date | null, monthKeyFilter: string): boolean {
    if (!monthKeyFilter) return true;
    if (!date) return false;
    return sheetMonthKey(date) === monthKeyFilter;
}

export function matchesSheetMonthKey(monthKey: string | null | undefined, monthKeyFilter: string): boolean {
    if (!monthKeyFilter) return true;
    if (!monthKey) return false;
    return monthKey === monthKeyFilter;
}

/** Tenta várias colunas até achar uma data válida. */
export function parseMonthFromRow(
    row: Record<string, unknown>,
    columns: string[],
): { monthStart: Date | null; monthKey: string | null } {
    for (const col of columns) {
        if (!col) continue;
        const monthStart = parseSheetMonthDate(row[col]);
        if (monthStart) {
            return { monthStart, monthKey: sheetMonthKey(monthStart) };
        }
    }
    for (const [key, val] of Object.entries(row)) {
        if (!/mes|month|data/i.test(key)) continue;
        const monthStart = parseSheetMonthDate(val);
        if (monthStart) {
            return { monthStart, monthKey: sheetMonthKey(monthStart) };
        }
    }
    return { monthStart: null, monthKey: null };
}
