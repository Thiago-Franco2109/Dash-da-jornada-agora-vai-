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
