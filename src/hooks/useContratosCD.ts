import { useState, useEffect } from 'react';

/**
 * Contratos do Cardápio Digital — ver netlify/functions/cd-contratos.ts.
 *
 * O valor vem dos campos personalizados do Trello (quadros de financeiro,
 * onboarding e retenção), casado com o parceiro por estabelecimento_id — o
 * ID que está no título do card. Substituiu a lista fixa de
 * src/config/cdContracts.ts, que casava por nome.
 *
 * Nome de loja se repete entre cidades e a mesma loja costuma ter dois
 * cadastros (marketplace e CD), então o casamento por nome errava nos dois
 * sentidos. `aliases` resolve o segundo caso: quando a planilha traz o ID do
 * cadastro que não tem card, ele aponta pro ID que tem.
 */

export interface ContratoCD {
    estabelecimento_id: number;
    estabelecimento: string;
    /** Mensalidade em reais, já normalizada a partir do plano do card. */
    valor_mensal: number;
    plano?: string;
    forma_pagamento?: string;
    link_contrato?: string;
    /** Lista do Trello onde o card está — é ela que define `ativo`. */
    lista: string;
    ativo: boolean;
    card_url: string;
    /** O card tinha só o total do contrato; a mensalidade saiu de uma divisão. */
    derivado_do_total: boolean;
}

export interface ContratosCD {
    /** Um contrato por card. Loja com vários cadastros aparece UMA vez. */
    porEstabelecimento: Map<number, ContratoCD>;
    /** Soma das mensalidades ativas. */
    mrrTotal: number;
    contratosAtivos: number;
    atualizadoEm: Date | null;
}

interface RespostaContratos {
    ok?: boolean;
    error?: string;
    atualizado_em?: string;
    mrr_total?: number;
    contratos_ativos?: number;
    contratos?: ContratoCD[];
    aliases?: Record<string, number>;
}

const VAZIO: ContratosCD = {
    porEstabelecimento: new Map(),
    mrrTotal: 0,
    contratosAtivos: 0,
    atualizadoEm: null,
};

interface UseContratosCDResult {
    data: ContratosCD;
    loading: boolean;
    error: string | null;
}

export function useContratosCD(enabled = true): UseContratosCDResult {
    const [data, setData] = useState<ContratosCD>(VAZIO);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) return;

        let cancelado = false;

        const carregar = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/.netlify/functions/cd-contratos', {
                    credentials: 'include' as RequestCredentials,
                });
                const json: RespostaContratos = await res.json().catch(() => ({}));
                if (!res.ok || json?.ok === false) {
                    throw new Error(json?.error || `Erro ${res.status} ao carregar os contratos.`);
                }
                if (cancelado) return;

                const porEstabelecimento = new Map<number, ContratoCD>();
                for (const c of json.contratos ?? []) {
                    porEstabelecimento.set(c.estabelecimento_id, c);
                }
                // Os aliases entram como atalho de busca: apontam pro MESMO
                // objeto de contrato, então não viram linha extra em nenhuma
                // soma feita sobre os valores distintos do mapa.
                for (const [alias, canonico] of Object.entries(json.aliases ?? {})) {
                    const contrato = porEstabelecimento.get(canonico);
                    if (contrato && !porEstabelecimento.has(Number(alias))) {
                        porEstabelecimento.set(Number(alias), contrato);
                    }
                }

                setData({
                    porEstabelecimento,
                    mrrTotal: json.mrr_total ?? 0,
                    contratosAtivos: json.contratos_ativos ?? 0,
                    atualizadoEm: json.atualizado_em ? new Date(json.atualizado_em) : null,
                });
            } catch (err: unknown) {
                if (cancelado) return;
                setData(VAZIO);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelado) setLoading(false);
            }
        };

        void carregar();

        return () => { cancelado = true; };
    }, [enabled]);

    return enabled ? { data, loading, error } : { data: VAZIO, loading: false, error: null };
}
