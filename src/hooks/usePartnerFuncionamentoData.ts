import { useMemo } from 'react';
import {
    HORARIOS_FUNCIONAMENTO_DATA_SOURCE,
    RECESSOS_ESTABELECIMENTO_DATA_SOURCE,
} from '../config/dataSource';
import { CACHE_KEYS } from '../utils/dataSync';
import {
    formatTurno,
    parseHorariosForEstab,
    parseRecessosForEstab,
} from '../utils/partnerFuncionamento';
import { useGatewaySheetData } from './useGatewaySheetData';

interface UsePartnerFuncionamentoDataOptions {
    estabId: string;
    estabelecimento?: string;
    enabled?: boolean;
}

function partnerHasHorarios(
    horarios: ReturnType<typeof parseHorariosForEstab>,
): boolean {
    return horarios.some(dia =>
        formatTurno(dia.turno1Inicio, dia.turno1Fim) !== 'Fechado'
        || formatTurno(dia.turno2Inicio, dia.turno2Fim) !== 'Fechado',
    );
}

/** Horários semanais e recessos do parceiro — abas da planilha mestre (BIGOU). */
export function usePartnerFuncionamentoData({
    estabId,
    estabelecimento = '',
    enabled = true,
}: UsePartnerFuncionamentoDataOptions) {
    const horarios = useGatewaySheetData({
        sheetId: HORARIOS_FUNCIONAMENTO_DATA_SOURCE.sheetId,
        tab: HORARIOS_FUNCIONAMENTO_DATA_SOURCE.range,
        cacheKey: CACHE_KEYS.horarios_funcionamento,
        enabled,
        allowEmpty: true,
    });

    const recessos = useGatewaySheetData({
        sheetId: RECESSOS_ESTABELECIMENTO_DATA_SOURCE.sheetId,
        tab: RECESSOS_ESTABELECIMENTO_DATA_SOURCE.range,
        cacheKey: CACHE_KEYS.recessos_estabelecimento,
        enabled,
        allowEmpty: true,
    });

    const horariosDoParceiro = useMemo(
        () => parseHorariosForEstab(horarios.table, estabId, estabelecimento),
        [horarios.table, estabId, estabelecimento],
    );

    const recessosDoParceiro = useMemo(
        () => parseRecessosForEstab(recessos.table, estabId, estabelecimento),
        [recessos.table, estabId, estabelecimento],
    );

    const sheetHorariosCount = horarios.table.rows.length;
    const sheetRecessosCount = recessos.table.rows.length;
    const hasPartnerHorarios = partnerHasHorarios(horariosDoParceiro);

    const isLoading = horarios.isLoading || recessos.isLoading;
    const isRefreshing = horarios.isRefreshing || recessos.isRefreshing;
    const error = [horarios.error, recessos.error].filter(Boolean).join(' · ') || null;
    const isUsingCache = horarios.isUsingCache || recessos.isUsingCache;

    const lastSyncTime = useMemo(() => {
        const times = [horarios.lastSyncTime, recessos.lastSyncTime].filter(Boolean) as Date[];
        if (times.length === 0) return null;
        return times.reduce((latest, t) => (t > latest ? t : latest));
    }, [horarios.lastSyncTime, recessos.lastSyncTime]);

    const refreshData = () => {
        horarios.refreshData();
        recessos.refreshData();
    };

    return {
        horarios: horariosDoParceiro,
        recessos: recessosDoParceiro,
        sheetHorariosCount,
        sheetRecessosCount,
        hasPartnerHorarios,
        isLoading,
        isRefreshing,
        error,
        isUsingCache,
        lastSyncTime,
        refreshData,
    };
}
