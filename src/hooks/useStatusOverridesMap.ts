import { useState, useEffect, useCallback } from 'react';
import { fetchStatusOverridesMap } from '../utils/dataSync';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// Overrides de status de campanha do CS (Supabase partner_status_overrides),
// app-wide/cacheado. Esta é a ÚNICA fonte de "decisão de trabalho do CS"
// (ofertei/aguardando/negado). O estado real (ativo/não ofertado) vem do banco.
// ─────────────────────────────────────────────────────────────────────────

export type OverrideEntry = { promo: string; cupom: string };
export type OverridesMap = Record<string, OverrideEntry>;
export type OverrideField = 'promo_status_override' | 'cupom_status_override';

let _cache: OverridesMap | null = null;

export function useStatusOverridesMap() {
    const [overridesMap, setOverridesMap] = useState<OverridesMap>(_cache ?? {});

    useEffect(() => {
        if (_cache) return;
        fetchStatusOverridesMap()
            .then(m => { _cache = m; setOverridesMap(m); })
            .catch(() => { /* segue vazio */ });
    }, []);

    const setOverride = useCallback(async (partnerId: string | number, field: OverrideField, status: string): Promise<boolean> => {
        const id = String(partnerId);
        const key = field === 'promo_status_override' ? 'promo' : 'cupom';
        const prev = overridesMap[id];
        // otimista
        setOverridesMap(m => {
            const next = { ...m };
            next[id] = { promo: prev?.promo ?? '', cupom: prev?.cupom ?? '', [key]: status };
            _cache = next;
            return next;
        });
        const { error } = await supabase
            .from('partner_status_overrides')
            .upsert({ partner_id: id, [field]: status, updated_at: new Date().toISOString() }, { onConflict: 'partner_id' });
        if (error) {
            console.error('[useStatusOverridesMap] falha ao salvar:', error);
            setOverridesMap(m => {
                const next = { ...m };
                if (prev) next[id] = prev; else delete next[id];
                _cache = next;
                return next;
            });
            return false;
        }
        return true;
    }, [overridesMap]);

    return { overridesMap, setOverride };
}
