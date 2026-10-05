import { normalize } from '../hooks/useCityIds';

/**
 * Cidades da OKR — o recorte que o painel inteiro sabe aplicar.
 *
 * Isto NÃO é a mesma coisa que as categorias de `utils/cityOkr.ts` (Top 5,
 * Lançadas 23/24…): aquilo classifica a base toda em grupos; aqui é a lista
 * curta que está na OKR do período, e que vira um interruptor global.
 *
 * Casar por nome é o único caminho possível (a cidade chega como texto na
 * planilha, no Trello e no banco), então o casamento é por PREFIXO normalizado
 * em vez de igualdade:
 *
 *   banco       → "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES"
 *   planilha    → "Bom Jesus Do Itabapoana - RJ"
 *   OKR         → "Bom Jesus"
 *
 * Igualdade exata deixaria todas essas de fora. Ver também a memória
 * "identidade de loja é o ID": aqui o nome é da CIDADE, não da loja — cidade
 * homônima entre estados não existe nessa base.
 */

export interface CidadeOkr {
    /** Como a cidade aparece na OKR — é o rótulo que a interface mostra. */
    rotulo: string;
    /**
     * Prefixos (já normalizados: minúsculas, sem acento) que identificam a
     * cidade nos dados. "bom jesus" cobre Itabapoana e Norte, que na OKR
     * contam como uma praça só.
     */
    prefixos: string[];
}

export const CIDADES_OKR: CidadeOkr[] = [
    { rotulo: 'Barroso', prefixos: ['barroso'] },
    { rotulo: 'Bom Jesus', prefixos: ['bom jesus'] },
    { rotulo: 'Carandaí', prefixos: ['carandai'] },
    { rotulo: 'Carangola', prefixos: ['carangola'] },
    { rotulo: 'Espera Feliz', prefixos: ['espera feliz'] },
];

export const CIDADES_OKR_ROTULOS = CIDADES_OKR.map(c => c.rotulo);

const PREFIXOS_OKR = CIDADES_OKR.flatMap(c => c.prefixos);

/** Tira o sufixo de UF: "carandai - mg" → "carandai". */
function semUf(parte: string): string {
    return parte.replace(/\s*-\s*[a-z]{2}$/, '').trim();
}

/**
 * Partes comparáveis de um nome de cidade. Entradas compostas ("A / B",
 * "A e B") viram uma parte cada, porque os dados tanto chegam com o nome
 * inteiro quanto só com uma das pontas.
 */
function partesComparaveis(cidade: string): string[] {
    const inteiro = normalize(cidade);
    if (!inteiro) return [];
    const partes = new Set<string>([inteiro, semUf(inteiro)]);
    for (const parte of inteiro.split(/\s*\/\s*|\s+e\s+/)) {
        const limpa = parte.trim();
        if (!limpa) continue;
        partes.add(limpa);
        partes.add(semUf(limpa));
    }
    partes.delete('');
    return [...partes];
}

/** A cidade está na OKR? Nome vazio não está — ausência de dado não é match. */
export function isCidadeOkr(cidade?: string | null): boolean {
    if (!cidade?.trim()) return false;
    return partesComparaveis(cidade).some(parte =>
        PREFIXOS_OKR.some(prefixo => parte === prefixo || parte.startsWith(`${prefixo} `)),
    );
}

/** Rótulo da OKR para a cidade ("Bom Jesus do Itabapoana - RJ" → "Bom Jesus"). */
export function rotuloOkrDaCidade(cidade?: string | null): string | null {
    if (!cidade?.trim()) return null;
    const partes = partesComparaveis(cidade);
    for (const entrada of CIDADES_OKR) {
        const bate = partes.some(parte =>
            entrada.prefixos.some(prefixo => parte === prefixo || parte.startsWith(`${prefixo} `)),
        );
        if (bate) return entrada.rotulo;
    }
    return null;
}
