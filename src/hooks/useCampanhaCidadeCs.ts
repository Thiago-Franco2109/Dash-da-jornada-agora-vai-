import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { campaignIdFromNome } from '../config/campaignTypes';

// ─────────────────────────────────────────────────────────────────────────
// Campanha que o CS NÃO oferta numa cidade — Supabase `campanha_cidade_cs`.
//
// O `config` da campanha no CMS diz onde ela PODE rodar; esta tabela diz onde
// ela de fato não é ofertada. Sem isso a campanha fica eternamente como "sem
// item" em todo parceiro da cidade, e quem já fez tudo que dava nunca fecha a
// conta (ver supabase/campanha_cidade_cs.sql).
//
// A chave é a CIDADE: marcar uma vez vale pra todos os parceiros dela.
// ─────────────────────────────────────────────────────────────────────────

export interface CidadeCampanhaEntrada {
    motivo?: string | null;
    marcadoPor?: string | null;
    em?: string | null;
}

/** [localidade_id][campanha_id] = entrada. A entrada existir = não ofertada. */
export type CampanhaCidadeMap = Record<string, Record<string, CidadeCampanhaEntrada>>;

async function fetchCampanhaCidade(): Promise<CampanhaCidadeMap> {
    const { data, error } = await supabase
        .from('campanha_cidade_cs')
        .select('localidade_id, campanha_id, motivo, marcado_por, atualizado_em');
    if (error) throw new Error(error.message);

    const map: CampanhaCidadeMap = {};
    for (const row of data ?? []) {
        (map[String(row.localidade_id)] ??= {})[String(row.campanha_id)] = {
            motivo: row.motivo ?? null,
            marcadoPor: row.marcado_por ?? null,
            em: row.atualizado_em ?? null,
        };
    }
    return map;
}

/** Store de módulo com assinantes — mesmo padrão de `useCampanhaStatusCs`: a
 *  tabela, o CRM e a tela do parceiro leem o mesmo estado, e uma escrita feita
 *  em qualquer um deles tem que chegar nos outros sem recarregar a página. */
interface EstadoCidade {
    data: CampanhaCidadeMap;
    carregado: boolean;
    erro: string | null;
}

let _estado: EstadoCidade = { data: {}, carregado: false, erro: null };
const _assinantes = new Set<() => void>();
let _carregando: Promise<void> | null = null;

function publicar(parcial: Partial<EstadoCidade>) {
    _estado = { ..._estado, ...parcial };
    for (const fn of _assinantes) fn();
}

function carregar(): void {
    if (_carregando) return;
    _carregando = fetchCampanhaCidade()
        .then(m => { publicar({ data: m, carregado: true, erro: null }); })
        .catch(err => {
            // Tabela ausente ou offline: a tela segue funcionando, só sem a
            // marcação — toda campanha do CMS volta a contar.
            console.warn('[useCampanhaCidadeCs] falha ao carregar:', err);
            publicar({ erro: err instanceof Error ? err.message : 'falha ao carregar' });
        })
        .finally(() => { _carregando = null; });
}

export function useCampanhaCidadeCs() {
    const estado = useSyncExternalStore(
        cb => { _assinantes.add(cb); return () => { _assinantes.delete(cb); }; },
        () => _estado,
    );
    const cidadeMap = estado.data;

    useEffect(() => {
        if (!_estado.carregado) carregar();
    }, []);

    /**
     * A campanha é ofertada nesta cidade? Recebe o NOME da campanha porque é a
     * chave que o `promo_resumo` usa; a conversão pro id fica aqui, num lugar
     * só.
     *
     * Estável entre renders enquanto o mapa não muda — é dependência de
     * `useMemo` no App, que recalcula a tabela inteira.
     */
    const naoOfertadaNaCidade = useCallback(
        (localidadeId: string | number | null | undefined, campanhaNome: string): boolean => {
            if (localidadeId == null || String(localidadeId) === '') return false;
            return Boolean(cidadeMap[String(localidadeId)]?.[campaignIdFromNome(campanhaNome)]);
        },
        [cidadeMap],
    );

    /** Entrada crua (motivo, autor, data) — pro puxadinho explicar a ausência. */
    const getEntradaCidade = useCallback(
        (localidadeId: string | number | null | undefined, campanhaNome: string): CidadeCampanhaEntrada | undefined => {
            if (localidadeId == null || String(localidadeId) === '') return undefined;
            return cidadeMap[String(localidadeId)]?.[campaignIdFromNome(campanhaNome)];
        },
        [cidadeMap],
    );

    /**
     * Marca (ou desmarca) a campanha como não ofertada na cidade.
     * `naoOfertada = false` APAGA a linha, devolvendo a campanha à contagem.
     */
    const setNaoOfertadaNaCidade = useCallback(async (
        localidadeId: string | number,
        campanhaNome: string,
        naoOfertada: boolean,
        extras?: { motivo?: string | null; marcadoPor?: string | null },
    ): Promise<boolean> => {
        const loc = String(localidadeId);
        const campanhaId = campaignIdFromNome(campanhaNome);
        const anterior = _estado.data[loc]?.[campanhaId];
        const nova: CidadeCampanhaEntrada | undefined = naoOfertada
            ? { motivo: extras?.motivo ?? null, marcadoPor: extras?.marcadoPor ?? null, em: new Date().toISOString() }
            : undefined;

        const aplicar = (valor: CidadeCampanhaEntrada | undefined) => {
            const daCidade = { ...(_estado.data[loc] ?? {}) };
            if (valor) daCidade[campanhaId] = valor;
            else delete daCidade[campanhaId];
            publicar({ data: { ..._estado.data, [loc]: daCidade }, erro: null });
        };

        aplicar(nova); // otimista

        const { error } = naoOfertada
            ? await supabase.from('campanha_cidade_cs').upsert(
                {
                    localidade_id: loc,
                    campanha_id: campanhaId,
                    motivo: nova!.motivo,
                    marcado_por: nova!.marcadoPor,
                    atualizado_em: nova!.em,
                },
                { onConflict: 'localidade_id,campanha_id' },
            )
            : await supabase.from('campanha_cidade_cs').delete()
                .eq('localidade_id', loc).eq('campanha_id', campanhaId);

        if (error) {
            console.error('[useCampanhaCidadeCs] falha ao salvar:', error);
            aplicar(anterior);
            // O erro TEM que chegar na tela: a reversão silenciosa é
            // indistinguível de "o clique não funcionou".
            publicar({ erro: error.message });
            return false;
        }
        return true;
    }, []);

    return { cidadeMap, naoOfertadaNaCidade, getEntradaCidade, setNaoOfertadaNaCidade, erro: estado.erro };
}
