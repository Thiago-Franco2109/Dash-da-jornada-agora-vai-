import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { PromoStatus } from './useStatusOverride';

// ─────────────────────────────────────────────────────────────────────────
// Status CRM do CS por (parceiro, campanha) — Supabase `campanha_status_cs`.
//
// Existe pras campanhas que NÃO têm coluna própria em
// `partner_status_overrides` (Super Promos e Cupons têm; Ofertas da Casa vive
// no localStorage). Sem isto, campanha criada no CMS aparecia na tela do
// parceiro sem onde registrar o status do CS.
//
// Ver supabase/campanha_status_cs.sql.
// ─────────────────────────────────────────────────────────────────────────

/** [partnerId][campanhaId] = status */
export type CampanhaStatusMap = Record<string, Record<string, PromoStatus>>;

let _cache: CampanhaStatusMap | null = null;

async function fetchCampanhaStatus(): Promise<CampanhaStatusMap> {
    const { data, error } = await supabase
        .from('campanha_status_cs')
        .select('partner_id, campanha_id, status');
    if (error) throw new Error(error.message);

    const map: CampanhaStatusMap = {};
    for (const row of data ?? []) {
        const pid = String(row.partner_id);
        (map[pid] ??= {})[String(row.campanha_id)] = row.status as PromoStatus;
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

    const getCampanhaStatus = useCallback(
        (partnerId: string, campanhaId: string): PromoStatus =>
            statusMap[partnerId]?.[campanhaId] ?? 'aguardando',
        [statusMap],
    );

    const setCampanhaStatus = useCallback(async (partnerId: string, campanhaId: string, status: PromoStatus): Promise<boolean> => {
        const anterior = statusMap[partnerId]?.[campanhaId];

        const aplicar = (valor: PromoStatus | undefined) => setStatusMap(prev => {
            const doParceiro = { ...(prev[partnerId] ?? {}) };
            if (valor) doParceiro[campanhaId] = valor;
            else delete doParceiro[campanhaId];
            const next = { ...prev, [partnerId]: doParceiro };
            _cache = next;
            return next;
        });

        aplicar(status); // otimista
        setErro(null);

        const { error } = await supabase
            .from('campanha_status_cs')
            .upsert(
                { partner_id: partnerId, campanha_id: campanhaId, status, atualizado_em: new Date().toISOString() },
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

    return { statusMap, getCampanhaStatus, setCampanhaStatus, erro };
}
