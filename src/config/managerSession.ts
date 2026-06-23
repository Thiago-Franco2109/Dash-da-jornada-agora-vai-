import type { Manager } from './managerMapping';

export const MANAGER_SESSION_KEY = 'partner_journey_manager_session';

export type ManagerFilter = Manager | '';

export function loadManagerSession(): ManagerFilter {
    try {
        const value = sessionStorage.getItem(MANAGER_SESSION_KEY);
        if (value === 'THIAGO' || value === 'LAÍS') return value;
    } catch {
        /* ignore */
    }
    return '';
}

export function saveManagerSession(manager: ManagerFilter): void {
    try {
        if (manager) sessionStorage.setItem(MANAGER_SESSION_KEY, manager);
        else sessionStorage.removeItem(MANAGER_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

export function clearManagerSession(): void {
    saveManagerSession('');
}
