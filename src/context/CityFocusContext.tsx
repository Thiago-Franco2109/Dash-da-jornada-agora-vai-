import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { CIDADES_OKR_ROTULOS, isCidadeOkr } from '../config/cidadesOkr';

const STORAGE_KEY = 'city_focus_okr';

/**
 * Foco de cidades — um interruptor só, válido para o painel inteiro.
 *
 * A escolha de ser global (e não um filtro por tela) é o ponto: a OKR é a
 * mesma em todas as telas, e repetir o recorte em cada seletor de cidade
 * deixaria Jornada, CRM e Carteira respondendo perguntas diferentes na mesma
 * sessão. Aqui o estado é um só; cada tela apenas o aplica aos seus dados e
 * mostra o mesmo chip.
 *
 * Regra do recorte: parceiro SEM cidade não passa enquanto o foco está ligado.
 * Card do Trello sem cidade (ver camposFiltraveis) não é "talvez da OKR" — é
 * desconhecido, e deixá-lo passar inflaria justamente o número que a OKR mede.
 */
interface CityFocusState {
    /** true = tudo que a sessão vê está restrito às cidades da OKR. */
    okrAtivo: boolean;
    setOkrAtivo: (ativo: boolean) => void;
    alternarOkr: () => void;
    /** Rótulos das cidades da OKR, na ordem do registro. */
    cidadesOkr: string[];
    /** A cidade passa pelo foco atual? Com o foco desligado, tudo passa. */
    cidadeNoFoco: (cidade?: string | null) => boolean;
    /**
     * Atalho para listas. Devolve a MESMA referência quando o foco está
     * desligado — assim os memos das telas não invalidam à toa.
     */
    filtrarPorCidade: <T>(linhas: T[], cidadeDe: (linha: T) => string | undefined | null) => T[];
}

const CityFocusContext = createContext<CityFocusState | null>(null);

function carregarFoco(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function CityFocusProvider({ children }: { children: ReactNode }) {
    const [okrAtivo, setOkrAtivo] = useState<boolean>(carregarFoco);

    // Persiste a escolha: quem trabalha a OKR passa o dia inteiro nela, e
    // recarregar a aba não pode devolver silenciosamente a base toda.
    useEffect(() => {
        try {
            if (okrAtivo) localStorage.setItem(STORAGE_KEY, '1');
            else localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* navegador sem storage: o foco vale só para esta sessão */
        }
    }, [okrAtivo]);

    const alternarOkr = useCallback(() => setOkrAtivo(v => !v), []);

    const cidadeNoFoco = useCallback(
        (cidade?: string | null) => (okrAtivo ? isCidadeOkr(cidade) : true),
        [okrAtivo],
    );

    const filtrarPorCidade = useCallback(
        <T,>(linhas: T[], cidadeDe: (linha: T) => string | undefined | null): T[] =>
            (okrAtivo ? linhas.filter(linha => isCidadeOkr(cidadeDe(linha))) : linhas),
        [okrAtivo],
    );

    const value = useMemo<CityFocusState>(() => ({
        okrAtivo,
        setOkrAtivo,
        alternarOkr,
        cidadesOkr: CIDADES_OKR_ROTULOS,
        cidadeNoFoco,
        filtrarPorCidade,
    }), [okrAtivo, alternarOkr, cidadeNoFoco, filtrarPorCidade]);

    return <CityFocusContext.Provider value={value}>{children}</CityFocusContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCityFocus(): CityFocusState {
    const ctx = useContext(CityFocusContext);
    if (!ctx) throw new Error('useCityFocus must be used inside CityFocusProvider');
    return ctx;
}
