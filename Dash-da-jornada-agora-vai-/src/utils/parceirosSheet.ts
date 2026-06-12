import type { GatewaySheetTable } from '../types/gatewaySheet';
import { cellText, resolveSheetColumn } from './sheetColumnMatch';
import { normalizeEstabId } from './indicadorSheet';

function partnerLookupKey(estabId: string): string {
    const norm = estabId
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    return `id:${norm}`;
}

export type ParceiroContratoStatus = 'ativo' | 'suspenso' | 'cancelado' | 'pendente';

export interface ParceirosStatusEntry {
    status: ParceiroContratoStatus;
    contratoId: number;
}

/** Normaliza o valor da coluna CONTRATO para um dos status canônicos. */
export function normalizeParceiroContratoStatus(raw: string): ParceiroContratoStatus | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s.includes('cancel')) return 'cancelado';
    if (s.includes('susp')) return 'suspenso';
    if (s.includes('pend')) return 'pendente';
    if (s.includes('ativo') && !s.includes('inativo')) return 'ativo';
    return null;
}

export function isParceiroContratoAtivo(status: string): boolean {
    const norm = normalizeParceiroContratoStatus(status);
    return norm === 'ativo';
}

function orderedHeadersOf(table: GatewaySheetTable): string[] {
    if (table.orderedHeaders?.length) return table.orderedHeaders;
    if (table.headers.length > 0) return table.headers;
    const first = table.rows[0];
    return first ? Object.keys(first) : [];
}

function parseContratoId(raw: string): number {
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
}

/**
 * Mapa ESTAB_ID → status do contrato (coluna CONTRATO da aba PARCEIROS).
 * Se o parceiro aparecer mais de uma vez, prevalece o registro com maior CONTRATO_ID.
 */
export function buildParceirosStatusMap(table: GatewaySheetTable): Map<string, ParceirosStatusEntry> {
    const ordered = orderedHeadersOf(table);
    const idCol = resolveSheetColumn(ordered, ['ID', 'ESTAB_ID', 'ESTAB ID']);
    const contratoCol = resolveSheetColumn(ordered, ['CONTRATO']);
    const contratoIdCol = resolveSheetColumn(ordered, ['CONTRATO_ID', 'CONTRATO ID']);
    const map = new Map<string, ParceirosStatusEntry>();

    for (const row of table.rows) {
        const estabId = normalizeEstabId(cellText(row, idCol));
        if (!estabId) continue;

        const status = normalizeParceiroContratoStatus(cellText(row, contratoCol));
        if (!status) continue;

        const key = partnerLookupKey(estabId);
        const contratoId = parseContratoId(cellText(row, contratoIdCol));
        const prev = map.get(key);

        if (!prev || contratoId >= prev.contratoId) {
            map.set(key, { status, contratoId });
        }
    }

    return map;
}

export function resolveParceiroStatusFromMap(
    estabId: string,
    statusMap: Map<string, ParceirosStatusEntry>,
    fallback?: string,
): string {
    const entry = statusMap.get(partnerLookupKey(estabId));
    if (entry) return entry.status;
    const fromFallback = fallback ? normalizeParceiroContratoStatus(fallback) : null;
    return fromFallback ?? fallback?.trim().toLowerCase() ?? 'desconhecido';
}
