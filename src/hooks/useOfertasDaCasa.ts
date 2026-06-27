import { useState, useCallback, useEffect } from 'react';
import type { OfertasDaCasaRecord, OfertasDaCasaSource, OfertasDaCasaStatus } from '../types/crmCampaigns';

const STORAGE_KEY = 'crm_ofertas_da_casa_v1';

export function loadOfertasDaCasaRecords(): Record<string, OfertasDaCasaRecord> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveRecords(map: Record<string, OfertasDaCasaRecord>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useOfertasDaCasa() {
    const [records, setRecords] = useState<Record<string, OfertasDaCasaRecord>>(loadOfertasDaCasaRecords);

    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setRecords(loadOfertasDaCasaRecords());
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const getRecord = useCallback(
        (partnerId: string): OfertasDaCasaRecord | undefined => records[partnerId],
        [records],
    );

    const getStatus = useCallback(
        (partnerId: string): OfertasDaCasaStatus => records[partnerId]?.status ?? 'desconhecido',
        [records],
    );

    const setStatus = useCallback(
        (partnerId: string, status: OfertasDaCasaStatus, source: OfertasDaCasaSource = 'manual') => {
            setRecords(prev => {
                const next: OfertasDaCasaRecord = {
                    partnerId,
                    status,
                    source,
                    updatedAt: new Date().toISOString(),
                    notes: prev[partnerId]?.notes,
                };
                const updated = { ...prev, [partnerId]: next };
                saveRecords(updated);
                return updated;
            });
        },
        [],
    );

    const setNotes = useCallback((partnerId: string, notes: string) => {
        setRecords(prev => {
            const existing = prev[partnerId];
            const next: OfertasDaCasaRecord = {
                partnerId,
                status: existing?.status ?? 'desconhecido',
                source: existing?.source ?? 'manual',
                updatedAt: new Date().toISOString(),
                notes,
            };
            const updated = { ...prev, [partnerId]: next };
            saveRecords(updated);
            return updated;
        });
    }, []);

    /** Para integração futura com planilha/API */
    const importAutoStatus = useCallback(
        (entries: { partnerId: string; status: OfertasDaCasaStatus }[]) => {
            setRecords(prev => {
                const updated = { ...prev };
                const now = new Date().toISOString();
                for (const entry of entries) {
                    updated[entry.partnerId] = {
                        partnerId: entry.partnerId,
                        status: entry.status,
                        source: 'auto',
                        updatedAt: now,
                        notes: prev[entry.partnerId]?.notes,
                    };
                }
                saveRecords(updated);
                return updated;
            });
        },
        [],
    );

    return { getRecord, getStatus, setStatus, setNotes, importAutoStatus, records };
}
