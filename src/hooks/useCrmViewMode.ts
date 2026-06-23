import { useState, useCallback } from 'react';
import type { CrmViewMode } from '../types/crm';

const STORAGE_KEY = 'crm_view_mode_v1';

function loadViewMode(): CrmViewMode {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const modes: CrmViewMode[] = ['dashboard', 'kanban', 'list', 'table', 'calendar'];
        if (raw && modes.includes(raw as CrmViewMode)) return raw as CrmViewMode;
    } catch { /* ignore */ }
    return 'dashboard';
}

export function useCrmViewMode() {
    const [viewMode, setViewModeState] = useState<CrmViewMode>(loadViewMode);

    const setViewMode = useCallback((mode: CrmViewMode) => {
        setViewModeState(mode);
        localStorage.setItem(STORAGE_KEY, mode);
    }, []);

    return { viewMode, setViewMode };
}
