import type { CsCityKpis, CsKpiFigures, CsRiscoPartner } from '../hooks/useCsKpis';
import { getEffectiveManager } from '../config/managerMapping';

/** Recorte de receita de uma carteira, somado a partir das cidades do gestor. */
export interface ManagerKpis {
    manager: string;
    cidades: string[];
    comissaoAtual: number;
    comissaoAnterior: number;
    variacaoPct: number;
    nrrPct: number;
    grrPct: number;
    churnReceitaPct: number;
    expansao: { valor: number; count: number };
    contracao: { valor: number; count: number };
    perdido: { valor: number; count: number };
    novos: { valor: number; count: number };
}

/**
 * O endpoint devolve NRR e GRR já em porcentagem, sem os numeradores. Somar
 * porcentagens de cidades diferentes daria um número errado, então os
 * numeradores são recuperados antes de somar.
 *
 * O denominador de ambos é a comissão do período anterior: no cálculo do
 * backend, `nrrDen` acumula `prev` de quem tinha `prev > 0`, e `comissao.anterior`
 * acumula `prev` de todo mundo — quem não tinha receita anterior soma zero, então
 * os dois valores coincidem.
 */
function numeradores(city: CsKpiFigures): { nrrNum: number; grrNum: number; den: number } {
    const den = city.comissao.anterior;
    return {
        den,
        nrrNum: (city.nrrPct / 100) * den,
        grrNum: (city.grrPct / 100) * den,
    };
}

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

/** Soma as cidades de cada gestor numa única leitura de carteira. */
export function aggregateKpisByManager(cidades: CsCityKpis[]): ManagerKpis[] {
    const buckets = new Map<string, {
        cidades: string[];
        atual: number; anterior: number;
        nrrNum: number; grrNum: number; den: number;
        expansaoVal: number; expansaoCount: number;
        contracaoVal: number; contracaoCount: number;
        perdidoVal: number; perdidoCount: number;
        novosVal: number; novosCount: number;
    }>();

    for (const city of cidades) {
        const manager = getEffectiveManager(city.cidade, '');
        let bucket = buckets.get(manager);
        if (!bucket) {
            bucket = {
                cidades: [],
                atual: 0, anterior: 0, nrrNum: 0, grrNum: 0, den: 0,
                expansaoVal: 0, expansaoCount: 0,
                contracaoVal: 0, contracaoCount: 0,
                perdidoVal: 0, perdidoCount: 0,
                novosVal: 0, novosCount: 0,
            };
            buckets.set(manager, bucket);
        }

        const { nrrNum, grrNum, den } = numeradores(city);
        bucket.cidades.push(city.cidade);
        bucket.atual += city.comissao.atual;
        bucket.anterior += city.comissao.anterior;
        bucket.nrrNum += nrrNum;
        bucket.grrNum += grrNum;
        bucket.den += den;
        bucket.expansaoVal += city.expansao.valor;
        bucket.expansaoCount += city.expansao.count;
        bucket.contracaoVal += city.contracao.valor;
        bucket.contracaoCount += city.contracao.count;
        bucket.perdidoVal += city.perdido.valor;
        bucket.perdidoCount += city.perdido.count;
        bucket.novosVal += city.novos.valor;
        bucket.novosCount += city.novos.count;
    }

    return [...buckets.entries()].map(([manager, b]) => ({
        manager,
        cidades: b.cidades.sort((a, z) => a.localeCompare(z, 'pt-BR')),
        comissaoAtual: b.atual,
        comissaoAnterior: b.anterior,
        variacaoPct: b.anterior > 0 ? (b.atual / b.anterior - 1) * 100 : 0,
        nrrPct: pct(b.nrrNum, b.den),
        grrPct: pct(b.grrNum, b.den),
        churnReceitaPct: b.den > 0 ? (1 - b.grrNum / b.den) * 100 : 0,
        expansao: { valor: b.expansaoVal, count: b.expansaoCount },
        contracao: { valor: b.contracaoVal, count: b.contracaoCount },
        perdido: { valor: b.perdidoVal, count: b.perdidoCount },
        novos: { valor: b.novosVal, count: b.novosCount },
    }));
}

/** Quem responde por cada parceiro em risco, para agrupar os alertas. */
export function managerForRisco(partner: CsRiscoPartner): string {
    return getEffectiveManager(partner.cidade || '', '');
}
