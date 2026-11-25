import { useState, useCallback, useEffect } from 'react';

const FN_URL = '/.netlify/functions/ga-acessos';

/** Janela que o GA respondeu — exibida na tela para o CS saber o que está contando. */
export interface JanelaAcesso {
    inicio: string;   // YYYY-MM-DD
    fim: string;      // YYYY-MM-DD (ontem; o GA exclui o dia corrente)
    dias: number;
}

export interface StoreAccessData {
    estabelecimento: string;   // '' — a API devolve id, não nome (e nome não identifica loja)
    estabId: string;
    acessosUnicos: number;
    mediaDiaria: number;
    ultimoDia: string;         // fim da janela
    totalDias: number;         // tamanho da janela
    raw: Record<string, unknown>;
}

const byId = (id: string) => `id:${id.trim()}`;

/**
 * Acesso de uma loja pelo id. Só existe busca por id: nome de loja se repete
 * entre cidades e nunca identificou parceiro (ver memória "identidade de loja
 * é o ID"). O caminho antigo, via planilha, tinha um fallback por nome porque
 * a planilha nem sempre trazia id — a API do GA sempre traz.
 */
export function lookupAccessById(
    accessData: Record<string, StoreAccessData>,
    id: string | number,
): StoreAccessData | null {
    const chave = String(id ?? '').trim();
    if (!chave) return null;
    return accessData[byId(chave)] ?? null;
}

export function lookupAccess(
    accessData: Record<string, StoreAccessData>,
    partner: { estab_id?: string | number | null },
): StoreAccessData | null {
    return lookupAccessById(accessData, partner.estab_id ?? '');
}

/**
 * Acessos ao cardápio, direto da GA4 Data API via Netlify Function.
 *
 * Antes isto vinha de uma planilha alimentada pelo add-on SyncWith e servida
 * por um gateway. Esse caminho entregava número errado em silêncio: o gateway
 * cortava a resposta em ~10 mil linhas e a aba crua, ordenada por volume,
 * tinha ~31 mil — loja pequena simplesmente não existia para o painel, e o
 * total de quem aparecia vinha truncado (Montanhas: 38 pela planilha, 83 pela
 * API; Açaí du Filipi: 41 contra 164).
 */
export function useDailyAccessSync({ enabled = true, dias = 30 }: { enabled?: boolean; dias?: number } = {}) {
    const [accessData, setAccessData] = useState<Record<string, StoreAccessData>>({});
    const [cidades, setCidades] = useState<Record<string, number>>({});
    const [janela, setJanela] = useState<JanelaAcesso | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const performSync = useCallback(async () => {
        if (!enabled) return;

        try {
            setIsLoading(true);
            setError(null);

            const res = await fetch(`${FN_URL}?dias=${dias}`, { credentials: 'include' as RequestCredentials });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `Falha ao carregar acessos (${res.status})`);
            }

            const janelaResp: JanelaAcesso = json.janela ?? { inicio: '', fim: '', dias };
            const lojas: Record<string, number> = json.lojas ?? {};

            const parsed: Record<string, StoreAccessData> = {};
            for (const [id, total] of Object.entries(lojas)) {
                const acessos = Number(total) || 0;
                if (acessos <= 0) continue;
                parsed[byId(id)] = {
                    estabelecimento: '',
                    estabId: id,
                    acessosUnicos: acessos,
                    mediaDiaria: janelaResp.dias > 0 ? Math.round(acessos / janelaResp.dias) : 0,
                    ultimoDia: janelaResp.fim,
                    totalDias: janelaResp.dias,
                    raw: {},
                };
            }

            setAccessData(parsed);
            setCidades(json.cidades ?? {});
            setJanela(janelaResp);
            setLastSyncTime(new Date());
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao sincronizar acessos';
            console.warn('[useDailyAccessSync] falha ao carregar:', message);
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [enabled, dias]);

    useEffect(() => {
        if (enabled) performSync();
        else setIsLoading(false);
    }, [performSync, enabled]);

    return {
        accessData,
        cidadesAcesso: cidades,
        janelaAcesso: janela,
        diasJanela: janela?.dias ?? 0,
        loadingAccess: isLoading,
        accessError: error,
        lastAccessSync: lastSyncTime,
        refreshAccessData: performSync,
    };
}
