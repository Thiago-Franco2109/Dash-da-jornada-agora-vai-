/** Tabela genérica retornada pelo Bigou Sheets Gateway */
export interface GatewaySheetTable {
    headers: string[];
    rows: Record<string, unknown>[];
}

export interface GatewaySheetCacheResult {
    data: GatewaySheetTable;
    lastSyncTime: Date;
}
