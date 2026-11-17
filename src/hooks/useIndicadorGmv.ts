import { useCallback, useEffect, useState } from 'react';

/**
 * GMV mês a mês direto da Function `crm-gmv`, com a janela que a tela pedir.
 *
 * Existe separado do `useCrmData` porque a aba Indicador replica a planilha:
 * precisa de 12+ meses e do mês corrente, enquanto o resto do app trabalha com
 * 6 meses fechados (ver crm-gmv.ts — a janela maior custa segundos na query).
 * Quando a Function falha, quem consome cai para `CrmPartner.gmvMensal`.
 */

export interface IndicadorGmvMes {
    mes: string;
    label: string;
}

interface CrmGmvResposta {
    ok?: boolean;
    meses?: IndicadorGmvMes[];
    porEstab?: Record<string, Record<string, number>>;
    error?: string;
}

export interface IndicadorGmvResult {
    meses: IndicadorGmvMes[];
    porEstab: Record<string, Record<string, number>>;
    isLoading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useIndicadorGmv(meses: number, enabled: boolean): IndicadorGmvResult {
    const [data, setData] = useState<{ meses: IndicadorGmvMes[]; porEstab: Record<string, Record<string, number>> }>({
        meses: [],
        porEstab: {},
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);

    const refresh = useCallback(() => setVersion(v => v + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelado = false;

        (async () => {
            setIsLoading(true);
            setError(null);
            try {
                const url = `/.netlify/functions/crm-gmv?meses=${meses}&incluirMesAtual=1`;
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                const json = (await res.json().catch(() => ({}))) as CrmGmvResposta;
                if (!res.ok || json.ok === false) throw new Error(json.error || `Erro ${res.status} em crm-gmv`);
                if (cancelado) return;
                setData({ meses: json.meses ?? [], porEstab: json.porEstab ?? {} });
            } catch (err: unknown) {
                if (cancelado) return;
                setError(err instanceof Error ? err.message : 'Erro ao carregar GMV mensal');
                setData({ meses: [], porEstab: {} });
            } finally {
                if (!cancelado) setIsLoading(false);
            }
        })();

        return () => { cancelado = true; };
    }, [meses, enabled, version]);

    return { ...data, isLoading, error, refresh };
}
