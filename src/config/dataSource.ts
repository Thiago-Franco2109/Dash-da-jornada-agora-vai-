// Configuration for data source
// Uses a Netlify Function proxy to hide sheet IDs from the frontend
// The proxy calls the Bigou Sheets Gateway API via cookie httpOnly authentication

/** 
 * Tipos de planilhas suportadas pelo proxy (Netlify Function: /api/sheets-proxy)
 * Essas chaves são mapeadas para IDs reais no servidor via variáveis de ambiente.
 */
export type SheetType = 'main' | 'access' | 'logo';

export const DATA_SOURCE = {
    // ID simbólico mapeado no servidor para a planilha principal
    type: 'main' as SheetType,
    // Nome da aba (o Gateway adiciona o range automaticamente)
    range: 'novos formatado',
};

export const ACCESS_DATA_SOURCE = {
    type: 'access' as SheetType,
    range: 'novo relatório final',
};

/** Planilha de logos dos parceiros (atualizada diariamente) */
export const LOGO_SHEET_SOURCE = {
    type: 'logo' as SheetType,
    range: 'dados',
} as const;

/** @deprecated alias: use LOGO_SHEET_SOURCE.type */
export const LOGO_REFERENCE_SHEET_ID = LOGO_SHEET_SOURCE.type;

