import type {
    OkrLojaCd,
    OkrLojaEngajada,
    OkrParceiroNovo,
    OkrTrimestre,
} from '../hooks/useOkrTrimestre';

/**
 * O placar dos três KRs — o ÚNICO lugar onde eles são calculados.
 *
 * A function devolve só as listas nominais justamente para esta conta existir
 * uma vez: ela precisa descontar as lojas que o CS tirou da conta
 * (`okr_excluido`), e um total vindo pronto do banco seria uma segunda verdade,
 * calculada sobre a base cheia, divergindo do que a tela mostra no momento em
 * que alguém excluísse a primeira loja.
 *
 * Os três KRs são PORCENTAGENS com meta de patamar, não contagens acumuladas:
 * o progresso é `feito / base` contra `metaPct`, e 38% não acumula ao longo do
 * trimestre — está lá ou não está no dia em que se olha. Por isso não há
 * checkpoint mensal nem "ritmo do trimestre" como havia na versão anterior.
 *
 * `faltam` é o número mais acionável da tela: transforma "35,6% contra 38%" em
 * "faltam 3 lojas".
 */

export interface FigurasKr {
    /** Numerador: quem conta hoje. */
    feito: number;
    /** Denominador, já sem as lojas fora da conta. */
    base: number;
    /** 0–100 com uma casa. null quando a base é zero — e zero não é 0%. */
    pct: number | null;
    metaPct: number;
    /** Quantas lojas ainda precisam virar para a meta fechar. */
    faltam: number;
}

export interface FigurasKr1 extends FigurasKr {
    /** Ainda dentro dos 14 dias — dá para converter. */
    naJanela: number;
    /** Janela fechada sem bater: não dá mais para recuperar esses. */
    perdidos: number;
    /** Teto se todo mundo que ainda está na janela converter. */
    potencialPct: number | null;
    /** Saíram da coorte por relançamento com troca de dono. */
    trocaDono: number;
}

export interface FigurasKr2 extends FigurasKr {
    /** Entre metade da régua e a régua — é daqui que o KR cresce. */
    quaseLa: number;
    /** Cruzaram a régua nesta janela (antes→depois). */
    cruzaram: number;
    /** Caíram da régua — o vazamento. */
    cairam: number;
}

export interface FigurasKr3 extends FigurasKr {
    /** Mesma conta no mês anterior fechado — a régua de leitura. */
    pctMesAnterior: number | null;
    acimaMesAnterior: number;
    /** Entre metade da régua e a régua. */
    quaseLa: number;
    /** Ainda não faturaram nada no mês. */
    semFaturamento: number;
    faturamentoTotal: number;
}

export interface LinhaCidade {
    cidade: string;
    kr1: { coorte: number; atingiram: number };
    kr2: { base: number; engajadas: number; pct: number | null };
}

export interface FigurasOkr {
    kr1: FigurasKr1;
    kr2: FigurasKr2;
    kr3: FigurasKr3;
    porCidade: LinhaCidade[];
    /** Listas já sem as lojas fora da conta — é o que cada painel exibe. */
    novos: OkrParceiroNovo[];
    /** A coorte do KR 1 sem quem saiu por troca de dono. */
    coorteKr1: OkrParceiroNovo[];
    /** Quem saiu da coorte — a tela lista, porque o número vai para o CEO. */
    foraPorTrocaDono: OkrParceiroNovo[];
    engajamento: OkrLojaEngajada[];
    lojasCd: OkrLojaCd[];
    /** Quantas lojas saíram da base de cada KR pela marcação manual. */
    foraDaConta: { kr1: number; kr2: number; kr3: number };
}

