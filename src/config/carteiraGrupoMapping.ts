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

    'Miraí': 'LANÇADAS_26',

    'Santos Dumont': 'TOP_5',
    'Além Paraíba': 'TOP_5',
    'Muriaé': 'TOP_5',

    'Ubá': 'RESTANTES_IFOOD',

    'Bicas': 'POTENCIAIS',
    'Ervália': 'POTENCIAIS',

    // Carteira da Laís
    'Barão de Cocais': 'POTENCIAIS',
    'Jacutinga': 'POTENCIAIS',
    'Monte Santo de Minas': 'POTENCIAIS',
    'Abaeté': 'POTENCIAIS',
    'Monte Azul Paulista': 'POTENCIAIS',
    'Ouro Fino': 'POTENCIAIS',
    'Piraúba': 'POTENCIAIS',

    'Santa Bárbara': 'LANÇADAS_25',
    'São José do Vale do Rio Preto': 'LANÇADAS_25',
    'Porciúncula': 'LANÇADAS_25',
    'Carmo': 'LANÇADAS_25',
    'Divino': 'LANÇADAS_25',

    'São João Nepomuceno': 'TOP_5',
    'Rio Pomba': 'TOP_5',

    'Pitangui': 'LANÇADAS_24',
    'Bom Jardim': 'LANÇADAS_24',
    'Raul Soares': 'LANÇADAS_24',
    'Carangola': 'LANÇADAS_24',

    'Conceição de Macabu': 'LANÇADAS_23',
    'Tocantins': 'LANÇADAS_23',

    'Ponte Nova': 'RELANÇADAS_25',

    'Matias Barbosa': 'LANÇADAS_26',
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
