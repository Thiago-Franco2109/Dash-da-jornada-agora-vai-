// Configuration for data source
// Calls the Bigou Sheets Gateway API directly via browser credentials (cookies)

export const THIAGO_DATA_SOURCE = {
    // Google Sheets spreadsheet ID
    sheetId: '1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU',
    // Nome da aba
    range: 'novos formatado',
};

export const LAIS_DATA_SOURCE = {
    // Google Sheets spreadsheet ID da Laís
    sheetId: '1LjUUgITjhHpkNoH8R10yf-EBn6f6XCvsjkDqA6vTWYM',
    // Nome da aba
    range: 'novos formatado',
};

// Consolidated data sources for the main dashboard
export const PARTNER_DATA_SOURCES = [
    THIAGO_DATA_SOURCE,
    LAIS_DATA_SOURCE,
];

/** @deprecated Use THIAGO_DATA_SOURCE or PARTNER_DATA_SOURCES */
export const DATA_SOURCE = THIAGO_DATA_SOURCE;

// ── Cardápio Digital (CD) ──────────────────────────────────────

/** CD — aba com todos os novos assinantes (formatada) */
export const CD_NOVOS_DATA_SOURCE = {
    sheetId: '1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU',
    range: 'CD_TODOS_NOVOS_FORMATADO',
};

/** CD — aba com desempenho total dos assinantes (nome exato da aba na planilha) */
export const CD_DESEMPENHO_DATA_SOURCE = {
    sheetId: '1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU',
    range: (import.meta.env.VITE_CD_DESEMPENHO_TAB as string | undefined)?.trim() || 'CD_TODOS_DESEMPENHO',
};

/** Fontes consolidadas para o modo Cardápio Digital */
export const CD_DATA_SOURCES = [
    CD_NOVOS_DATA_SOURCE,
];

/** Fonte da aba Todas as Lojas (referência estável para o hook) */
export const CD_DESEMPENHO_SOURCES = [CD_DESEMPENHO_DATA_SOURCE];


export const ACCESS_DATA_SOURCE = {
    sheetId: '1fSmujBzlFtu4ZTuTl5v2nUcFwL3uol3QFqRrzEUULEA',
    range: 'novo relatório final',
};

/** Planilha de logos dos parceiros (atualizada diariamente) */
export const LOGO_SHEET_SOURCE = {
    sheetId: '1Y5_TXSIi2RFyd_uUMXcWLQTQ52Oy8kCwYZrnlj6a5Xk',
    range: 'dados',
} as const;

/** Aba INDICADOR – contém status de promoção (col E) e cupom (col F) por parceiro */
export const INDICADOR_DATA_SOURCE = {
    sheetId: '1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU',
    range: 'INDICADOR',
} as const;

/** @deprecated alias: use LOGO_SHEET_SOURCE.sheetId */
export const LOGO_REFERENCE_SHEET_ID = LOGO_SHEET_SOURCE.sheetId;
