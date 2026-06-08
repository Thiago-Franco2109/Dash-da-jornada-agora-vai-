
import { useState, useEffect, useCallback } from 'react';
import { fetchBoardCards, fetchBoardLists, fetchBoardActions } from '../lib/trello';
import { calculateDurations, type CardDuration } from '../utils/trelloCalculations';

export function useOnboardingDuration(enabled: boolean = true) {
  const [data, setData] = useState<CardDuration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [cards, lists, actions] = await Promise.all([
        fetchBoardCards(),
        fetchBoardLists(),
        fetchBoardActions(),
      ]);
      
      const durations = calculateDurations(cards, lists, actions);
      setData(durations);
    } catch (err: any) {
      console.error('Error fetching Trello data:', err);
      setError(err.message || 'Falha ao buscar dados do Trello');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
