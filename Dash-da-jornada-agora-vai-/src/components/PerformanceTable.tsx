import { useState, useEffect, useRef, useCallback } from 'react';
import { getStarColor, getTendenciaColor, getTendenciaLabel, type EnrichedPerformanceRow } from '../utils/calculations';

export type PerformanceRow = {
    cidade: string;
    estabelecimento: string;
    estab_id?: string;  // ESTAB_ID da coluna B – chave para cruzamento com INDICADOR
    status: string;
    lancamento: string;
    desempenho: string;
    week_1: number;
    week_2: number;
    week_3: number;
    week_4: number;
    logo_url?: string;
    analista?: string;
    /** Status da promoção */
    promo_status?: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado';
    /** Status do cupom */
    cupom_status?: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado';
    /** Total de avaliações */
    total_avaliacoes?: number;
    /** Relevância Comercial (1-5) vinda do Supabase */
    commercial_relevance?: number;
};

export type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
} | null;

interface PerformanceTableProps {
    data: EnrichedPerformanceRow[];
    sortConfig: SortConfig;
    requestSort: (key: string) => void;
    onRowClick: (row: EnrichedPerformanceRow) => void;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado') => void;
    /** journey = onboarding 28 dias; desempenho = Todas as Lojas CD (churn) */
    variant?: 'journey' | 'desempenho';
}

type ActiveDropdown = { rowIndex: number; field: 'promo' | 'cupom' } | null;

