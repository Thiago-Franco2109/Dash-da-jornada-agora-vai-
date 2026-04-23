
export type Manager = 'THIAGO' | 'LAÍS' | 'DESCONHECIDO';

export const INITIAL_CITY_MANAGER_MAP: Record<string, Manager> = {
    // LAÍS
    'Barão de Cocais': 'LAÍS',
    'Jacutinga': 'LAÍS',
    'Monte Santo de Minas': 'LAÍS',
    'Santa Bárbara': 'LAÍS',
    'São José do Vale do Rio Preto': 'LAÍS',
    'São João Nepomuceno': 'LAÍS',
    'Pitangui': 'LAÍS',
    'Abaeté': 'LAÍS',
    'Conceição de Macabu': 'LAÍS',
    'Monte Azul Paulista': 'LAÍS',
    'Ouro Fino': 'LAÍS',
    'Piraúba': 'LAÍS',
    'Porciúncula': 'LAÍS',
    'Tocantins': 'LAÍS',
    'Bom Jardim': 'LAÍS',
    'Raul Soares': 'LAÍS',
    'Carangola': 'LAÍS',
    'Carmo': 'LAÍS',
    'Divino': 'LAÍS',
    'Ponte Nova': 'LAÍS',
    'Rio Pomba': 'LAÍS',

    // THIAGO
    'Cordeiro': 'THIAGO',
    'Cantagalo': 'THIAGO',
    'Barroso': 'THIAGO',
    'Bom Jesus do Itabapoana': 'THIAGO',
    'Cláudio': 'THIAGO',
    'Silva Jardim': 'THIAGO',
    'Santos Dumont': 'THIAGO',
    'Guaçuí': 'THIAGO',
    'Ubá': 'THIAGO',
    'Bicas': 'THIAGO',
    'Ervália': 'THIAGO',
    'Paraopeba': 'THIAGO',
    'Caetanópolis': 'THIAGO',
    'Carandaí': 'THIAGO',
    'Espera Feliz': 'THIAGO',
    'Além Paraíba': 'THIAGO',
    'Muriaé': 'THIAGO',
    'Natividade': 'THIAGO',
};

const STORAGE_KEY = 'city_manager_overrides';

export function getManagerOverrides(): Record<string, Manager> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

export function saveManagerOverride(city: string, manager: Manager) {
    const overrides = getManagerOverrides();
    if (manager === 'DESCONHECIDO') {
        delete overrides[city];
    } else {
        overrides[city] = manager;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function getEffectiveManager(city: string, originalManager: string): string {
    const overrides = getManagerOverrides();
    if (overrides[city]) return overrides[city];
    
    if (INITIAL_CITY_MANAGER_MAP[city]) return INITIAL_CITY_MANAGER_MAP[city];

    // Fallback normalizado para evitar duplicidade de nomes
    const norm = String(originalManager || '').trim().toUpperCase();
    if (norm === 'THIAGO' || norm === 'LAÍS') return norm;
    
    return originalManager || 'Desconhecido';
}

/**
 * Identifica o nome do gestor (THIAGO ou LAÍS) com base no usuário logado (nome ou e-mail).
 */
export function identifyManagerFromUser(user: { name?: string; email?: string }): string | null {
    const nameStr = (user.name || '').trim().toUpperCase();
    const emailStr = (user.email || '').trim().toUpperCase();
    
    // Mapeamento direto ou detecção por palavra-chave no nome
    if (nameStr.includes('THIAGO')) return 'THIAGO';
    if (nameStr.includes('LAIS') || nameStr.includes('LAÍS')) return 'LAÍS';

    // Fallback: detecção pelo e-mail
    if (emailStr.includes('THIAGO')) return 'THIAGO';
    if (emailStr.includes('LAIS') || emailStr.includes('LAÍS')) return 'LAÍS';
    
    return null;
}
