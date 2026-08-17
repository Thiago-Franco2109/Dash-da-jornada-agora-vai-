import { useState, useEffect, useRef, useCallback } from 'react';
import { formatarMoedaBRL } from '../config/cdContracts';
import { getStarColor, getTendenciaColor, getTendenciaLabel, type EnrichedPerformanceRow } from '../utils/calculations';
import {
    CAMPAIGN_TYPES,
    type CampaignStatuses,
    type CampaignTypeId,
    getCampaignOverrideField,
    getCampaignStatus,
    withDefaultCampaignStatus,
} from '../config/campaignTypes';
import CampaignIcons from './CampaignIcons';
import type { StatusOverrideField } from '../hooks/useStatusOverride';
import type { PromoResumo } from '../hooks/usePromoStatus';

export type CampaignStatusChangeHandler = (
    partnerId: string,
    campaignId: CampaignTypeId,
    newStatus: PromoStatusValue,
) => void;

export type PromoStatusValue = 'ativo' | 'aguardando' | 'inativo' | 'ofertei' | 'negado';

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
    week_5?: number;
    week_6?: number;
    week_7?: number;
    week_8?: number;
    week_9?: number;
    week_10?: number;
    week_11?: number;
    week_12?: number;
    logo_url?: string;
    analista?: string;
    /** Status por tipo de campanha */
    campaign_statuses?: CampaignStatuses;
    /** @deprecated use campaign_statuses.super_promos */
    promo_status?: PromoStatusValue;
    /** @deprecated use campaign_statuses.cupons_destaque */
    cupom_status?: PromoStatusValue;
    /** Total de avaliações */
    total_avaliacoes?: number;
    /** Relevância Comercial (1-5) vinda do Supabase */
    commercial_relevance?: number;
    /** INDICADOR col. G+ — rótulo do mês mais recente (ex. jun./26) */
    pedidos_mes_label?: string;
    /** Valor numérico (com sinal) do GMV do mês — usado para ORDENAR a coluna. */
    pedidos_mes_value?: number;
    /** Campanhas de promoção ativas no banco (tooltip da coluna Promoções). */
    promo_campanhas?: string[];
    /** Resumo de status dos itens promocionais (coluna Promoções). */
    promo_resumo?: PromoResumo;
    /** Valor bruto da célula de pedidos do mês */
    pedidos_mes_raw?: string;
    /** Histórico de GMV mês a mês, em ordem cronológica (mais antigo → mais recente) */
    gmv_mensal?: { label: string; value: number }[];
};

/**
 * Coluna Promoções — slots em ordem e largura FIXAS.
 * Cada estado tem sempre a mesma posição horizontal, então a coluna pode ser
 * varrida verticalmente: "a 1ª posição tem número" = tem item pendente.
 * Pílulas que embrulham quebram esse alinhamento, por isso ícone + número.
 * Semântica travada pelo briefing — não alterar os significados.
 */
const PROMO_SLOTS = [
    { key: 'pendente', icon: 'pending', tone: 'text-orange-600 dark:text-orange-400', hint: 'pendente(s) — disponível no painel do parceiro pra ativar' },
    { key: 'aprovado', icon: 'check_circle', tone: 'text-emerald-600 dark:text-emerald-400', hint: 'aprovada(s) — ativa no painel' },
    { key: 'rascunho', icon: 'edit_note', tone: 'text-slate-500 dark:text-slate-400', hint: 'em rascunho' },
    { key: 'semItem', icon: 'block', tone: 'text-red-500 dark:text-red-400', hint: 'na cidade, sem item pro parceiro' },
] as const satisfies readonly { key: keyof Omit<PromoResumo, 'detalhe'>; icon: string; tone: string; hint: string }[];

export function getRowCampaignStatus(row: PerformanceRow, campaignId: CampaignTypeId): PromoStatusValue {
    const fromMap = getCampaignStatus(row.campaign_statuses, campaignId);
    if (fromMap) return fromMap;
    if (campaignId === 'super_promos' && row.promo_status) return row.promo_status;
    if (campaignId === 'cupons_destaque' && row.cupom_status) return row.cupom_status;
    return withDefaultCampaignStatus(undefined);
}

