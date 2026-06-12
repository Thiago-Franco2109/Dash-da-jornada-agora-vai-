/** Participação na campanha Ofertas da casa */
export type OfertasDaCasaStatus =
    | 'desconhecido'
    | 'nao_ofertado'
    | 'aguardando_retorno'
    | 'participando'
    | 'nao_participando';

export type OfertasDaCasaSource = 'manual' | 'auto';

export interface OfertasDaCasaRecord {
    partnerId: string;
    status: OfertasDaCasaStatus;
    source: OfertasDaCasaSource;
    updatedAt: string;
    notes?: string;
}
