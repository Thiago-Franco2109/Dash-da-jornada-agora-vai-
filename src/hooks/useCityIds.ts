import { useState, useEffect, useMemo, useCallback } from 'react';
import { encodeSheetTabForGateway } from '../utils/dataSync';
import { useParceirosAtivos } from './useParceirosAtivos';

// ─── Configuração do mesmo Gateway usado pelo restante do app ──────────────
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? 'https://sheets-api-production-0097.up.railway.app')
    .trim()
    .replace(/\/+$/, '');

const SHEET_ID = '1ht9dNFXse4tQEJkMP62cuqbFcJwoFSC40RRmZYAY9zg';
const TAB_NAME = 'cidades-situação';

function apiUrl(path: string) {
    if (!path.startsWith('/')) path = `/${path}`;
    return `${API_ORIGIN}${path}`;
}

function getFetchOptions(): RequestInit {
    const token = sessionStorage.getItem('auth_token');
    const options: RequestInit = { credentials: 'include' as RequestCredentials };
    if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
    }
    return options;
}

// ─── Mapa normalizado: nome_da_cidade_em_minúsculas → id ──────────────────
export type CityIdMap = Record<string, number>;

/** Normaliza o nome da cidade para comparação robusta */
export function normalize(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // remove acentos
        .replace(/\s+/g, ' ')             // colapsa espaços múltiplos
        .trim();
}

let _cache: CityIdMap | null = null;
let _fetchPromise: Promise<CityIdMap> | null = null;

/**
 * Registra no mapa todas as variações de nome de uma cidade.
 * Lida com padrões como:
 *   "Cordeiro / Cantagalo"          → registra ambos
 *   "Bom Jesus do Itabapoana - RJ"  → registra com e sem sufixo " - XX"
 */
function registerCity(map: CityIdMap, rawName: string, id: number) {
    const parts = rawName.split('/').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        // Ex: "Bom Jesus do Itabapoana - RJ" → também registra "Bom Jesus do Itabapoana"
        const withoutSuffix = part.replace(/\s*-\s*[A-Z]{2}$/, '').trim();
        map[normalize(part)] = id;
        if (withoutSuffix !== part) map[normalize(withoutSuffix)] = id;
    }
}

/**
 * Chaves de busca para um nome de cidade vindo da planilha/dashboard, na ordem
 * do mais específico para o mais genérico. Espelha o `registerCity`, só que do
 * lado da consulta: "Cordeiro / Cantagalo - RJ" tenta o nome inteiro, depois
 * cada parte, com e sem o sufixo " - UF".
 */
function cityLookupKeys(rawName: string): string[] {
    const trimmed = (rawName ?? '').trim();
    if (!trimmed) return [];
    const keys: string[] = [normalize(trimmed)];
    for (const part of trimmed.split('/').map(p => p.trim()).filter(Boolean)) {
        keys.push(normalize(part));
        const withoutSuffix = part.replace(/\s*-\s*[A-Za-z]{2}$/, '').trim();
        if (withoutSuffix && withoutSuffix !== part) keys.push(normalize(withoutSuffix));
    }
    return Array.from(new Set(keys.filter(Boolean)));
}

async function fetchCityIdMap(): Promise<CityIdMap> {
    if (_cache) return _cache;
    if (_fetchPromise) return _fetchPromise;

    _fetchPromise = (async () => {
        const url = apiUrl(`/api/sheets/${SHEET_ID}/${encodeSheetTabForGateway(TAB_NAME)}`);
        const res = await fetch(url, getFetchOptions());
        if (!res.ok) throw new Error(`Cidades sheet: ${res.status} ${res.statusText}`);

        const json = await res.json();
        const map: CityIdMap = {};

        // ── Formato Gateway: { success, data: { headers, rows } } ────────
        // As rows chegam como objetos: { 'ID BD': 14, 'UF': 'MG', 'Cidade': 'Muriaé', ... }
        if (json.success && json.data?.rows) {
            const headers: string[] = json.data.headers ?? [];

            for (const row of json.data.rows) {
                let id: number | undefined;
                let name: string | undefined;

                if (Array.isArray(row)) {
                    // Fallback: array posicional — Coluna A = índice 0, Coluna C = índice 2
                    id   = parseInt(String(row[0] ?? ''));
                    name = String(row[2] ?? '').trim() || undefined;
                } else {
                    // Objeto com chaves de header (caso padrão do Gateway)
                    // Tenta os possíveis nomes para Coluna A (ID) e Coluna C (Cidade)
                    const idRaw = row['ID BD'] ?? row['id_bd'] ?? row['id'] ?? row['ID'] ??
                        (headers[0] ? row[headers[0]] : undefined);
                    const nameRaw = row['Cidade'] ?? row['cidade'] ?? row['CIDADE'] ??
                        (headers[2] ? row[headers[2]] : undefined);

                    id   = parseInt(String(idRaw ?? ''));
                    name = String(nameRaw ?? '').trim() || undefined;
                }

                if (id !== undefined && !isNaN(id) && name) {
                    registerCity(map, name, id);
                }
            }
        } else {
            // Fallback: array de arrays ou .values
            const values: any[][] = Array.isArray(json) ? json : (json.values ?? []);
            for (const row of values) {
                const id   = parseInt(String(row[0] ?? ''));
                const name = String(row[2] ?? '').trim();
                if (!isNaN(id) && name) registerCity(map, name, id);
            }
        }

        _cache = map;
        console.log(`[useCityIds] ✅ Mapa carregado: ${Object.keys(map).length} entradas para ${new Set(Object.values(map)).size} cidades`);
        return map;
    })();

    return _fetchPromise;
}

