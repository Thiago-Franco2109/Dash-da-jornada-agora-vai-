import type {
    OkrLojaCd,
    OkrLojaRisco,
    OkrParceiroNovo,
    OkrTrimestre,
} from '../hooks/useOkrTrimestre';

/**
 * O placar dos quatro KRs — o ÚNICO lugar onde eles são calculados.
 *
 * A function devolve só as listas nominais justamente para esta conta existir
 * uma vez: ela precisa descontar as lojas que o CS tirou da conta
 * (`okr_excluido`) e somar as que ele marcou como críticas (`okr_critica`),
 * e um total vindo pronto do banco seria uma segunda verdade, calculada sobre
 * a base cheia, divergindo do que a tela mostra no momento em que alguém
 * mexesse na primeira marcação.
 *
 * Os quatro KRs são CONTAGENS com meta absoluta, não porcentagens: o progresso
 * é `feito / meta`, e passar da meta não é erro — é a OKR batida com folga.
 */

export interface FigurasKr {
    feito: number;
    meta: number;
    /** 0–100, limitado para a barra; `feito` pode passar da meta. */
    progressoPct: number;
}

export interface FigurasKr22 extends FigurasKr {
    /** Lançados no trimestre (já sem os fora da conta). */
    coorte: number;
    naJanela: number;
    /** Janela fechada sem bater — não dá mais para recuperar esses. */
    perdidos: number;
}

export interface FigurasKr23 extends FigurasKr {
    /** Entraram em risco no trimestre ou estão marcadas como críticas. */
    universo: number;
    /** Do universo, quantas estão marcadas à mão. */
    criticas: number;
    /** Em risco e ainda sem reverter. */
    pendentes: number;
}

export interface FigurasKr41 extends FigurasKr {
    desafio: number;
    /** Acumulado real × esperado, mês a mês do trimestre. */
    porMes: { mes: string; pedidos: number; acumulado: number; checkpoint: number }[];
    /** Checkpoint do fim do mês em curso. */
    checkpointAtual: number;
    /** O checkpoint interpolado até hoje — ver `esperadoHoje`. */
    esperadoAgora: number;
}

export interface FigurasKr42 extends FigurasKr {
    base: number;
    /** Lojas entre metade da régua e a régua — as que dá para empurrar. */
    quaseLa: number;
    checkpointAtual: number;
    esperadoAgora: number;
}

export interface LinhaCidade {
    cidade: string;
    kr22: { coorte: number; atingiram: number };
    kr23: { universo: number; revertidas: number };
}

export interface FigurasOkr {
    kr22: FigurasKr22;
    kr23: FigurasKr23;
    kr41: FigurasKr41;
    kr42: FigurasKr42;
    porCidade: LinhaCidade[];
    /** Listas já sem as lojas fora da conta — é o que cada painel exibe. */
    novos: OkrParceiroNovo[];
    risco: LojaRiscoAvaliada[];
    lojasCd: OkrLojaCd[];
    /** Quantas lojas saíram da base de cada KR. */
    foraDaConta: { kr22: number; kr23: number; cd: number };
}

/** Uma loja do KR 2.3 com o veredito já aplicado. */
export interface LojaRiscoAvaliada extends OkrLojaRisco {
    /** Marcada à mão como crítica de cancelamento. */
    critica: boolean;
    /** Entrou no universo do KR: ficou parada 7+ dias no trimestre, ou é crítica. */
    emRisco: boolean;
    /** Teve pedido nas N semanas seguidas e cancelamento abaixo do teto. */
    revertida: boolean;
    /** O que falta para reverter — vazio quando já reverteu. */
    falta: ('semanas' | 'cancelamento')[];
}

function progresso(feito: number, meta: number): number {
    return meta > 0 ? Math.min(Math.round((feito / meta) * 1000) / 10, 100) : 0;
}

/**
 * O checkpoint do mês interpolado até a data de corte.
 *
 * Os checkpoints da OKR são de FIM de mês ("out 4.350"). Comparar o acumulado
 * do dia 13 contra o número do dia 31 pinta o KR de vermelho o mês inteiro e
 * só fica honesto na véspera — então a régua do dia é a reta entre o
 * checkpoint anterior e o do mês em curso.
 */
function esperadoHoje(
    checkpoints: number[],
    partida: number,
    meses: string[],
    corte: string,
): number {
    const i = Math.max(meses.indexOf(corte.slice(0, 7)), 0);
    const anterior = i > 0 ? (checkpoints[i - 1] ?? partida) : partida;
    const alvo = checkpoints[i] ?? anterior;
    const diaDoMes = Number(corte.slice(8, 10));
    const diasNoMes = new Date(Date.UTC(Number(corte.slice(0, 4)), Number(corte.slice(5, 7)), 0)).getUTCDate();
    return Math.round(anterior + (alvo - anterior) * (diaDoMes / diasNoMes));
}

/**
 * Aplica a régua de reversão do KR 2.3: pedido em cada uma das N semanas
 * corridas E cancelamento abaixo do teto na mesma janela.
 *
 * Loja sem pedido nenhum na janela tem taxa `null` — e `null` não passa no
 * teto: "não cancelou nada" porque não vendeu nada não é reversão.
 */
function avaliarRisco(
    loja: OkrLojaRisco,
    critica: boolean,
    diasParado: number,
    tetoPct: number,
): LojaRiscoAvaliada {
    const temSemanas = loja.semanasComPedido.every(Boolean);
    const cancelamentoOk = loja.taxaCancelamentoPct !== null && loja.taxaCancelamentoPct < tetoPct;
    const emRisco = critica || loja.maiorLacunaDias >= diasParado;
    const falta: ('semanas' | 'cancelamento')[] = [];
    if (!temSemanas) falta.push('semanas');
    if (!cancelamentoOk) falta.push('cancelamento');
    return {
        ...loja,
        critica,
        emRisco,
        revertida: emRisco && temSemanas && cancelamentoOk,
        falta,
    };
}

