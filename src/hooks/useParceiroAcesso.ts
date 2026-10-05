import { useState, useEffect } from 'react';

/**
 * Como o lojista acessa o painel — ver netlify/functions/parceiro-acesso.ts.
 *
 * `predominante` é null só quando o dono nunca entrou no painel (aí `nuncaAcessou` é true).
 *
 * O Suporte Bigou é excluído na function — sem isso todo parceiro devolvia o mesmo número.
 *
 * `diasSemAcesso` vem de `session.data_atualizacao` (atividade), não de `session.data` (login):
 * o lojista fica logado por meses, então contar login dava "sumido há 752 dias" pra quem
 * estava usando o painel no mesmo dia.
 */

export interface ParceiroAcesso {
    estabId: number;
    janelaDias: number;
    /**
     * LOGINS do dono no histórico — base da classificação de dispositivo, não medida de uso.
     * A sessão do painel dura meses, então 3 logins num ano é o normal de quem não desloga.
     */
    totalSessoes: number;
    /** Desses, quantos tiveram atividade na janela recente (janelaDias). */
    sessoesRecentes: number;
    sessoesSaoLogins?: boolean;
    celular: number;
    computador: number;
    pctCelular: number;
    predominante: 'celular' | 'computador' | null;
    porApp: Record<string, { celular: number; computador: number }>;
    ultimoAcesso: string | null;
    diasSemAcesso: number | null;
    /** Mais de 30 dias sem abrir o painel — sinal de churn antes do pedido cair. */
    sumido: boolean;
    nuncaAcessou: boolean;
}

interface UseParceiroAcessoResult {
    data: ParceiroAcesso | null;
    loading: boolean;
    error: string | null;
}

export function useParceiroAcesso(estabId?: string | number, enabled = true): UseParceiroAcessoResult {
    const [data, setData] = useState<ParceiroAcesso | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const id = estabId == null ? '' : String(estabId).trim();
    // Estado DERIVADO, não guardado — ver nota em useCardapioAnalise.
    const ativo = enabled && /^\d+$/.test(id);

    useEffect(() => {
        if (!ativo) return;

        let cancelado = false;

        // O corpo do effect não chama setState direto (react-hooks/set-state-in-effect):
        // tudo acontece dentro desta função, inclusive o loading inicial.
        const carregar = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/.netlify/functions/parceiro-acesso?estabId=${encodeURIComponent(id)}`, {
                    credentials: 'include' as RequestCredentials,
                    cache: 'no-store',
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok === false) {
                    throw new Error(json?.error || `Erro ${res.status} ao carregar os acessos do lojista.`);
                }
                if (!cancelado) setData(json as ParceiroAcesso);
            } catch (err: unknown) {
                if (cancelado) return;
                setData(null);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelado) setLoading(false);
            }
        };

        void carregar();

        return () => { cancelado = true; };
    }, [id, ativo]);

    return ativo ? { data, loading, error } : { data: null, loading: false, error: null };
}
