
export interface PartnerState {
    isFinished: boolean;
    notes?: string;
    /** Lançamento (DD/MM/AAAA) do contrato ao qual este estado pertence — ver getPartnerState. */
    lancamento?: string;
}

function defaultPartnerState(): PartnerState {
    return { isFinished: false };
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

/**
 * @param currentLancamento Lançamento (DD/MM/AAAA) do contrato atual do
 * estabelecimento, quando conhecido (ver enrichPartnerData). Se o estado
 * salvo pertencer a um lançamento diferente — ex.: parceiro cancelou e
 * voltou com um contrato novo — o estado antigo (isFinished/notas)
 * é descartado e um estado novo é persistido, para não arrastar uma jornada
 * já encerrada para o contrato novo. Estados sem `lancamento` salvo (de
 * antes desta checagem existir) só recebem a marcação, sem reset.
 */
export function getPartnerState(estabId: string | number, currentLancamento?: string): PartnerState {
    const states = getAllPartnerStates();
    const id = String(estabId);
    const stored = states[id];
    const isNewContract = !!currentLancamento && !!stored?.lancamento && stored.lancamento !== currentLancamento;

    const state: PartnerState = isNewContract
        ? { ...defaultPartnerState(), lancamento: currentLancamento }
        : (stored || defaultPartnerState());

    if (currentLancamento && state.lancamento !== currentLancamento) {
        state.lancamento = currentLancamento;
    }
    if (isNewContract || (currentLancamento && !stored?.lancamento)) {
        savePartnerState(id, state);
    }

    return state;
}

export function savePartnerState(estabId: string | number, state: Partial<PartnerState>) {
    const states = getAllPartnerStates();
    const id = String(estabId);
    const current = states[id] || { isFinished: false };
    
    states[id] = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

export function finishJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: true });
}

export function reopenJourney(estabId: string | number) {
    savePartnerState(estabId, { isFinished: false });
}