// ──────────────────────────────────────────────────────────────
// StatusDropdown — componente isolado com click-outside e
// detecção automática de direção (para cima nas últimas linhas)
// ──────────────────────────────────────────────────────────────
function StatusDropdown({
    rowIndex,
    totalRows,
    field,
    partnerId,
    currentStatus,
    activeDropdown,
    setActiveDropdown,
    onStatusChange,
    children,
}: {
    rowIndex: number;
    totalRows: number;
    field: 'promo' | 'cupom';
    partnerId: string;
    currentStatus: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado' | undefined;
    activeDropdown: ActiveDropdown;
    setActiveDropdown: (v: ActiveDropdown) => void;
    onStatusChange?: PerformanceTableProps['onStatusChange'];
    children: React.ReactNode;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const isOpen = activeDropdown?.rowIndex === rowIndex && activeDropdown?.field === field;

    // Fecha ao clicar fora
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, setActiveDropdown]);

    // Abre para cima se estiver nas últimas 4 linhas
    const openUpward = totalRows > 3 && rowIndex >= totalRows - 3;

    const overrideField = field === 'promo' ? 'promo_status_override' : 'cupom_status_override';

    const handleSelect = (status: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado') => {
        onStatusChange && onStatusChange(partnerId, overrideField, status);
        setActiveDropdown(null);
    };

    const toggleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveDropdown(isOpen ? null : { rowIndex, field });
    };

    return (
        <div ref={wrapperRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={toggleOpen}
                className="inline-flex justify-center w-full focus:outline-none hover:opacity-80 transition-opacity"
                title="Clique para alterar status"
            >
                {children}
            </button>

            {isOpen && (
                <div
                    className={`absolute z-50 w-44 rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 focus:outline-none overflow-hidden animate-in`}
                    style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        ...(openUpward
                            ? { bottom: 'calc(100% + 6px)' }
                            : { top: 'calc(100% + 6px)' }),
                    }}
                >
                    {/* Indicador de seta */}
                    <div
                        className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white dark:bg-slate-800 rotate-45 ring-1 ring-black/10 dark:ring-white/10 ${
                            openUpward ? 'bottom-[-5px] border-t-0 border-l-0' : 'top-[-5px] border-b-0 border-r-0'
                        }`}
                        style={{ zIndex: -1 }}
                    />
                    <div className="py-1">
                        {[
                            { value: 'ativo' as const,     icon: '✅', label: 'Ativo',               color: 'text-emerald-600' },
                            { value: 'aguardando' as const, icon: '🔴', label: 'Não ofertado',       color: 'text-red-400'     },
                            { value: 'ofertei' as const,   icon: '🟠', label: 'Aguardando retorno', color: 'text-orange-500'  },
                            { value: 'negado' as const,    icon: '⛔', label: 'Negado',             color: 'text-slate-500'   },
                            { value: 'inativo' as const,   icon: '➖', label: 'Inativo / Limpar',   color: 'text-slate-400'   },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleSelect(opt.value)}
                                className={`text-left w-full flex items-center gap-2 px-4 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${opt.color} ${currentStatus === opt.value ? 'bg-slate-50 dark:bg-slate-700/60 font-bold' : ''}`}
                            >
                                <span>{opt.icon}</span>
                                {opt.label}
                                {currentStatus === opt.value && (
                                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider opacity-60">Atual</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// PerformanceTable principal
// ──────────────────────────────────────────────────────────────
export default function PerformanceTable({ data, sortConfig, requestSort, onRowClick, onStatusChange, variant = 'journey' }: PerformanceTableProps) {
    const isDesempenho = variant === 'desempenho';
    const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);

    // Fecha dropdown ao pressionar Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveDropdown(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Fecha dropdown ao clicar em qualquer linha da tabela (navegação)
    const handleRowClick = useCallback((row: EnrichedPerformanceRow) => {
        setActiveDropdown(null);
        onRowClick(row);
    }, [onRowClick]);

    // Generate stars visual
    const renderStars = (stars: number) => {
        return (
            <div className={`flex items-center justify-center ${getStarColor(stars)}`}>
                <span className="material-symbols-outlined text-[16px]">star</span>
                <span className="font-bold ml-1">{stars}</span>
            </div>
        );
    };

    const renderIndicadorBadge = (status: 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado' | undefined) => {
        if (status === 'ativo') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 whitespace-nowrap">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    Ativo
                </span>
            );
        }
        if (status === 'ofertei') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 ring-1 ring-inset ring-orange-400/30 whitespace-nowrap">
                    <span className="material-symbols-outlined text-[13px]">hourglass_top</span>
                    Aguard. retorno
                </span>
            );
        }
        if (status === 'negado') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 ring-1 ring-inset ring-slate-300/60 dark:ring-slate-600 whitespace-nowrap">
                    <span className="material-symbols-outlined text-[13px]">block</span>
                    Negado
                </span>
            );
        }
        if (status === 'aguardando') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-300 ring-1 ring-inset ring-red-300/50 whitespace-nowrap">
                    <span className="material-symbols-outlined text-[13px]">priority_high</span>
                    Não ofertado
                </span>
            );
        }
        // inativo / undefined — badge neutro com ícone de edição para indicar que é clicável
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 whitespace-nowrap">
                <span className="material-symbols-outlined text-[13px]">remove</span>
                —
            </span>
        );
    };

    const renderAvaliacaoBadge = (total: number | undefined, diasAtivo: number) => {
        if (total === undefined) {
            return <span className="text-slate-400">—</span>;
        }
        if (total > 0) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20">
                    <span className="material-symbols-outlined text-[13px]">star</span>
                    {total}
                </span>
            );
        }
        if (diasAtivo > 15) {
            return (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20">
                    <span className="material-symbols-outlined text-[13px]">warning</span>
                    Crítico
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                0
            </span>
        );
    };

    const renderSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return (
            <span className="material-symbols-outlined text-[16px] ml-1 align-bottom text-primary">
                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            </span>
        );
    };

    return (
        <div className="flex-1 overflow-x-auto p-6 flex flex-col">
            <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('cidade')}>
                                    Cidade {renderSortIcon('cidade')}
                                </th>
                                <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('estabelecimento')}>
                                    Estabelecimento {renderSortIcon('estabelecimento')}
                                </th>
                                {!isDesempenho && (
                                    <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('commercial_relevance')}>
                                        Relevância {renderSortIcon('commercial_relevance')}
                                    </th>
                                )}
                                <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('status')}>
                                    Status {renderSortIcon('status')}
                                </th>
                                {isDesempenho ? (
                                    <>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_1')}>S1 {renderSortIcon('week_1')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_2')}>S2 {renderSortIcon('week_2')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_3')}>S3 {renderSortIcon('week_3')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_4')}>S4 {renderSortIcon('week_4')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('total_pedidos')}>
                                            Total {renderSortIcon('total_pedidos')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('desempenho')}>
                                            Desempenho {renderSortIcon('desempenho')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('tendencia_pedidos')}>
                                            Tendência {renderSortIcon('tendencia_pedidos')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('risco_churn')}>
                                            Risco Churn {renderSortIcon('risco_churn')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('analista')}>
                                            Gestor {renderSortIcon('analista')}
                                        </th>
                                    </>
                                ) : (
                                    <>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('dias_desde_lancamento')}>
                                            Dias Ativo {renderSortIcon('dias_desde_lancamento')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('total_pedidos')}>
                                            Pedidos {renderSortIcon('total_pedidos')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('indice_desempenho')}>
                                            Índice {renderSortIcon('indice_desempenho')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('city_weight')}>
                                            Peso (Cid.) {renderSortIcon('city_weight')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('priority_stars')}>
                                            Prioridade {renderSortIcon('priority_stars')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Promo
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Cupom
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('total_avaliacoes')}>
                                            Avaliação {renderSortIcon('total_avaliacoes')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Contatos
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Jornada
                                        </th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                            {data.map((row, index) => {
                                const isTopPriority = index < 10 && (isDesempenho ? (row.risco_churn ?? 0) >= 4 : row.priority_stars >= 4);
                                const partnerId = row.estab_id || row.estabelecimento;

                                const renderContactDots = () => {
                                    return (
                                        <div className="flex justify-center gap-1">
                                            {(['w1', 'w2', 'w3', 'w4'] as const).map((w) => (
                                                <div
                                                    key={w}
                                                    className={`size-2 rounded-full border ${row.contacts[w] ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}
                                                    title={row.contacts[w] ? 'Contato Realizado' : 'Pendente'}
                                                />
                                            ))}
                                        </div>
                                    );
                                };

                                return (
                                    <tr
                                        key={`${row.estabelecimento}-${row.cidade}`}
                                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${isTopPriority ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}
                                        onClick={() => handleRowClick(row)}
                                    >
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-base font-semibold text-slate-700 dark:text-slate-300 sm:pl-6 group-hover:text-primary transition-colors relative">
                                            {isTopPriority && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
                                            {row.cidade}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-slate-900 dark:text-slate-200 group-hover:text-primary transition-colors">
                                            <div className="flex items-center gap-3">
                                                {row.logo_url ? (
                                                    <img src={row.logo_url} alt={row.estabelecimento} className="size-10 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm object-cover" />
                                                ) : (
                                                    <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                                        <span className="material-symbols-outlined text-[20px]">store</span>
                                                    </div>
                                                )}
                                                <span className="truncate max-w-[200px]" title={row.estabelecimento}>
                                                    {row.estabelecimento}
                                                </span>
                                            </div>
                                        </td>
                                        {!isDesempenho && (
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                {row.commercial_relevance ? (
                                                    <div className="flex items-center justify-center gap-0.5 text-amber-500">
                                                        <span className="material-symbols-outlined text-[16px] fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>grade</span>
                                                        <span className="font-bold text-xs">{row.commercial_relevance}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-700 material-symbols-outlined text-[16px]">grade</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${row.status === 'ativo'
                                                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 ring-green-600/20'
                                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 ring-red-600/20'
                                                }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        {isDesempenho ? (
                                            <>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_1}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_2}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_3}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-medium text-slate-800 dark:text-slate-200">{row.week_4}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    <span className="font-bold text-lg text-slate-900 dark:text-white">{row.total_pedidos}</span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">
                                                    {row.desempenho || '—'}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    <span className={`font-semibold ${getTendenciaColor(row.tendencia_pedidos || 'estavel')}`}>
                                                        {getTendenciaLabel(row.tendencia_pedidos || 'estavel')}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    {renderStars(row.risco_churn ?? row.priority_stars)}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">
                                                    {row.analista}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-500 dark:text-slate-400">{row.dias_desde_lancamento}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-center">
                                            <span className="font-bold text-lg text-slate-900 dark:text-white">{row.total_pedidos}</span>
                                            <span className="text-slate-400 mx-1 text-sm">/</span>
                                            <span className="text-slate-500 text-sm">{row.pedidos_esperados}</span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-medium text-slate-700 dark:text-slate-300">
                                            {row.indice_desempenho.toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-500 dark:text-slate-400">{row.city_weight}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            {renderStars(row.priority_stars)}
                                        </td>

                                        {/* ── Coluna Promo ── */}
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                            <StatusDropdown
                                                rowIndex={index}
                                                totalRows={data.length}
                                                field="promo"
                                                partnerId={partnerId}
                                                currentStatus={row.promo_status}
                                                activeDropdown={activeDropdown}
                                                setActiveDropdown={setActiveDropdown}
                                                onStatusChange={onStatusChange}
                                            >
                                                {renderIndicadorBadge(row.promo_status)}
                                            </StatusDropdown>
                                        </td>

                                        {/* ── Coluna Cupom ── */}
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                            <StatusDropdown
                                                rowIndex={index}
                                                totalRows={data.length}
                                                field="cupom"
                                                partnerId={partnerId}
                                                currentStatus={row.cupom_status}
                                                activeDropdown={activeDropdown}
                                                setActiveDropdown={setActiveDropdown}
                                                onStatusChange={onStatusChange}
                                            >
                                                {renderIndicadorBadge(row.cupom_status)}
                                            </StatusDropdown>
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            {renderAvaliacaoBadge(row.total_avaliacoes, row.dias_desde_lancamento)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            {renderContactDots()}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            {row.isFinished ? (
                                                <span className="text-emerald-500 material-symbols-outlined" title="Jornada Concluída">verified</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Em curso</span>
                                            )}
                                        </td>
                                            </>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
