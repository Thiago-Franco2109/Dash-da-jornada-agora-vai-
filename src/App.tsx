import { useState, useMemo, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import Header from './components/Header';
import NavigationSidebar from './components/NavigationSidebar';
import FilterToolbar from './components/FilterToolbar';
import PerformanceTable from './components/PerformanceTable';
import type { SortConfig } from './components/PerformanceTable';
import PartnerDetailsView from './components/PartnerDetailsView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import AboutView from './components/AboutView';
import ManagersView from './components/ManagersView';
import ProfileView from './components/ProfileView';
import ContactsView from './components/ContactsView';
import CDDesempenhoView from './components/CDDesempenhoView';
import AllPartnersView from './components/AllPartnersView';
import CsKpisView from './components/CsKpisView';
import CarteiraView from './components/CarteiraView';
import PedidoMensalView from './components/PedidoMensalView';
import CrmView from './components/CrmView';
import type { AppView } from './types/views';
import type { CrmPartner } from './types/crm';
import { computeTopCitiesByGmv } from './config/crmCampaigns';
import {
  PARTNER_DATA_SOURCES,
  CD_DATA_SOURCES,
  CD_DESEMPENHO_SOURCES,
  PEDIDO_MENSAL_DATA_SOURCE,
  PARCEIRO_MENSAL_DATA_SOURCE,
} from './config/dataSource';
import { enrichPartnerData, enrichDesempenhoPartnerData, matchesPromoCupomFilter, type EnrichedPerformanceRow } from './utils/calculations';
import {
    buildAllPromoCupomFilterOptions,
    countPromoCupomFilter,
    type PromoCupomFilterValue,
} from './config/promoCupomFilter';
import { crmPartnersToEnrichedRows } from './utils/indicadorPerformance';
import { mergeOfertasManualStatus, promoStatusToOfertasStatus } from './utils/ofertasStatusMap';
import { getCampaignOverrideField, type CampaignTypeId } from './config/campaignTypes';
import { useOfertasDaCasa } from './hooks/useOfertasDaCasa';
import { useDataSync } from './hooks/useDataSync';
import { useRelevanceMap } from './hooks/useRelevanceMap';
import { useCampanhas } from './hooks/useCampanhas';
import { overlayCampanhas, normalizeNome } from './utils/campanhasOverlay';
import { useParceirosAtivos } from './hooks/useParceirosAtivos';
import { useAuth } from './context/AuthContext';
import { useProductMode } from './context/ProductModeContext';
import { useManagerSession } from './context/ManagerSessionContext';
import LoginPage from './components/LoginPage';
import { useDailyAccessSync } from './hooks/useDailyAccessSync';
import { buildNoCityIndexMap } from './config/managerMapping';
import { CACHE_KEYS } from './utils/dataSync';
import { useStatusOverride, type PromoStatus, type StatusOverrideField } from './hooks/useStatusOverride';
import { useCityIds } from './hooks/useCityIds';
import { useCarteiraData } from './hooks/useCarteiraData';
import { useGatewaySheetData } from './hooks/useGatewaySheetData';
import { useCrmData } from './hooks/useCrmData';
import PartnerSearchPalette from './components/PartnerSearchPalette';

function App() {
  const { isAuthenticated, isLoading: loadingAuth, logout } = useAuth();
  const { mode, theme, isCD } = useProductMode();
  const { managerFilter, setManagerFilter } = useManagerSession();
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [mappingVersion, setMappingVersion] = useState(0); 
  const [showFinished, setShowFinished] = useState(false);
  const [forceRender, setForceRender] = useState(0);


  const [cityFilter, setCityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState<'all' | '1-7' | '8-14' | '15-21' | '22-28'>('all');
  const [promoCupomFilter, setPromoCupomFilter] = useState<PromoCupomFilterValue | ''>('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'indice_desempenho', direction: 'asc' });
  const [selectedRow, setSelectedRow] = useState<EnrichedPerformanceRow | null>(null);
  const [partnerSearchOpen, setPartnerSearchOpen] = useState(false);
  const [statusSaveError, setStatusSaveError] = useState<string | null>(null);

  const activeSources = isCD ? CD_DATA_SOURCES : PARTNER_DATA_SOURCES;
  const activeCacheKey = isCD ? CACHE_KEYS.cd_novos : CACHE_KEYS.marketplace;

  // 1. Data Synchronization — só inicia após autenticação
  const { data: rawRows, isLoading: loadingSync, error: syncError, lastSyncTime, isUsingCache, refreshData } = useDataSync({
    sources: activeSources,
    cacheKey: activeCacheKey,
    enabled: isAuthenticated,
  });

  // CD Desempenho — mesma API do dashboard, só dispara ao abrir "Todas as Lojas"
  const desempenhoTabActive = isAuthenticated && isCD && (currentView === 'cd_desempenho' || currentView === 'churn' || partnerSearchOpen);
  const carteiraTabActive = isAuthenticated && !isCD && (
    currentView === 'carteira' || currentView === 'pedido_mensal'
  );
  const pedidoMensalTabActive = isAuthenticated && !isCD && currentView === 'pedido_mensal';
  const crmTabActive = isAuthenticated && !isCD && currentView === 'crm';
  const crmDataEnabled = isAuthenticated && !isCD && (
    crmTabActive || currentView === 'todos_parceiros' || currentView === 'churn' || selectedRow !== null || partnerSearchOpen
  );
  const {
    data: desempenhoRawRows,
    isLoading: loadingDesempenho,
    isRefreshing: refreshingDesempenho,
    error: desempenhoError,
    lastSyncTime: desempenhoLastSync,
    isUsingCache: desempenhoUsingCache,
    refreshData: refreshDesempenhoData,
  } = useDataSync({
    sources: CD_DESEMPENHO_SOURCES,
    cacheKey: CACHE_KEYS.cd_desempenho,
    skipSideData: false,
    enabled: desempenhoTabActive,
    syncProfile: 'cd_desempenho',
  });

  const {
    rows: carteiraRows,
    isLoading: loadingCarteira,
    isRefreshing: refreshingCarteira,
    error: carteiraError,
    lastSyncTime: carteiraLastSync,
    isUsingCache: carteiraUsingCache,
    refreshData: refreshCarteiraData,
  } = useCarteiraData({ enabled: carteiraTabActive });

  const {
    table: pedidoMensalTable,
    isLoading: loadingPedidoMensal,
    isRefreshing: refreshingPedidoMensal,
    error: pedidoMensalError,
    lastSyncTime: pedidoMensalLastSync,
    isUsingCache: pedidoMensalUsingCache,
    refreshData: refreshPedidoMensalData,
  } = useGatewaySheetData({
    sheetId: PEDIDO_MENSAL_DATA_SOURCE.sheetId,
    tab: PEDIDO_MENSAL_DATA_SOURCE.range,
    cacheKey: CACHE_KEYS.pedido_mensal,
    enabled: pedidoMensalTabActive,
  });

  const {
    table: parceiroMensalTable,
    isLoading: loadingParceiroMensal,
    isRefreshing: refreshingParceiroMensal,
    error: parceiroMensalError,
    lastSyncTime: parceiroMensalLastSync,
    isUsingCache: parceiroMensalUsingCache,
    refreshData: refreshParceiroMensalData,
  } = useGatewaySheetData({
    sheetId: PARCEIRO_MENSAL_DATA_SOURCE.sheetId,
    tab: PARCEIRO_MENSAL_DATA_SOURCE.range,
    cacheKey: CACHE_KEYS.parceiro_mensal,
    enabled: pedidoMensalTabActive,
  });

  const {
    partners: crmPartners,
    parseInfo: crmParseInfo,
    isLoading: loadingCrm,
    isRefreshing: refreshingCrm,
    error: crmError,
    lastSyncTime: crmLastSync,
    isUsingCache: crmUsingCache,
    refreshData: refreshCrmData,
  } = useCrmData({ enabled: crmDataEnabled });

  // Fonte única de relevância (app-wide), usada por todas as telas.
  const { relevanceMap: relMap, updateRelevance: updateRel } = useRelevanceMap();
  // Estado real de campanhas (banco), aplicado por cima do status de trabalho do CS.
  const { campanhasMap } = useCampanhas();
  // Parceiros ativos do banco — suplementam a carteira (novos sem pedido aparecem).
  const { parceiros: parceirosAtivos } = useParceirosAtivos();
  // Índice nome→id (do banco) p/ o overlay casar por nome quando o estab_id da
  // planilha não bate (ex: dashboard "novos formatado").
  const parceirosNomeToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parceirosAtivos) {
      const key = normalizeNome(p.nome);
      if (key && !m.has(key)) m.set(key, String(p.id));
    }
    return m;
  }, [parceirosAtivos]);
  // Índice id→nome (do banco) — o banco é a fonte de verdade do NOME. A planilha
  // (INDICADOR) costuma trazer o nome defasado (ex: "Honori Burguer" vs o real
  // "Honori Coxinha e Companhia"), então casamos por estab_id e substituímos o
  // nome exibido/pesquisado pelo do banco. Métricas seguem vindo da planilha.
  const parceirosIdToNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parceirosAtivos) {
      const id = String(p.id).trim();
      if (id && p.nome) m.set(id, p.nome);
    }
    return m;
  }, [parceirosAtivos]);
  const applyNomeBanco = useCallback((row: EnrichedPerformanceRow): EnrichedPerformanceRow => {
    const id = String(row.estab_id ?? '').trim();
    if (!id) return row;
    const nomeBanco = parceirosIdToNome.get(id);
    if (!nomeBanco || nomeBanco === row.estabelecimento) return row;
    return { ...row, estabelecimento: nomeBanco };
  }, [parceirosIdToNome]);

  const topCitiesByGmv = useMemo(() => computeTopCitiesByGmv(crmPartners, 5), [crmPartners]);

  const crmPartnerForSelected = useMemo((): CrmPartner | null => {
    if (!selectedRow || isCD) return null;
    const estabId = String(selectedRow.estab_id ?? '').trim();
    const nome = selectedRow.estabelecimento?.trim();
    return crmPartners.find(p =>
      (estabId && p.estabId === estabId) ||
      (nome && p.estabelecimento === nome),
    ) ?? null;
  }, [selectedRow, crmPartners, isCD]);

  const { updateStatus } = useStatusOverride();
  const { setStatus: setOfertasStatus, records: ofertasRecords } = useOfertasDaCasa();
  const { cityIdMap, loading: cityIdsLoading } = useCityIds();

  const handleCampaignStatusChange = async (partnerId: string, campaignId: CampaignTypeId, newStatus: PromoStatus) => {
    const isIndicadorView = !isCD && (currentView === 'churn' || currentView === 'todos_parceiros');
    const activeRows = currentView === 'cd_desempenho' || (currentView === 'churn' && isCD)
      ? desempenhoRawRows
      : isIndicadorView
        ? []
        : rawRows;
    const row = activeRows.find(r => (r.estab_id || r.estabelecimento) === partnerId);
    if (row) {
        const statuses = { ...(row.campaign_statuses ?? {}) };
        statuses[campaignId] = newStatus;
        if (campaignId === 'super_promos') row.promo_status = newStatus;
        if (campaignId === 'cupons_destaque') row.cupom_status = newStatus;
        row.campaign_statuses = statuses;
        setForceRender(prev => prev + 1);
    }

    if (campaignId === 'ofertas_da_casa') {
        setOfertasStatus(partnerId, promoStatusToOfertasStatus(newStatus), 'manual');
        setForceRender(prev => prev + 1);
        return;
    }

    const field = getCampaignOverrideField(campaignId);
    if (!field) return;

    const success = await updateStatus(partnerId, field, newStatus);
    if (!success) {
        setStatusSaveError('Não foi possível salvar o novo status. Verifique sua conexão e tente novamente.');
    } else if (isIndicadorView) {
        refreshCrmData();
    }
  };

  /** @deprecated use handleCampaignStatusChange */
  const handleStatusChange = async (partnerId: string, field: StatusOverrideField, newStatus: PromoStatus) => {
    const campaignId: CampaignTypeId =
        field === 'promo_status_override' ? 'super_promos' : 'cupons_destaque';
    await handleCampaignStatusChange(partnerId, campaignId, newStatus);
  };

  // -- Live API Access Data (Unique Store Accesses) — só inicia após autenticação
  const { accessData, loadingAccess, accessError, refreshAccessData } = useDailyAccessSync({ enabled: isAuthenticated });

  // Resetar filtros de tela ao alternar entre Marketplace e Cardápio Digital (gestor persiste na sessão)
  useEffect(() => {
    setCityFilter('');
    setSearchQuery('');
    setPriorityFilter('');
    setAgeGroupFilter('all');
    setPromoCupomFilter('');
    setSelectedRow(null);
    setSortConfig({ key: 'indice_desempenho', direction: 'asc' });
    if (isCD && (currentView === 'carteira' || currentView === 'pedido_mensal' || currentView === 'crm' || currentView === 'todos_parceiros')) {
      setCurrentView('dashboard');
    }
    if (currentView === 'cd_desempenho') {
      setCurrentView('dashboard');
    }
  }, [mode]);

  // Some o aviso de falha ao salvar status depois de alguns segundos
  useEffect(() => {
    if (!statusSaveError) return;
    const timer = setTimeout(() => setStatusSaveError(null), 6000);
    return () => clearTimeout(timer);
  }, [statusSaveError]);

  // Failsafe: se houver erro de autenticação em qualquer hook, força logout
  useEffect(() => {
    const isAuthError = (err: string | null) => 
      err?.includes('401') || err?.toLowerCase().includes('unauthorized');

    if (isAuthError(syncError) || isAuthError(accessError)) {
      console.warn("[App] Erro de autenticação detectado nos hooks de sincronização. Redirecionando...");
      logout();
    }
  }, [syncError, accessError, logout]);

  // Diagnóstico: cidades do dashboard não mapeadas na planilha de IDs
  useEffect(() => {
    if (cityIdsLoading || rawRows.length === 0) return;
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const uniqueCidadesData = Array.from(new Set(rawRows.map(r => r.cidade).filter(Boolean)));
    const unmapped = uniqueCidadesData.filter(c => cityIdMap[normalize(c)] === undefined);
    const mapped   = uniqueCidadesData.filter(c => cityIdMap[normalize(c)] !== undefined);
    console.group('%c[Diagnóstico] Mapeamento de Cidades', 'color:#6366f1;font-weight:bold');
    console.log(`%cMapeadas (${mapped.length}):`, 'color:#10b981', mapped.sort().join(', '));
    if (unmapped.length > 0) {
      console.warn(`%c⚠ NÃO mapeadas (${unmapped.length}):`, 'color:#f59e0b', unmapped.sort().join(', '));
    } else {
      console.log('%c✅ Todas as cidades estão mapeadas!', 'color:#10b981');
    }
    console.groupEnd();
  }, [cityIdMap, cityIdsLoading, rawRows]);

  // 2. Enrichment & Permanent Filters
  const enrichedData = useMemo(() => {
    const noCityIndexMap = buildNoCityIndexMap(rawRows);
    const rows = rawRows.map(row => {
      const partnerKey = row.estab_id || row.estabelecimento;
      const noCityIndex = noCityIndexMap.get(partnerKey);
      const enriched = enrichPartnerData(row, undefined, noCityIndex, mode);
      // relevância comercial da fonte única (aparece/edita no dashboard também)
      const rel = relMap[row.estab_id ?? ''] ?? relMap[enriched.estabelecimento];
      const withRel = rel != null ? { ...enriched, commercial_relevance: rel } : enriched;
      return applyNomeBanco(overlayCampanhas(withRel, campanhasMap, parceirosNomeToId));
    })
      .filter((row: EnrichedPerformanceRow) => {
        const status = row.status?.toLowerCase() || '';
        if (status === 'desistencia' || status === 'desistência') return false;
        if (!showFinished && row.isFinished) return false;
        return true;
      });
    return mergeOfertasManualStatus(rows, ofertasRecords);
  }, [rawRows, mappingVersion, showFinished, forceRender, mode, ofertasRecords, relMap, campanhasMap, parceirosNomeToId, applyNomeBanco]);

  // DEBUG temporário: inspecionar match de campanhas no runtime
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const jota = enrichedData.find(r => /jota/i.test(r.estabelecimento));
    (window as unknown as Record<string, unknown>).__dbgCampanhas = {
      jotaRow: jota ? { estab_id: jota.estab_id, estabelecimento: jota.estabelecimento, campaign_statuses: jota.campaign_statuses, promo_campanhas: jota.promo_campanhas } : null,
      map28443: campanhasMap['28443'],
      mapSize: Object.keys(campanhasMap).length,
    };
  }, [enrichedData, campanhasMap]);

  const indicadorEnrichedData = useMemo(
    () => {
      const base = mergeOfertasManualStatus(
        crmPartnersToEnrichedRows(crmPartners, relMap).map(r => applyNomeBanco(overlayCampanhas(r, campanhasMap, parceirosNomeToId))),
        ofertasRecords,
      );
      // Suplementa com parceiros ATIVOS do banco que ainda não estão na planilha
      // (ex: recém-ativados sem pedido). Assim eles aparecem na carteira.
      const existing = new Set(base.map(r => String(r.estab_id ?? '')));
      const extras: EnrichedPerformanceRow[] = [];
      for (const p of parceirosAtivos) {
        if (existing.has(String(p.id))) continue;
        const minimal = {
          cidade: p.cidade ?? '', estabelecimento: p.nome, estab_id: String(p.id),
          status: 'ativo', lancamento: '', desempenho: '',
          week_1: 0, week_2: 0, week_3: 0, week_4: 0,
        };
        let row = enrichPartnerData(minimal, undefined, undefined, mode);
        // sem lançamento/pedido no banco → zera métricas derivadas (evita NaN)
        row = { ...row, dias_desde_lancamento: 0, pedidos_esperados: 0, indice_desempenho: 0, priority_stars: 0 };
        const rel = relMap[String(p.id)];
        if (rel != null) row = { ...row, commercial_relevance: rel };
        extras.push(overlayCampanhas(row, campanhasMap, parceirosNomeToId));
      }
      return [...base, ...extras];
    },
    [crmPartners, relMap, forceRender, ofertasRecords, campanhasMap, parceirosAtivos, mode, parceirosNomeToId, applyNomeBanco],
  );

  const indicadorPedidosMesHeader = crmParseInfo?.gmvColumn ?? undefined;

  useEffect(() => {
    if (currentView === 'cd_desempenho' || currentView === 'churn') {
      setSortConfig({
        key: !isCD ? 'risco_churn' : 'risco_churn',
        direction: 'desc',
      });
      setPriorityFilter('');
    }
    if (currentView === 'todos_parceiros') {
      setSortConfig({ key: 'estabelecimento', direction: 'asc' });
      setPriorityFilter('');
    }
  }, [currentView, isCD]);

  const enrichedDesempenhoData = useMemo(() => {
    if (desempenhoRawRows.length === 0) return [];
    const noCityIndexMap = buildNoCityIndexMap(desempenhoRawRows);
    const enrichMode = isCD ? mode : 'cardapio_digital';
    return desempenhoRawRows.map(row => {
      const partnerKey = row.estab_id || row.estabelecimento;
      const noCityIndex = noCityIndexMap.get(partnerKey);
      return enrichDesempenhoPartnerData(row, undefined, noCityIndex, enrichMode);
    }).filter((row: EnrichedPerformanceRow) => {
      const status = row.status?.toLowerCase().trim() || '';
      return status !== 'cancelado' && status !== 'cancelada';
    });
  }, [desempenhoRawRows, mappingVersion, mode, isCD]);

  // Extract unique cities and managers
  const uniqueCities = Array.from(new Set(enrichedData.map(row => row.cidade))).sort();
  const uniqueManagers = Array.from(new Set(enrichedData.map(row => row.analista || 'Desconhecido'))).filter(m => m !== 'Desconhecido').sort();

  const dataBeforePromoCupomFilter = useMemo(() => {
    return enrichedData.filter((row: EnrichedPerformanceRow) => {
      if (cityFilter && row.cidade !== cityFilter) return false;
      if (searchQuery && !row.estabelecimento.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (priorityFilter && row.priority_stars.toString() !== priorityFilter) return false;
      if (managerFilter && row.analista !== managerFilter) return false;
      return true;
    });
  }, [enrichedData, cityFilter, searchQuery, priorityFilter, managerFilter]);

  const baseFilteredData = useMemo(() => {
    if (!promoCupomFilter) return dataBeforePromoCupomFilter;
    return dataBeforePromoCupomFilter.filter(row =>
      matchesPromoCupomFilter(row, promoCupomFilter),
    );
  }, [dataBeforePromoCupomFilter, promoCupomFilter]);

  const promoCupomFilterCounts = useMemo(() => {
    const counts: Partial<Record<PromoCupomFilterValue, number>> = {};
    for (const opt of buildAllPromoCupomFilterOptions()) {
      counts[opt.value] = countPromoCupomFilter(dataBeforePromoCupomFilter, opt.value);
    }
    return counts;
  }, [dataBeforePromoCupomFilter]);

  // Filter Data
  let filteredTableData = baseFilteredData.filter((row: EnrichedPerformanceRow) => {
    const days = row.dias_desde_lancamento;
    if (ageGroupFilter === '1-7' && (days < 1 || days > 7)) return false;
    if (ageGroupFilter === '8-14' && (days < 8 || days > 14)) return false;
    if (ageGroupFilter === '15-21' && (days < 15 || days > 21)) return false;
    if (ageGroupFilter === '22-28' && (days < 22 || days > 28)) return false;
    return true;
  });

  // Sort Data
  if (sortConfig !== null) {
    filteredTableData.sort((a: EnrichedPerformanceRow, b: EnrichedPerformanceRow) => {
      const { key, direction } = sortConfig;
      let aVal: any = a[key as keyof EnrichedPerformanceRow];
      let bVal: any = b[key as keyof EnrichedPerformanceRow];

      if (key === 'lancamento') {
        const [aD, aM, aY] = (aVal as string).split('/');
        const [bD, bM, bY] = (bVal as string).split('/');
        aVal = new Date(parseInt(aY), parseInt(aM) - 1, parseInt(aD)).getTime();
        bVal = new Date(parseInt(bY), parseInt(bM) - 1, parseInt(bD)).getTime();
      } else if (key === 'desempenho' && typeof aVal === 'string') {
        aVal = parseFloat((aVal as string).replace('%', ''));
        bVal = parseFloat((bVal as string).replace('%', ''));
      } else if (key === 'pedidos_mes_value') {
        // GMV do mês (coluna JUN./26) — garante comparação numérica
        aVal = Number(aVal ?? 0);
        bVal = Number(bVal ?? 0);
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const activeEnrichedPool = currentView === 'churn' || currentView === 'todos_parceiros'
    ? (isCD ? enrichedDesempenhoData : indicadorEnrichedData)
    : currentView === 'cd_desempenho'
      ? enrichedDesempenhoData
      : enrichedData;

  const currentSelectedRow = selectedRow
    ? (activeEnrichedPool.find(r => r.estabelecimento === selectedRow.estabelecimento) ?? selectedRow)
    : null;

  const handleRelevanceChange = (partnerId: string, score: number) => {
    if (!partnerId) return;
    void updateRel(partnerId, score);
  };

  const handleRowClick = (row: EnrichedPerformanceRow) => {
    const latest = activeEnrichedPool.find(r => r.estabelecimento === row.estabelecimento) ?? row;
    setSelectedRow(latest);
    if (currentView !== 'dashboard' && currentView !== 'cd_desempenho' && currentView !== 'churn' && currentView !== 'todos_parceiros') {
      setCurrentView('dashboard');
    }
  };

  const searchablePartners = useMemo(() => {
    const map = new Map<string, EnrichedPerformanceRow>();
    const add = (rows: EnrichedPerformanceRow[]) => {
      for (const row of rows) {
        const key = (row.estab_id || row.estabelecimento || '').trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, row);
      }
    };
    if (isCD) {
      add(enrichedDesempenhoData);
      add(enrichedData);
    } else {
      add(indicadorEnrichedData);
      add(enrichedData);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.estabelecimento.localeCompare(b.estabelecimento, 'pt-BR'),
    );
  }, [isCD, enrichedData, indicadorEnrichedData, enrichedDesempenhoData]);

  const navigateToPartner = (row: EnrichedPerformanceRow) => {
    const matchKey = (r: EnrichedPerformanceRow) =>
      r.estabelecimento === row.estabelecimento ||
      (!!row.estab_id && r.estab_id === row.estab_id);

    if (isCD) {
      const inDesempenho = enrichedDesempenhoData.find(matchKey);
      setSelectedRow(inDesempenho ?? row);
      setCurrentView('cd_desempenho');
    } else {
      const inIndicador = indicadorEnrichedData.find(matchKey);
      if (inIndicador) {
        setSelectedRow(inIndicador);
        setCurrentView('todos_parceiros');
      } else {
        const inDashboard = enrichedData.find(matchKey);
        setSelectedRow(inDashboard ?? row);
        setCurrentView('dashboard');
      }
    }
    setSearchQuery('');
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPartnerSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  if (loadingAuth || (loadingSync && rawRows.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white dark:bg-slate-900">
      <Header 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        searchQuery={searchQuery} 
        setSearchQuery={setSearchQuery}
        onOpenPartnerSearch={() => setPartnerSearchOpen(true)}
      />
      <div className="flex flex-1 min-h-0 relative">
        <NavigationSidebar 
          currentView={currentView}
          onNavigate={setCurrentView}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-900 transition-all duration-300">
          {currentView === 'cs_kpis' ? (
            <CsKpisView />
        ) : currentView === 'settings' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SettingsView />
          </div>
        ) : currentView === 'about' ? (
          <AboutView />
        ) : currentView === 'managers' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ManagersView data={enrichedData} onMappingChange={() => setMappingVersion(v => v + 1)} />
          </div>
        ) : currentView === 'profile' ? (
          <ProfileView />
        ) : currentView === 'contacts' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ContactsView data={enrichedData} onRowClick={handleRowClick} managerFilter={managerFilter} />
          </div>
        ) : currentView === 'reports' ? (
          <ReportsView data={enrichedData} managerFilter={managerFilter} />
        ) : currentView === 'carteira' ? (
          <CarteiraView
            rows={carteiraRows}
            isLoading={loadingCarteira}
            isRefreshing={refreshingCarteira}
            error={carteiraError}
            isUsingCache={carteiraUsingCache}
            lastSyncTime={carteiraLastSync}
            onRefresh={refreshCarteiraData}
            managerFilter={managerFilter}
          />
        ) : currentView === 'crm' ? (
          <CrmView
            partners={crmPartners}
            parseInfo={crmParseInfo}
            isLoading={loadingCrm}
            isRefreshing={refreshingCrm}
            error={crmError}
            isUsingCache={crmUsingCache}
            lastSyncTime={crmLastSync}
            onRefresh={refreshCrmData}
            managerFilter={managerFilter}
            searchQuery={searchQuery}
            cityFilter={cityFilter}
            setCityFilter={setCityFilter}
            onStatusChange={handleStatusChange}
            onCampaignStatusChange={handleCampaignStatusChange}
          />
        ) : currentView === 'pedido_mensal' ? (
          <PedidoMensalView
            pedidoTable={pedidoMensalTable}
            parceiroTable={parceiroMensalTable}
            isLoading={loadingPedidoMensal || loadingParceiroMensal}
            isRefreshing={refreshingPedidoMensal || refreshingParceiroMensal}
            error={[pedidoMensalError, parceiroMensalError].filter(Boolean).join(' · ') || null}
            isUsingCache={pedidoMensalUsingCache || parceiroMensalUsingCache}
            lastSyncTime={
              pedidoMensalLastSync && parceiroMensalLastSync
                ? (pedidoMensalLastSync > parceiroMensalLastSync ? pedidoMensalLastSync : parceiroMensalLastSync)
                : pedidoMensalLastSync ?? parceiroMensalLastSync
            }
            onRefresh={() => {
              refreshPedidoMensalData();
              refreshParceiroMensalData();
            }}
            managerFilter={managerFilter}
            carteiraRows={carteiraRows}
          />
        ) : currentView === 'todos_parceiros' ? (
          currentSelectedRow ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <PartnerDetailsView
              partner={currentSelectedRow}
              onBack={() => setSelectedRow(null)}
              dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
              onRefresh={() => setMappingVersion(v => v + 1)}
              viewContext={undefined}
              crmPartner={crmPartnerForSelected}
              topCities={topCitiesByGmv}
              onStatusChange={handleStatusChange}
              onNavigateToCrm={() => {
                setCityFilter(currentSelectedRow.cidade);
                setSelectedRow(null);
                setCurrentView('crm');
              }}
            />
            </div>
          ) : (
            <AllPartnersView
              data={indicadorEnrichedData}
              isLoading={loadingCrm}
              isRefreshing={refreshingCrm}
              error={crmError}
              isUsingCache={crmUsingCache}
              lastSyncTime={crmLastSync}
              onRefresh={refreshCrmData}
              searchQuery={searchQuery}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
              managerFilter={managerFilter}
              setManagerFilter={setManagerFilter}
              sortConfig={sortConfig}
              requestSort={requestSort}
              onRowClick={handleRowClick}
              onCampaignStatusChange={handleCampaignStatusChange}
              onStatusChange={handleStatusChange}
              onRelevanceChange={handleRelevanceChange}
              dataSourceLabel="INDICADOR_FORMATADO"
              pedidosMesHeader={indicadorPedidosMesHeader}
            />
          )
        ) : currentView === 'churn' ? (
          currentSelectedRow ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <PartnerDetailsView
              partner={currentSelectedRow}
              onBack={() => setSelectedRow(null)}
              dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
              onRefresh={() => setMappingVersion(v => v + 1)}
              viewContext={isCD ? 'desempenho' : undefined}
              crmPartner={!isCD ? crmPartnerForSelected : null}
              topCities={!isCD ? topCitiesByGmv : undefined}
              onStatusChange={handleStatusChange}
              onNavigateToCrm={!isCD ? () => {
                setCityFilter(currentSelectedRow.cidade);
                setSelectedRow(null);
                setCurrentView('crm');
              } : undefined}
            />
            </div>
          ) : (
            <CDDesempenhoView
              data={isCD ? enrichedDesempenhoData : indicadorEnrichedData}
              isLoading={isCD ? loadingDesempenho : loadingCrm}
              isRefreshing={isCD ? refreshingDesempenho : refreshingCrm}
              error={isCD ? desempenhoError : crmError}
              isUsingCache={isCD ? desempenhoUsingCache : crmUsingCache}
              lastSyncTime={isCD ? desempenhoLastSync : crmLastSync}
              onRefresh={isCD ? refreshDesempenhoData : refreshCrmData}
              searchQuery={searchQuery}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
              managerFilter={managerFilter}
              setManagerFilter={setManagerFilter}
              sortConfig={sortConfig}
              requestSort={requestSort}
              onRowClick={handleRowClick}
              onCampaignStatusChange={handleCampaignStatusChange}
              onStatusChange={handleStatusChange}
              onRelevanceChange={handleRelevanceChange}
              preset="churn"
              dataSource={isCD ? 'cd_desempenho' : 'indicador'}
              pedidosMesHeader={indicadorPedidosMesHeader}
            />
          )
        ) : currentView === 'cd_desempenho' ? (
          currentSelectedRow ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <PartnerDetailsView
              partner={currentSelectedRow}
              onBack={() => setSelectedRow(null)}
              dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
              onRefresh={() => setMappingVersion(v => v + 1)}
              viewContext="desempenho"
            />
            </div>
          ) : (
            <CDDesempenhoView
              data={enrichedDesempenhoData}
              isLoading={loadingDesempenho}
              isRefreshing={refreshingDesempenho}
              error={desempenhoError}
              isUsingCache={desempenhoUsingCache}
              lastSyncTime={desempenhoLastSync}
              onRefresh={refreshDesempenhoData}
              searchQuery={searchQuery}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
              managerFilter={managerFilter}
              setManagerFilter={setManagerFilter}
              sortConfig={sortConfig}
              requestSort={requestSort}
              onRowClick={handleRowClick}
              onCampaignStatusChange={handleCampaignStatusChange}
              onStatusChange={handleStatusChange}
              onRelevanceChange={handleRelevanceChange}
              preset="all"
              dataSource="cd_desempenho"
            />
          )
        ) : (
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900 xl:border-r border-slate-200 dark:border-slate-700">
            {currentSelectedRow ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
              <PartnerDetailsView
                partner={currentSelectedRow}
                onBack={() => setSelectedRow(null)}
                dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
                onRefresh={() => setMappingVersion(v => v + 1)}
                crmPartner={crmPartnerForSelected}
                topCities={topCitiesByGmv}
                onStatusChange={handleStatusChange}
                onNavigateToCrm={() => {
                  setCityFilter(currentSelectedRow.cidade);
                  setSelectedRow(null);
                  setCurrentView('crm');
                }}
              />
              </div>
            ) : (
              <>
                <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">{theme.headerTitle}</h1>
                      <p className="text-slate-500 dark:text-slate-400 text-base font-normal">Acompanhe as métricas de desempenho e o status de saúde dos parceiros nos primeiros 28 dias críticos de ativação.</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <button
                        onClick={() => { refreshData(); refreshAccessData(); }}
                        disabled={loadingSync || loadingAccess}
                        className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className={`material-symbols-outlined text-lg ${(loadingSync || loadingAccess) ? 'animate-spin text-primary' : ''}`}>sync</span>
                        {(loadingSync || loadingAccess) ? 'Atualizando...' : 'Atualizar agora'}
                      </button>

                      {lastSyncTime && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-end gap-1">
                          Última atualização: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      )}
                    </div>
                  </div>

                  {isUsingCache && (
                    <div className="mt-4 flex flex-col gap-2 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-400">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined shrink-0 text-amber-600 dark:text-amber-500">cloud_off</span>
                        <div>
                          <p className="text-sm font-semibold">Usando dados em cache</p>
                          <p className="text-sm opacity-90">Não foi possível conectar à base de dados no momento. Mostrando as últimas informações salvas localmente.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {syncError && !isUsingCache && (
                    <div className="mt-4 flex items-start gap-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-800 dark:text-red-400">
                      <span className="material-symbols-outlined shrink-0">error</span>
                      <div>
                        <p className="text-sm font-semibold">Erro ao atualizar dados</p>
                        <p className="text-sm opacity-90">{syncError}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                <FilterToolbar
                  cityFilter={cityFilter}
                  setCityFilter={setCityFilter}
                  cities={uniqueCities}
                  priorityFilter={priorityFilter}
                  setPriorityFilter={setPriorityFilter}
                  managerFilter={managerFilter}
                  setManagerFilter={setManagerFilter}
                  managers={uniqueManagers}
                  showPromoCupomFilter={!isCD}
                  promoCupomFilter={promoCupomFilter}
                  setPromoCupomFilter={setPromoCupomFilter}
                  promoCupomFilterCounts={promoCupomFilterCounts}
                />
                </div>

                <div className="shrink-0 flex items-center justify-between px-6 bg-slate-50/30 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex gap-6 overflow-x-auto scrollbar-hide pt-2">
                      {[
                          { id: 'all', label: 'Todos os Períodos' },
                          { id: '1-7', label: '1 a 7 dias' },
                          { id: '8-14', label: '8 a 14 dias' },
                          { id: '15-21', label: '15 a 21 dias' },
                          { id: '22-28', label: '22 a 28 dias' }
                      ].map(tab => (
                          <button
                              key={tab.id}
                              onClick={() => setAgeGroupFilter(tab.id as any)}
                              className={`pb-3 pt-2 px-1 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${ageGroupFilter === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                          >
                              {tab.label}
                              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${ageGroupFilter === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                  {baseFilteredData.filter(r => {
                                      const d = r.dias_desde_lancamento;
                                      if (tab.id === '1-7') return d >= 1 && d <= 7;
                                      if (tab.id === '8-14') return d >= 8 && d <= 14;
                                      if (tab.id === '15-21') return d >= 15 && d <= 21;
                                      if (tab.id === '22-28') return d >= 22 && d <= 28;
                                      return true;
                                  }).length}
                              </span>
                          </button>
                      ))}
                  </div>

                  <button
                    onClick={() => setShowFinished(!showFinished)}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                      showFinished 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' 
                      : 'bg-slate-100 text-slate-400 border border-transparent hover:border-slate-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showFinished ? 'visibility' : 'visibility_off'}
                    </span>
                    {showFinished ? 'Mostrando Encerrados' : 'Ver Encerrados'}
                  </button>
                </div>

                {loadingSync && rawRows.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-slate-500 font-medium">Sincronizando dados...</p>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                    <PerformanceTable
                      data={filteredTableData}
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                      onRowClick={handleRowClick}
                      onCampaignStatusChange={handleCampaignStatusChange}
                      onStatusChange={handleStatusChange}
                      onRelevanceChange={handleRelevanceChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </main>
      </div>

      <PartnerSearchPalette
        isOpen={partnerSearchOpen}
        onClose={() => setPartnerSearchOpen(false)}
        partners={searchablePartners}
        onSelect={navigateToPartner}
        isLoading={partnerSearchOpen && (isCD ? loadingDesempenho : loadingCrm) && searchablePartners.length === 0}
      />

      {statusSaveError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 max-w-sm bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-500/20 rounded-xl text-red-800 dark:text-red-400 shadow-lg">
          <span className="material-symbols-outlined shrink-0">error</span>
          <div>
            <p className="text-sm font-semibold">Erro ao salvar status</p>
            <p className="text-sm opacity-90">{statusSaveError}</p>
          </div>
          <button
            onClick={() => setStatusSaveError(null)}
            className="material-symbols-outlined text-base opacity-60 hover:opacity-100 shrink-0"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
