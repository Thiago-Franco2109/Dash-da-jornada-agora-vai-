function normalizeKey(key: string): string {
    return key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s]+/g, ' ')
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
            h.norm !== candidate
            && candidate.includes(h.norm)
            && h.norm.length >= 4,
        );
        if (partial?.raw) return partial.raw;
    }
    return null;
}

export const CITY_COLUMN_CANDIDATES = [
    'CIDADE', 'Cidade', 'cidade', 'LOCALIDADE', 'Localidade', 'MUNICIPIO', 'Município',
];

export const PARTNER_COLUMN_CANDIDATES = [
    'PARCEIRO', 'Parceiro', 'ESTABELECIMENTO', 'Estabelecimento', 'LOJA', 'Loja',
    'NOME', 'Nome', 'parceiro_nome', 'FANTASIA', 'Fantasia', 'NOME_FANTASIA',
];

export function cellText(row: Record<string, unknown>, column: string | null): string {
    if (!column) return '';
    const val = row[column];
    return val == null ? '' : String(val).trim();
}
