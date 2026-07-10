import { useState, useMemo } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CrmPartner, CrmParseInfo, CrmPipelineStage } from '../types/crm';
import { useCrmNotes } from '../hooks/useCrmNotes';
import { useCrmViewMode } from '../hooks/useCrmViewMode';
import type { PromoStatus } from '../hooks/useStatusOverride';
import type { CampaignTypeId } from '../config/campaignTypes';
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_IDS, getCampaignConfig } from '../config/campaignTypes';
import { crmCitiesMatch, normalizeCrmCity } from '../utils/crmData';
import { useOfertasDaCasa } from '../hooks/useOfertasDaCasa';
import { computeTopCitiesByGmv, isTopPriorityCity } from '../config/crmCampaigns';
import { isParceiroContratoAtivo, normalizeParceiroContratoStatus } from '../utils/parceirosSheet';
import { useCityIds } from '../hooks/useCityIds';
import {
    computeFollowUpAlerts,
    filterActiveCrmPartners,
    filterCrmPartners,
    getPromoStatusForPartner,
} from '../utils/crmPipeline';
import CrmViewModeSwitcher from './crm/CrmViewModeSwitcher';
import CrmFollowUpAlerts from './crm/CrmFollowUpAlerts';
import CrmPipelineDashboard from './crm/CrmPipelineDashboard';
import CrmKanbanBoard from './crm/CrmKanbanBoard';
import CrmListView from './crm/CrmListView';
import CrmCalendarView from './crm/CrmCalendarView';
import CrmTableView from './crm/CrmTableView';

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
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
}

