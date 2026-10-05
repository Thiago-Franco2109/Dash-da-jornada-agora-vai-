import { useCityFocus } from '../context/CityFocusContext';

/**
 * Interruptor do foco "Cidades OKR". É o MESMO estado em qualquer lugar onde
 * este chip apareça — no cabeçalho (sempre à mão) e ao lado de cada seletor de
 * cidade (onde o CS está filtrando). Clicar aqui muda o painel inteiro, e o
 * chip fica aceso justamente para que ninguém leia um número recortado achando
 * que é a base toda.
 */
interface CityFocusChipProps {
    /** `header` = sobre a barra colorida; `filtro` = dentro das barras claras. */
    variante?: 'header' | 'filtro';
    /** Acompanha a altura dos controles da barra onde o chip entra. */
    tamanho?: 'sm' | 'md';
    className?: string;
}

export default function CityFocusChip({ variante = 'filtro', tamanho = 'md', className = '' }: CityFocusChipProps) {
    const { okrAtivo, alternarOkr, cidadesOkr } = useCityFocus();

    const titulo = okrAtivo
        ? `Mostrando só as cidades da OKR: ${cidadesOkr.join(', ')}. Clique para ver todas as cidades.`
        : `Filtrar o painel inteiro pelas cidades da OKR: ${cidadesOkr.join(', ')}.`;

    // Tailwind v4 não aceita o `!` do v3, então o tamanho vem por classe mesmo.
    const medida = tamanho === 'sm' ? 'h-7 px-2 text-[11px] gap-1' : 'h-9 px-3 text-xs gap-1.5';

    const estilo = variante === 'header'
        ? (okrAtivo
            ? 'bg-white text-slate-900 border-white shadow-sm'
            : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20 hover:text-white')
        : (okrAtivo
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-primary hover:border-primary/40');

    return (
        <button
            type="button"
            onClick={alternarOkr}
            aria-pressed={okrAtivo}
            title={titulo}
            className={`shrink-0 inline-flex items-center rounded-lg border font-bold uppercase tracking-wide transition-colors ${medida} ${estilo} ${className}`}
        >
            <span className="material-symbols-outlined text-[16px]">
                {okrAtivo ? 'flag_circle' : 'outlined_flag'}
            </span>
            Cidades OKR
            <span className={`text-[10px] font-black tabular-nums ${okrAtivo ? 'opacity-70' : 'opacity-50'}`}>
                {cidadesOkr.length}
            </span>
        </button>
    );
}
