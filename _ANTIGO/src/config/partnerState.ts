
export interface PartnerState {
    isFinished: boolean;
    contacts: {
        w1: boolean; // 7d
        w2: boolean; // 14d
        w3: boolean; // 21d
        w4: boolean; // 28d
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
    return states[id] || {
        isFinished: false,
        contacts: { w1: false, w2: false, w3: false, w4: false }
    };
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

export function toggleContact(estabId: string | number, week: 'w1' | 'w2' | 'w3' | 'w4') {
    const current = getPartnerState(estabId);
    const newContacts = { ...current.contacts, [week]: !current.contacts[week] };
    savePartnerState(estabId, { contacts: newContacts });
}

export function finishJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: true });
}

export function reopenJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: false });
}
