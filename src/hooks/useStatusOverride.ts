import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CampaignStatusOverrideField } from '../config/campaignTypes';

/**
 * 'confirmado' é um estado manual do CS (ex.: cupons) — parceiro confirmou verbalmente
 * mas o banco ainda não reflete a ativação real. Só o sistema promove pra 'ativo'
 * quando o dado real do banco confirma (ver src/utils/campanhasOverlay.ts); o usuário
 * nunca escolhe 'ativo' diretamente pra campanhas que usam esse fluxo de confirmação.
 */
export type PromoStatus = 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado' | 'confirmado';

export type StatusOverrideField = CampaignStatusOverrideField;

export function useStatusOverride() {
    const [isUpdating, setIsUpdating] = useState(false);

    const updateStatus = async (partnerId: string, field: StatusOverrideField, newStatus: PromoStatus) => {
        setIsUpdating(true);
        try {
            // Primeiro, tentamos fazer o upsert
            const { error } = await supabase
                .from('partner_status_overrides')
                .upsert(
                    {
                        partner_id: partnerId,
                        [field]: newStatus,
                        updated_at: new Date().toISOString()
                    },
                    { onConflict: 'partner_id' }
                );

            if (error) {
                console.error('Erro ao atualizar status no Supabase:', error);
                throw error;
            }
            
            return true;
        } catch (error) {
            console.error('Falha ao atualizar status:', error);
            return false;
        } finally {
            setIsUpdating(false);
        }
    };

    return {
        updateStatus,
        isUpdating
    };
}
