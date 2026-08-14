export interface CarteiraRow {
    divisao: string;
    cidade: string;
    grupo: string;
    total: number;
    ativos: number;
    suspenso: number;
    pendente: number;
    pctComPromo: number;
    promoAprovada: number;
    semPromo: number;
    pctComCupom: number;
    cupomAprovado: number;
    semCupom: number;
}

export type CarteiraMetrica =
    | 'total'
    | 'ativos'
    | 'suspenso'
    | 'pendente'
    | 'promoAprovada'
    | 'semPromo'
    | 'cupomAprovado'
    | 'semCupom';

export interface CarteiraEstabelecimento {
    id: number;
    nome: string;
}

export interface CarteiraDrillDown {
    cidade: string;
    metrica: CarteiraMetrica;
    total: number;
    estabelecimentos: CarteiraEstabelecimento[];
}
