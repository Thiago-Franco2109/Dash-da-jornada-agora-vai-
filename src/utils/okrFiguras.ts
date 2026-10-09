import type {
    OkrParceiroAdocao,
    OkrParceiroChurn,
    OkrParceiroNovo,
    OkrTrimestre,
} from '../hooks/useOkrTrimestre';

/**
 * A soma dos três KRs — o ÚNICO lugar onde a porcentagem da OKR é calculada.
 *
 * A function devolve só as listas nominais justamente para esta conta existir
 * uma vez: ela precisa descontar as lojas que o CS tirou da conta (Supabase
 * `okr_excluido`), e um total vindo pronto do banco seria uma segunda verdade,
 * calculada sobre a base cheia, divergindo do que a tela mostra no momento em
 * que alguém excluísse a primeira loja.
 *
 * `pct` é `null`, e não 0, quando não há denominador: "nenhuma janela de 14
 * dias fechou ainda" e "nenhum parceiro bateu a meta" são coisas diferentes, e
 * 0% diria a segunda.
 */

export interface FigurasKr1 {
    /** Lançados no trimestre (já sem os excluídos). */
    coorte: number;
    /** Dos lançados, quantos já tiveram a janela de 14 dias fechada. */
    fechados: number;
    atingiram: number;
    /** Ainda dentro da janela — não entram na conta, dá tempo de agir. */
    naJanela: number;
    pct: number | null;
}

export interface FigurasKr2 {
    base: number;
    recebendo: number;
    pct: number | null;
}

export interface FigurasKr3 {
    base: number;
    perdidos: number;
    pct: number | null;
}

export interface LinhaCidade {
    cidade: string;
    kr1: FigurasKr1;
    kr2: FigurasKr2;
    kr3: FigurasKr3;
}

export interface FigurasOkr {
    kr1: FigurasKr1;
    kr2: FigurasKr2;
    kr3: FigurasKr3;
    porCidade: LinhaCidade[];
    /** Listas já sem as lojas fora da conta — é o que cada painel exibe. */
    novos: OkrParceiroNovo[];
    adocao: OkrParceiroAdocao[];
    churn: OkrParceiroChurn[];
    /**
     * Quantas lojas saíram da base de cada KR. Vai ao lado do número na tela:
     * quem lê "56,5%" precisa poder ver que o denominador foi mexido.
     */
    foraDaConta: { kr1: number; kr2: number; kr3: number };
}

function pct(parte: number, total: number): number | null {
    return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

function figurasKr1(lista: OkrParceiroNovo[]): FigurasKr1 {
    const fechados = lista.filter(p => p.concluida);
    const atingiram = fechados.filter(p => p.atingiu).length;
    return {
        coorte: lista.length,
        fechados: fechados.length,
        atingiram,
        naJanela: lista.length - fechados.length,
        pct: pct(atingiram, fechados.length),
    };
}

function figurasKr2(lista: OkrParceiroAdocao[]): FigurasKr2 {
    const recebendo = lista.filter(p => p.recebendo).length;
    return { base: lista.length, recebendo, pct: pct(recebendo, lista.length) };
}

function figurasKr3(lista: OkrParceiroChurn[]): FigurasKr3 {
    const perdidos = lista.filter(p => p.saida).length;
    return { base: lista.length, perdidos, pct: pct(lista.length - perdidos, lista.length) };
}

export function calcularFiguras(dados: OkrTrimestre, excluidos: ReadonlySet<number>): FigurasOkr {
    const dentro = <T extends { id: number }>(lista: T[]) => lista.filter(p => !excluidos.has(p.id));

    const novos = dentro(dados.kr1.parceiros);
    const adocao = dentro(dados.kr2.parceiros);
    const churn = dentro(dados.kr3.parceiros);

    const cidades = [...new Set([
        ...novos.map(p => p.cidade),
        ...adocao.map(p => p.cidade),
        ...churn.map(p => p.cidade),
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return {
        kr1: figurasKr1(novos),
        kr2: figurasKr2(adocao),
        kr3: figurasKr3(churn),
        porCidade: cidades.map(cidade => ({
            cidade,
            kr1: figurasKr1(novos.filter(p => p.cidade === cidade)),
            kr2: figurasKr2(adocao.filter(p => p.cidade === cidade)),
            kr3: figurasKr3(churn.filter(p => p.cidade === cidade)),
        })),
        novos,
        adocao,
        churn,
        foraDaConta: {
            kr1: dados.kr1.parceiros.length - novos.length,
            kr2: dados.kr2.parceiros.length - adocao.length,
            kr3: dados.kr3.parceiros.length - churn.length,
        },
    };
}

/** Nome e cidade de uma loja fora da conta, buscados nas listas do trimestre. */
export function identificarNoRecorte(
    dados: OkrTrimestre | null,
    id: number,
): { nome: string; cidade: string } | null {
    if (!dados) return null;
    for (const lista of [dados.kr1.parceiros, dados.kr2.parceiros, dados.kr3.parceiros]) {
        const achado = lista.find(p => p.id === id);
        if (achado) return { nome: achado.nome, cidade: achado.cidade };
    }
    return null;
}
