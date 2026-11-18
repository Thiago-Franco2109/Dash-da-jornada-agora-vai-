import { useState, useCallback, useEffect } from 'react';
import { ACCESS_DATA_SOURCE } from '../config/dataSource';
import { encodeSheetTabForGateway } from '../utils/dataSync';
import { findCellByNames } from '../utils/sheetColumnMatch';

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? 'https://sheets-api-production-0097.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

function apiUrl(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem("auth_token");
    const options: RequestInit = { credentials: "include" as RequestCredentials };
    if (token) {
        options.headers = {
            ...options.headers,
            "Authorization": `Bearer ${token}`
        };
    }
    return options;
}


export interface StoreAccessData {
    estabelecimento: string;
    estabId: string;           // id da planilha ('' quando a linha não traz)
    acessosUnicos: number;    // soma total de todos os dias disponíveis
    mediaDiaria: number;       // média de acessos por dia
    lastDayAcessos: number;    // valor do último dia disponível
    totalDias: number;         // quantos dias têm dados
    /** nome repetido na planilha: a linha não identifica uma loja só */
    ambiguo?: boolean;
    raw: Record<string, any>;  // linha completa da planilha
}

const ACCESS_ID_COLUMNS = ['ESTABELECIMENTO_ID', 'ESTAB_ID', 'ID_ESTABELECIMENTO', 'ID LOJA', 'ID'];
const ACCESS_DAY_COLUMNS = ['Day', 'Dia', 'Date', 'Data'];
const ACCESS_USERS_COLUMNS = ['Active users', 'Usuarios ativos', 'Usuários ativos', 'Acessos', 'Users'];
const ACCESS_STORE_COLUMNS = ['Loja', 'Estabelecimento', 'Parceiro'];

/** GA devolve "(not set)" quando o evento não trouxe o parâmetro — não é loja. */
function isNotSet(valor: string): boolean {
    return !valor || /^\(not set\)$/i.test(valor.trim());
}

/** Chaves do mapa: id é autoritativo, nome é fallback (ver memória: identidade é o ID) */
const byId = (id: string) => `id:${id.trim()}`;
const byName = (nome: string) => `nome:${nome.trim().toLowerCase()}`;

/**
 * Resolve os acessos de um parceiro. Tenta o estab_id primeiro; só cai no nome
 * quando a planilha não traz id. Nome repetido devolve null — a planilha tem
 * duas lojas com aquele nome e qualquer número escolhido seria chute.
 */
/**
 * Acesso de uma loja QUALQUER pelo id — sem o fallback por nome do
 * `lookupAccess`, que existe só para o parceiro que veio da planilha sem id.
 * É o que a comparação com a concorrência usa: lá o id sai do banco e nome
 * repetido entre cidades não pode nem encostar na conta (ver memória
 * "identidade de loja é o ID").
 */
export function lookupAccessById(
    accessData: Record<string, StoreAccessData>,
    id: string | number,
): StoreAccessData | null {
    const chave = String(id).trim();
    if (!chave) return null;
    return accessData[byId(chave)] ?? null;
}

export function lookupAccess(
    accessData: Record<string, StoreAccessData>,
    partner: { estab_id?: string | number | null; estabelecimento?: string | null },
): StoreAccessData | null {
    const id = partner.estab_id == null ? '' : String(partner.estab_id).trim();
    if (id) {
        const hit = accessData[byId(id)];
        if (hit) return hit;
    }

    const nome = (partner.estabelecimento ?? '').trim();
    if (!nome) return null;

    const hit = accessData[byName(nome)];
    if (!hit || hit.ambiguo) return null;
    return hit;
}

