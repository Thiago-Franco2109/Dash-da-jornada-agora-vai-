/** Set<string> persistido em localStorage — usado por filtros "ignorar X" que precisam sobreviver a reload. */

export function loadPersistedSet(key: string): Set<string> {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
}

export function savePersistedSet(key: string, set: Set<string>) {
    try {
        localStorage.setItem(key, JSON.stringify([...set]));
    } catch { /* ignore */ }
}
