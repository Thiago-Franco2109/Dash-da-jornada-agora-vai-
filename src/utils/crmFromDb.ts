import type { GatewaySheetTable } from '../types/gatewaySheet';

/**
 * Monta as tabelas do CRM a partir das Functions do banco (`crm-base`,
 * `crm-cupons`, `crm-gmv`), no mesmo formato das abas INDICADOR_FORMATADO,
 * PROMO-ESPECIAL e CUPOM-PARCEIRO.
 *
 * A ideia é trocar só a origem dos dados: o `parseCrmPartners` continua
 * intacto, com toda a lógica de dedup, status de campanha e override.
 */

const CRM_BASE_URL = '/.netlify/functions/crm-base';
const CRM_CUPONS_URL = '/.netlify/functions/crm-cupons';
const CRM_GMV_URL = '/.netlify/functions/crm-gmv';

interface CrmBaseParceiro {
    estabId: string;
    estabelecimento: string;
    cidade: string;
    contrato: string;
    superPromosAprov: number;
    superPromosAguar: number;
}

interface CrmCupom {
    estabId: string;
    dataInicio: string;
    dataFim: string;
}

export interface CrmDbTables {
    indicador: GatewaySheetTable;
    promoEspecial: GatewaySheetTable;
    cupomParceiro: GatewaySheetTable;
    parceirosCount: number;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function aprovAguar(aprov: number, aguar: number): string {
    const partes: string[] = [];
    if (aprov > 0) partes.push(`APROV: ${aprov}`);
    if (aguar > 0) partes.push(`AGUAR: ${aguar}`);
    return partes.join(' · ');
}

async function getJson(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json as { ok?: boolean })?.ok === false) {
        const erro = (json as { error?: string })?.error;
        throw new Error(erro || `Erro ${res.status} em ${url}`);
    }
    return json as Record<string, unknown>;
}

/**
 * Busca as três Functions em paralelo e devolve as tabelas prontas.
 * Lança se qualquer uma falhar — quem chama decide cair para a planilha.
 */
export async function fetchCrmTablesFromDb(): Promise<CrmDbTables> {
    const [base, cupomResp, gmvResp] = await Promise.all([
        getJson(CRM_BASE_URL),
        getJson(CRM_CUPONS_URL),
        getJson(CRM_GMV_URL),
    ]);

    const parceiros = (base.parceiros ?? []) as CrmBaseParceiro[];
    const promoEspecial = base.promoEspecial as GatewaySheetTable;
    const cupons = (cupomResp.cupons ?? []) as CrmCupom[];
    const meses = (gmvResp.meses ?? []) as { mes: string; label: string }[];
    const gmvPorEstab = (gmvResp.porEstab ?? {}) as Record<string, Record<string, number>>;

    const cidadePorEstab = new Map(parceiros.map(p => [p.estabId, p.cidade]));
    const nomePorEstab = new Map(parceiros.map(p => [p.estabId, p.estabelecimento]));

    // Cupons de quem não é parceiro vivo não entram (a aba também não trazia).
    const cupomRows = cupons
        .filter(c => cidadePorEstab.has(c.estabId))
        .map(c => ({
            'CIDADE': cidadePorEstab.get(c.estabId) ?? '',
            'ESTAB_ID': c.estabId,
            'ESTABELECIMENTO': nomePorEstab.get(c.estabId) ?? '',
            'DATA_INICIO': c.dataInicio,
            'DATA_FIM': c.dataFim,
        }));

    const cupomPorEstab = new Map<string, number>();
    for (const c of cupomRows) {
        cupomPorEstab.set(c.ESTAB_ID, (cupomPorEstab.get(c.ESTAB_ID) ?? 0) + 1);
    }

    // Colunas de mês vêm do mais recente para o mais antigo, como na aba —
    // o parser inverte para montar a série cronológica.
    const indicadorHeaders = [
        'CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'CONTRATO',
        'OFERTAS DA CASA', 'SUPER PROMOS', 'CUPOM PARC.',
        ...meses.map(m => m.label),
    ];

    const indicadorRows = parceiros.map(p => {
        const porMes = gmvPorEstab[p.estabId] ?? {};
        const cupomCount = cupomPorEstab.get(p.estabId) ?? 0;

        const row: Record<string, string> = {
            'CIDADE': p.cidade,
            'ESTAB_ID': p.estabId,
            'ESTABELECIMENTO': p.estabelecimento,
            'CONTRATO': p.contrato,
            'OFERTAS DA CASA': '',
            'SUPER PROMOS': aprovAguar(p.superPromosAprov, p.superPromosAguar),
            'CUPOM PARC.': cupomCount > 0 ? aprovAguar(cupomCount, 0) : '',
        };
        for (const m of meses) {
            row[m.label] = brl.format(porMes[m.mes] ?? 0);
        }
        return row;
    });

    const cupomHeaders = ['CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'DATA_INICIO', 'DATA_FIM'];

    return {
        indicador: { headers: indicadorHeaders, orderedHeaders: indicadorHeaders, rows: indicadorRows },
        promoEspecial,
        cupomParceiro: { headers: cupomHeaders, orderedHeaders: cupomHeaders, rows: cupomRows },
        parceirosCount: parceiros.length,
    };
}
