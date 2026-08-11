import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    HORARIOS_FUNCIONAMENTO_DATA_SOURCE,
    RECESSOS_ESTABELECIMENTO_DATA_SOURCE,
} from '../config/dataSource';
import type { GatewaySheetTable } from '../types/gatewaySheet';
import {
    fetchGatewaySheetTable,
    saveGatewaySheetCache,
    loadGatewaySheetCache,
    CACHE_KEYS,
} from '../utils/dataSync';
import {
    formatTurno,
    normalizeSemana,
    parseHorariosForEstab,
    parseRecessosForEstab,
    sortRecessos,
    type HorarioDia,
    type RecessoRecord,
} from '../utils/partnerFuncionamento';

interface UsePartnerFuncionamentoDataOptions {
    estabId: string;
    estabelecimento?: string;
    enabled?: boolean;
}

const EMPTY_TABLE: GatewaySheetTable = { headers: [], rows: [] };

/** De onde vieram os dados exibidos: banco (CMS, tempo real) ou planilha (sync diário). */
export type FuncionamentoFonte = 'banco' | 'planilha';

const FUNCIONAMENTO_FN_URL = '/.netlify/functions/funcionamento';

interface FuncionamentoLive {
    horarios: HorarioDia[];
    recessos: RecessoRecord[];
}

/**
 * Fonte primária: mesma base do CMS, sem o filtro de 90 dias do sync da planilha.
 * Só parceiros com ESTAB_ID numérico — o restante continua caindo na planilha.
 */
