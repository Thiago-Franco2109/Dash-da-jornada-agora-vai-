import { normalizePartnerLookupKey } from '../utils/dataSync';

export type ContractPayment = 'cartao' | 'pix' | 'online';
export type ContractStatus = 'em_dia' | 'cancelado';

export interface CDContract {
    estabelecimento: string;
    formaPagamento: ContractPayment;
    valorMensal: number;
    vencimento?: string;
    status: ContractStatus;
}

/** Contratos Cardápio Digital — atualizado em jun/2026 */
export const CD_CONTRACTS: CDContract[] = [
    { estabelecimento: 'Lalanza Hamburgueria e Pizzaria', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '14/11/2025', status: 'em_dia' },
    { estabelecimento: 'Ebenézer Hamburgueria Gourmet Artesanal', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '16/11/2025', status: 'em_dia' },
    { estabelecimento: 'Trevo Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '17/11/2025', status: 'em_dia' },
    { estabelecimento: 'Restaurante Mineiro', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '24/11/2025', status: 'em_dia' },
    { estabelecimento: 'Rei Arthur Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '14/12/2025', status: 'em_dia' },
    { estabelecimento: 'Adega SD', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '17/12/2025', status: 'em_dia' },
    { estabelecimento: 'Wisley Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '17/12/2025', status: 'em_dia' },
    { estabelecimento: 'LC Restaurante e Hamburgueria', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '18/12/2025', status: 'em_dia' },
    { estabelecimento: 'EXPRESS DI ROMA PIZZA', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '26/12/2025', status: 'em_dia' },
    { estabelecimento: 'Kaká Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '31/12/2025', status: 'em_dia' },
    { estabelecimento: 'Bebelinda Burguer', formaPagamento: 'pix', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: 'Bebelinda Burguer', formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Xangô Restaurante e Pizzaria', formaPagamento: 'pix', valorMensal: 89.9, status: 'cancelado' },
    { estabelecimento: 'Pizzaria Dom Camilo', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '11/01/2026', status: 'em_dia' },
    { estabelecimento: 'Mineira Salgados e Churros', formaPagamento: 'pix', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: 'Mineira Salgados e Churros', formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Sandrinho Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '23/01/2026', status: 'em_dia' },
    { estabelecimento: 'Sandrinho Lanches', formaPagamento: 'cartao', valorMensal: 79.9, status: 'em_dia' },
    { estabelecimento: "Brother's Burguer Macabu", formaPagamento: 'pix', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: "Brother's Burguer Macabu", formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Stop Lanches', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '07/02/2026', status: 'em_dia' },
    { estabelecimento: "Fabiu's Lanches", formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '12/02/2026', status: 'em_dia' },
    { estabelecimento: 'Like Açaí', formaPagamento: 'cartao', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: 'Hot Dog Hamburgueria Açaí Fael & Fran', formaPagamento: 'cartao', valorMensal: 89.9, status: 'cancelado' },
    { estabelecimento: 'Parada Bomtempo', formaPagamento: 'online', valorMensal: 89.9, status: 'cancelado' },
    { estabelecimento: 'Parada Bomtempo', formaPagamento: 'online', valorMensal: 89.9, vencimento: '24/06/2026', status: 'em_dia' },
    { estabelecimento: 'Pastelaria na Laje', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Ponto do Sabor', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Point Açaí', formaPagamento: 'cartao', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Casa da Mell Hamburgueria e Petiscaria', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: "Jegue's Bar e Pastelaria", formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Arte em Pizza', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Izack Lanches', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Ateliê da Batata', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Parada do Tiozão', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Bardô Restaurante', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Bim Bim Lanches', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Faceburguer Hamburgueria', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Meu Chapa Lanches', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Rock Burguer', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Trem De Tudo', formaPagamento: 'online', valorMensal: 19.9, status: 'em_dia' },
    { estabelecimento: 'Sabor do Chefe', formaPagamento: 'online', valorMensal: 59.93, status: 'em_dia' },
    { estabelecimento: 'Sorveteria Sol e Neve', formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Nani Lanches', formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Churrasquinho e Jantinha Sol Costa', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '12/02/2026', status: 'em_dia' },
    { estabelecimento: 'Forneria Bella Castro - Pizzaria Artesanal', formaPagamento: 'online', valorMensal: 59.92, status: 'em_dia' },
    { estabelecimento: 'Esplendorosa Batata Recheada', formaPagamento: 'online', valorMensal: 59.92, status: 'cancelado' },
    { estabelecimento: 'Açaí 2 irmãos', formaPagamento: 'online', valorMensal: 79.9, status: 'em_dia' },
    { estabelecimento: 'Bar e Restaurante Cirola - Ponte Preta', formaPagamento: 'online', valorMensal: 79.9, status: 'em_dia' },
    { estabelecimento: 'Macabu Chicken', formaPagamento: 'online', valorMensal: 79.9, status: 'cancelado' },
    { estabelecimento: 'Império Lanches', formaPagamento: 'online', valorMensal: 79.9, status: 'em_dia' },
    { estabelecimento: 'Sensação Hamburgueria', formaPagamento: 'online', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: 'Açaí do Alvim', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '09/03/2026', status: 'em_dia' },
    { estabelecimento: 'Delicias do Fael', formaPagamento: 'online', valorMensal: 89.9, vencimento: '09/04/2026', status: 'em_dia' },
    { estabelecimento: 'Premium Burguer Delivery', formaPagamento: 'cartao', valorMensal: 89.9, vencimento: '10/04/2026', status: 'em_dia' },
    { estabelecimento: 'Lanchonete Rosestolato', formaPagamento: 'online', valorMensal: 89.9, vencimento: '13/04/2026', status: 'em_dia' },
    { estabelecimento: 'LS Lanchonete', formaPagamento: 'online', valorMensal: 119.9, vencimento: '17/04/2026', status: 'em_dia' },
    { estabelecimento: 'Ateliê das Cestas', formaPagamento: 'cartao', valorMensal: 129.9, vencimento: '19/04/2026', status: 'em_dia' },
    { estabelecimento: "Donana'Salgados", formaPagamento: 'online', valorMensal: 89.9, vencimento: '23/04/2026', status: 'em_dia' },
    { estabelecimento: 'Cátia Rocha Doceria', formaPagamento: 'online', valorMensal: 119.9, vencimento: '24/04/2026', status: 'em_dia' },
    { estabelecimento: 'Bill Burguer', formaPagamento: 'online', valorMensal: 129.9, vencimento: '25/04/2026', status: 'em_dia' },
    { estabelecimento: 'Restaurante do Darcy', formaPagamento: 'online', valorMensal: 129.9, vencimento: '01/05/2026', status: 'em_dia' },
    { estabelecimento: 'República Pizzaria e Lanchonete', formaPagamento: 'online', valorMensal: 89.9, status: 'em_dia' },
    { estabelecimento: 'Ana Açaiteria', formaPagamento: 'online', valorMensal: 119.9, vencimento: '02/05/2026', status: 'em_dia' },
    { estabelecimento: 'Delicias da Paloma', formaPagamento: 'online', valorMensal: 119.9, vencimento: '08/05/2026', status: 'em_dia' },
    { estabelecimento: 'O Poderoso Chapeiro', formaPagamento: 'online', valorMensal: 129.9, vencimento: '08/05/2026', status: 'em_dia' },
    { estabelecimento: 'Lu & Lu Retrô Express', formaPagamento: 'online', valorMensal: 119.9, vencimento: '09/05/2026', status: 'em_dia' },
    { estabelecimento: 'Star Burguer', formaPagamento: 'online', valorMensal: 129.9, vencimento: '15/05/2026', status: 'em_dia' },
    { estabelecimento: 'Pizzaria do Rintintin', formaPagamento: 'online', valorMensal: 129.9, vencimento: '16/05/2026', status: 'em_dia' },
    { estabelecimento: 'Cantin Mineiro', formaPagamento: 'online', valorMensal: 129.9, vencimento: '16/05/2026', status: 'em_dia' },
    { estabelecimento: 'Divina Fornada Pizzaria e Esfiharia', formaPagamento: 'online', valorMensal: 129.9, vencimento: '17/05/2026', status: 'em_dia' },
    { estabelecimento: 'Ponto do Delivery', formaPagamento: 'online', valorMensal: 129.9, vencimento: '29/05/2026', status: 'em_dia' },
    { estabelecimento: 'Disk Quentinhas', formaPagamento: 'online', valorMensal: 129.9, vencimento: '04/06/2026', status: 'em_dia' },
    { estabelecimento: "Massas D'Ouro", formaPagamento: 'online', valorMensal: 119.9, vencimento: '12/06/2026', status: 'em_dia' },
    { estabelecimento: 'Peixaria do Anizio', formaPagamento: 'online', valorMensal: 119.9, vencimento: '26/06/2026', status: 'em_dia' },
    { estabelecimento: "Quentinha do Brother's", formaPagamento: 'pix', valorMensal: 119.9, vencimento: '27/06/2026', status: 'em_dia' },
    { estabelecimento: 'D2 Lanches', formaPagamento: 'pix', valorMensal: 89.9, status: 'em_dia' },
];

const PEDIDOS_POR_DIA_RISCO = 1;

function normalizeContractKey(name: string): string {
    return normalizePartnerLookupKey(name);
}

function pickBestContract(existing: CDContract | undefined, candidate: CDContract): CDContract {
    if (!existing) return candidate;
    if (existing.status === 'cancelado' && candidate.status === 'em_dia') return candidate;
    if (existing.status === 'em_dia' && candidate.status === 'cancelado') return existing;
    if (candidate.valorMensal > existing.valorMensal) return candidate;
    return existing;
}

const contractByKey = CD_CONTRACTS.reduce((map, contract) => {
    const key = normalizeContractKey(contract.estabelecimento);
    map.set(key, pickBestContract(map.get(key), contract));
    return map;
}, new Map<string, CDContract>());

export function findContractForPartner(estabelecimento: string): CDContract | undefined {
    const key = normalizeContractKey(estabelecimento);
    const direct = contractByKey.get(key);
    if (direct) return direct;

    for (const [contractKey, contract] of contractByKey) {
        if (key.includes(contractKey) || contractKey.includes(key)) {
            return contract;
        }
    }
    return undefined;
}

export function isMrrEmRisco(pedidosPorDia: number, contrato?: CDContract): boolean {
    return contrato?.status === 'em_dia' && pedidosPorDia < PEDIDOS_POR_DIA_RISCO;
}

export function calcularPedidosPorDia(pedidosSemanaAtual: number): number {
    return pedidosSemanaAtual / 7;
}

export function formatarMoedaBRL(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarFormaPagamento(forma: ContractPayment): string {
    switch (forma) {
        case 'cartao': return 'Cartão';
        case 'pix': return 'PIX';
        case 'online': return 'Online';
    }
}

export interface MRRMetrics {
    mrrTotal: number;
    mrrEmRisco: number;
    mrrSeguro: number;
    mrrEmRiscoPct: number;
    lojasComContrato: number;
    lojasEmRisco: number;
    lojasSeguras: number;
    contratosAtivos: number;
}

export function calcularMRRContratosAtivos(): { mrrTotal: number; contratosAtivos: number } {
    let mrrTotal = 0;
    let contratosAtivos = 0;
    for (const contract of contractByKey.values()) {
        if (contract.status === 'em_dia') {
            mrrTotal += contract.valorMensal;
            contratosAtivos++;
        }
    }
    return { mrrTotal, contratosAtivos };
}

export function calcularMRRMetrics(
    rows: Array<{ valor_contrato?: number; contrato_status?: ContractStatus; mrr_em_risco?: boolean; week_1?: number }>,
): MRRMetrics {
    const { mrrTotal: mrrTotalCadastro, contratosAtivos } = calcularMRRContratosAtivos();

    const comContrato = rows.filter(r => r.valor_contrato != null && r.contrato_status === 'em_dia');
    const emRisco = comContrato.filter(r => r.mrr_em_risco);
    const seguras = comContrato.filter(r => (r.week_1 ?? 0) > 7);
    const mrrEmRisco = emRisco.reduce((sum, r) => sum + (r.valor_contrato ?? 0), 0);
    const mrrSeguro = seguras.reduce((sum, r) => sum + (r.valor_contrato ?? 0), 0);
    const mrrMatched = comContrato.reduce((sum, r) => sum + (r.valor_contrato ?? 0), 0);

    return {
        mrrTotal: mrrTotalCadastro,
        mrrEmRisco,
        mrrSeguro,
        mrrEmRiscoPct: mrrMatched > 0 ? (mrrEmRisco / mrrMatched) * 100 : 0,
        lojasComContrato: comContrato.length,
        lojasEmRisco: emRisco.length,
        lojasSeguras: seguras.length,
        contratosAtivos,
    };
}