const PIPELINE_TABS: { id: CrmPipelineStage; label: string; icon: string }[] = [
    { id: 'all', label: 'Todos', icon: 'view_list' },
    { id: 'aguardando', label: 'Não ofertado', icon: 'campaign' },
    { id: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top' },
    { id: 'negado', label: 'Negado', icon: 'block' },
    { id: 'ativo', label: 'Promo ativa', icon: 'check_circle' },
];

const CAMPAIGN_FILTER_STORAGE_KEY = 'crm_campaign_filter_v1';

/** Rótulo do estágio "ativo" conforme a campanha selecionada */
const ACTIVE_STAGE_LABEL: Record<CampaignTypeId, string> = {
    super_promos: 'Promo ativa',
    ofertas_da_casa: 'Participando',
    cupons_destaque: 'Cupom ativo',
};

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
    onCampaignStatusChange,
}: CrmViewProps) {
    const { getNote, upsertNote, registerContact } = useCrmNotes();
    const { getStatus: getOfertasStatus, setStatus: setOfertasStatus } = useOfertasDaCasa();
    const { getCmsPromoUrl } = useCityIds();
    const { viewMode, setViewMode } = useCrmViewMode();

    const topCities = useMemo(() => computeTopCitiesByGmv(partners, 5), [partners]);
    const [stageFilter, setStageFilter] = useState<CrmPipelineStage>('all');
    const [internalCityFilter, setInternalCityFilter] = useState('');
    const cityFilter = setCityFilterProp !== undefined ? (cityFilterProp ?? '') : internalCityFilter;
    const setCityFilter = setCityFilterProp ?? setInternalCityFilter;
    const [campaignFilter, setCampaignFilter] = useState<CampaignTypeId>(() => {
        const saved = localStorage.getItem(CAMPAIGN_FILTER_STORAGE_KEY);
        return saved && (CAMPAIGN_TYPE_IDS as string[]).includes(saved) ? (saved as CampaignTypeId) : 'super_promos';
    });
    const [statusParceiroFilter, setStatusParceiroFilter] = useState<'all' | 'ativo' | 'pendente' | 'suspenso' | 'cancelado'>('all');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editNotes, setEditNotes] = useState('');
    const [editFollowUp, setEditFollowUp] = useState('');
    const [sortKey, setSortKey] = useState<'gmv' | 'followUp' | 'lastContact' | 'cidade'>('gmv');
    // Overrides otimistas de status por campanha (evita vazar status entre CRMs distintos)
    const [localStatusByCampaign, setLocalStatusByCampaign] = useState<Record<string, Record<string, PromoStatus>>>({});
    const localStatus = useMemo(
        () => localStatusByCampaign[campaignFilter] ?? {},
        [localStatusByCampaign, campaignFilter],
    );
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const campaignConfig = getCampaignConfig(campaignFilter);
    const getPromoStatus = (row: CrmPartner) => getPromoStatusForPartner(row, localStatus, campaignFilter);

    const changeCampaign = (id: CampaignTypeId) => {
        setCampaignFilter(id);
        localStorage.setItem(CAMPAIGN_FILTER_STORAGE_KEY, id);
        setStageFilter('all');
    };

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

    const activePartners = useMemo(() => filterActiveCrmPartners(partners), [partners]);

    const partnersInCity = useMemo(() => {
        if (!cityFilter) return activePartners;
        return activePartners.filter(row => crmCitiesMatch(row.cidade, cityFilter));
    }, [activePartners, cityFilter]);

    const baseFiltered = useMemo(() => {
        return filterCrmPartners(partnersInCity, {
            managerFilter,
            searchQuery,
            stageFilter: viewMode === 'table' ? stageFilter : 'all',
            localStatus,
            campaign: campaignFilter,
            crmCitiesMatch,
        }).filter(row => {
            if (statusParceiroFilter === 'all') return true;
            return normalizeParceiroContratoStatus(row.statusParceiro) === statusParceiroFilter;
        });
    }, [partnersInCity, managerFilter, searchQuery, stageFilter, localStatus, campaignFilter, statusParceiroFilter, viewMode]);

    const stageFiltered = useMemo(() => {
        if (viewMode === 'table' || stageFilter === 'all') return baseFiltered;
        return baseFiltered.filter(row => getPromoStatus(row) === stageFilter);
    }, [baseFiltered, stageFilter, viewMode, localStatus]);

    const sorted = useMemo(() => {
        const list = [...stageFiltered];
        list.sort((a, b) => {
            const aNote = getNote(a.partnerId);
            const bNote = getNote(b.partnerId);
            if (sortKey === 'gmv') return (b.indiceGmv ?? -1) - (a.indiceGmv ?? -1);
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
    }, [stageFiltered, sortKey, getNote]);

    const followUpAlerts = useMemo(
        () => computeFollowUpAlerts(partnersInCity.filter(p => !managerFilter || p.analista === managerFilter), getNote),
        [partnersInCity, managerFilter, getNote],
    );

    const kpis = useMemo(() => {
        const scope = managerFilter
            ? partnersInCity.filter(r => r.analista === managerFilter)
            : partnersInCity;
        const active = scope.filter(r => getPromoStatus(r) === 'ativo').length;
        const pending = scope.filter(r => getPromoStatus(r) === 'aguardando').length;
        const offered = scope.filter(r => getPromoStatus(r) === 'ofertei').length;
        const denied = scope.filter(r => getPromoStatus(r) === 'negado').length;
        const overdue = scope.filter(r => {
            const note = getNote(r.partnerId);
            if (!note?.nextFollowUp) return false;
            const d = parseISO(note.nextFollowUp);
            return isPast(d) && !isToday(d);
        }).length;
        return { active, pending, offered, denied, overdue, total: scope.length, cities: cities.length };
    }, [partnersInCity, managerFilter, getNote, cities.length, localStatus, campaignFilter]);

    const stageCounts = useMemo(() => {
        const scope = managerFilter
            ? partnersInCity.filter(r => r.analista === managerFilter)
            : partnersInCity;
        const counts: Record<CrmPipelineStage, number> = {
            all: scope.length, aguardando: 0, ofertei: 0, negado: 0, inativo: 0, ativo: 0,
        };
        scope.forEach(r => {
            const s = getPromoStatus(r);
            if (s in counts) counts[s as CrmPipelineStage]++;
        });
        return counts;
    }, [partnersInCity, managerFilter, localStatus, campaignFilter]);

    const handlePartnerStatusChange = (partnerId: string, newStatus: PromoStatus) => {
        setLocalStatusByCampaign(prev => ({
            ...prev,
            [campaignFilter]: { ...(prev[campaignFilter] ?? {}), [partnerId]: newStatus },
        }));
        onPartnerStatusChange?.(partnerId, newStatus);
    };

    const openEdit = (id: string) => {
        const note = getNote(id);
        setEditingId(id);
        setEditNotes(note?.notes ?? '');
        setEditFollowUp(note?.nextFollowUp ?? '');
        setHighlightId(id);
    };

    const saveEdit = () => {
        if (!editingId) return;
        upsertNote(editingId, { notes: editNotes, nextFollowUp: editFollowUp || null });
        setEditingId(null);
    };

    const handleAlertPartnerClick = (partnerId: string) => {
        openEdit(partnerId);
        setViewMode('list');
    };

    const ofertasPendentesTop5 = useMemo(() => {
        return partnersInCity.filter(row => {
            if (!isTopPriorityCity(row.cidade, topCities)) return false;
            return getOfertasStatus(row.partnerId) !== 'participando';
        }).length;
    }, [partnersInCity, topCities, getOfertasStatus]);

    const gmvHeader = partners[0]?.gmvMesLabel || parseInfo?.gmvColumn || 'GMV';

    const dashboardPartners = useMemo(() => {
        if (!managerFilter) return partnersInCity;
        return partnersInCity.filter(r => r.analista === managerFilter);
    }, [partnersInCity, managerFilter]);

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            CRM — Prospecção de Promoções
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 font-semibold text-primary">
                                <span className="material-symbols-outlined text-[16px]">{campaignConfig.icon}</span>
                                {campaignConfig.label}
                            </span>
                            <span className="text-slate-400">· Pipeline multi-visão · Kanban, lista, calendário e dashboard.</span>
                        </p>
                        {parseInfo && (
                            <p className="text-[11px] text-slate-400 mt-1">
                                {cityFilter
                                    ? `${kpis.total.toLocaleString('pt-BR')} parceiros ativos em ${cityFilter}`
                                    : `${kpis.total.toLocaleString('pt-BR')} parceiros ativos · ${kpis.cities} cidades`}
                                {managerFilter ? ` · Gestor: ${managerFilter}` : ''}
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
                    </div>
                </div>

                <CrmViewModeSwitcher viewMode={viewMode} onChange={setViewMode} />

                {isUsingCache && (
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-400 text-sm">
                        <span className="material-symbols-outlined shrink-0">cloud_off</span>
                        Exibindo cache local. Conecte ao Gateway e clique em Atualizar.
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-800 dark:text-red-400 text-sm">
                        <span className="material-symbols-outlined shrink-0">error</span>
                        <p>{error}</p>
                    </div>
                )}

                <CrmFollowUpAlerts alerts={followUpAlerts} onPartnerClick={handleAlertPartnerClick} />

                <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Qual CRM você vai trabalhar?</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {CAMPAIGN_TYPES.map(c => {
                            const selected = campaignFilter === c.id;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => changeCampaign(c.id)}
                                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                                        selected
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-[22px] ${selected ? 'text-primary' : 'text-slate-400'}`}>{c.icon}</span>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-bold truncate ${selected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>{c.label}</p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {c.id === 'super_promos' ? 'Promoção subsidiada' : c.id === 'ofertas_da_casa' ? 'Ofertas da casa' : 'Cupons de destaque'}
                                        </p>
                                    </div>
                                    {selected && <span className="material-symbols-outlined text-primary text-[18px] ml-auto shrink-0">check_circle</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">location_city</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Cidade</span>
                    </div>
                    <select
                        value={cityFilter}
                        onChange={e => { setCityFilter(e.target.value); setStageFilter('all'); }}
                        className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200 font-medium"
                    >
                        <option value="">Todas as cidades ({cities.length})</option>
                        {cities.map(c => (
                            <option key={c} value={c}>{c} ({activeCountByCity.get(c) ?? 0} ativos)</option>
                        ))}
                    </select>
                    {cityFilter && (
                        <button type="button" onClick={() => { setCityFilter(''); setStageFilter('all'); }} className="shrink-0 text-xs font-semibold text-primary hover:underline px-2">
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
                                <span className="ml-1 font-semibold">— {ofertasPendentesTop5.toLocaleString('pt-BR')} pendente(s)</span>
                            )}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {[
                        { label: 'Parceiros ativos', value: kpis.total, icon: 'store', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
                        { label: 'Não ofertado', value: kpis.pending, icon: 'campaign', color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
                        { label: 'Aguardando retorno', value: kpis.offered, icon: 'hourglass_top', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
                        { label: ACTIVE_STAGE_LABEL[campaignFilter], value: kpis.active, icon: 'check_circle', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
                        { label: 'Negado', value: kpis.denied, icon: 'block', color: 'text-slate-500 bg-slate-50 dark:bg-slate-800/40' },
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

                {(viewMode === 'table' || viewMode === 'list') && (
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
                        {viewMode === 'table' && (
                            <>
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
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide border-b border-slate-200 dark:border-slate-700 pb-0 flex-1">
                                    {PIPELINE_TABS.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setStageFilter(tab.id)}
                                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                                stageFilter === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                            {tab.id === 'ativo' ? ACTIVE_STAGE_LABEL[campaignFilter] : tab.label}
                                            <span className={`py-0.5 px-2 rounded-full text-xs ${stageFilter === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                                                {stageCounts[tab.id].toLocaleString('pt-BR')}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {viewMode === 'dashboard' && (
                    <CrmPipelineDashboard partners={dashboardPartners} localStatus={localStatus} campaign={campaignFilter} />
                )}

                {viewMode === 'kanban' && (
                    <CrmKanbanBoard
                        partners={stageFiltered}
                        localStatus={localStatus}
                        campaign={campaignFilter}
                        getNote={getNote}
                        onStatusChange={onStatusChange}
                        onPartnerStatusChange={handlePartnerStatusChange}
                        onCampaignStatusChange={onCampaignStatusChange}
                        onEditPartner={openEdit}
                        onRegisterContact={registerContact}
                    />
                )}

                {viewMode === 'list' && (
                    <CrmListView
                        partners={sorted}
                        localStatus={localStatus}
                        campaign={campaignFilter}
                        getNote={getNote}
                        onStatusChange={onStatusChange}
                        onPartnerStatusChange={handlePartnerStatusChange}
                        onCampaignStatusChange={onCampaignStatusChange}
                        onEditPartner={openEdit}
                        onRegisterContact={registerContact}
                    />
                )}

                {viewMode === 'calendar' && (
                    <CrmCalendarView
                        partners={stageFiltered}
                        getNote={getNote}
                        onEditPartner={openEdit}
                    />
                )}

                {viewMode === 'table' && (
                    <CrmTableView
                        partners={partners}
                        sorted={sorted}
                        partnersInCityCount={partnersInCity.length}
                        cityFilter={cityFilter}
                        isLoading={isLoading}
                        gmvHeader={gmvHeader}
                        topCities={topCities}
                        localStatus={localStatus}
                        getNote={getNote}
                        getPromoStatus={getPromoStatus}
                        getOfertasStatus={getOfertasStatus}
                        setOfertasStatus={setOfertasStatus}
                        getCmsPromoUrl={getCmsPromoUrl}
                        onStatusChange={onStatusChange}
                        onPartnerStatusChange={handlePartnerStatusChange}
                        onEditPartner={openEdit}
                        onRegisterContact={registerContact}
                    />
                )}

                {highlightId && viewMode === 'list' && (
                    <p className="text-xs text-primary font-medium">Parceiro selecionado via alerta — edite notas no modal.</p>
                )}
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
                            <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                Cancelar
                            </button>
                            <button type="button" onClick={saveEdit} className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors">
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