async function fetchFuncionamentoLive(estabId: string): Promise<FuncionamentoLive> {
    const res = await fetch(
        `${FUNCIONAMENTO_FN_URL}?estabId=${encodeURIComponent(estabId)}`,
        { credentials: 'include' as RequestCredentials, cache: 'no-store' },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar horários no banco.`);
    }
    return {
        horarios: normalizeSemana(Array.isArray(json.horarios) ? json.horarios : []),
        recessos: sortRecessos(Array.isArray(json.recessos) ? json.recessos : []),
    };
}

function partnerHasHorarios(
    horarios: ReturnType<typeof parseHorariosForEstab>,
): boolean {
    return horarios.some(dia =>
        formatTurno(dia.turno1Inicio, dia.turno1Fim) !== 'Fechado'
        || formatTurno(dia.turno2Inicio, dia.turno2Fim) !== 'Fechado',
    );
}

interface SheetFetchResult {
    table: GatewaySheetTable;
    error: string | null;
    fromCache: boolean;
}

async function fetchSheet(
    sheetId: string,
    tab: string,
    cacheKey: string,
): Promise<SheetFetchResult> {
    const cached = loadGatewaySheetCache(cacheKey);
    try {
        const table = await fetchGatewaySheetTable(sheetId, tab, { skipQueue: true });
        saveGatewaySheetCache(cacheKey, { data: table, lastSyncTime: new Date() });
        return { table, error: null, fromCache: false };
    } catch (err) {
        const message = err instanceof Error ? err.message : `Falha ao carregar aba ${tab}`;
        console.warn(`[usePartnerFuncionamentoData] Falha ao carregar "${tab}":`, message);
        if (cached?.data?.rows?.length) {
            return { table: cached.data, error: null, fromCache: true };
        }
        return { table: EMPTY_TABLE, error: `${tab}: ${message}`, fromCache: false };
    }
}

/** Horários semanais e recessos do parceiro — abas da planilha mestre (BIGOU). */
export function usePartnerFuncionamentoData({
    estabId,
    estabelecimento = '',
    enabled = true,
}: UsePartnerFuncionamentoDataOptions) {
    const [horariosTable, setHorariosTable] = useState<GatewaySheetTable>(EMPTY_TABLE);
    const [recessosTable, setRecessosTable] = useState<GatewaySheetTable>(EMPTY_TABLE);
    const [liveData, setLiveData] = useState<FuncionamentoLive | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isUsingCache, setIsUsingCache] = useState(false);
    const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

    // Ref (e não state) para não recriar performSync e disparar o efeito em loop.
    const jaTemDadosRef = useRef(false);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        const idNumerico = estabId.trim();
        if (/^\d+$/.test(idNumerico)) {
            if (jaTemDadosRef.current) setIsRefreshing(true);
            else setIsLoading(true);

            try {
                const live = await fetchFuncionamentoLive(idNumerico);
                setLiveData(live);
                setLastSyncTime(new Date());
                setIsUsingCache(false);
                setError(null);
                setHasFetchedOnce(true);
                jaTemDadosRef.current = true;
                return;
            } catch (err) {
                console.warn('[usePartnerFuncionamentoData] Banco indisponível; usando a planilha:', err);
                setLiveData(null);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        }

        const cachedH = loadGatewaySheetCache(CACHE_KEYS.horarios_funcionamento);
        const cachedR = loadGatewaySheetCache(CACHE_KEYS.recessos_estabelecimento);
        const hasCache = !!(cachedH?.data?.rows?.length || cachedR?.data?.rows?.length);

        if (hasCache) {
            if (cachedH?.data) setHorariosTable(cachedH.data);
            if (cachedR?.data) setRecessosTable(cachedR.data);
            const cacheTime = cachedH?.lastSyncTime ?? cachedR?.lastSyncTime ?? null;
            setLastSyncTime(cacheTime);
            setIsUsingCache(true);
            setIsLoading(false);
            setHasFetchedOnce(true);
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            setError(null);
            const syncTime = new Date();

            const horarios = await fetchSheet(
                HORARIOS_FUNCIONAMENTO_DATA_SOURCE.sheetId,
                HORARIOS_FUNCIONAMENTO_DATA_SOURCE.range,
                CACHE_KEYS.horarios_funcionamento,
            );
            const recessos = await fetchSheet(
                RECESSOS_ESTABELECIMENTO_DATA_SOURCE.sheetId,
                RECESSOS_ESTABELECIMENTO_DATA_SOURCE.range,
                CACHE_KEYS.recessos_estabelecimento,
            );

            setHorariosTable(horarios.table);
            setRecessosTable(recessos.table);
            setLastSyncTime(syncTime);
            setIsUsingCache(horarios.fromCache || recessos.fromCache);
            setHasFetchedOnce(true);
            jaTemDadosRef.current = true;

            const errors = [horarios.error, recessos.error].filter(Boolean);
            setError(errors.length ? errors.join(' · ') : null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar horários e recessos';
            setError(message);
            if (hasCache) {
                if (cachedH?.data) setHorariosTable(cachedH.data);
                if (cachedR?.data) setRecessosTable(cachedR.data);
                setLastSyncTime(cachedH?.lastSyncTime ?? cachedR?.lastSyncTime ?? null);
                setIsUsingCache(true);
                setHasFetchedOnce(true);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [enabled, estabId]);

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }

        // Com ESTAB_ID numérico a fonte é o banco; o cache da planilha só entra
        // em cena se a Function falhar (fallback dentro do performSync).
        if (/^\d+$/.test(estabId.trim())) {
            performSync();
            return;
        }

        const cachedH = loadGatewaySheetCache(CACHE_KEYS.horarios_funcionamento);
        const cachedR = loadGatewaySheetCache(CACHE_KEYS.recessos_estabelecimento);
        if (cachedH?.data?.rows?.length) setHorariosTable(cachedH.data);
        if (cachedR?.data?.rows?.length) setRecessosTable(cachedR.data);
        if (cachedH?.data?.rows?.length || cachedR?.data?.rows?.length) {
            setLastSyncTime(cachedH?.lastSyncTime ?? cachedR?.lastSyncTime ?? null);
            setIsUsingCache(true);
            setIsLoading(false);
            setHasFetchedOnce(true);
        }

        performSync();
    }, [enabled, estabId, performSync]);

    const horariosDoParceiro = useMemo(
        () => liveData?.horarios ?? parseHorariosForEstab(horariosTable, estabId, estabelecimento),
        [liveData, horariosTable, estabId, estabelecimento],
    );

    const recessosDoParceiro = useMemo(
        () => liveData?.recessos ?? parseRecessosForEstab(recessosTable, estabId, estabelecimento),
        [liveData, recessosTable, estabId, estabelecimento],
    );

    const fonte: FuncionamentoFonte = liveData ? 'banco' : 'planilha';

    return {
        horarios: horariosDoParceiro,
        recessos: recessosDoParceiro,
        fonte,
        sheetHorariosCount: horariosTable.rows.length,
        sheetRecessosCount: recessosTable.rows.length,
        hasPartnerHorarios: partnerHasHorarios(horariosDoParceiro),
        isLoading,
        isRefreshing,
        error,
        isUsingCache,
        lastSyncTime,
        hasFetchedOnce,
        refreshData: performSync,
    };
}
