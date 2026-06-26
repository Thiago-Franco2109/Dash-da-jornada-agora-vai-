import { useState } from 'react';
import { supabase } from '../lib/supabase';

export type PromoStatus = 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado';

export function useStatusOverride() {
    const [isUpdating, setIsUpdating] = useState(false);

    const updateStatus = async (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => {
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
