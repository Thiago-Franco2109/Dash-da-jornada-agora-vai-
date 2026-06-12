
export type Manager = 'THIAGO' | 'LAÍS' | 'DESCONHECIDO';
export type ProductModeKey = 'marketplace' | 'cardapio_digital';

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

const OVERRIDES_KEY_PREFIX = 'city_manager_overrides';
const NO_CITY_SPLIT_KEY_PREFIX = 'no_city_manager_split';

export interface NoCityManagerSplit {
    /** Quantidade de parceiros sem cidade atribuídos ao Thiago (ordem alfabética); o restante vai para Laís */
    thiagoCount: number;
}

function overridesStorageKey(mode: ProductModeKey): string {
    return `${OVERRIDES_KEY_PREFIX}_${mode}`;
}

function noCitySplitStorageKey(mode: ProductModeKey): string {
    return `${NO_CITY_SPLIT_KEY_PREFIX}_${mode}`;
}

export function getManagerOverrides(mode: ProductModeKey = 'marketplace'): Record<string, Manager> {
    try {
        const stored = localStorage.getItem(overridesStorageKey(mode));
        if (stored) return JSON.parse(stored);

        // Migra chave legada do marketplace
        if (mode === 'marketplace') {
            const legacy = localStorage.getItem('city_manager_overrides');
            if (legacy) {
                localStorage.setItem(overridesStorageKey(mode), legacy);
                return JSON.parse(legacy);
            }
        }
    } catch {
        return {};
    }
    return {};
}

export function saveManagerOverride(city: string, manager: Manager, mode: ProductModeKey = 'marketplace') {
    const overrides = getManagerOverrides(mode);
    if (manager === 'DESCONHECIDO') {
        delete overrides[city];
    } else {
        overrides[city] = manager;
    }
    localStorage.setItem(overridesStorageKey(mode), JSON.stringify(overrides));
}

export function getNoCityManagerSplit(mode: ProductModeKey = 'marketplace'): NoCityManagerSplit {
    try {
        const stored = localStorage.getItem(noCitySplitStorageKey(mode));
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return { thiagoCount: 0 };
}

export function saveNoCityManagerSplit(split: NoCityManagerSplit, mode: ProductModeKey = 'marketplace') {
    localStorage.setItem(noCitySplitStorageKey(mode), JSON.stringify({
        thiagoCount: Math.max(0, split.thiagoCount),
    }));
}

export function getEffectiveManager(city: string, originalManager: string, mode: ProductModeKey = 'marketplace'): string {
    const overrides = getManagerOverrides(mode);
    if (overrides[city]) return overrides[city];

    if (INITIAL_CITY_MANAGER_MAP[city]) return INITIAL_CITY_MANAGER_MAP[city];

    const norm = String(originalManager || '').trim().toUpperCase();
    if (norm === 'THIAGO' || norm === 'LAÍS') return norm;

    return originalManager || 'Desconhecido';
}

/**
 * Resolve o gestor de um parceiro, incluindo distribuição configurável para parceiros sem cidade.
 * Padrão sem cidade: Laís (thiagoCount define quantos vão para Thiago, por ordem alfabética).
 */
export function getManagerForPartner(
    city: string,
    originalManager: string,
    noCityIndex: number | undefined,
    mode: ProductModeKey = 'marketplace',
): string {
    const trimmedCity = (city || '').trim();
    if (trimmedCity) {
        return getEffectiveManager(trimmedCity, originalManager, mode);
    }

    if (noCityIndex === undefined) return 'LAÍS';

    const split = getNoCityManagerSplit(mode);
    return noCityIndex < split.thiagoCount ? 'THIAGO' : 'LAÍS';
}

/**
 * Identifica o nome do gestor (THIAGO ou LAÍS) com base no usuário logado (nome ou e-mail).
 */
export function identifyManagerFromUser(user: { name?: string; email?: string }): string | null {
    const nameStr = (user.name || '').trim().toUpperCase();
    const emailStr = (user.email || '').trim().toUpperCase();

    if (nameStr.includes('THIAGO')) return 'THIAGO';
    if (nameStr.includes('LAIS') || nameStr.includes('LAÍS')) return 'LAÍS';

    if (emailStr.includes('THIAGO')) return 'THIAGO';
    if (emailStr.includes('LAIS') || emailStr.includes('LAÍS')) return 'LAÍS';

    return null;
}

/** Cidades cuja gestão efetiva pertence ao gestor informado. */
export function getCitiesForManager(manager: Manager, mode: ProductModeKey = 'marketplace'): string[] {
    const overrides = getManagerOverrides(mode);
    const allCities = new Set([
        ...Object.keys(INITIAL_CITY_MANAGER_MAP),
        ...Object.keys(overrides),
    ]);

    return Array.from(allCities)
        .filter(city => getEffectiveManager(city, '', mode) === manager)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function cityBelongsToManager(
    city: string,
    manager: Manager,
    mode: ProductModeKey = 'marketplace',
): boolean {
    const trimmed = (city || '').trim();
    if (!trimmed) return false;
    return getEffectiveManager(trimmed, '', mode) === manager;
}

/** Retorna mapa estável de índice para parceiros sem cidade (ordem alfabética por nome). */
export function buildNoCityIndexMap<T extends { cidade?: string; estab_id?: string; estabelecimento: string }>(
    rows: T[],
): Map<string, number> {
    const noCity = rows
        .filter(r => !(r.cidade || '').trim())
        .sort((a, b) => (a.estabelecimento || '').localeCompare(b.estabelecimento || '', 'pt-BR'));

    const map = new Map<string, number>();
    noCity.forEach((row, index) => {
        const key = row.estab_id || row.estabelecimento;
        map.set(key, index);
    });
    return map;
}
