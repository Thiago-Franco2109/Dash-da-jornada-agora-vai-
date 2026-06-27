import { LOJAS_DELIVERY_DATA_SOURCE } from '../config/dataSource';
import { CACHE_KEYS } from '../utils/dataSync';
import { useGatewaySheetData } from './useGatewaySheetData';

interface UseLojasDeliveryDataOptions {
    enabled?: boolean;
}

/** Lê a aba LOJAS_DELIVERY da planilha mestre via Bigou Sheets Gateway. */
export function useLojasDeliveryData({ enabled = true }: UseLojasDeliveryDataOptions = {}) {
    return useGatewaySheetData({
        sheetId: LOJAS_DELIVERY_DATA_SOURCE.sheetId,
        tab: LOJAS_DELIVERY_DATA_SOURCE.range,
        cacheKey: CACHE_KEYS.lojas_delivery,
        enabled,
    });
}
