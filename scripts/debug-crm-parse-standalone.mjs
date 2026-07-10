/**
 * Standalone runtime diagnostic (no Vite imports).
 * Run: node scripts/debug-crm-parse-standalone.mjs
 */
import { appendFileSync } from 'fs';

const LOG = '/Users/thiago/Documents/meus projetos/Dash-da-jornada-agora-vai--main/.cursor/debug-ca6d7f.log';

function log(hypothesisId, location, message, data) {
    const line = JSON.stringify({ sessionId: 'ca6d7f', hypothesisId, location, message, data, timestamp: Date.now() }) + '\n';
    appendFileSync(LOG, line);
    console.log(message, JSON.stringify(data, null, 2));
}

function normalizeKey(key) {
    return key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s.]+/g, ' ').trim();
}

function resolveSheetColumn(headers, candidates) {
    const nh = headers.map(h => ({ raw: h, norm: normalizeKey(h) }));
    const nc = candidates.map(normalizeKey);
    for (const c of nc) {
        const ex = nh.find(h => h.norm === c);
        if (ex?.raw) return ex.raw;
    }
    return null;
}

function cellText(row, col) {
    if (!col) return '';
    const v = row[col];
    return v == null ? '' : String(v).trim();
}

function findCellByNames(row, names) {
    const targets = new Set(names.map(normalizeKey));
    for (const k of Object.keys(row)) {
        if (targets.has(normalizeKey(k))) {
            const v = String(row[k] ?? '').trim();
            if (v) return v;
        }
    }
    return '';
}

function cellByPosition(row, orderedHeaders, index, names = []) {
    if (names.length > 0) {
        const byName = findCellByNames(row, names);
        if (byName) return byName;
        const resolved = resolveSheetColumn(orderedHeaders, names);
        if (resolved) {
            const byResolved = cellText(row, resolved);
            if (byResolved) return byResolved;
        }
    }
    const byColKey = cellText(row, `__col_${index}`);
    if (byColKey) return byColKey;
    const headerAt = orderedHeaders[index]?.trim();
    if (headerAt) return cellText(row, headerAt);
    return '';
}

function parseAprovAguar(raw) {
    const text = String(raw ?? '');
    return {
        aprov: parseInt(text.match(/APROV:\s*(\d+)/i)?.[1] ?? '0', 10),
        aguar: parseInt(text.match(/AGUAR:\s*(\d+)/i)?.[1] ?? '0', 10),
    };
}

function resolveStatus(override, sheetActive, counts) {
    if (override) return override;
    if (counts.aprov > 0) return 'ativo';
    if (counts.aguar > 0) return 'ofertei';
    if (sheetActive) return 'ativo';
    return 'aguardando';
}

function rowHasNamedHeaderKeys(record) {
    return Object.keys(record).some(k => !/^\d+$/.test(k) && !k.startsWith('__col_'));
}

function resolveRecordCell(record, header, index) {
    const key = header.trim();
    if (key) {
        if (record[key] != null && String(record[key]).trim()) return record[key];
        const norm = normalizeKey(key);
        for (const k of Object.keys(record)) {
            if (normalizeKey(k) === norm && String(record[k] ?? '').trim()) return record[k];
        }
        const ALIASES = {
            'super promos': ['promocao', 'promoção', 'promo'],
            'cupom parc': ['cupom parc', 'cupom parc.', 'cupom_parc'],
        };
        for (const alias of ALIASES[norm] ?? []) {
            for (const k of Object.keys(record)) {
                if (normalizeKey(k) === alias && String(record[k] ?? '').trim()) return record[k];
            }
        }
    }
    return record[`__col_${index}`] ?? '';
}

function rowToArrayByHeaders(record, orderedHeaders) {
    return orderedHeaders.map((header, index) => resolveRecordCell(record, header, index));
}

function matrixFromLooseRows(rows, orderedHeaders) {
    return rows.map(row => {
        if (Array.isArray(row)) return row;
        if (row && typeof row === 'object') {
            const record = row;
            if (orderedHeaders?.length) return rowToArrayByHeaders(record, orderedHeaders);
            return Object.values(record);
        }
        return [];
    });
}

function mapMatrixRow(row, orderedHeaders) {
    const obj = {};
    for (let i = 0; i < orderedHeaders.length; i++) {
        const val = row[i] ?? '';
        const key = orderedHeaders[i]?.trim() || `__col_${i}`;
        obj[key] = val;
        obj[`__col_${i}`] = val;
    }
    return obj;
}

