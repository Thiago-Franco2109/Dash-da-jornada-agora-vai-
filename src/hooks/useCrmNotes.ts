import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { CrmPartnerNote } from '../types/crm';

// ─────────────────────────────────────────────────────────────────────────
// Notas e follow-up do CRM, por parceiro — Supabase `crm_notas`.
//
// Era localStorage (`crm_promo_notes_v1`), o que dava a cada navegador uma
// verdade diferente: com dois CS na mesma fila de ativação, nenhum via a
// cobrança do outro. Ver supabase/crm_notas.sql.
//
// O cache é de módulo (mesmo padrão de useCampanhaStatusCs/useStatusOverridesMap),
// então as duas instâncias do hook na mesma aba — App e ficha do parceiro —
// compartilham estado de verdade. Antes elas só se falavam pelo evento `storage`,
// que não dispara na aba que escreveu.
// ─────────────────────────────────────────────────────────────────────────

type NotesMap = Record<string, CrmPartnerNote>;

let _cache: NotesMap | null = null;
/** Instâncias vivas do hook, pra um upsert num lugar refletir no outro na hora. */
const inscritos = new Set<(m: NotesMap) => void>();

function publicar(map: NotesMap) {
    _cache = map;
    for (const fn of inscritos) fn(map);
}

async function fetchNotas(): Promise<NotesMap> {
    const { data, error } = await supabase
        .from('crm_notas')
        .select('partner_id, notas, ultimo_contato, proximo_follow_up, atualizado_em');
    if (error) throw new Error(error.message);

    const map: NotesMap = {};
    for (const row of data ?? []) {
        map[String(row.partner_id)] = {
            partnerId: String(row.partner_id),
            notes: row.notas ?? '',
            lastContact: row.ultimo_contato ?? null,
            nextFollowUp: row.proximo_follow_up ?? null,
            updatedAt: row.atualizado_em ?? '',
        };
    }
    return map;
}

/** Data local em YYYY-MM-DD (não usar toISOString: converte pra UTC e erra o dia à noite). */
export function hojeISO(hoje = new Date()): string {
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

export function useCrmNotes() {
    const [notesMap, setNotesMap] = useState<NotesMap>(_cache ?? {});
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        inscritos.add(setNotesMap);
        return () => { inscritos.delete(setNotesMap); };
    }, []);

    useEffect(() => {
        if (_cache) return;
        fetchNotas()
            .then(publicar)
            .catch(err => {
                console.warn('[useCrmNotes] falha ao carregar:', err);
                setErro(err instanceof Error ? err.message : 'falha ao carregar');
            });
    }, []);

    const getNote = useCallback(
        (partnerId: string): CrmPartnerNote | undefined => notesMap[partnerId],
        [notesMap],
    );

    const upsertNote = useCallback(async (
        partnerId: string,
        patch: Partial<Pick<CrmPartnerNote, 'notes' | 'lastContact' | 'nextFollowUp'>>,
    ): Promise<boolean> => {
        const anterior = (_cache ?? {})[partnerId];
        const nova: CrmPartnerNote = {
            partnerId,
            notes: patch.notes ?? anterior?.notes ?? '',
            lastContact: patch.lastContact !== undefined ? patch.lastContact : (anterior?.lastContact ?? null),
            nextFollowUp: patch.nextFollowUp !== undefined ? patch.nextFollowUp : (anterior?.nextFollowUp ?? null),
            updatedAt: new Date().toISOString(),
        };

        publicar({ ...(_cache ?? {}), [partnerId]: nova }); // otimista
        setErro(null);

        const { error } = await supabase
            .from('crm_notas')
            .upsert(
                {
                    partner_id: partnerId,
                    notas: nova.notes,
                    ultimo_contato: nova.lastContact,
                    proximo_follow_up: nova.nextFollowUp,
                    atualizado_em: nova.updatedAt,
                },
                { onConflict: 'partner_id' },
            );

        if (error) {
            console.error('[useCrmNotes] falha ao salvar:', error);
            const revertido = { ...(_cache ?? {}) };
            if (anterior) revertido[partnerId] = anterior; else delete revertido[partnerId];
            publicar(revertido);
            setErro(error.message);
            return false;
        }
        return true;
    }, []);

    const registerContact = useCallback(
        (partnerId: string, nextFollowUp?: string | null) => {
            const patch: Partial<Pick<CrmPartnerNote, 'lastContact' | 'nextFollowUp'>> = { lastContact: hojeISO() };
            if (nextFollowUp !== undefined) patch.nextFollowUp = nextFollowUp;
            void upsertNote(partnerId, patch);
        },
        [upsertNote],
    );

    return { notesMap, getNote, upsertNote, registerContact, erro };
}
