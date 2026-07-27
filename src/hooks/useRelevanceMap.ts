import { useState, useEffect, useCallback } from 'react';
import { fetchRelevanceMap, saveRelevanceScore } from '../utils/dataSync';

/**
 * Fonte ÚNICA de relevância comercial para todo o app (leve: 1 query no Supabase).
 * Sempre ativa (independe da view), pra que a relevância apareça e seja editável
 * em qualquer tela — dashboard, churn, todos os parceiros — compartilhando o
 * mesmo mapa (`partner_relevance`, chave = estab_id).
 */
export function useRelevanceMap() {
    const [relevanceMap, setRelevanceMap] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        fetchRelevanceMap()
            .then(map => { if (alive) { setRelevanceMap(map); setLoading(false); } })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const updateRelevance = useCallback(async (partnerId: string | number, score: number) => {
        const id = String(partnerId);
        const previous = relevanceMap[id];
        // atualização otimista
        setRelevanceMap(prev => {
            const next = { ...prev };
            if (score <= 0) delete next[id];
            else next[id] = score;
            return next;
        });
        const res = await saveRelevanceScore(id, score);
        if (!res.success) {
            // reverte em caso de falha
            setRelevanceMap(prev => {
                const next = { ...prev };
                if (previous == null) delete next[id];
                else next[id] = previous;
                return next;
            });
        }
        return res;
    }, [relevanceMap]);

    return { relevanceMap, loading, updateRelevance };
}
