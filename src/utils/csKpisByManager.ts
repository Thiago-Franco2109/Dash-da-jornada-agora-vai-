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

/**
 * Soma um conjunto de cidades no mesmo formato do bloco global do endpoint.
 *
 * Existe por causa do foco "Cidades OKR": o endpoint entrega o global já
 * calculado sobre a base inteira, e mostrá-lo ao lado de uma lista recortada
 * diria "NRR da OKR" exibindo o NRR de todo mundo. NRR/GRR voltam a ser somados
 * pelos numeradores (ver `numeradores` acima) — porcentagem não se soma.
 */
export function aggregateCityFigures(cidades: CsCityKpis[]): CsKpiFigures {
    const z = { valor: 0, count: 0 };
    const acc = {
        atual: 0, anterior: 0, nrrNum: 0, grrNum: 0, den: 0,
        expansao: { ...z }, contracao: { ...z }, perdido: { ...z }, emQueda: { ...z }, novos: { ...z },
        estavelCount: 0,
        totalAtivos: 0, comPedido: 0, semPedido: 0, pedidosCount: 0,
    };
    const risco: CsRiscoPartner[] = [];

    for (const city of cidades) {
        const { nrrNum, grrNum, den } = numeradores(city);
        acc.atual += city.comissao.atual;
        acc.anterior += city.comissao.anterior;
        acc.nrrNum += nrrNum;
        acc.grrNum += grrNum;
        acc.den += den;
        for (const chave of ['expansao', 'contracao', 'perdido', 'emQueda', 'novos'] as const) {
            acc[chave].valor += city[chave].valor;
            acc[chave].count += city[chave].count;
        }
        acc.estavelCount += city.estavelCount;
        acc.totalAtivos += city.atividade.totalAtivos;
        acc.comPedido += city.atividade.comPedido;
        acc.semPedido += city.atividade.semPedido;
        acc.pedidosCount += city.atividade.pedidosCount;
        risco.push(...city.topRisco);
    }

    return {
        comissao: {
            atual: acc.atual,
            anterior: acc.anterior,
            variacaoPct: acc.anterior > 0 ? (acc.atual / acc.anterior - 1) * 100 : 0,
        },
        nrrPct: pct(acc.nrrNum, acc.den),
        grrPct: pct(acc.grrNum, acc.den),
        churnReceitaPct: acc.den > 0 ? (1 - acc.grrNum / acc.den) * 100 : 0,
        expansao: acc.expansao,
        contracao: acc.contracao,
        estavelCount: acc.estavelCount,
        perdido: acc.perdido,
        emQueda: acc.emQueda,
        novos: acc.novos,
        atividade: {
            totalAtivos: acc.totalAtivos,
            comPedido: acc.comPedido,
            semPedido: acc.semPedido,
            pedidosCount: acc.pedidosCount,
            taxaPct: acc.totalAtivos > 0 ? (acc.comPedido / acc.totalAtivos) * 100 : 0,
        },
        // O endpoint devolve 10 por cidade e 20 no global — a soma segue o global.
        topRisco: risco.sort((a, b) => b.perda - a.perda).slice(0, 20),
    };
}

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
