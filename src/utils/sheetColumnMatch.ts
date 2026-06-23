function normalizeKey(key: string): string {
    return key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s.]+/g, ' ')
        .trim();
}

/** Encontra o nome da coluna na planilha a partir de candidatos (ex.: CIDADE, Cidade) */
export function resolveSheetColumn(headers: string[], candidates: string[]): string | null {
    const normalizedHeaders = headers.map(h => ({ raw: h, norm: normalizeKey(h) }));
    const normalizedCandidates = candidates.map(normalizeKey);

    for (const candidate of normalizedCandidates) {
        const exact = normalizedHeaders.find(h => h.norm === candidate);
        if (exact?.raw) return exact.raw;
    }

    for (const candidate of normalizedCandidates) {
        const partial = normalizedHeaders.find(h =>
            h.norm.length >= 5
            && (h.norm.startsWith(candidate) || candidate.startsWith(h.norm)),
        );
        if (partial?.raw) return partial.raw;
    }

    return null;
}

export const CITY_COLUMN_CANDIDATES = [
    'CIDADE', 'Cidade', 'cidade', 'LOCALIDADE', 'Localidade', 'MUNICIPIO', 'Município',
];

export const PARTNER_COLUMN_CANDIDATES = [
    'ESTABELECIMENTO', 'Estabelecimento', 'estabelecimento',
    'PARCEIRO', 'Parceiro', 'LOJA', 'Loja',
    'FANTASIA', 'Fantasia', 'NOME_FANTASIA', 'NOME', 'Nome',
];

export function cellText(row: Record<string, unknown>, column: string | null): string {
    if (!column) return '';
    const val = row[column];
    return val == null ? '' : String(val).trim();
}

/** Busca valor ignorando maiúsculas/acentos no nome da coluna */
export function findCellByNames(row: Record<string, unknown>, names: string[]): string {
    const targets = new Set(names.map(normalizeKey));
    for (const key of Object.keys(row)) {
        if (targets.has(normalizeKey(key))) {
            const val = String(row[key] ?? '').trim();
            if (val) return val;
        }
    }
    return '';
}

/** Lê célula pela posição fixa (coluna A=0, B=1…) — prioridade no INDICADOR */
export function cellByPosition(
    row: Record<string, unknown>,
    orderedHeaders: string[],
    index: number,
    names: string[] = [],
): string {
    const byColKey = cellText(row, `__col_${index}`);
    if (byColKey) return byColKey;

    const byIndex = row[String(index)] ?? row[index];
    if (byIndex != null && String(byIndex).trim()) return String(byIndex).trim();

    const byName = findCellByNames(row, names);
    if (byName) return byName;

    const resolved = resolveSheetColumn(orderedHeaders, names);
    if (resolved) {
        const byResolved = cellText(row, resolved);
        if (byResolved) return byResolved;
    }

    const headerAt = orderedHeaders[index]?.trim();
    if (headerAt) {
        const byHeader = cellText(row, headerAt);
        if (byHeader) return byHeader;
    }

    return '';
}

/** Lê célula: posição fixa → nome → cabeçalho na coluna */
export function cellByHeaderOrIndex(
    row: Record<string, unknown>,
    orderedHeaders: string[],
    names: string[],
    index: number,
): string {
    return cellByPosition(row, orderedHeaders, index, names);
}
