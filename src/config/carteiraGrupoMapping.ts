import { normalize } from '../hooks/useCityIds';

/**
 * Semente de GRUPO por cidade — mesmo papel do INITIAL_CITY_MANAGER_MAP em
 * managerMapping.ts: classificação comercial que ainda não foi cadastrada na
 * tabela Supabase `carteira_cidade`. Ordem de decisão (ver CarteiraView e
 * CarteiraPorGrupoView): Supabase > este mapa semente > vazio.
 */
const RAW_CITY_GRUPO: Record<string, string> = {
    'Cordeiro': 'LANÇADAS_23',
    'Cantagalo': 'LANÇADAS_23',

    'Barroso': 'LANÇADAS_24',
    'Silva Jardim': 'LANÇADAS_24',
    'Guaçuí': 'LANÇADAS_24',
    'Paraopeba': 'LANÇADAS_24',
    'Caetanópolis': 'LANÇADAS_24',
    'Carandaí': 'LANÇADAS_24',
    'Espera Feliz': 'LANÇADAS_24',

    'Bom Jesus do Itabapoana': 'LANÇADAS_25',
    'Bom Jesus do Norte': 'LANÇADAS_25',
    'Cláudio': 'LANÇADAS_25',

    'Natividade': 'LANÇADAS_26',

    'Miraí': 'LANÇADAS_27',

    'Santos Dumont': 'TOP_5',
    'Além Paraíba': 'TOP_5',
    'Muriaé': 'TOP_5',

    'Ubá': 'RESTANTES_IFOOD',

    'Bicas': 'POTENCIAIS',
    'Ervália': 'POTENCIAIS',
};

const INITIAL_CITY_GRUPO_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(RAW_CITY_GRUPO).map(([cidade, grupo]) => [normalize(cidade), grupo]),
);

/**
 * Resolve o GRUPO semente de uma cidade, tratando nomes combinados
 * ("Cordeiro / Cantagalo") e sufixo de UF ("Bom Jesus do Itabapoana - RJ"),
 * igual ao registerCity de useCityIds.ts.
 */
export function getInitialGrupo(cidade: string): string {
    const parts = (cidade || '').split('/').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        const semSufixo = part.replace(/\s*-\s*[A-Z]{2}$/, '').trim();
        const grupo = INITIAL_CITY_GRUPO_MAP[normalize(semSufixo || part)];
        if (grupo) return grupo;
    }
    return '';
}
