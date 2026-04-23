import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function usePartnerRelevance(partnerId: string | number) {
    const [relevance, setRelevance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const id = String(partnerId);

    useEffect(() => {
        async function fetchRelevance() {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('partner_relevance')
                    .select('relevance_score')
                    .eq('partner_id', id)
                    .single();

                if (error) {
                    if (error.code === 'PGRST116') {
                        // Row not found
                        setRelevance(null);
                    } else {
                        throw error;
                    }
                } else if (data) {
                    setRelevance(data.relevance_score);
                }
            } catch (err: any) {
                console.error('Error fetching partner relevance:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (id) {
            fetchRelevance();
        }
    }, [id]);

    const updateRelevance = async (score: number) => {
        try {
            setLoading(true);
            const { error } = await supabase
                .from('partner_relevance')
                .upsert({ 
                    partner_id: id, 
                    relevance_score: score,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'partner_id' });

            if (error) throw error;
            setRelevance(score);
            return { success: true };
        } catch (err: any) {
            console.error('Error updating partner relevance:', err);
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    return { relevance, loading, error, updateRelevance };
}
