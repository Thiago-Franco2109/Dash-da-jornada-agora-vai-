
export interface ContactDetail {
    completed: boolean;
    status: 'pendente' | 'aguardando_retorno' | 'em_andamento' | 'finalizado' | 'negado';
    date?: string;
    notes?: string;
    images?: string[]; // Array of base64 strings or image URLs
    checklist?: Record<string, boolean>; // checklist item id -> checked
}

export interface PartnerState {
    isFinished: boolean;
    contacts: {
        w1: boolean; // 7d
        w2: boolean; // 14d
        w3: boolean; // 21d
        w4: boolean; // 28d
    };
    contactDetails?: {
        w1?: ContactDetail;
        w2?: ContactDetail;
        w3?: ContactDetail;
        w4?: ContactDetail;
    };
    notes?: string;
}

const STORAGE_KEY = 'partner_states_v1';

export function getAllPartnerStates(): Record<string, PartnerState> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

export function getPartnerState(estabId: string | number): PartnerState {
    const states = getAllPartnerStates();
    const id = String(estabId);
    const state = states[id] || {
        isFinished: false,
        contacts: { w1: false, w2: false, w3: false, w4: false }
    };
    
    // Initialize or migrate contactDetails if not present
    if (!state.contactDetails) {
        state.contactDetails = {
            w1: { completed: state.contacts.w1, status: state.contacts.w1 ? 'finalizado' : 'pendente' },
            w2: { completed: state.contacts.w2, status: state.contacts.w2 ? 'finalizado' : 'pendente' },
            w3: { completed: state.contacts.w3, status: state.contacts.w3 ? 'finalizado' : 'pendente' },
            w4: { completed: state.contacts.w4, status: state.contacts.w4 ? 'finalizado' : 'pendente' },
        };
    } else {
        // Guarantee all weeks w1-w4 are defined
        (['w1', 'w2', 'w3', 'w4'] as const).forEach(w => {
            if (!state.contactDetails![w]) {
                state.contactDetails![w] = {
                    completed: state.contacts[w],
                    status: state.contacts[w] ? 'finalizado' : 'pendente'
                };
            }
        });
    }
    
    return state;
}

export function savePartnerState(estabId: string | number, state: Partial<PartnerState>) {
    const states = getAllPartnerStates();
    const id = String(estabId);
    const current = states[id] || {
        isFinished: false,
        contacts: { w1: false, w2: false, w3: false, w4: false }
    };
    
    states[id] = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

export function updateContactDetail(
    estabId: string | number,
    week: 'w1' | 'w2' | 'w3' | 'w4',
    details: Partial<ContactDetail>
) {
    const current = getPartnerState(estabId);
    const currentDetail = current.contactDetails?.[week] || {
        completed: current.contacts[week],
        status: current.contacts[week] ? 'finalizado' : 'pendente'
    };
    
    const updatedDetail = { ...currentDetail, ...details };
    const newContacts = { ...current.contacts, [week]: updatedDetail.completed };
    
    const newContactDetails = {
        ...(current.contactDetails || {}),
        [week]: updatedDetail
    };
    
    savePartnerState(estabId, {
        contacts: newContacts,
        contactDetails: newContactDetails
    });
}

export function toggleContact(estabId: string | number, week: 'w1' | 'w2' | 'w3' | 'w4') {
    const current = getPartnerState(estabId);
    const newCompleted = !current.contacts[week];
    
    updateContactDetail(estabId, week, {
        completed: newCompleted,
        status: newCompleted ? 'finalizado' : 'pendente'
    });
}

export function finishJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: true });
}

export function reopenJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: false });
}
