import type { CarteiraRow } from '../types/carteira';
import { normalize as normalizeCity } from '../hooks/useCityIds';

/** Categorias OKR — registro oficial por cidade */
export type OkrCategoryId =
    | 'top5'
    | 'potenciais'
    | 'resignificadas'
    | 'lancadas_2324'
    | 'lancadas_25'
    | 'lancadas_26'
    | 'outros';

export type OkrCategoryFilter = OkrCategoryId | '';

export const OKR_CATEGORY_OPTIONS: { id: OkrCategoryFilter; label: string }[] = [
    { id: '', label: 'Todas as categorias OKR' },
    { id: 'top5', label: 'Top 5' },
    { id: 'potenciais', label: 'Potenciais' },
    { id: 'resignificadas', label: 'Resignificadas' },
    { id: 'lancadas_2324', label: 'Lançadas 23/24' },
    { id: 'lancadas_25', label: 'Lançadas 25' },
    { id: 'lancadas_26', label: 'Lançadas 26' },
];

const OKR_LABELS: Record<OkrCategoryId, string> = {
    top5: 'Top 5',
    potenciais: 'Potenciais',
    resignificadas: 'Resignificadas',
    lancadas_2324: 'Lançadas 23/24',
    lancadas_25: 'Lançadas 25',
    lancadas_26: 'Lançadas 26',
    outros: 'Outros',
};

/** Registro canônico — cidades compostas permanecem como uma entrada */
const OKR_CITY_REGISTRY: { category: OkrCategoryId; cities: string[] }[] = [
    {
        category: 'top5',
        cities: [
            'Muriaé',
            'Rio Pomba',
            'Santos Dumont',
            'Além Paraíba',
            'São João Nepomuceno',
        ],
    },
    {
        category: 'potenciais',
        cities: [
            'Abaeté',
            'Bicas',
            'Ervália',
            'Jacutinga',
            'Monte Azul Paulista',
            'Monte Santo de Minas',
            'Ouro Fino',
            'Piraúba',
        ],
    },
    {
        category: 'resignificadas',
        cities: [
            'Barão de Cocais',
            'Ubá',
            'Ponte Nova',
        ],
    },
    {
        category: 'lancadas_2324',
        cities: [
            'Barroso',
            'Bom Jardim',
            'Carandaí',
            'Carangola',
            'Conceição de Macabu',
            'Cordeiro / Cantagalo',
            'Espera Feliz',
            'Guaçuí',
            'Paraopeba / Caetanópolis',
            'Pitangui',
            'Raul Soares',
            'Silva Jardim',
            'Tocantins',
        ],
    },
    {
        category: 'lancadas_25',
        cities: [
            'Bom Jesus do Itabapoana/Bom Jesus do Norte',
            'Carmo',
            'Cláudio',
            'Divino',
            'Porciúncula',
            'Santa Bárbara',
            'São José do Vale do Rio Preto',
        ],
    },
    {
        category: 'lancadas_26',
        cities: [
            'Natividade e Miraí',
        ],
    },
];

function splitCompoundParts(rawCity: string): string[] {
    if (!/\//.test(rawCity) && !/\s+e\s+/i.test(rawCity)) return [];
    return rawCity
        .split(/\s*\/\s*|\s+e\s+/i)
        .map(p => p.trim())
        .filter(Boolean);
}

/** Registra cidade (composta ou simples). Partes só entram no mapa para casar dados com nome isolado. */
function registerCityEntry(
    map: Map<string, OkrCategoryId>,
    rawCity: string,
    category: OkrCategoryId,
) {
    const fullKey = normalizeCity(rawCity);
    map.set(fullKey, category);

    const parts = splitCompoundParts(rawCity);
    for (const part of parts) {
        const withoutSuffix = part.replace(/\s*-\s*[A-Z]{2}$/i, '').trim();
        map.set(normalizeCity(part), category);
        if (withoutSuffix !== part) {
            map.set(normalizeCity(withoutSuffix), category);
        }
    }
}

function buildCanonicalOkrMap(): Map<string, OkrCategoryId> {
    const map = new Map<string, OkrCategoryId>();
    for (const { category, cities } of OKR_CITY_REGISTRY) {
        for (const city of cities) {
            registerCityEntry(map, city, category);
        }
    }
    return map;
}

function normalizeGrupo(grupo: string): string {
    return grupo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\s-]+/g, ' ')
        .trim();
}

