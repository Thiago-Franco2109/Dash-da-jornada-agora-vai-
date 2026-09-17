import { useState, useEffect, useCallback } from 'react';
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
}

/** [partnerId][campanhaId] = entrada */
export type CampanhaStatusMap = Record<string, Record<string, CampanhaEntrada>>;

let _cache: CampanhaStatusMap | null = null;

async function fetchCampanhaStatus(): Promise<CampanhaStatusMap> {
    const { data, error } = await supabase
        .from('campanha_status_cs')
        .select('partner_id, campanha_id, status, motivo, motivo_detalhe');
    if (error) throw new Error(error.message);

    const map: CampanhaStatusMap = {};
    for (const row of data ?? []) {
        const pid = String(row.partner_id);
        (map[pid] ??= {})[String(row.campanha_id)] = {
            status: row.status as PromoStatus,
            motivo: (row.motivo as MotivoLigacao) ?? null,
            motivoDetalhe: row.motivo_detalhe ?? null,
        };
    }
    return map;
}

export function useCampanhaStatusCs() {
    const [statusMap, setStatusMap] = useState<CampanhaStatusMap>(_cache ?? {});
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (_cache) return;
        fetchCampanhaStatus()
            .then(m => { _cache = m; setStatusMap(m); })
            .catch(err => {
                // Tabela ausente ou offline: a tela segue funcionando, só sem status salvo.
                console.warn('[useCampanhaStatusCs] falha ao carregar:', err);
                setErro(err instanceof Error ? err.message : 'falha ao carregar');
            });
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

    const setCampanhaStatus = useCallback(async (
        partnerId: string,
        campanhaId: string,
        status: PromoStatus,
        extras?: { motivo?: MotivoLigacao | null; motivoDetalhe?: string | null },
    ): Promise<boolean> => {
        const anterior = statusMap[partnerId]?.[campanhaId];
        const nova: CampanhaEntrada = {
            status,
            motivo: extras?.motivo ?? null,
            motivoDetalhe: extras?.motivoDetalhe ?? null,
        };

        const aplicar = (valor: CampanhaEntrada | undefined) => setStatusMap(prev => {
            const doParceiro = { ...(prev[partnerId] ?? {}) };
            if (valor) doParceiro[campanhaId] = valor;
            else delete doParceiro[campanhaId];
            const next = { ...prev, [partnerId]: doParceiro };
            _cache = next;
            return next;
        });

        aplicar(nova); // otimista
        setErro(null);

        const { error } = await supabase
            .from('campanha_status_cs')
            .upsert(
                {
                    partner_id: partnerId,
                    campanha_id: campanhaId,
                    status,
                    motivo: nova.motivo,
                    motivo_detalhe: nova.motivoDetalhe,
                    atualizado_em: new Date().toISOString(),
                },
                { onConflict: 'partner_id,campanha_id' },
            );

        if (error) {
            console.error('[useCampanhaStatusCs] falha ao salvar:', error);
            aplicar(anterior);
            setErro(error.message);
            return false;
        }
        return true;
    }, [statusMap]);

    return { statusMap, getEntrada, getCampanhaStatus, setCampanhaStatus, erro };
}
