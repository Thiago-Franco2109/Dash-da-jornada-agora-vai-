/** Tabela genérica retornada pelo Bigou Sheets Gateway */
export interface GatewaySheetTable {
    headers: string[];
    rows: Record<string, unknown>[];
    /** Ordem completa das colunas (A, B, C…) — preserva índices do INDICADOR */
    orderedHeaders?: string[];
}

export interface GatewaySheetCacheResult {
    data: GatewaySheetTable;
    lastSyncTime: Date;
}
