// Configuration for data source
// Calls the Bigou Sheets Gateway API directly via browser credentials (cookies)

export const DATA_SOURCE = {
    // Google Sheets spreadsheet ID
    sheetId: '1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU',
    // Nome da aba
    range: 'novos formatado',
};

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