export function useDailyAccessSync({ enabled = true }: { enabled?: boolean } = {}) {
    const [accessData, setAccessData] = useState<Record<string, StoreAccessData>>({});
    /**
     * Dias DISTINTOS que a planilha inteira cobre.
     *
     * `StoreAccessData.mediaDiaria` divide pelos dias em que AQUELA loja teve
     * acesso, e a planilha não traz linha de dia zerado: loja vista em 3 dias
     * de 30 ganha média de 3 dias e parece movimentada. Para comparar lojas
     * entre si a divisão tem que ser pela mesma janela — esta.
     */
    const [diasJanela, setDiasJanela] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const performSync = useCallback(async () => {
        if (!enabled) return;
        if (!ACCESS_DATA_SOURCE.sheetId) {
            setError("Access Sheet ID is missing.");
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const url = apiUrl(`/api/sheets/${ACCESS_DATA_SOURCE.sheetId}/${encodeSheetTabForGateway(ACCESS_DATA_SOURCE.range)}`);
            const res = await fetch(url, getFetchOptions());


            if (!res.ok) {
                throw new Error(`Failed to fetch access data: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();
            const rows: Record<string, any>[] = json.data?.rows || (Array.isArray(json) ? json : json.values || []);

            // A aba `analytics` é o retorno cru do SyncWith: uma linha por dia × loja,
            // não uma linha por loja com colunas de data. Agregamos por
            // estabelecimento_id, que identifica a loja sozinho (o nome não).
            type Acumulado = {
                estabelecimento: string;
                estabId: string;
                total: number;
                dias: Set<string>;
                ultimoTs: number;
                ultimoValor: number;
                raw: Record<string, any>;
            };

            const porChave = new Map<string, Acumulado>();
            const idsPorNome = new Map<string, Set<string>>();
            const diasGlobais = new Set<string>();

            rows.forEach((row: any) => {
                if (!row) return;

                const nome = findCellByNames(row, ACCESS_STORE_COLUMNS);
                const estabId = findCellByNames(row, ACCESS_ID_COLUMNS).replace(/\D/g, '');

                // Linha sem loja e sem id é o acesso que o app não atribuiu a ninguém.
                if (isNotSet(nome) && !estabId) return;

                const usuarios = parseInt(String(findCellByNames(row, ACCESS_USERS_COLUMNS)).replace(/\D/g, ''), 10);
                if (isNaN(usuarios) || usuarios <= 0) return;

                const dia = findCellByNames(row, ACCESS_DAY_COLUMNS);
                const chave = estabId ? byId(estabId) : byName(nome);

                const acc: Acumulado = porChave.get(chave) ?? {
                    estabelecimento: isNotSet(nome) ? '' : nome.trim(),
                    estabId,
                    total: 0,
                    dias: new Set<string>(),
                    ultimoTs: -Infinity,
                    ultimoValor: 0,
                    raw: row,
                };

                acc.total += usuarios;
                if (dia) {
                    acc.dias.add(dia);
                    diasGlobais.add(dia);
                    const ts = Date.parse(dia);
                    if (!isNaN(ts) && ts >= acc.ultimoTs) {
                        acc.ultimoTs = ts;
                        acc.ultimoValor = usuarios;
                    }
                }
                if (!acc.estabelecimento && !isNotSet(nome)) acc.estabelecimento = nome.trim();
                porChave.set(chave, acc);

                if (!isNotSet(nome)) {
                    const chaveNome = byName(nome);
                    const ids = idsPorNome.get(chaveNome) ?? new Set<string>();
                    ids.add(estabId);
                    idsPorNome.set(chaveNome, ids);
                }
            });

            const parsedData: Record<string, StoreAccessData> = {};

            porChave.forEach((acc, chave) => {
                const totalDias = acc.dias.size;
                const entry: StoreAccessData = {
                    estabelecimento: acc.estabelecimento,
                    estabId: acc.estabId,
                    acessosUnicos: acc.total,
                    mediaDiaria: totalDias > 0 ? Math.round(acc.total / totalDias) : 0,
                    lastDayAcessos: acc.ultimoValor,
                    totalDias,
                    raw: acc.raw,
                };
                parsedData[chave] = entry;

                // O índice por nome só vale quando aquele nome aponta para uma loja
                // só. Com dois ids no mesmo nome, qualquer número seria chute.
                if (acc.estabId && acc.estabelecimento) {
                    const chaveNome = byName(acc.estabelecimento);
                    const ids = idsPorNome.get(chaveNome);
                    if (ids && ids.size > 1) {
                        parsedData[chaveNome] = { ...entry, ambiguo: true };
                    } else if (!parsedData[chaveNome]) {
                        parsedData[chaveNome] = entry;
                    }
                }
            });

            setAccessData(parsedData);
            setDiasJanela(diasGlobais.size);
            setLastSyncTime(new Date());

        } catch (err: any) {
            console.error("Access data sync failed:", err);
            setError(err.message || "Failed to synchronize access data.");
        } finally {
            setIsLoading(false);
        }
    }, [enabled]);

    // Initial load — só executa quando enabled for true
    useEffect(() => {
        if (enabled) performSync();
        else setIsLoading(false);
    }, [performSync, enabled]);

    return {
        accessData,
        diasJanela,
        loadingAccess: isLoading,
        accessError: error,
        lastAccessSync: lastSyncTime,
        refreshAccessData: performSync
    };
}
