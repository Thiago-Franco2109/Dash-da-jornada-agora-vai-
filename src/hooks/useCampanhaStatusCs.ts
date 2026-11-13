import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import type { PromoStatus } from './useStatusOverride';
import type { MotivoLigacao } from '../config/desfechoLigacao';

// ─────────────────────────────────────────────────────────────────────────
// Status CRM e motivo do CS por (parceiro, campanha) — Supabase `campanha_status_cs`.
//
// STATUS: existe pras campanhas que NÃO têm coluna própria em
// `partner_status_overrides` (Super Promos e Cupons têm; Ofertas da Casa vive
// no localStorage).
//
// MOTIVO: por que o parceiro ainda não participa. Diferente do status, é gravado
// aqui pra TODAS as campanhas — é dimensão nova, não precisa herdar a bagunça de
// onde cada status mora.
//
// Ver supabase/campanha_status_cs.sql.
// ─────────────────────────────────────────────────────────────────────────

export interface CampanhaEntrada {
    status: PromoStatus;
    motivo?: MotivoLigacao | null;
    motivoDetalhe?: string | null;
    /** Quando o CS gravou (ISO). É o que faz a marcação expirar sozinha quando
     *  a réplica alcança — ver `slotDaCampanha` em promoEstado.ts. */
    em?: string | null;
}

/** [partnerId][campanhaId] = entrada */
export type CampanhaStatusMap = Record<string, Record<string, CampanhaEntrada>>;

async function fetchCampanhaStatus(): Promise<CampanhaStatusMap> {
    const { data, error } = await supabase
        .from('campanha_status_cs')
        .select('partner_id, campanha_id, status, motivo, motivo_detalhe, atualizado_em');
    if (error) throw new Error(error.message);

    const map: CampanhaStatusMap = {};
    for (const row of data ?? []) {
        const pid = String(row.partner_id);
        (map[pid] ??= {})[String(row.campanha_id)] = {
            status: row.status as PromoStatus,
            motivo: (row.motivo as MotivoLigacao) ?? null,
            motivoDetalhe: row.motivo_detalhe ?? null,
            em: row.atualizado_em ?? null,
        };
    }
    return map;
}

/**
 * Store de módulo com assinantes.
 *
 * Antes cada chamada do hook guardava a própria cópia e o `_cache` nunca era
 * republicado: quatro consumidores (tabela da jornada, CRM Jornada, tela do
 * parceiro e o KPI do cabeçalho) e um só aprendia a escrita. Marcar o status na
 * tabela não aparecia em lugar nenhum além dela — era o "não está
 * sobrescrevendo o status". Com assinantes, uma escrita chega em todos.
 */
interface EstadoStatusCs {
    data: CampanhaStatusMap;
    carregado: boolean;
    erro: string | null;
}

let _estado: EstadoStatusCs = { data: {}, carregado: false, erro: null };
const _assinantes = new Set<() => void>();
let _carregando: Promise<void> | null = null;

function publicar(parcial: Partial<EstadoStatusCs>) {
    _estado = { ..._estado, ...parcial };
    for (const fn of _assinantes) fn();
}

function carregar(): void {
    if (_carregando) return;
    _carregando = fetchCampanhaStatus()
        .then(m => { publicar({ data: m, carregado: true, erro: null }); })
        .catch(err => {
            // Tabela ausente ou offline: a tela segue funcionando, só sem status salvo.
            console.warn('[useCampanhaStatusCs] falha ao carregar:', err);
            publicar({ erro: err instanceof Error ? err.message : 'falha ao carregar' });
        })
        .finally(() => { _carregando = null; });
}

export function useCampanhaStatusCs() {
    const estado = useSyncExternalStore(
        cb => { _assinantes.add(cb); return () => { _assinantes.delete(cb); }; },
        () => _estado,
    );
    const statusMap = estado.data;

    useEffect(() => {
        if (!_estado.carregado) carregar();
    }, []);

    const getEntrada = useCallback(
        (partnerId: string, campanhaId: string): CampanhaEntrada | undefined =>
            statusMap[partnerId]?.[campanhaId],
        [statusMap],
    );

    const getCampanhaStatus = useCallback(
        (partnerId: string, campanhaId: string): PromoStatus =>
            statusMap[partnerId]?.[campanhaId]?.status ?? 'aguardando',
        [statusMap],
    );

    /**
     * Grava o status de uma campanha. `status = null` APAGA a linha — e isso
     * importa: antes "limpar" mandava 'aguardando', que é um status como outro
     * qualquer, então o slot continuava marcado em vez de voltar a vazio.
     */
    const setCampanhaStatus = useCallback(async (
        partnerId: string,
        campanhaId: string,
        status: PromoStatus | null,
        extras?: { motivo?: MotivoLigacao | null; motivoDetalhe?: string | null },
    ): Promise<boolean> => {
        const anterior = _estado.data[partnerId]?.[campanhaId];
        const nova: CampanhaEntrada | undefined = status == null ? undefined : {
            status,
            motivo: extras?.motivo ?? null,
            motivoDetalhe: extras?.motivoDetalhe ?? null,
            em: new Date().toISOString(),
        };

        const aplicar = (valor: CampanhaEntrada | undefined) => {
            const doParceiro = { ...(_estado.data[partnerId] ?? {}) };
            if (valor) doParceiro[campanhaId] = valor;
            else delete doParceiro[campanhaId];
            publicar({ data: { ..._estado.data, [partnerId]: doParceiro }, erro: null });
        };

        aplicar(nova); // otimista

        const { error } = status == null
            ? await supabase.from('campanha_status_cs').delete()
                .eq('partner_id', partnerId).eq('campanha_id', campanhaId)
            : await supabase.from('campanha_status_cs').upsert(
                {
                    partner_id: partnerId,
                    campanha_id: campanhaId,
                    status,
                    motivo: nova!.motivo,
                    motivo_detalhe: nova!.motivoDetalhe,
                    atualizado_em: nova!.em,
                },
                { onConflict: 'partner_id,campanha_id' },
            );

        if (error) {
            console.error('[useCampanhaStatusCs] falha ao salvar:', error);
            aplicar(anterior);
            // O erro TEM que chegar na tela: a reversão silenciosa é
            // indistinguível de "o clique não funcionou".
            publicar({ erro: error.message });
            return false;
        }
        return true;
    }, []);

    return { statusMap, getEntrada, getCampanhaStatus, setCampanhaStatus, erro: estado.erro };
}
