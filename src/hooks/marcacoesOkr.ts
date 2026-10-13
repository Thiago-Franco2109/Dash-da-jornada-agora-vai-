import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// As marcações manuais da OKR — "fora da conta" (`okr_excluido`), "crítica de
// cancelamento" (`okr_critica`) e "no plano de recuperação" (`okr_recuperacao`).
//
// As duas têm a MESMA forma: uma linha por parceiro, com motivo, observação,
// autor e data. Em vez de dois hooks quase iguais, uma fábrica — assim a
// correção que um precisar (reverter escrita otimista, compartilhar cache
// entre instâncias) não existe num e falta no outro.
//
// Cache de módulo + inscritos (mesmo padrão de usePausaOnboarding): várias
// instâncias do mesmo hook convivem na tela (cada lista de KR e o painel de
// marcados), e precisam compartilhar estado — senão marcar uma loja não
// atualizaria o número sem recarregar a página.
//
// Ver supabase/okr_excluido.sql e supabase/okr_critica.sql.
// ─────────────────────────────────────────────────────────────────────────

export interface Marcacao {
    partnerId: string;
    motivo: string | null;
    observacao: string | null;
    /** Cópia do nome/cidade na hora da marcação — ver o SQL. */
    nome: string | null;
    cidade: string | null;
    quando: string;
    quem: string | null;
}

export type MarcacaoMap = Record<string, Marcacao>;

export interface DadosMarcacao {
    motivo?: string | null;
    observacao?: string | null;
    nome?: string | null;
    cidade?: string | null;
    quem?: string | null;
}

export interface UsoMarcacao {
    marcacoes: MarcacaoMap;
    /** Ids marcados, prontos para filtrar as listas dos KRs. */
    ids: Set<number>;
    carregando: boolean;
    erro: string | null;
    marcar: (partnerId: string | number, dados: DadosMarcacao) => Promise<boolean>;
    /** Marca vários de uma vez — um upsert só, não N chamadas em série. */
    marcarVarios: (itens: { partnerId: string | number; dados: DadosMarcacao }[]) => Promise<boolean>;
    desmarcar: (partnerId: string | number) => Promise<boolean>;
}

interface ConfigMarcacao {
    tabela: string;
    /** Coluna de data: `okr_excluido` usa excluido_em, `okr_critica` marcado_em. */
    colQuando: string;
    colQuem: string;
}

