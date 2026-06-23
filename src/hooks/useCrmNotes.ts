import { useState, useCallback, useEffect } from 'react';
import type { CrmPartnerNote } from '../types/crm';

const STORAGE_KEY = 'crm_promo_notes_v1';

function loadNotes(): Record<string, CrmPartnerNote> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveNotes(map: Record<string, CrmPartnerNote>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useCrmNotes() {
    const [notesMap, setNotesMap] = useState<Record<string, CrmPartnerNote>>(loadNotes);

    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setNotesMap(loadNotes());
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const getNote = useCallback(
        (partnerId: string): CrmPartnerNote | undefined => notesMap[partnerId],
        [notesMap],
    );

    const upsertNote = useCallback(
        (partnerId: string, patch: Partial<Pick<CrmPartnerNote, 'notes' | 'lastContact' | 'nextFollowUp'>>) => {
            setNotesMap(prev => {
                const existing = prev[partnerId];
                const next: CrmPartnerNote = {
                    partnerId,
                    notes: patch.notes ?? existing?.notes ?? '',
                    lastContact: patch.lastContact !== undefined ? patch.lastContact : (existing?.lastContact ?? null),
                    nextFollowUp: patch.nextFollowUp !== undefined ? patch.nextFollowUp : (existing?.nextFollowUp ?? null),
                    updatedAt: new Date().toISOString(),
                };
                const updated = { ...prev, [partnerId]: next };
                saveNotes(updated);
                return updated;
            });
        },
        [],
    );

    const registerContact = useCallback(
        (partnerId: string) => {
            upsertNote(partnerId, { lastContact: new Date().toISOString().slice(0, 10) });
        },
        [upsertNote],
    );

    return { notesMap, getNote, upsertNote, registerContact };
}