function pct(parte: number, total: number): number | null {
    return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

/** Quantos ainda precisam virar para a porcentagem alcançar a meta. */
function faltam(feito: number, base: number, metaPct: number): number {
    return Math.max(Math.ceil((base * metaPct) / 100) - feito, 0);
}

export function calcularFiguras(dados: OkrTrimestre, foraDaConta: ReadonlySet<number>): FigurasOkr {
    const p = dados.parametros;
    const dentro = <T extends { id: number }>(lista: T[]) => lista.filter(l => !foraDaConta.has(l.id));

    // ── KR 1 — engajamento de novos parceiros ────────────────────────────
    // Relançamento com troca de dono sai da coorte, como manda o enunciado.
    // Relançamento pelo MESMO dono fica: é o parceiro de sempre recomeçando.
    const novos = dentro(dados.kr1.parceiros);
    const foraPorTrocaDono = novos.filter(n => n.trocaDono);
    const coorteKr1 = novos.filter(n => !n.trocaDono);
    const atingiram = coorteKr1.filter(n => n.atingiu).length;
    const naJanela = coorteKr1.filter(n => !n.concluida && !n.atingiu).length;
    const kr1: FigurasKr1 = {
        feito: atingiram,
        base: coorteKr1.length,
        pct: pct(atingiram, coorteKr1.length),
        metaPct: dados.kr1.meta,
        faltam: faltam(atingiram, coorteKr1.length, dados.kr1.meta),
        naJanela,
        perdidos: coorteKr1.filter(n => n.concluida && !n.atingiu).length,
        // Quem está na janela ainda pode virar — o cartão mostra esse teto para
        // o KR não parecer desastre na primeira semana do trimestre.
        potencialPct: pct(atingiram + naJanela, coorteKr1.length),
        trocaDono: foraPorTrocaDono.length,
    };

    // ── KR 2 — lojas engajadas ───────────────────────────────────────────
    const engajamento = dentro(dados.kr2.parceiros);
    const engajadas = engajamento.filter(l => l.engajada).length;
    const kr2: FigurasKr2 = {
        feito: engajadas,
        base: engajamento.length,
        pct: pct(engajadas, engajamento.length),
        metaPct: dados.kr2.meta,
        faltam: faltam(engajadas, engajamento.length, dados.kr2.meta),
        quaseLa: engajamento.filter(l =>
            !l.engajada && l.pedidos28d >= p.pedidosEngajada / 2).length,
        cruzaram: engajamento.filter(l => l.cruzou).length,
        cairam: engajamento.filter(l => l.caiu).length,
    };

    // ── KR 3 — faturamento no Cardápio Digital ───────────────────────────
    const lojasCd = dentro(dados.kr3.lojas);
    const acima = lojasCd.filter(l => l.acima).length;
    const acimaMesAnterior = lojasCd.filter(l =>
        (l.porMes[dados.trimestre.mesAnterior] ?? 0) > p.faturamentoMinimo).length;
    const kr3: FigurasKr3 = {
        feito: acima,
        base: lojasCd.length,
        pct: pct(acima, lojasCd.length),
        metaPct: dados.kr3.meta,
        faltam: faltam(acima, lojasCd.length, dados.kr3.meta),
        // O KR é mensal: no dia 19 o mês ainda não acabou, e o número do mês
        // fechado é a única referência honesta de onde a base costuma parar.
        pctMesAnterior: pct(acimaMesAnterior, lojasCd.length),
        acimaMesAnterior,
        quaseLa: lojasCd.filter(l =>
            !l.acima && l.faturamentoMes >= p.faturamentoMinimo / 2).length,
        semFaturamento: lojasCd.filter(l => l.faturamentoMes === 0).length,
        faturamentoTotal: lojasCd.reduce((a, l) => a + l.faturamentoMes, 0),
    };

    // ── recorte por cidade (só o Bigou App: o KR 3 não é por cidade) ─────
    const cidades = [...new Set([...coorteKr1, ...engajamento].map(l => l.cidade).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return {
        kr1,
        kr2,
        kr3,
        porCidade: cidades.map(cidade => {
            const naCidade = engajamento.filter(l => l.cidade === cidade);
            const engajadasNaCidade = naCidade.filter(l => l.engajada).length;
            return {
                cidade,
                kr1: {
                    coorte: coorteKr1.filter(n => n.cidade === cidade).length,
                    atingiram: coorteKr1.filter(n => n.cidade === cidade && n.atingiu).length,
                },
                kr2: {
                    base: naCidade.length,
                    engajadas: engajadasNaCidade,
                    pct: pct(engajadasNaCidade, naCidade.length),
                },
            };
        }),
        novos,
        coorteKr1,
        foraPorTrocaDono,
        engajamento,
        lojasCd,
        foraDaConta: {
            kr1: dados.kr1.parceiros.length - novos.length,
            kr2: dados.kr2.parceiros.length - engajamento.length,
            kr3: dados.kr3.lojas.length - lojasCd.length,
        },
    };
}

/** Nome e cidade de uma loja marcada, buscados nas listas do trimestre. */
export function identificarNoRecorte(
    dados: OkrTrimestre | null,
    id: number,
): { nome: string; cidade: string } | null {
    if (!dados) return null;
    for (const lista of [dados.kr1.parceiros, dados.kr2.parceiros, dados.kr3.lojas]) {
        const achado = (lista as { id: number; nome: string; cidade: string }[]).find(l => l.id === id);
        if (achado) return { nome: achado.nome, cidade: achado.cidade };
    }
    return null;
}
