export interface AcaoPromocionalCidade {
    cidade: string;
    lojasAtivas: number;
    comPromocao: number;
    pctComPromocao: number;
    promoSubsidio: number;
    pctPromoSubsidio: number;
    promoSemSubsidio: number;
    pctPromoSemSubsidio: number;
    comCupom: number;
    pctComCupom: number;
    cupomDestaque: number;
    pctCupomDestaque: number;
    primeiroPedido: number;
    pctPrimeiroPedido: number;
    taxaEntrega: number;
    pctTaxaEntrega: number;
    cupomRegular: number;
    pctCupomRegular: number;
    semAcao: number;
    pctSemAcao: number;
}

export interface AcoesPromocionaisTotais {
    cidadesComAcoes: number;
    totalCidades: number;
    lojasAtivas: number;
    comPromocao: number;
    comCupom: number;
    cupomDestaque: number;
    cupomRegular: number;
    semAcao: number;
}

export type AcaoPromocionalMetrica =
    | 'comPromocao'
    | 'promoSubsidio'
    | 'promoSemSubsidio'
    | 'comCupom'
    | 'cupomDestaque'
    | 'primeiroPedido'
    | 'taxaEntrega'
    | 'cupomRegular'
    | 'semAcao';

export interface AcaoPromocionalEstabelecimento {
    id: number;
    nome: string;
}

export interface AcaoPromocionalDrillDown {
    cidade: string;
    metrica: AcaoPromocionalMetrica;
    total: number;
    estabelecimentos: AcaoPromocionalEstabelecimento[];
}
