import type { GatewaySheetTable } from '../types/gatewaySheet';

/**
 * Monta as tabelas PEDIDO_MENSAL e PARCEIRO_MENSAL a partir da Function
 * `pedido-mensal`, no mesmo formato das abas da planilha mestre.
 *
 * A Function manda um agregado por (parceiro, mês) e um dicionário de
 * parceiros; as duas tabelas são derivadas aqui. Mandar as duas prontas do
 * servidor dobrava o payload, porque repetem quase tudo.
 *
 * Os parsers `parsePedidoMensalTable` e `parseParceiroMensalTable` continuam
 * intactos: para eles, nada mudou além da origem das linhas.
 */

const PEDIDO_MENSAL_FN_URL = '/.netlify/functions/pedido-mensal';

interface LinhaAgregada {
    estabId: string;
    mes: string;
    monthMovel: number;
    recessos: number;
    aceitos: number;
    cancelados: number;
    aceitosOnline: number;
    canceladosOnline: number;
    aceitosCupom: number;
    canceladosCupom: number;
    novosUsuarios: number;
    incentivos: number;
    cupomParceiro: number;
    comissao: number;
    comissaoLiq: number;
    comissaoCancelados: number;
    comissaoExpirados: number;
    txServico: number;
    txPgtOnline: number;
    gmvBruto: number;
    gmvLiq: number;
    gmvOnline: number;
}

interface InfoParceiro {
    nome: string;
    cidade: string;
    contrato: string;
}

export interface PedidoMensalDbTables {
    pedidoMensal: GatewaySheetTable;
    parceiroMensal: GatewaySheetTable;
    meses: string[];
}

function pct(parte: number, base: number): number {
    if (base <= 0) return 0;
    return Math.round((parte / base) * 1000) / 10;
}

/** Último dia do mês 'YYYY-MM'. */
function ultimoDia(mes: string): string {
    const [ano, m] = mes.split('-').map(Number);
    const dia = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    return `${mes}-${String(dia).padStart(2, '0')}`;
}

function tabela(rows: Record<string, string>[]): GatewaySheetTable {
    const headers = Object.keys(rows[0] ?? {});
    return { headers, orderedHeaders: headers, rows };
}

/**
 * As duas telas (pedido mensal e parceiro mensal) pedem os dados ao mesmo
 * tempo, e a Function é cara. Uma requisição só serve as duas: chamadas
 * concorrentes compartilham a promessa e o resultado vale por um minuto.
 */
let emVoo: Promise<PedidoMensalDbTables> | null = null;
let cache: { dados: PedidoMensalDbTables; quando: number } | null = null;
const CACHE_MS = 60_000;

export function fetchPedidoMensalFromDb(force = false): Promise<PedidoMensalDbTables> {
    if (!force && cache && Date.now() - cache.quando < CACHE_MS) {
        return Promise.resolve(cache.dados);
    }
    if (emVoo) return emVoo;

    emVoo = carregarPedidoMensal()
        .then(dados => { cache = { dados, quando: Date.now() }; return dados; })
        .finally(() => { emVoo = null; });

    return emVoo;
}

async function carregarPedidoMensal(): Promise<PedidoMensalDbTables> {
    const res = await fetch(PEDIDO_MENSAL_FN_URL, {
        credentials: 'include' as RequestCredentials,
        cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.linhas)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar o pedido mensal.`);
    }

    const linhas = json.linhas as LinhaAgregada[];
    const parceiros = (json.parceiros ?? {}) as Record<string, InfoParceiro>;
    const meses = (json.meses ?? []) as string[];

    const pedidoRows: Record<string, string>[] = [];
    const parceiroRows: Record<string, string>[] = [];

    for (const l of linhas) {
        const info = parceiros[l.estabId];
        if (!info) continue;

        const totalDecidido = l.aceitos + l.cancelados;
        const totalOnline = l.aceitosOnline + l.canceladosOnline;
        const totalCupom = l.aceitosCupom + l.canceladosCupom;

        pedidoRows.push({
            'CHAVE': `${l.mes}|${l.estabId}`,
            'MONTH_START': `${l.mes}-01`,
            'MONTH_END': ultimoDia(l.mes),
            'MONTH_MOVEL': String(l.monthMovel),
            'CIDADE': info.cidade,
            'ESTAB_ID': l.estabId,
            'ESTABELECIMENTO': info.nome,
            'CONTRATO': info.contrato,
            'PEDIDOS_ACEITOS': String(l.aceitos),
            'PEDIDOS_CANCELADOS': String(l.cancelados),
            'PORC_CANCEL': String(pct(l.cancelados, totalDecidido)),
            'INCENTIVOS': String(l.incentivos),
            'CUPOM_PARCEIRO': String(l.cupomParceiro),
            'RECESSOS': String(l.recessos),
            'COMISSAO_LIQ': String(l.comissaoLiq),
            'NOVOS_USUARIOS': String(l.novosUsuarios),
            'ACEITOS_PGT_ONLINE': String(l.aceitosOnline),
            'CANCELADOS_PGT_ONLINE': String(l.canceladosOnline),
            'PORC_CANCEL_PGT_ONLINE': String(pct(l.canceladosOnline, totalOnline)),
            'ACEITOS_CUPOM': String(l.aceitosCupom),
            'CANCELADOS_CUPOM': String(l.canceladosCupom),
            'PORC_CANCEL_CUPOM': String(pct(l.canceladosCupom, totalCupom)),
        });

        parceiroRows.push({
            'DATA_MES': `${l.mes}-01`,
            'CIDADE': info.cidade,
            'PARCEIRO_ID': l.estabId,
            'PARCEIRO': info.nome,
            'PEDIDOS_ACEITOS': String(l.aceitos),
            'PEDIDOS_CANCELADOS': String(l.cancelados),
            'PORC_CANCELAMENTO': String(pct(l.cancelados, totalDecidido)),
            'COMISSAO_LIQ': String(l.comissaoLiq),
            'COMISSAO_BRUTA': String(l.comissao),
            'TX_SERVICO': String(l.txServico),
            'COMISSAO_LIQ_TX_SERVICO': String(Math.round((l.comissaoLiq + l.txServico) * 100) / 100),
            'GMV_LIQ': String(l.gmvLiq),
            'GMV_BRUTO': String(l.gmvBruto),
            'GMV_BRUTO_ONLINE': String(l.gmvOnline),
            'TAXA_PGT_ONLINE': String(l.txPgtOnline),
            // O banco tem uma taxa só de pagamento online, sem separar a parte
            // do gateway — a coluna "aproximada" da planilha repete a mesma.
            'TAXA_GATEWAY_APROX': String(l.txPgtOnline),
            'COMISSAO_BRUTA_EXPIRADO': String(l.comissaoExpirados),
            'COMISSAO_BRUTA_CANCELADOS': String(l.comissaoCancelados),
        });
    }

    return {
        pedidoMensal: tabela(pedidoRows),
        parceiroMensal: tabela(parceiroRows),
        meses,
    };
}

/** Só a tabela PEDIDO_MENSAL (a requisição é compartilhada com a de parceiro). */
export async function fetchPedidoMensalTable(): Promise<GatewaySheetTable> {
    return (await fetchPedidoMensalFromDb()).pedidoMensal;
}

/** Só a tabela PARCEIRO_MENSAL. */
export async function fetchParceiroMensalTable(): Promise<GatewaySheetTable> {
    return (await fetchPedidoMensalFromDb()).parceiroMensal;
}
