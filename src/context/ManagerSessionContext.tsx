import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import { identifyManagerFromUser } from '../config/managerMapping';
import {
    clearManagerSession,
    loadManagerSession,
    profileToManagerFilter,
    saveManagerSession,
    type ManagerFilter,
    type SessionProfile,
} from '../config/managerSession';
import ManagerPickerModal from '../components/ManagerPickerModal';
import { useAuth } from './AuthContext';

interface ManagerSessionState {
    /** Identidade escolhida na entrada; vale para a aba inteira. */
    profile: SessionProfile | '';
    /** Filtro de analista em vigor; ajustável pelo seletor das telas. */
    managerFilter: ManagerFilter;
    setManagerFilter: (manager: string) => void;
    needsPicker: boolean;
}

const ManagerSessionContext = createContext<ManagerSessionState | null>(null);

export function ManagerSessionProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated, logout } = useAuth();
    const [profile, setProfile] = useState<SessionProfile | ''>(() => loadManagerSession());
    const [managerFilter, setManagerFilterState] = useState<ManagerFilter>(
        () => profileToManagerFilter(loadManagerSession())
    );
    const [needsPicker, setNeedsPicker] = useState(false);

    /**
     * Ajuste pontual do seletor de analista das telas. Não altera quem está
     * usando o painel, então também não mexe na sessão gravada.
     */
    const setManagerFilter = useCallback((manager: string) => {
        setManagerFilterState(manager === 'THIAGO' || manager === 'LAÍS' ? manager : '');
    }, []);

    const confirmPicker = useCallback((chosen: SessionProfile) => {
        setProfile(chosen);
        saveManagerSession(chosen);
        setManagerFilterState(profileToManagerFilter(chosen));
        setNeedsPicker(false);
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            clearManagerSession();
            setProfile('');
            setManagerFilterState('');
            setNeedsPicker(false);
            return;
        }

        const session = loadManagerSession();
        if (session) {
            setProfile(session);
            setManagerFilterState(profileToManagerFilter(session));
            setNeedsPicker(false);
            return;
        }

        if (user) {
            const identified = identifyManagerFromUser(user);
            if (identified === 'THIAGO' || identified === 'LAÍS') {
                confirmPicker(identified);
                return;
            }
        }

        setNeedsPicker(true);
    }, [isAuthenticated, user, confirmPicker]);

    return (
        <ManagerSessionContext.Provider value={{ profile, managerFilter, setManagerFilter, needsPicker }}>
            {children}
            {isAuthenticated && needsPicker && (
                <ManagerPickerModal
                    onSelect={confirmPicker}
                    onSignOut={logout}
                    accountEmail={user?.email}
                />
            )}
        </ManagerSessionContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useManagerSession(): ManagerSessionState {
    const ctx = useContext(ManagerSessionContext);
    if (!ctx) throw new Error('useManagerSession must be used inside ManagerSessionProvider');
    return ctx;
}
