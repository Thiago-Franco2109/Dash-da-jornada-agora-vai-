/**
 * Runtime diagnostic for CRM INDICADOR parse pipeline.
 * Run: node scripts/debug-crm-parse.mjs
 */
import { normalizeIndicadorGatewayPayload, indicadorHasCampaignColumns } from '../src/utils/indicadorSheet.ts';
import { parseCrmPartners } from '../src/utils/crmData.ts';

const HEADERS = [
    'CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'CONTRATO',
    'OFERTAS DA CASA', 'SUPER PROMOS', 'CUPOM PARC.', 'jul./26',
];

const MEGA_ROW_NAMED = {
    CIDADE: 'Carandaí',
    ESTAB_ID: '26904',
    ESTABELECIMENTO: 'Mega Lanches',
    CONTRATO: 'ativo',
    'OFERTAS DA CASA': '',
    'SUPER PROMOS': 'APROV: 1',
    'CUPOM PARC.': 'AGUAR: 2',
    'jul./26': 'R$ 1.225,10',
};

const MEGA_ROW_ARRAY = [
    'Carandaí', '26904', 'Mega Lanches', 'ativo', '',
    'APROV: 1', 'AGUAR: 2', 'R$ 1.225,10',
];

const EMPTY = { headers: [], rows: [] };

function summarize(label, indicador) {
    const oh = indicador.orderedHeaders ?? indicador.headers ?? [];
    const mega = indicador.rows.find(r =>
        String(r.ESTAB_ID ?? r['__col_1'] ?? '').includes('26904'),
    );
    const { partners } = parseCrmPartners(indicador, EMPTY, EMPTY, EMPTY);
    const parsed = partners.find(p => p.estabId === '26904');
    console.log('\n===', label, '===');
    console.log('headers:', oh.slice(0, 10));
    console.log('hasCampaignCols:', indicadorHasCampaignColumns(oh));
    console.log('rowCount:', indicador.rows.length);
    if (mega) {
        console.log('mega row keys:', Object.keys(mega).slice(0, 14));
        console.log('mega SUPER PROMOS:', mega['SUPER PROMOS'] ?? mega['__col_5']);
        console.log('mega CUPOM PARC.:', mega['CUPOM PARC.'] ?? mega['__col_6']);
    }
    if (parsed) {
        console.log('parsed promo:', parsed.campaigns.super_promos.status, parsed.campaigns.super_promos.resumo);
        console.log('parsed cupom:', parsed.campaigns.cupons_destaque.status, parsed.campaigns.cupons_destaque.resumo);
    } else {
        console.log('parsed: NOT FOUND');
    }
    const dist = partners.reduce((a, p) => {
        const s = p.campaigns.super_promos.status;
        a[s] = (a[s] ?? 0) + 1;
        return a;
    }, {});
    console.log('super_promos distribution:', dist);
}

// Gateway JSON shape: headers + named object rows
summarize('Gateway named rows', normalizeIndicadorGatewayPayload(HEADERS, [MEGA_ROW_NAMED]));

// Gateway JSON shape: headers + array rows
summarize('Gateway array rows', normalizeIndicadorGatewayPayload(HEADERS, [MEGA_ROW_ARRAY]));

// Matrix values shape (Google API)
summarize('Matrix values', normalizeIndicadorGatewayPayload([], [], [HEADERS, MEGA_ROW_ARRAY]));

// Old 6-col layout (pre OFERTAS DA CASA) — simulates stale cache
const OLD_HEADERS = ['CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'CONTRATO', 'PROMOÇÃO', 'CUPOM PARC.', 'jul./26'];
const OLD_ROW = {
    CIDADE: 'Carandaí', ESTAB_ID: '26904', ESTABELECIMENTO: 'Mega Lanches', CONTRATO: 'ativo',
    'PROMOÇÃO': 'APROV: 1', 'CUPOM PARC.': 'AGUAR: 2', 'jul./26': 'R$ 1.225,10',
};
summarize('OLD 6-col layout', normalizeIndicadorGatewayPayload(OLD_HEADERS, [OLD_ROW]));
