import { useState, useMemo, useRef, useEffect } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CrmPartner, CrmPipelineStage, CrmParseInfo } from '../types/crm';
import { useCrmNotes } from '../hooks/useCrmNotes';
import type { PromoStatus } from '../hooks/useStatusOverride';
import { crmCitiesMatch, formatBRL, normalizeCrmCity } from '../utils/crmData';
import { useOfertasDaCasa } from '../hooks/useOfertasDaCasa';
import {
    computeTopCitiesByGmv,
    getOfertasDaCasaStatusMeta,
    isTopPriorityCity,
    OFERTAS_DA_CASA_CAMPAIGN,
    OFERTAS_DA_CASA_STATUS_OPTIONS,
} from '../config/crmCampaigns';
import { isParceiroContratoAtivo, normalizeParceiroContratoStatus } from '../utils/parceirosSheet';
import { useCityIds } from '../hooks/useCityIds';
import type { OfertasDaCasaStatus } from '../types/crmCampaigns';

interface CrmViewProps {
    partners: CrmPartner[];
    parseInfo: CrmParseInfo | null;
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
    searchQuery?: string;
    cityFilter?: string;
    setCityFilter?: (city: string) => void;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange?: (partnerId: string, newStatus: PromoStatus) => void;
}

const PIPELINE_TABS: { id: CrmPipelineStage; label: string; icon: string }[] = [
    { id: 'all', label: 'Todos', icon: 'view_list' },
    { id: 'aguardando', label: 'Não ofertado', icon: 'campaign' },
    { id: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top' },
    { id: 'negado', label: 'Negado', icon: 'block' },
    { id: 'ativo', label: 'Promo ativa', icon: 'check_circle' },
];

const STATUS_OPTIONS: { value: PromoStatus; icon: string; label: string; color: string; badge: string }[] = [
    { value: 'aguardando', icon: '🔴', label: 'Não ofertado', color: 'text-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { value: 'ofertei', icon: '🟠', label: 'Aguardando retorno', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    { value: 'negado', icon: '⛔', label: 'Negado', color: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    { value: 'ativo', icon: '✅', label: 'Promo ativa', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { value: 'inativo', icon: '➖', label: 'Inativo', color: 'text-slate-400', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500' },
];

function getStatusMeta(status?: PromoStatus) {
    return STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[0];
}

function StatusDropdown({
    partnerId,
    currentStatus,
    onStatusChange,
    onPartnerStatusChange,
}: {
    partnerId: string;
    currentStatus?: PromoStatus;
    onStatusChange?: CrmViewProps['onStatusChange'];
    onPartnerStatusChange?: CrmViewProps['onPartnerStatusChange'];
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const meta = getStatusMeta(currentStatus);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer hover:opacity-80 transition-opacity ${meta.badge}`}
            >
                <span>{meta.icon}</span>
                {meta.label}
                <span className="material-symbols-outlined text-[14px] opacity-60">expand_more</span>
            </button>
            {open && (
                <div className="absolute z-50 left-0 mt-1 w-48 rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
                    {STATUS_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onStatusChange?.(partnerId, 'promo_status_override', opt.value);
                                onPartnerStatusChange?.(partnerId, opt.value);
                                setOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 ${opt.color} ${currentStatus === opt.value ? 'bg-slate-50 dark:bg-slate-700/60 font-bold' : ''}`}
                        >
                            <span>{opt.icon}</span>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function partnerStatusBadge(status: string) {
    const norm = normalizeParceiroContratoStatus(status);
    switch (norm) {
        case 'ativo':
            return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
        case 'pendente':
            return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
        case 'suspenso':
            return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        case 'cancelado':
            return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
}

export default function CrmView({
    partners,
    parseInfo,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
    searchQuery = '',
    cityFilter: cityFilterProp,
    setCityFilter: setCityFilterProp,
    onStatusChange,
    onPartnerStatusChange,
}: CrmViewProps) {
    const { getNote, upsertNote, registerContact } = useCrmNotes();
    const { getStatus: getOfertasStatus, setStatus: setOfertasStatus } = useOfertasDaCasa();
    const { getCmsPromoUrl } = useCityIds();
    const topCities = useMemo(() => computeTopCitiesByGmv(partners, 5), [partners]);
    const [stageFilter, setStageFilter] = useState<CrmPipelineStage>('all');
    const [internalCityFilter, setInternalCityFilter] = useState('');
    const cityFilter = setCityFilterProp !== undefined ? (cityFilterProp ?? '') : internalCityFilter;
    const setCityFilter = setCityFilterProp ?? setInternalCityFilter;
    const [statusParceiroFilter, setStatusParceiroFilter] = useState<'all' | 'ativo' | 'pendente' | 'suspenso' | 'cancelado'>('all');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editNotes, setEditNotes] = useState('');
    const [editFollowUp, setEditFollowUp] = useState('');
    const [sortKey, setSortKey] = useState<'gmv' | 'followUp' | 'lastContact' | 'cidade'>('gmv');
    const [localStatus, setLocalStatus] = useState<Record<string, PromoStatus>>({});

    const getPromoStatus = (row: CrmPartner) => localStatus[row.partnerId] ?? row.promoStatus;

    const cities = useMemo(() => {
        const seen = new Map<string, string>();
        partners.forEach(row => {
            const city = normalizeCrmCity(row.cidade);
            if (!city) return;
            const key = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (!seen.has(key)) seen.set(key, city);
        });
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [partners]);

    const activeCountByCity = useMemo(() => {
        const map = new Map<string, number>();
        partners.forEach(p => {
            if (!isParceiroContratoAtivo(p.statusParceiro)) return;
            const city = normalizeCrmCity(p.cidade);
            if (!city) return;
            map.set(city, (map.get(city) ?? 0) + 1);
        });
        return map;
    }, [partners]);

    const partnersInCity = useMemo(() => {
        if (!cityFilter) return partners;
        return partners.filter(row => crmCitiesMatch(row.cidade, cityFilter));
    }, [partners, cityFilter]);

    const activePartnersInCity = useMemo(
        () => partnersInCity.filter(row => isParceiroContratoAtivo(row.statusParceiro)),
        [partnersInCity],
    );

    const filtered = useMemo(() => {
        return partnersInCity.filter(row => {
            const promoStatus = getPromoStatus(row);
            if (stageFilter !== 'all' && promoStatus !== stageFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!row.estabelecimento.toLowerCase().includes(q) && !row.cidade.toLowerCase().includes(q)) return false;
            }
            if (statusParceiroFilter !== 'all') {
                const norm = normalizeParceiroContratoStatus(row.statusParceiro);
                if (norm !== statusParceiroFilter) return false;
            }
            return true;
        });
    }, [partnersInCity, stageFilter, searchQuery, statusParceiroFilter, localStatus]);

    const sorted = useMemo(() => {
        const list = [...filtered];
        list.sort((a, b) => {
            const aNote = getNote(a.partnerId);
            const bNote = getNote(b.partnerId);

            if (sortKey === 'gmv') {
                const aGmv = a.indiceGmv ?? -1;
                const bGmv = b.indiceGmv ?? -1;
                return bGmv - aGmv;
            }
            if (sortKey === 'cidade') return a.cidade.localeCompare(b.cidade, 'pt-BR');
            if (sortKey === 'followUp') {
                const aDate = aNote?.nextFollowUp ? new Date(aNote.nextFollowUp).getTime() : Infinity;
                const bDate = bNote?.nextFollowUp ? new Date(bNote.nextFollowUp).getTime() : Infinity;
                return aDate - bDate;
            }
            if (sortKey === 'lastContact') {
                const aDate = aNote?.lastContact ? new Date(aNote.lastContact).getTime() : 0;
                const bDate = bNote?.lastContact ? new Date(bNote.lastContact).getTime() : 0;
                return aDate - bDate;
            }
            return 0;
        });
        return list;
    }, [filtered, sortKey, getNote]);

    const kpis = useMemo(() => {
        const active = activePartnersInCity.filter(r => getPromoStatus(r) === 'ativo' || r.hasPromoAtiva).length;
        const pending = activePartnersInCity.filter(r => getPromoStatus(r) === 'aguardando').length;
        const offered = activePartnersInCity.filter(r => getPromoStatus(r) === 'ofertei').length;
        const denied = activePartnersInCity.filter(r => getPromoStatus(r) === 'negado').length;
        const semCupom = activePartnersInCity.filter(r => !r.hasCupomAtivo).length;
        const overdue = activePartnersInCity.filter(r => {
            const note = getNote(r.partnerId);
            if (!note?.nextFollowUp) return false;
            const d = parseISO(note.nextFollowUp);
            return isPast(d) && !isToday(d);
        }).length;
        return {
            active,
            pending,
            offered,
            denied,
            semCupom,
            overdue,
            total: activePartnersInCity.length,
            cities: cities.length,
        };
    }, [activePartnersInCity, getNote, cities.length, localStatus]);

    const stageCounts = useMemo(() => {
        const counts: Record<CrmPipelineStage, number> = {
            all: activePartnersInCity.length,
            aguardando: 0,
            ofertei: 0,
            negado: 0,
            inativo: 0,
            ativo: 0,
        };
        activePartnersInCity.forEach(r => {
            const s = getPromoStatus(r);
            if (s in counts) counts[s as CrmPipelineStage]++;
        });
        return counts;
    }, [activePartnersInCity, localStatus]);

    const handlePartnerStatusChange = (partnerId: string, newStatus: PromoStatus) => {
        setLocalStatus(prev => ({ ...prev, [partnerId]: newStatus }));
        onPartnerStatusChange?.(partnerId, newStatus);
    };

    const openEdit = (id: string) => {
        const note = getNote(id);
        setEditingId(id);
        setEditNotes(note?.notes ?? '');
        setEditFollowUp(note?.nextFollowUp ?? '');
    };

    const saveEdit = () => {
        if (!editingId) return;
        upsertNote(editingId, { notes: editNotes, nextFollowUp: editFollowUp || null });
        setEditingId(null);
    };

    const formatDate = (iso: string | null | undefined) => {
        if (!iso) return '—';
        try {
            return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
        } catch {
            return iso;
        }
    };

    const followUpClass = (iso: string | null | undefined) => {
        if (!iso) return 'text-slate-400';
        try {
            const d = parseISO(iso);
            if (isPast(d) && !isToday(d)) return 'text-red-600 font-bold';
            if (isToday(d)) return 'text-amber-600 font-bold';
            return 'text-slate-600 dark:text-slate-400';
        } catch {
            return 'text-slate-400';
        }
    };

    const ofertasPendentesTop5 = useMemo(() => {
        return activePartnersInCity.filter(row => {
            if (!isTopPriorityCity(row.cidade, topCities)) return false;
            const st = getOfertasStatus(row.partnerId);
            return st !== 'participando';
        }).length;
    }, [activePartnersInCity, topCities, getOfertasStatus]);

    const gmvHeader = partners[0]?.gmvMesLabel || parseInfo?.gmvColumn || 'GMV';

    const formatGmv = (row: CrmPartner) => {
        if (row.indiceGmv != null && row.indiceGmv > 0) return formatBRL(row.indiceGmv);
        if (row.indiceGmvRaw && row.indiceGmvRaw !== '—') return row.indiceGmvRaw;
        return '—';
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            CRM — Prospecção de Promoções
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Parceiros do INDICADOR_FORMATADO · status via aba PARCEIROS · cruzamento PROMO-ESPECIAL e CUPOM-PARCEIRO.
                        </p>
                        {parseInfo && (
                            <p className="text-[11px] text-slate-400 mt-1">
                                {cityFilter
                                    ? `${kpis.total.toLocaleString('pt-BR')} parceiros ativos em ${cityFilter}`
                                    : `${kpis.total.toLocaleString('pt-BR')} parceiros ativos · ${kpis.cities} cidades`}
                                {parseInfo.gmvColumn ? ` · GMV: coluna "${parseInfo.gmvColumn}"` : ''}
                                {parseInfo.parceirosRows > 0
                                    ? ` · status PARCEIROS: ${parseInfo.parceirosMatched}/${parseInfo.parsedPartners} casados`
                                    : ''}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isLoading || isRefreshing}
                            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-lg ${isLoading || isRefreshing ? 'animate-spin text-primary' : ''}`}>sync</span>
                            {isLoading || isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
                        </button>
                        {lastSyncTime && (
                            <span className="text-xs text-slate-400">
                                Última sync: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                        )}
                        {managerFilter && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-2 text-xs font-medium">
                                <span className="material-symbols-outlined text-[16px]">info</span>
                                Gestor na sessão: {managerFilter} (CRM exibe todos os parceiros)
                            </span>
                        )}
                    </div>
                </div>

                {isUsingCache && (
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-400 text-sm">
                        <span className="material-symbols-outlined shrink-0">cloud_off</span>
                        Exibindo cache local. Conecte ao Gateway e clique em Atualizar.
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-800 dark:text-red-400 text-sm">
                        <span className="material-symbols-outlined shrink-0">error</span>
                        <div>
                            <p>{error}</p>
                            {parseInfo && parseInfo.indicadorRows > 0 && parseInfo.parsedPartners === 0 && (
                                <p className="mt-1 text-xs opacity-90">
                                    Cabeçalhos detectados: {parseInfo.indicadorHeaders.join(', ') || '(nenhum)'}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">location_city</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Cidade</span>
                    </div>
                    <select
                        value={cityFilter}
                        onChange={e => {
                            setCityFilter(e.target.value);
                            setStageFilter('all');
                        }}
                        className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200 font-medium"
                    >
                        <option value="">Todas as cidades ({cities.length})</option>
                        {cities.map(c => (
                            <option key={c} value={c}>
                                {c} ({activeCountByCity.get(c) ?? 0} ativos)
                            </option>
                        ))}
                    </select>
                    {cityFilter && (
                        <button
                            type="button"
                            onClick={() => {
                                setCityFilter('');
                                setStageFilter('all');
                            }}
                            className="shrink-0 text-xs font-semibold text-primary hover:underline px-2"
                        >
                            Limpar filtro
                        </button>
                    )}
                </div>

                {topCities.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 text-sm">
                        <span className="material-symbols-outlined text-amber-600 shrink-0">home_work</span>
                        <p className="text-amber-900 dark:text-amber-200 flex-1">
                            <span className="font-bold">Ofertas da casa</span>
                            {' · '}Top 5 GMV: {topCities.join(', ')}
                            {ofertasPendentesTop5 > 0 && (
                                <span className="ml-1 font-semibold">
                                    — {ofertasPendentesTop5.toLocaleString('pt-BR')} parceiro(s) ativo(s) ainda sem participação
                                </span>
                            )}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {[
                        { label: 'Parceiros ativos', value: kpis.total, icon: 'store', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
                        { label: 'Não ofertado', value: kpis.pending, icon: 'campaign', color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
                        { label: 'Aguardando retorno', value: kpis.offered, icon: 'hourglass_top', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
                        { label: 'Promo ativa', value: kpis.active, icon: 'check_circle', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
                        { label: 'Sem cupom', value: kpis.semCupom, icon: 'confirmation_number', color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20' },
                        { label: 'Follow-up atrasado', value: kpis.overdue, icon: 'event_busy', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
                    ].map(kpi => (
                        <div key={kpi.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                            <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                                <span className="material-symbols-outlined text-[22px]">{kpi.icon}</span>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{kpi.value.toLocaleString('pt-BR')}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kpi.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={statusParceiroFilter}
                        onChange={e => setStatusParceiroFilter(e.target.value as typeof statusParceiroFilter)}
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200"
                    >
                        <option value="all">Status parceiro: Todos</option>
                        <option value="ativo">Somente ativos</option>
                        <option value="pendente">Somente pendentes</option>
                        <option value="suspenso">Somente suspensos</option>
                        <option value="cancelado">Somente cancelados</option>
                    </select>
                    <select
                        value={sortKey}
                        onChange={e => setSortKey(e.target.value as typeof sortKey)}
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200"
                    >
                        <option value="gmv">Ordenar: Índice GMV</option>
                        <option value="cidade">Ordenar: Cidade</option>
                        <option value="followUp">Ordenar: Próximo follow-up</option>
                        <option value="lastContact">Ordenar: Último contato</option>
                    </select>
                </div>

                <div className="flex gap-2 overflow-x-auto scrollbar-hide border-b border-slate-200 dark:border-slate-700 pb-0">
                    {PIPELINE_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setStageFilter(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                stageFilter === tab.id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            {tab.label}
                            <span className={`py-0.5 px-2 rounded-full text-xs ${stageFilter === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                                {stageCounts[tab.id].toLocaleString('pt-BR')}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Exibindo <span className="font-bold text-slate-900 dark:text-white">{sorted.length.toLocaleString('pt-BR')}</span>
                            {' '}de{' '}
                            <span className="font-bold">{partnersInCity.length.toLocaleString('pt-BR')}</span>
                            {' '}parceiro{sorted.length !== 1 ? 's' : ''}
                            {cityFilter ? (
                                <> em <span className="font-bold text-primary">{cityFilter}</span></>
                            ) : null}
                        </p>
                        {cityFilter && sorted.length !== partnersInCity.length && (
                            <span className="text-[10px] text-slate-500">funil / busca ativos</span>
                        )}
                    </div>
                    {isLoading && partners.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-16">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
                            <p className="text-slate-500 text-sm">Carregando INDICADOR_FORMATADO, PARCEIROS, PROMO-ESPECIAL e CUPOM-PARCEIRO…</p>
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-16 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4">handshake</span>
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Nenhum parceiro neste recorte</h3>
                            <p className="text-sm text-slate-500 mt-1">Altere os filtros ou mude de aba no funil.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[1250px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Parceiro</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cidade</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gestor</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">GMV {gmvHeader}</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Promoção</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Cupom PARC.</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ofertas da casa</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Último contato</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Follow-up</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Notas</th>
                                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {sorted.map(row => {
                                        const id = row.partnerId;
                                        const note = getNote(id);
                                        const hasNotes = Boolean(note?.notes?.trim());
                                        const promoStatus = getPromoStatus(row);

                                        return (
                                            <tr key={`${id}-${row.cidade}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        {row.logoUrl ? (
                                                            <img src={row.logoUrl} alt="" className="w-8 h-8 rounded-lg border border-slate-200 object-cover" />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
                                                                {(row.estabelecimento || row.cidade || '??').slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.estabelecimento || row.estabId || '—'}</p>
                                                            {row.estabId && (
                                                                <p className="text-[10px] text-slate-400 font-mono">#{row.estabId}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{row.cidade}</td>
                                                <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{row.analista || '—'}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${partnerStatusBadge(row.statusParceiro)}`}>
                                                        {row.statusParceiro || '—'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                    {formatGmv(row)}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-col gap-1 min-w-[140px]">
                                                        <StatusDropdown
                                                            partnerId={id}
                                                            currentStatus={promoStatus}
                                                            onStatusChange={onStatusChange}
                                                            onPartnerStatusChange={handlePartnerStatusChange}
                                                        />
                                                        <span className="text-[10px] text-slate-500 font-mono" title="INDICADOR · PROMOÇÃO">
                                                            {row.promoResumo}
                                                        </span>
                                                        {row.promoItensAtivos > 0 && (
                                                            <span className="text-[9px] font-bold text-emerald-600">
                                                                {row.promoItensAtivos} item(ns) em PROMO-ESPECIAL
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            row.hasCupomAtivo
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                                        }`}>
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                {row.hasCupomAtivo ? 'check' : 'close'}
                                                            </span>
                                                            {row.hasCupomAtivo ? 'Ativo' : 'Sem cupom'}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-mono text-center" title="INDICADOR · CUPOM PARC.">
                                                            {row.cupomResumo}
                                                        </span>
                                                        {row.cupomCount > 0 && (
                                                            <span className="text-[9px] text-violet-600 font-semibold">
                                                                {row.cupomCount} cupom(ns) cadastrado(s)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-col items-center gap-1 min-w-[130px]">
                                                        {isTopPriorityCity(row.cidade, topCities) && (
                                                            <span className="text-[9px] font-bold uppercase text-amber-600">Top 5 GMV</span>
                                                        )}
                                                        <select
                                                            value={getOfertasStatus(id)}
                                                            onChange={e => setOfertasStatus(id, e.target.value as OfertasDaCasaStatus, 'manual')}
                                                            className={`w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold px-2 ${getOfertasDaCasaStatusMeta(getOfertasStatus(id)).badge}`}
                                                        >
                                                            {OFERTAS_DA_CASA_STATUS_OPTIONS.map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                        <a
                                                            href={getCmsPromoUrl(OFERTAS_DA_CASA_CAMPAIGN.cmsBaseUrl, row.cidade)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
                                                            title="Abrir campanha Ofertas da casa no CMS"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">launch</span>
                                                            CMS
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                                                    {formatDate(note?.lastContact)}
                                                </td>
                                                <td className={`py-3 px-4 text-sm ${followUpClass(note?.nextFollowUp)}`}>
                                                    {formatDate(note?.nextFollowUp)}
                                                </td>
                                                <td className="py-3 px-4 max-w-[160px]">
                                                    {hasNotes ? (
                                                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate" title={note?.notes}>
                                                            {note?.notes}
                                                        </p>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">—</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => registerContact(id)}
                                                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                                            title="Registrar contato hoje"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">call</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEdit(id)}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                            title="Editar notas e follow-up"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit_note</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {editingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditingId(null)}>
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notas e follow-up</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Próximo follow-up</label>
                            <input
                                type="date"
                                value={editFollowUp}
                                onChange={e => setEditFollowUp(e.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notas</label>
                            <textarea
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                rows={4}
                                placeholder="Ex: Ofereci promo de frete grátis, aguardando resposta do dono..."
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