export function calcularFiguras(
    dados: OkrTrimestre,
    foraDaConta: ReadonlySet<number>,
    criticas: ReadonlySet<number>,
): FigurasOkr {
    const p = dados.parametros;
    const dentro = <T extends { id: number }>(lista: T[]) => lista.filter(l => !foraDaConta.has(l.id));

    // ── KR 2.2 — safra 14d ───────────────────────────────────────────────
    const novos = dentro(dados.kr22.parceiros);
    const atingiram = novos.filter(n => n.atingiu).length;
    const kr22: FigurasKr22 = {
        feito: atingiram,
        meta: dados.kr22.meta,
        progressoPct: progresso(atingiram, dados.kr22.meta),
        coorte: novos.length,
        naJanela: novos.filter(n => !n.concluida && !n.atingiu).length,
        perdidos: novos.filter(n => n.concluida && !n.atingiu).length,
    };

    // ── KR 2.3 — lojas em risco ──────────────────────────────────────────
    const risco = dentro(dados.kr23.parceiros)
        .map(l => avaliarRisco(l, criticas.has(l.id), p.diasParado, p.tetoCancelamentoPct))
        .sort((a, b) => {
            // Revertidas primeiro (é o placar), depois quem está mais perto.
            if (a.revertida !== b.revertida) return a.revertida ? -1 : 1;
            return b.semanasComPedido.filter(Boolean).length - a.semanasComPedido.filter(Boolean).length;
        });
    const universo = risco.filter(l => l.emRisco);
    const revertidas = universo.filter(l => l.revertida).length;
    const kr23: FigurasKr23 = {
        feito: revertidas,
        meta: dados.kr23.meta,
        progressoPct: progresso(revertidas, dados.kr23.meta),
        universo: universo.length,
        criticas: universo.filter(l => l.critica).length,
        pendentes: universo.length - revertidas,
    };

    // ── Objetivo 4 — Cardápio Digital ────────────────────────────────────
    const lojasCd = dentro(dados.cardapioDigital.lojas);

    /** Índice do mês do trimestre em que o corte está (0, 1 ou 2). */
    const mesCorrente = Math.max(dados.trimestre.meses.indexOf(dados.trimestre.corte.slice(0, 7)), 0);

    let acumulado = 0;
    const porMes = dados.trimestre.meses.map((mes, i) => {
        const pedidos = lojasCd.reduce((a, l) => a + (l.porMes[mes] ?? 0), 0);
        acumulado += pedidos;
        return { mes, pedidos, acumulado, checkpoint: dados.kr41.checkpoints[i] ?? 0 };
    });
    const pedidosCd = porMes[porMes.length - 1]?.acumulado ?? 0;
    const kr41: FigurasKr41 = {
        feito: pedidosCd,
        meta: dados.kr41.meta,
        progressoPct: progresso(pedidosCd, dados.kr41.meta),
        desafio: dados.kr41.desafio,
        porMes,
        checkpointAtual: dados.kr41.checkpoints[mesCorrente] ?? dados.kr41.meta,
        esperadoAgora: esperadoHoje(dados.kr41.checkpoints, 0, dados.trimestre.meses, dados.trimestre.corte),
    };

    const ativasCd = lojasCd.filter(l => l.pedidos30d >= p.pedidosLojaAtiva).length;
    const kr42: FigurasKr42 = {
        feito: ativasCd,
        meta: dados.kr42.meta,
        progressoPct: progresso(ativasCd, dados.kr42.meta),
        base: dados.kr42.base,
        quaseLa: lojasCd.filter(l =>
            l.pedidos30d < p.pedidosLojaAtiva && l.pedidos30d >= p.pedidosLojaAtiva / 2,
        ).length,
        checkpointAtual: dados.kr42.checkpoints[mesCorrente] ?? dados.kr42.meta,
        // O KR 4.2 parte de uma base declarada (23 lojas), não de zero.
        esperadoAgora: esperadoHoje(dados.kr42.checkpoints, dados.kr42.base, dados.trimestre.meses, dados.trimestre.corte),
    };

    // ── recorte por cidade (só o objetivo 2: o 4 não é por cidade) ───────
    const cidades = [...new Set([...novos, ...risco].map(l => l.cidade).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return {
        kr22,
        kr23,
        kr41,
        kr42,
        porCidade: cidades.map(cidade => ({
            cidade,
            kr22: {
                coorte: novos.filter(n => n.cidade === cidade).length,
                atingiram: novos.filter(n => n.cidade === cidade && n.atingiu).length,
            },
            kr23: {
                universo: universo.filter(l => l.cidade === cidade).length,
                revertidas: universo.filter(l => l.cidade === cidade && l.revertida).length,
            },
        })),
        novos,
        risco,
        lojasCd,
        foraDaConta: {
            kr22: dados.kr22.parceiros.length - novos.length,
            kr23: dados.kr23.parceiros.length - risco.length,
            cd: dados.cardapioDigital.lojas.length - lojasCd.length,
        },
    };
}

/** Nome e cidade de uma loja marcada, buscados nas listas do trimestre. */
export function identificarNoRecorte(
    dados: OkrTrimestre | null,
    id: number,
): { nome: string; cidade: string } | null {
    if (!dados) return null;
    for (const lista of [dados.kr22.parceiros, dados.kr23.parceiros, dados.cardapioDigital.lojas]) {
        const achado = (lista as { id: number; nome: string; cidade: string }[]).find(l => l.id === id);
        if (achado) return { nome: achado.nome, cidade: achado.cidade };
    }
    return null;
}
