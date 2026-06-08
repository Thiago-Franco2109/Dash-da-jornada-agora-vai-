import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type ProductMode = 'marketplace' | 'cardapio_digital';

interface ProductModeTheme {
    /** Cor de fundo do header */
    headerBg: string;
    /** Cor de fundo da sidebar */
    sidebarBg: string;
    /** Cor da borda da sidebar */
    sidebarBorder: string;
    /** Classes Tailwind para a sidebar (bg, border, text...) */
    sidebarClasses: {
        bg: string;
        border: string;
        divider: string;
        footerBorder: string;
        activeItem: string;
        pinBorder: string;
    };
    /** Título exibido no header */
    headerTitle: string;
    /** Label curto do modo */
    label: string;
}

const THEMES: Record<ProductMode, ProductModeTheme> = {
    marketplace: {
        headerBg: '#32ba72',
        sidebarBg: 'bg-emerald-800',
        sidebarBorder: 'border-emerald-900',
        sidebarClasses: {
            bg: 'bg-emerald-800',
            border: 'border-emerald-900',
            divider: 'bg-emerald-600/50',
            footerBorder: 'border-emerald-600/50',
            activeItem: 'bg-white text-emerald-700',
            pinBorder: 'border-emerald-700/50',
        },
        headerTitle: 'Jornada de novos parceiros',
        label: 'Marketplace',
    },
    cardapio_digital: {
        headerBg: '#1565C0',
        sidebarBg: 'bg-blue-800',
        sidebarBorder: 'border-blue-900',
        sidebarClasses: {
            bg: 'bg-blue-800',
            border: 'border-blue-900',
            divider: 'bg-blue-600/50',
            footerBorder: 'border-blue-600/50',
            activeItem: 'bg-white text-blue-700',
            pinBorder: 'border-blue-700/50',
        },
        headerTitle: 'Jornada assinantes CD',
        label: 'Cardápio Digital',
    },
};

interface ProductModeContextValue {
    mode: ProductMode;
    theme: ProductModeTheme;
    isCD: boolean;
    toggleMode: () => void;
    setMode: (mode: ProductMode) => void;
}

const ProductModeContext = createContext<ProductModeContextValue | null>(null);

const STORAGE_KEY = 'bigou_product_mode';

function loadPersistedMode(): ProductMode {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'marketplace' || stored === 'cardapio_digital') return stored;
    } catch { /* ignore */ }
    return 'marketplace';
}

export function ProductModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<ProductMode>(loadPersistedMode);

    const setMode = useCallback((newMode: ProductMode) => {
        setModeState(newMode);
        try { localStorage.setItem(STORAGE_KEY, newMode); } catch { /* ignore */ }
    }, []);

    const toggleMode = useCallback(() => {
        setMode(mode === 'marketplace' ? 'cardapio_digital' : 'marketplace');
    }, [mode, setMode]);

    const value = useMemo<ProductModeContextValue>(() => ({
        mode,
        theme: THEMES[mode],
        isCD: mode === 'cardapio_digital',
        toggleMode,
        setMode,
    }), [mode, toggleMode, setMode]);

    return (
        <ProductModeContext.Provider value={value}>
            {children}
        </ProductModeContext.Provider>
    );
}

export function useProductMode(): ProductModeContextValue {
    const ctx = useContext(ProductModeContext);
    if (!ctx) throw new Error('useProductMode deve ser usado dentro de <ProductModeProvider>');
    return ctx;
}
