import { useState, useCallback } from 'react';

/**
 * Cor customizada por coluna do Quadro (chave = ColunaQuadro.key) — o Trello
 * não tem cor nativa de lista, isso é preferência nossa, salva no navegador.
 */

export const CORES_COLUNA = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];

function loadCores(key: string): Record<string, string> {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
}

function saveCores(key: string, cores: Record<string, string>) {
    try {
        localStorage.setItem(key, JSON.stringify(cores));
    } catch { /* ignore */ }
}

export function useCoresColuna(storageKey: string) {
    const [coresPorColuna, setCoresPorColuna] = useState<Record<string, string>>(() => loadCores(storageKey));

    const onCorChange = useCallback((chave: string, cor: string | null) => {
        setCoresPorColuna(prev => {
            const next = { ...prev };
            if (cor) next[chave] = cor; else delete next[chave];
            saveCores(storageKey, next);
            return next;
        });
    }, [storageKey]);

    return { coresPorColuna, onCorChange };
}