/** Fallback: coluna GRUPO da aba CIDADES */
export function parseGrupoToOkrCategory(grupo: string): OkrCategoryId {
    const g = normalizeGrupo(grupo);
    if (!g) return 'outros';
    if (/\btop\s*5\b|\btop5\b/.test(g)) return 'top5';
    if (g.includes('potencial')) return 'potenciais';
    if (g.includes('resignific')) return 'resignificadas';
    if (g.includes('23') && g.includes('24')) return 'lancadas_2324';
    if (g.includes('23') || g.includes('24')) return 'lancadas_2324';
    if (/\b25\b/.test(g) && g.includes('lancad')) return 'lancadas_25';
    if (/\b26\b/.test(g) && g.includes('lancad')) return 'lancadas_26';
    if (g.includes('lancad') && g.includes('25')) return 'lancadas_25';
    if (g.includes('lancad') && g.includes('26')) return 'lancadas_26';
    return 'outros';
}

/**
 * Mapa cidade normalizada → categoria OKR.
 * Prioridade: registro canônico; depois aba CIDADES para cidades ainda não mapeadas.
 */
export function buildCityOkrMap(rows: CarteiraRow[] = []): Map<string, OkrCategoryId> {
    const map = buildCanonicalOkrMap();

    for (const row of rows) {
        if (!row.cidade?.trim()) continue;
        const key = normalizeCity(row.cidade);
        if (map.has(key)) continue;
        const category = row.grupo
            ? parseGrupoToOkrCategory(row.grupo)
            : 'outros';
        registerCityEntry(map, row.cidade, category);
    }

    return map;
}

export function getCityOkrCategory(
    cidade: string,
    map: Map<string, OkrCategoryId>,
): OkrCategoryId {
    const trimmed = (cidade || '').trim();
    if (!trimmed) return 'outros';
    return map.get(normalizeCity(trimmed)) ?? 'outros';
}

export function getOkrCategoryLabel(category: OkrCategoryId): string {
    return OKR_LABELS[category];
}

export function cityMatchesOkrFilter(
    cidade: string,
    okrFilter: OkrCategoryFilter,
    map: Map<string, OkrCategoryId>,
): boolean {
    if (!okrFilter) return true;
    return getCityOkrCategory(cidade, map) === okrFilter;
}

/** Categorias OKR com pelo menos uma cidade no mapa */
export function listOkrCategoriesInMap(map: Map<string, OkrCategoryId>): OkrCategoryFilter[] {
    const set = new Set<OkrCategoryId>();
    for (const cat of map.values()) set.add(cat);
    const order: OkrCategoryId[] = [
        'top5',
        'potenciais',
        'resignificadas',
        'lancadas_2324',
        'lancadas_25',
        'lancadas_26',
        'outros',
    ];
    return order.filter(id => set.has(id));
}

/** Nome canônico da entrada OKR (preserva compostas como no registro) */
export function getCanonicalOkrCityLabel(cidade: string, map: Map<string, OkrCategoryId>): string {
    const trimmed = cidade.trim();
    if (!trimmed) return trimmed;

    const category = getCityOkrCategory(trimmed, map);
    for (const group of OKR_CITY_REGISTRY) {
        if (group.category !== category) continue;
        for (const canonical of group.cities) {
            if (normalizeCity(canonical) === normalizeCity(trimmed)) return canonical;
            const parts = splitCompoundParts(canonical);
            if (parts.some(p => normalizeCity(p) === normalizeCity(trimmed))) return canonical;
        }
    }
    return trimmed;
}
