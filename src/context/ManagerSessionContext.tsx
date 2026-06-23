import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    identifyManagerFromUser,
    type Manager,
} from '../config/managerMapping';
import {
    clearManagerSession,
    loadManagerSession,
    saveManagerSession,
    type ManagerFilter,
} from '../config/managerSession';
import ManagerPickerModal from '../components/ManagerPickerModal';
import { useAuth } from './AuthContext';

interface ManagerSessionState {
    managerFilter: ManagerFilter;
    setManagerFilter: (manager: string) => void;
    needsPicker: boolean;
}

const ManagerSessionContext = createContext<ManagerSessionState | null>(null);

export function ManagerSessionProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const [managerFilter, setManagerFilterState] = useState<ManagerFilter>(() => loadManagerSession());
    const [needsPicker, setNeedsPicker] = useState(false);

    const setManagerFilter = useCallback((manager: string) => {
        const normalized: ManagerFilter =
            manager === 'THIAGO' || manager === 'LAÍS' ? manager : '';
        setManagerFilterState(normalized);
        saveManagerSession(normalized);
        if (normalized) setNeedsPicker(false);
    }, []);

    const confirmPicker = useCallback((manager: Manager) => {
        setManagerFilter(manager);
    }, [setManagerFilter]);

    useEffect(() => {
        if (!isAuthenticated) {
            clearManagerSession();
            setManagerFilterState('');
            setNeedsPicker(false);
            return;
        }

        const session = loadManagerSession();
        if (session) {
            setManagerFilterState(session);
            setNeedsPicker(false);
            return;
        }

        if (user) {
            const identified = identifyManagerFromUser(user);
            if (identified === 'THIAGO' || identified === 'LAÍS') {
                setManagerFilter(identified);
                return;
            }
        }

        setNeedsPicker(true);
    }, [isAuthenticated, user, setManagerFilter]);

    return (
        <ManagerSessionContext.Provider value={{ managerFilter, setManagerFilter, needsPicker }}>
            {children}
            {isAuthenticated && needsPicker && (
                <ManagerPickerModal onSelect={confirmPicker} />
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