function criarHookMarcacao(cfg: ConfigMarcacao): () => UsoMarcacao {
    const colunas = `partner_id, motivo, observacao, nome, cidade, ${cfg.colQuando}, ${cfg.colQuem}`;

    let cache: MarcacaoMap | null = null;
    const inscritos = new Set<(m: MarcacaoMap) => void>();

    function publicar(map: MarcacaoMap) {
        cache = map;
        for (const fn of inscritos) fn(map);
    }

    function toMarcacao(row: Record<string, unknown>): Marcacao {
        return {
            partnerId: String(row.partner_id),
            motivo: (row.motivo as string) ?? null,
            observacao: (row.observacao as string) ?? null,
            nome: (row.nome as string) ?? null,
            cidade: (row.cidade as string) ?? null,
            quando: String(row[cfg.colQuando] ?? ''),
            quem: (row[cfg.colQuem] as string) ?? null,
        };
    }

    async function buscar(): Promise<MarcacaoMap> {
        const { data, error } = await supabase.from(cfg.tabela).select(colunas);
        if (error) throw new Error(error.message);
        const map: MarcacaoMap = {};
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
            map[String(row.partner_id)] = toMarcacao(row);
        }
        return map;
    }

    return function useMarcacao(): UsoMarcacao {
        const [marcacoes, setMarcacoes] = useState<MarcacaoMap>(cache ?? {});
        const [erro, setErro] = useState<string | null>(null);
        // Sem isto, os KRs apareceriam por um instante com a base cheia e logo
        // mudariam de número — justamente o que vai para o chefe.
        const [carregando, setCarregando] = useState(cache == null);

        useEffect(() => {
            inscritos.add(setMarcacoes);
            return () => { inscritos.delete(setMarcacoes); };
        }, []);

        useEffect(() => {
            if (cache) return;
            buscar()
                .then(m => { publicar(m); setCarregando(false); })
                .catch(err => {
                    console.warn(`[marcacoesOkr:${cfg.tabela}] falha ao carregar:`, err);
                    setErro(err instanceof Error ? err.message : 'falha ao carregar');
                    setCarregando(false);
                });
        }, []);

        const ids = useMemo(() => new Set(Object.keys(marcacoes).map(Number)), [marcacoes]);

        /** Otimista: desfaz o mapa se o Supabase recusar. */
        const marcar = useCallback(async (partnerId: string | number, dados: DadosMarcacao): Promise<boolean> => {
            const id = String(partnerId);
            const nova: Marcacao = {
                partnerId: id,
                motivo: dados.motivo ?? null,
                observacao: dados.observacao?.trim() ? dados.observacao.trim() : null,
                nome: dados.nome ?? null,
                cidade: dados.cidade ?? null,
                quando: new Date().toISOString(),
                quem: dados.quem ?? null,
            };
            const anterior = (cache ?? {})[id];
            publicar({ ...(cache ?? {}), [id]: nova });

            const { error } = await supabase
                .from(cfg.tabela)
                .upsert({
                    partner_id: id,
                    motivo: nova.motivo,
                    observacao: nova.observacao,
                    nome: nova.nome,
                    cidade: nova.cidade,
                    [cfg.colQuando]: nova.quando,
                    [cfg.colQuem]: nova.quem,
                    atualizado_em: new Date().toISOString(),
                }, { onConflict: 'partner_id' });

            if (error) {
                console.error(`[marcacoesOkr:${cfg.tabela}] falha ao marcar:`, error);
                setErro(error.message);
                const revertido = { ...(cache ?? {}) };
                if (anterior) revertido[id] = anterior; else delete revertido[id];
                publicar(revertido);
                return false;
            }
            setErro(null);
            return true;
        }, []);

        const marcarVarios = useCallback(async (itens: { partnerId: string | number; dados: DadosMarcacao }[]): Promise<boolean> => {
            if (itens.length === 0) return true;
            const agora = new Date().toISOString();
            const novas: MarcacaoMap = {};
            for (const { partnerId, dados } of itens) {
                novas[String(partnerId)] = {
                    partnerId: String(partnerId),
                    motivo: dados.motivo ?? null,
                    observacao: dados.observacao?.trim() ? dados.observacao.trim() : null,
                    nome: dados.nome ?? null,
                    cidade: dados.cidade ?? null,
                    quando: agora,
                    quem: dados.quem ?? null,
                };
            }
            const anterior = { ...(cache ?? {}) };
            publicar({ ...anterior, ...novas });

            const { error } = await supabase
                .from(cfg.tabela)
                .upsert(Object.values(novas).map(m => ({
                    partner_id: m.partnerId,
                    motivo: m.motivo,
                    observacao: m.observacao,
                    nome: m.nome,
                    cidade: m.cidade,
                    [cfg.colQuando]: m.quando,
                    [cfg.colQuem]: m.quem,
                    atualizado_em: agora,
                })), { onConflict: 'partner_id' });

            if (error) {
                console.error(`[marcacoesOkr:${cfg.tabela}] falha ao marcar em lote:`, error);
                setErro(error.message);
                publicar(anterior);
                return false;
            }
            setErro(null);
            return true;
        }, []);

        /** Some da tabela, não vira linha "cancelada". */
        const desmarcar = useCallback(async (partnerId: string | number): Promise<boolean> => {
            const id = String(partnerId);
            const anterior = (cache ?? {})[id];
            if (!anterior) return true;

            const otimista = { ...(cache ?? {}) };
            delete otimista[id];
            publicar(otimista);

            const { error } = await supabase.from(cfg.tabela).delete().eq('partner_id', id);
            if (error) {
                console.error(`[marcacoesOkr:${cfg.tabela}] falha ao desmarcar:`, error);
                setErro(error.message);
                publicar({ ...(cache ?? {}), [id]: anterior });
                return false;
            }
            setErro(null);
            return true;
        }, []);

        return { marcacoes, ids, carregando, erro, marcar, marcarVarios, desmarcar };
    };
}

/** Lojas fora da conta — não entram em nenhum KR. */
export const useExclusaoOkr = criarHookMarcacao({
    tabela: 'okr_excluido',
    colQuando: 'excluido_em',
    colQuem: 'excluido_por',
});

/** A lista de risco de cancelamento — torna a loja elegível ao plano do KR 2.3. */
export const useCriticaOkr = criarHookMarcacao({
    tabela: 'okr_critica',
    colQuando: 'marcado_em',
    colQuem: 'marcado_por',
});

/** Lojas selecionadas para o plano de recuperação — o universo do KR 2.3. */
export const useRecuperacaoOkr = criarHookMarcacao({
    tabela: 'okr_recuperacao',
    colQuando: 'incluido_em',
    colQuem: 'incluido_por',
});
