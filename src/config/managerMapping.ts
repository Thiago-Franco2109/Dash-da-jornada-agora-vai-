
export type Manager = 'THIAGO' | 'LAÍS' | 'DESCONHECIDO';
export type ProductModeKey = 'marketplace' | 'cardapio_digital';

/**
 * Atribuições vindas do Supabase (ver useAtribuicaoCs). Ficam num módulo
 * porque as telas resolvem o analista de forma síncrona, no meio da
 * renderização — o hook publica aqui assim que carrega.
 *
 * Ordem de decisão: loja > cidade (Supabase) > mapa semente abaixo.
 */
interface AtribuicoesPublicadas {
    porCidade: Record<ProductModeKey, Record<string, Manager>>;
    porParceiro: Record<ProductModeKey, Record<string, { analista: Manager }>>;
}

let atribuicoes: AtribuicoesPublicadas | null = null;

export function setAtribuicoesCarregadas(dados: AtribuicoesPublicadas): void {
    atribuicoes = dados;
}

/** True quando o Supabase já respondeu — a tela de Gestores usa para avisar. */
export function temAtribuicoesCarregadas(): boolean {
    return atribuicoes !== null;
}

/**
 * Mapa que era a única fonte antes do Supabase. Continua aqui como semente
 * (é o que popula a tabela na primeira execução do SQL) e como rede de
 * segurança se o Supabase não responder.
 */
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
    'Matias Barbosa': 'LAÍS',

    // THIAGO
    // Nomes compostos abaixo (ex: "Cordeiro / Cantagalo") são como o banco
    // Bigou registra essas regiões — usar os nomes separados aqui faz a
    // cidade nunca bater com o gestor atribuído.
    'Cordeiro / Cantagalo': 'THIAGO',
    'Barroso': 'THIAGO',
    'Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES': 'THIAGO',
    'Cláudio': 'THIAGO',
    'Silva Jardim': 'THIAGO',
    'Santos Dumont': 'THIAGO',
    'Guaçuí': 'THIAGO',
    'Ubá': 'THIAGO',
    'Bicas': 'THIAGO',
    'Ervália': 'THIAGO',
    'Paraopeba / Caetanópolis': 'THIAGO',
    'Carandaí': 'THIAGO',
    'Espera Feliz': 'THIAGO',
    'Além Paraíba': 'THIAGO',
    'Muriaé': 'THIAGO',
    'Natividade': 'THIAGO',
    'Miraí': 'THIAGO',
};

const NO_CITY_SPLIT_KEY_PREFIX = 'no_city_manager_split';

export interface NoCityManagerSplit {
    /** Quantidade de parceiros sem cidade atribuídos ao Thiago (ordem alfabética); o restante vai para Laís */
    thiagoCount: number;
}

function noCitySplitStorageKey(mode: ProductModeKey): string {
    return `${NO_CITY_SPLIT_KEY_PREFIX}_${mode}`;
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
    const doBanco = atribuicoes?.porCidade[mode]?.[city];
    if (doBanco) return doBanco;

    if (INITIAL_CITY_MANAGER_MAP[city]) return INITIAL_CITY_MANAGER_MAP[city];

    const norm = String(originalManager || '').trim().toUpperCase();
    if (norm === 'THIAGO' || norm === 'LAÍS') return norm;

    return originalManager || 'Desconhecido';
}

/**
 * Resolve o CS de um parceiro.
 *
 * A atribuição por LOJA vem primeiro: no Cardápio Digital, vendido para o
 * país inteiro, a cidade quase nunca tem carteira e a escolha é manual, loja
 * a loja. Só depois entra a cidade.
 *
 * `noCityIndex` é o resquício do rateio por contagem que existia antes da
 * atribuição por loja: sem cidade e sem escolha registrada, ainda divide
 * alfabeticamente para não deixar ninguém órfão na tela.
 */
export function getManagerForPartner(
    city: string,
    originalManager: string,
    noCityIndex: number | undefined,
    mode: ProductModeKey = 'marketplace',
    estabId?: string,
): string {
    const porLoja = estabId ? atribuicoes?.porParceiro[mode]?.[String(estabId)] : undefined;
    if (porLoja) return porLoja.analista;

    const trimmedCity = (city || '').trim();
    if (trimmedCity) {
        return getEffectiveManager(trimmedCity, originalManager, mode);
    }

    if (noCityIndex === undefined) return 'LAÍS';

    const split = getNoCityManagerSplit(mode);
    return noCityIndex < split.thiagoCount ? 'THIAGO' : 'LAÍS';
}

/** Lojas atribuídas manualmente a um CS (usado no Cardápio Digital). */
export function getLojasDoAnalista(analista: Manager, mode: ProductModeKey = 'cardapio_digital'): string[] {
    const porParceiro = atribuicoes?.porParceiro[mode] ?? {};
    return Object.entries(porParceiro)
        .filter(([, v]) => v.analista === analista)
        .map(([estabId]) => estabId);
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
    const allCities = new Set([
        ...Object.keys(INITIAL_CITY_MANAGER_MAP),
        ...Object.keys(atribuicoes?.porCidade[mode] ?? {}),
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