function normalizeNamed(headers, rows) {
    const orderedHeaders = [...headers];
    const mappedRows = matrixFromLooseRows(rows, orderedHeaders)
        .map(row => mapMatrixRow(row, orderedHeaders));
    return { orderedHeaders, rows: mappedRows };
}

function parseMega(indicador, label) {
    const oh = indicador.orderedHeaders;
    const row = indicador.rows[0];
    const promoRaw = cellByPosition(row, oh, 5, ['SUPER PROMOS', 'Super Promos', 'PROMOÇÃO']);
    const cupomRaw = cellByPosition(row, oh, 6, ['CUPOM PARC.', 'CUPOM PARC']);
    const promoCounts = parseAprovAguar(promoRaw);
    const cupomCounts = parseAprovAguar(cupomRaw);
    log('H1-H3', 'standalone', label, {
        promoRaw, cupomRaw, promoCounts, cupomCounts,
        promoStatus: resolveStatus(undefined, false, promoCounts),
        cupomStatus: resolveStatus(undefined, false, cupomCounts),
        rowKeys: Object.keys(row).slice(0, 14),
    });
}

const HEADERS = ['CIDADE','ESTAB_ID','ESTABELECIMENTO','CONTRATO','OFERTAS DA CASA','SUPER PROMOS','CUPOM PARC.','jul./26'];
const MEGA_NAMED = {
    CIDADE: 'Carandaí', ESTAB_ID: '26904', ESTABELECIMENTO: 'Mega Lanches', CONTRATO: 'ativo',
    'OFERTAS DA CASA': '', 'SUPER PROMOS': 'APROV: 1', 'CUPOM PARC.': 'AGUAR: 2', 'jul./26': 'R$ 1.225,10',
};

// Simulate OLD broken path: Object.values without header mapping
const BROKEN_ROW = Object.values(MEGA_NAMED);
log('H1', 'standalone', 'Object.values misalignment', {
    brokenArray: BROKEN_ROW,
    wrongPromoAtIdx5: BROKEN_ROW[5],
    wrongCupomAtIdx6: BROKEN_ROW[6],
});

parseMega(normalizeNamed(HEADERS, [MEGA_NAMED]), 'FIXED named-row path');

// Stale cache row: only __col_N keys from old 6-col layout
const STALE_ROW = {
    CIDADE: 'Carandaí', ESTAB_ID: '26904', ESTABELECIMENTO: 'Mega Lanches', CONTRATO: 'ativo',
    __col_4: '', __col_5: 'APROV: 1', __col_6: 'AGUAR: 2', // old: idx5 was CUPOM wrongly = super promos APROV
};
parseMega(normalizeNamed(HEADERS, [STALE_ROW]), 'Stale __col_ only row (new headers)');

// Pure __col_N row (no named header keys) — reproduces Object.values misalignment
const COL_ONLY_ROW = {
    __col_0: 'Carandaí', __col_1: '26904', __col_2: 'Mega Lanches', __col_3: 'ativo',
    __col_4: '', __col_5: 'APROV: 1', __col_6: 'AGUAR: 2',
};
parseMega(normalizeNamed(HEADERS, [COL_ONLY_ROW]), 'Pure __col_N row (no named keys)');

// Stale row WITHOUT super promos header keys - only old PROMOÇÃO key
const STALE_OLD_KEYS = {
    CIDADE: 'Carandaí', ESTAB_ID: '26904', ESTABELECIMENTO: 'Mega Lanches', CONTRATO: 'ativo',
    'PROMOÇÃO': 'APROV: 1', 'CUPOM PARC.': 'AGUAR: 2',
};
// Simulates cached GatewaySheetTable with legacy PROMOÇÃO key (bypasses fresh fetch)
const CACHED_TABLE = {
    headers: HEADERS,
    orderedHeaders: HEADERS,
    rows: [STALE_OLD_KEYS],
};

log('H6', 'standalone', 'cached table direct parse (pre re-normalize)', {
    promoDirect: cellByPosition(STALE_OLD_KEYS, HEADERS, 5, ['SUPER PROMOS', 'PROMOÇÃO']),
});

const normalized = normalizeNamed(HEADERS, [STALE_OLD_KEYS]);
parseMega(normalized, 'Re-normalize cached legacy row');

console.log('\nLogs written to', LOG);
