/**
 * Categorias de anotação do diário.
 *
 * A categoria existe por um motivo só: o relatório pro chefe se agrupar
 * sozinho. Cada categoria vira uma seção do texto, na ordem desta lista — por
 * isso ela começa pelo que é resultado ("Captação", "Onboarding") e termina no
 * que é bastidor ("Análise", "Administrativo").
 *
 * `emoji` é o que sai no texto do relatório (o Discord não renderiza Material
 * Symbols); `icon` é o que aparece na tela. Os dois existem de propósito.
 *
 * O `id` é gravado como texto solto em `diario_cs.categoria` — a lista vai
 * mudar com o uso, e enum no Postgres custa migração a cada mexida. Categoria
 * desconhecida (ou null) cai em "Outro", nunca some.
 */

export type CategoriaDiarioId =
    | 'captacao'
    | 'onboarding'
    | 'ligacao'
    | 'reuniao'
    | 'analise'
    | 'problema'
    | 'admin'
    | 'outro';

export interface CategoriaDiario {
    id: CategoriaDiarioId;
    /** Rótulo no chip e no seletor. */
    label: string;
    /** Título da seção no relatório. */
    secao: string;
    emoji: string;
    /** Material Symbols, igual ao resto do app. */
    icon: string;
    /** Cor base do chip — classes Tailwind completas (o JIT não resolve string montada). */
    chipClasses: string;
    chipAtivoClasses: string;
}

export const CATEGORIAS_DIARIO: CategoriaDiario[] = [
    {
        id: 'captacao',
        label: 'Captação',
        secao: 'Captação de ações',
        emoji: '🎯',
        icon: 'local_offer',
        chipClasses: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        chipAtivoClasses: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    },
    {
        id: 'onboarding',
        label: 'Onboarding',
        secao: 'Onboarding e treinamento',
        emoji: '🎓',
        icon: 'school',
        chipClasses: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
        chipAtivoClasses: 'bg-blue-600 text-white shadow-md shadow-blue-600/25',
    },
    {
        id: 'ligacao',
        label: 'Ligação',
        secao: 'Contatos com parceiros',
        emoji: '📞',
        icon: 'call',
        chipClasses: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
        chipAtivoClasses: 'bg-violet-600 text-white shadow-md shadow-violet-600/25',
    },
    {
        id: 'reuniao',
        label: 'Reunião',
        secao: 'Reuniões',
        emoji: '👥',
        icon: 'groups',
        chipClasses: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
        chipAtivoClasses: 'bg-amber-600 text-white shadow-md shadow-amber-600/25',
    },
    {
        id: 'analise',
        label: 'Análise',
        secao: 'Análises e levantamentos',
        emoji: '📊',
        icon: 'insights',
        chipClasses: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
        chipAtivoClasses: 'bg-cyan-600 text-white shadow-md shadow-cyan-600/25',
    },
    {
        id: 'problema',
        label: 'Problema',
        secao: 'Problemas e bloqueios',
        emoji: '⚠️',
        icon: 'report',
        chipClasses: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
        chipAtivoClasses: 'bg-red-600 text-white shadow-md shadow-red-600/25',
    },
    {
        id: 'admin',
        label: 'Administrativo',
        secao: 'Administrativo',
        emoji: '🗂️',
        icon: 'folder_managed',
        chipClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
        chipAtivoClasses: 'bg-slate-700 text-white shadow-md shadow-slate-700/25',
    },
    {
        id: 'outro',
        label: 'Outro',
        secao: 'Outros',
        emoji: '📌',
        icon: 'push_pin',
        chipClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
        chipAtivoClasses: 'bg-slate-600 text-white shadow-md shadow-slate-600/25',
    },
];

const POR_ID = new Map(CATEGORIAS_DIARIO.map(c => [c.id, c]));

/** Nunca devolve undefined: categoria desconhecida ou ausente vira "Outro". */
export function getCategoriaDiario(id: string | null | undefined): CategoriaDiario {
    return (id ? POR_ID.get(id as CategoriaDiarioId) : undefined) ?? POR_ID.get('outro')!;
}

export function isCategoriaDiario(value: unknown): value is CategoriaDiarioId {
    return typeof value === 'string' && POR_ID.has(value as CategoriaDiarioId);
}