export type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
} | null;

interface PerformanceTableProps {
    data: EnrichedPerformanceRow[];
    sortConfig: SortConfig;
    requestSort: (key: string) => void;
    onRowClick: (row: EnrichedPerformanceRow) => void;
    onCampaignStatusChange?: CampaignStatusChangeHandler;
    /** @deprecated use onCampaignStatusChange */
    onStatusChange?: (partnerId: string, field: StatusOverrideField, newStatus: PromoStatusValue) => void;
    /** Marca a relevância (0-5) de um parceiro inline. 0 = limpar. */
    onRelevanceChange?: (partnerId: string, score: number) => void;
    /** journey = onboarding 28 dias; desempenho = Todas as Lojas CD; indicador = carteira INDICADOR_FORMATADO */
    variant?: 'journey' | 'desempenho' | 'indicador';
    /** Cabeçalho da coluna de pedidos mensais (ex. jun./26) */
    pedidosMesHeader?: string;
    /** true (padrão): tabela preenche altura e rola internamente.
     *  false: cresce natural e rola com a página (usado no scroll único do churn). */
    fillHeight?: boolean;
}

type ActiveDropdown = { rowIndex: number; field: CampaignTypeId } | null;

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
    onCampaignStatusChange,
    onStatusChange,
    children,
}: {
    rowIndex: number;
    totalRows: number;
    field: CampaignTypeId;
    partnerId: string;
    currentStatus: PromoStatusValue | undefined;
    activeDropdown: ActiveDropdown;
    setActiveDropdown: (v: ActiveDropdown) => void;
    onCampaignStatusChange?: CampaignStatusChangeHandler;
    onStatusChange?: PerformanceTableProps['onStatusChange'];
    children: React.ReactNode;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const isOpen = activeDropdown?.rowIndex === rowIndex && activeDropdown?.field === field;
    const canEdit = Boolean(onCampaignStatusChange || onStatusChange);

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

    const handleSelect = (status: PromoStatusValue) => {
        if (onCampaignStatusChange) {
            onCampaignStatusChange(partnerId, field, status);
        } else {
            const overrideField = getCampaignOverrideField(field);
            if (overrideField && onStatusChange) {
                onStatusChange(partnerId, overrideField, status);
            }
        }
        setActiveDropdown(null);
    };

    const toggleOpen = (e: React.MouseEvent) => {
        if (!canEdit) return;
        e.stopPropagation();
        setActiveDropdown(isOpen ? null : { rowIndex, field });
    };

    return (
        <div ref={wrapperRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={toggleOpen}
                disabled={!canEdit}
                className={`inline-flex justify-center w-full focus:outline-none transition-opacity ${canEdit ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                title={canEdit ? 'Clique para alterar status' : 'Status da planilha'}
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
// Sparkline — mini gráfico de evolução de vendas mês a mês
// ──────────────────────────────────────────────────────────────
function Sparkline({
    data,
    width = 104,
    height = 30,
    maxPoints = 6,
}: {
    data?: { label: string; value: number }[];
    width?: number;
    height?: number;
    maxPoints?: number;
}) {
    // Série cronológica (antigo → recente); remove o mês atual (incompleto, sempre distorce a queda)
    const closedMonths = (data ?? []).slice(0, -1);
    const series = closedMonths.slice(-maxPoints);

    if (series.length < 2) {
        return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
    }

    const values = series.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const pad = 4;
    const innerH = height - pad * 2;
    const stepX = width / (values.length - 1);

    // Direita → esquerda: mês mais antigo à direita, mês fechado mais recente à esquerda
    const points = values.map((v, i) => {
        const x = width - i * stepX;
        const y = pad + innerH - ((v - min) / range) * innerH;
        return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L0,${height} L${width},${height} Z`;

    const oldest = values[0];
    const newestClosed = values[values.length - 1];
    const isUp = newestClosed >= oldest;
    const stroke = isUp ? '#10b981' : '#ef4444';
    const gradId = `spark-${isUp ? 'up' : 'down'}`;
    const highlightPoint = points[points.length - 1];

    const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    const tooltip = [...series].reverse().map(d => `${d.label}: ${fmt(d.value)}`).join('\n');
    const variacao = oldest > 0 ? Math.round(((newestClosed - oldest) / oldest) * 100) : null;

    return (
        <div className="flex items-center justify-center gap-1.5" title={tooltip}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#${gradId})`} />
                <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={highlightPoint.x} cy={highlightPoint.y} r="2.2" fill={stroke} />
            </svg>
            {variacao != null && (
                <span className={`text-[10px] font-semibold tabular-nums ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {variacao > 0 ? '+' : ''}{variacao}%
                </span>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// RelevanceCell — estrela clicável que abre um seletor 1-5 (+ limpar)
// para marcar a relevância do parceiro sem abrir a página dele
// ──────────────────────────────────────────────────────────────
function RelevanceCell({
    partnerId,
    current,
    onChange,
    rowIndex,
    totalRows,
}: {
    partnerId: string;
    current?: number;
    onChange?: (partnerId: string, score: number) => void;
    rowIndex: number;
    totalRows: number;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const canEdit = Boolean(onChange && partnerId);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const openUpward = totalRows > 3 && rowIndex >= totalRows - 3;

    const select = (score: number, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange?.(partnerId, score);
        setOpen(false);
    };

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canEdit) return;
        setOpen(o => !o);
    };

    return (
        <div ref={wrapperRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={toggle}
                disabled={!canEdit}
                title={canEdit ? 'Clique para marcar a relevância' : 'Relevância'}
                className={`inline-flex items-center justify-center gap-0.5 focus:outline-none ${canEdit ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
            >
                {current ? (
                    <span className="flex items-center gap-0.5 text-amber-500">
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>grade</span>
                        <span className="font-bold text-xs">{current}</span>
                    </span>
                ) : (
                    <span className="text-slate-300 dark:text-slate-700 material-symbols-outlined text-[16px]">grade</span>
                )}
            </button>

            {open && (
                <div
                    className={`absolute z-50 left-1/2 -translate-x-1/2 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'} rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 p-1.5`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={(e) => select(n, e)}
                                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${current === n ? 'bg-amber-500 text-white' : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30'}`}
                            >
                                {n}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={(e) => select(0, e)}
                            title="Limpar"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// PerformanceTable principal
// ──────────────────────────────────────────────────────────────
export default function PerformanceTable({ data, sortConfig, requestSort, onRowClick, onCampaignStatusChange, onStatusChange, onRelevanceChange, variant = 'journey', pedidosMesHeader, fillHeight = true }: PerformanceTableProps) {
    const isDesempenho = variant === 'desempenho';
    const isIndicador = variant === 'indicador';
    const pedidosColLabel = pedidosMesHeader || data.find(r => r.pedidos_mes_label)?.pedidos_mes_label || 'Pedidos/mês';
    const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);

    // Colunas de campanha exibidas: "Promoções" (consolidado, na coluna
    // super_promos) + Cupons. Ofertas fica embutida em Promoções (escondida).
    const displayCampaigns = CAMPAIGN_TYPES.filter(c => c.id !== 'ofertas_da_casa');
    const campaignLabel = (c: typeof CAMPAIGN_TYPES[number]) =>
        c.id === 'super_promos' ? 'Promoções' : c.shortLabel;

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

    // Coluna Promoções: resumo dos itens promocionais (pendente/aprovado/sem item)
    const promoResumoTitle = (r?: PromoResumo) =>
        r?.detalhe?.length ? r.detalhe.map(d => `${d.campanha}: ${d.status}`).join(' · ') : undefined;

    const renderPromoResumo = (r?: PromoResumo) => {
        if (!r || (r.pendente === 0 && r.aprovado === 0 && r.rascunho === 0 && r.semItem === 0)) {
            return <span className="text-[13px] text-slate-300 dark:text-slate-600">—</span>;
        }
        return (
            <div className="inline-flex items-center">
                {PROMO_SLOTS.map(slot => {
                    const n = r[slot.key];
                    // Slot vazio ocupa o espaço mesmo assim: mantém o alinhamento da coluna.
                    if (!n) return <span key={slot.key} className="w-7" aria-hidden="true" />;
                    return (
                        <span
                            key={slot.key}
                            className={`w-7 inline-flex items-center justify-center gap-0.5 ${slot.tone}`}
                            title={`${n} ${slot.hint}`}
                        >
                            <span className="material-symbols-outlined text-[14px] leading-none">{slot.icon}</span>
                            <span className="text-[11px] font-bold tabular-nums leading-none">{n}</span>
                        </span>
                    );
                })}
            </div>
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
        <div className={`${fillHeight ? 'flex flex-1 flex-col min-h-0' : ''} px-6 pb-6 pt-2`}>
            <div className={`${fillHeight ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'} rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm`}>
                <table className={`performance-table min-w-full divide-y divide-slate-200 dark:divide-slate-700 ${isIndicador ? 'performance-table--compact' : ''}`}>
                    <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                                {isDesempenho ? (
                                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('estabelecimento')}>
                                        Estabelecimento {renderSortIcon('estabelecimento')}
                                    </th>
                                ) : (
                                    <>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('cidade')}>
                                            Cidade {renderSortIcon('cidade')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('estabelecimento')}>
                                            Estabelecimento {renderSortIcon('estabelecimento')}
                                        </th>
                                    </>
                                )}
                                {!isDesempenho && (
                                    <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('commercial_relevance')}>
                                        Relevância {renderSortIcon('commercial_relevance')}
                                    </th>
                                )}
                                <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('status')}>
                                    Status {renderSortIcon('status')}
                                </th>
                                {isIndicador ? (
                                    <>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('pedidos_mes_value')}>
                                            {pedidosColLabel} {renderSortIcon('pedidos_mes_value')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Evolução
                                        </th>
                                        {displayCampaigns.map(campaign => (
                                            <th
                                                key={campaign.id}
                                                scope="col"
                                                className="px-2 py-3.5 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[88px]"
                                                title={campaign.label}
                                            >
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <CampaignIcons icons={campaign.icons} iconClassName="text-[14px]" />
                                                    <span>{campaignLabel(campaign)}</span>
                                                </div>
                                            </th>
                                        ))}
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('risco_churn')}>
                                            Risco {renderSortIcon('risco_churn')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('analista')}>
                                            Gestor {renderSortIcon('analista')}
                                        </th>
                                    </>
                                ) : isDesempenho ? (
                                    <>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_1')}>
                                            S1 <span className="normal-case font-normal text-[10px] text-primary">(atual)</span> {renderSortIcon('week_1')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_2')}>S2 {renderSortIcon('week_2')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_3')}>S3 {renderSortIcon('week_3')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('week_4')}>S4 {renderSortIcon('week_4')}</th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('pedidos_por_dia')}>
                                            Ped/dia {renderSortIcon('pedidos_por_dia')}
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('valor_contrato')}>
                                            Contrato {renderSortIcon('valor_contrato')}
                                        </th>
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
                                        {displayCampaigns.map(campaign => (
                                            <th
                                                key={campaign.id}
                                                scope="col"
                                                className="px-2 py-3.5 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[88px]"
                                                title={campaign.label}
                                            >
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <CampaignIcons icons={campaign.icons} iconClassName="text-[14px]" />
                                                    <span>{campaignLabel(campaign)}</span>
                                                </div>
                                            </th>
                                        ))}
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
                                const isTopPriority = index < 10 && (
                                    isDesempenho
                                        ? ((row.risco_churn ?? 0) >= 4 || row.mrr_em_risco)
                                        : isIndicador
                                            ? ((row.risco_churn ?? 0) >= 4)
                                            : row.priority_stars >= 4
                                );
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
                                        key={row.estab_id ? `id:${row.estab_id}` : `${row.estabelecimento}-${row.cidade}-${index}`}
                                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${isTopPriority ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}
                                        onClick={() => handleRowClick(row)}
                                    >
                                        {isDesempenho ? (
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6 relative">
                                                {isTopPriority && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
                                                <div className="flex items-center gap-3">
                                                    {row.logo_url ? (
                                                        <img src={row.logo_url} alt={row.estabelecimento} className="size-10 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm object-cover shrink-0" />
                                                    ) : (
                                                        <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                                                            <span className="material-symbols-outlined text-[20px]">store</span>
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="truncate max-w-[220px] text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors" title={row.estabelecimento}>
                                                            {row.estabelecimento}
                                                        </div>
                                                        {row.cidade && (
                                                            <div className="truncate max-w-[220px] mt-0.5 text-[11px] font-normal text-slate-400 dark:text-slate-500" title={row.cidade}>
                                                                {row.cidade}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
                                        {!isDesempenho && (
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                                <RelevanceCell
                                                    partnerId={row.estab_id ?? ''}
                                                    current={row.commercial_relevance}
                                                    onChange={onRelevanceChange}
                                                    rowIndex={index}
                                                    totalRows={data.length}
                                                />
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
                                        {isIndicador ? (
                                            <>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    <span className={`font-bold text-lg ${(row.total_pedidos ?? 0) <= 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                                        {row.pedidos_mes_raw && row.pedidos_mes_raw !== '—'
                                                            ? row.pedidos_mes_raw
                                                            : (row.total_pedidos ?? 0)}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    <Sparkline data={row.gmv_mensal} />
                                                </td>
                                                {displayCampaigns.map(campaign => {
                                                    if (campaign.id === 'super_promos') {
                                                        return (
                                                            <td key={campaign.id} className="whitespace-nowrap px-2 py-4 text-sm text-center" title={promoResumoTitle(row.promo_resumo)}>
                                                                {renderPromoResumo(row.promo_resumo)}
                                                            </td>
                                                        );
                                                    }
                                                    const status = getRowCampaignStatus(row, campaign.id);
                                                    return (
                                                        <td key={campaign.id} className="whitespace-nowrap px-2 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                                            <StatusDropdown
                                                                rowIndex={index}
                                                                totalRows={data.length}
                                                                field={campaign.id}
                                                                partnerId={partnerId}
                                                                currentStatus={status}
                                                                activeDropdown={activeDropdown}
                                                                setActiveDropdown={setActiveDropdown}
                                                                onCampaignStatusChange={onCampaignStatusChange}
                                                                onStatusChange={onStatusChange}
                                                            >
                                                                {renderIndicadorBadge(status)}
                                                            </StatusDropdown>
                                                        </td>
                                                    );
                                                })}
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    {renderStars(row.risco_churn ?? row.priority_stars)}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">
                                                    {row.analista || '—'}
                                                </td>
                                            </>
                                        ) : isDesempenho ? (
                                            <>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center font-medium text-slate-800 dark:text-slate-200">{row.week_1}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_2}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_3}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-slate-600 dark:text-slate-300">{row.week_4}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    <span className={`font-semibold ${(row.pedidos_por_dia ?? 0) < 1 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        {(row.pedidos_por_dia ?? 0).toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                                    {row.valor_contrato != null ? (
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <span className="font-medium text-slate-800 dark:text-slate-200">{formatarMoedaBRL(row.valor_contrato)}</span>
                                                            {row.mrr_em_risco && (
                                                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-200 dark:ring-red-800/40">
                                                                    MRR risco
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
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

                                        {displayCampaigns.map(campaign => {
                                            if (campaign.id === 'super_promos') {
                                                return (
                                                    <td key={campaign.id} className="whitespace-nowrap px-2 py-4 text-sm text-center" title={promoResumoTitle(row.promo_resumo)}>
                                                        {renderPromoResumo(row.promo_resumo)}
                                                    </td>
                                                );
                                            }
                                            const status = getRowCampaignStatus(row, campaign.id);
                                            return (
                                                <td key={campaign.id} className="whitespace-nowrap px-2 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                                                    <StatusDropdown
                                                        rowIndex={index}
                                                        totalRows={data.length}
                                                        field={campaign.id}
                                                        partnerId={partnerId}
                                                        currentStatus={status}
                                                        activeDropdown={activeDropdown}
                                                        setActiveDropdown={setActiveDropdown}
                                                        onCampaignStatusChange={onCampaignStatusChange}
                                                        onStatusChange={onStatusChange}
                                                    >
                                                        {renderIndicadorBadge(status)}
                                                    </StatusDropdown>
                                                </td>
                                            );
                                        })}

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
    );
}
