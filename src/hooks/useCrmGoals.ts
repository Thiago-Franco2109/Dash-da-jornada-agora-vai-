import { useState, useCallback, useEffect } from 'react';
import type { CrmGoal, CrmGoalMetric } from '../types/crm';

const STORAGE_KEY = 'crm_pipeline_goals_v1';

function loadGoals(): CrmGoal[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveGoals(goals: CrmGoal[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export function useCrmGoals() {
    const [goals, setGoals] = useState<CrmGoal[]>(loadGoals);

    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setGoals(loadGoals());
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const upsertGoal = useCallback(
        (scope: CrmGoal['scope'], scopeKey: string, metric: CrmGoalMetric, target: number) => {
            setGoals(prev => {
                const existing = prev.find(g => g.scope === scope && g.scopeKey === scopeKey && g.metric === metric);
                const next: CrmGoal = existing
                    ? { ...existing, target, updatedAt: new Date().toISOString() }
                    : {
                        id: `${scope}:${scopeKey}:${metric}`,
                        scope,
                        scopeKey,
                        metric,
                        target,
                        updatedAt: new Date().toISOString(),
                    };
                const updated = existing
                    ? prev.map(g => (g.id === existing.id ? next : g))
                    : [...prev, next];
                saveGoals(updated);
                return updated;
            });
        },
        [],
    );

    const removeGoal = useCallback((id: string) => {
        setGoals(prev => {
            const updated = prev.filter(g => g.id !== id);
            saveGoals(updated);
            return updated;
        });
    }, []);

    return { goals, upsertGoal, removeGoal };
}