// ─── Hook ─────────────────────────────────────────────────────────────────
/**
 * Resolve o `localidade_id` de um parceiro — o parâmetro que faz o CMS abrir já
 * filtrado na cidade certa.
 *
 * A planilha `cidades-situação` era a única fonte e casava por NOME: bastava a
 * cidade não estar lá (ou estar escrita diferente do dashboard) para o link cair
 * no CMS genérico e o CS ter que escolher a cidade na mão. O banco já responde
 * isso de forma exata — `estabelecimento.localidade_id` vem junto da lista de
 * parceiros ativos — então a ordem hoje é:
 *
 *   1. estab_id → localidade_id (banco, exato — ver memória: identidade é o ID)
 *   2. nome da cidade → localidade_id (banco, tabela `localidade`)
 *   3. nome da cidade → ID BD (planilha, fallback histórico)
 */
export function useCityIds() {
    const [cityIdMap, setCityIdMap] = useState<CityIdMap>(_cache ?? {});
    const [loading, setLoading]     = useState(!_cache);
    const [error, setError]         = useState<string | null>(null);
    const { parceiros, loading: parceirosLoading } = useParceirosAtivos();

    useEffect(() => {
        if (_cache) {
            setCityIdMap(_cache);
            setLoading(false);
            return;
        }
        setLoading(true);
        fetchCityIdMap()
            .then(map => { setCityIdMap(map); setLoading(false); })
            .catch(err => {
                console.warn('[useCityIds] Falha ao carregar IDs de cidades:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    // ── Índices vindos do banco ──────────────────────────────────────────
    // `porEstab` casa por ID e é sempre exato. `porNome` cobre quem não está na
    // lista de ativos (parceiro em onboarding, delivery=0) usando o nome da
    // própria tabela `localidade`. Nome repetido em localidades diferentes NÃO
    // entra: casar por nome ali seria sorteio, e o link abriria a cidade errada.
    const { porEstab, porNome } = useMemo(() => {
        const byId = new Map<string, number>();
        const byName: CityIdMap = {};
        const ambiguos = new Set<string>();

        for (const p of parceiros) {
            if (p.localidadeId == null) continue;
            byId.set(String(p.id), p.localidadeId);
            if (!p.cidade) continue;
            const candidato: CityIdMap = {};
            registerCity(candidato, p.cidade, p.localidadeId);
            for (const [key, id] of Object.entries(candidato)) {
                const atual = byName[key];
                if (atual !== undefined && atual !== id) { ambiguos.add(key); continue; }
                byName[key] = id;
            }
        }
        for (const key of ambiguos) delete byName[key];
        return { porEstab: byId, porNome: byName };
    }, [parceiros]);

    /**
     * Retorna o localidade_id do parceiro. Passe o `estabId` sempre que tiver:
     * é a única via que não depende de o nome da cidade bater entre planilha e
     * banco.
     */
    const getLocalidadeId = useCallback((
        cidadeNome: string,
        estabId?: string | number | null,
    ): number | undefined => {
        if (estabId != null && String(estabId).trim()) {
            const doBanco = porEstab.get(String(estabId).trim());
            if (doBanco) return doBanco;
        }
        for (const key of cityLookupKeys(cidadeNome)) {
            const id = porNome[key] ?? cityIdMap[key];
            if (id) return id;
        }
        return undefined;
    }, [porEstab, porNome, cityIdMap]);

    /**
     * Retorna a URL do CMS com ?localidade_id=X quando o ID for conhecido.
     * Ex: getCmsPromoUrl('https://admin.bigou.com.br/campanha/promocao/cadastro/26', 'Muriaé')
     *     → 'https://admin.bigou.com.br/campanha/promocao/cadastro/26?localidade_id=14'
     */
    const getCmsPromoUrl = useCallback((
        baseUrl: string,
        cidadeNome: string,
        estabId?: string | number | null,
    ): string => {
        const id = getLocalidadeId(cidadeNome, estabId);
        if (!id) return baseUrl;
        return `${baseUrl}?localidade_id=${id}`;
    }, [getLocalidadeId]);

    return {
        cityIdMap,
        // Só é "não mapeada" depois que as DUAS fontes chegaram. Enquanto o
        // banco carrega, a UI mostra "carregando cidade…" em vez de cravar o
        // aviso e mandar o CS escolher a cidade na mão sem necessidade.
        loading: loading || parceirosLoading,
        error,
        getCmsPromoUrl,
        getLocalidadeId,
    };
}
