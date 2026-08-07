import type { Manager } from './managerMapping';

export const MANAGER_SESSION_KEY = 'partner_journey_manager_session';

export type ManagerFilter = Manager | '';

/**
 * Quem está usando o painel nesta aba.
 *
 * Não confundir com `ManagerFilter`: o perfil é a identidade escolhida na
 * entrada e vale para a aba inteira; o filtro de analista é ajustável a
 * qualquer momento pelo seletor das telas. Ulysses (CEO) não tem carteira
 * própria — o perfil dele corresponde a filtro nenhum, ou seja, vê tudo.
 */
export type SessionProfile = 'THIAGO' | 'LAÍS' | 'ULYSSES';

const PROFILES: readonly SessionProfile[] = ['THIAGO', 'LAÍS', 'ULYSSES'];

export function isSessionProfile(value: unknown): value is SessionProfile {
    return typeof value === 'string' && PROFILES.includes(value as SessionProfile);
}

export function loadManagerSession(): SessionProfile | '' {
    try {
        const value = sessionStorage.getItem(MANAGER_SESSION_KEY);
        if (isSessionProfile(value)) return value;
    } catch {
        /* ignore */
    }
    return '';
}

export function saveManagerSession(profile: SessionProfile | ''): void {
    try {
        if (profile) sessionStorage.setItem(MANAGER_SESSION_KEY, profile);
        else sessionStorage.removeItem(MANAGER_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

export function clearManagerSession(): void {
    saveManagerSession('');
}

/** Filtro de analista com que a sessão começa. O CEO começa sem filtro. */
export function profileToManagerFilter(profile: SessionProfile | ''): ManagerFilter {
    return profile === 'THIAGO' || profile === 'LAÍS' ? profile : '';
}
