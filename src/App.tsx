import { useState, useMemo, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import Header from './components/Header';
import NavigationSidebar from './components/NavigationSidebar';
import HomeView from './components/HomeView';
import PerformanceTable, { getRowCampaignStatus } from './components/PerformanceTable';
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
import TrelloView from './components/TrelloView';
import CarteiraView from './components/CarteiraView';
import CarteiraPorGrupoView from './components/CarteiraPorGrupoView';
import AcoesPromocionaisView from './components/AcoesPromocionaisView';
import PedidoMensalView from './components/PedidoMensalView';
import OnboardingView from './components/OnboardingView';
import OnboardingCompletoAlert from './components/OnboardingCompletoAlert';
import CrmView from './components/CrmView';
import CrmJornadaView from './components/CrmJornadaView';
import TarefasDoDiaView from './components/TarefasDoDiaView';
import DiarioView from './components/DiarioView';
import AnotacaoRapida from './components/diario/AnotacaoRapida';
import type { AppView } from './types/views';
import type { CrmPartner } from './types/crm';
import { computeTopCitiesByGmv } from './config/crmCampaigns';
import { fetchPedidoMensalTable, fetchParceiroMensalTable } from './utils/pedidoMensalFromDb';
import { fetchJornadaMarketplace, fetchJornadaCd, fetchCdDesempenho } from './utils/jornadaFromDb';
import { useAtribuicaoCs } from './hooks/useAtribuicaoCs';
import { useOnboardingPendente } from './hooks/useOnboardingPendente';
import { useOnboardingTrello } from './hooks/useOnboardingTrello';
import { useTarefasPendentes } from './hooks/useTarefasPendentes';
import {
  PARTNER_DATA_SOURCES,
  CD_DATA_SOURCES,
  CD_DESEMPENHO_SOURCES,
  PEDIDO_MENSAL_DATA_SOURCE,
  PARCEIRO_MENSAL_DATA_SOURCE,
} from './config/dataSource';
import { enrichPartnerData, enrichDesempenhoPartnerData, type EnrichedPerformanceRow } from './utils/calculations';
import { crmPartnersToEnrichedRows } from './utils/indicadorPerformance';
import { jornadaRowsToCrmPartners } from './utils/jornadaCrmAdapter';
import { buildPreLancamentoRows } from './utils/preLancamento';
import { aplicarFiltroComposto, condicaoCulpadaPeloVazio, type ContextoAvaliacao } from './utils/avaliarFiltro';
import { camposFiltraveisJornada } from './config/camposFiltraveis';
import { grupoVazio, novoId, type FiltroComposto } from './config/filtrosJornada';
import { estaNaAba, contarPorFaixa, ABAS_JORNADA, type AbaJornada } from './utils/faixaJornada';
import { hojeISO } from './hooks/useCrmNotes';
import FilterBar from './components/FilterBar';
import { mergeOfertasManualStatus, promoStatusToOfertasStatus } from './utils/ofertasStatusMap';
import { getCampaignOverrideField, isEditableCampaign, type CampaignTypeId } from './config/campaignTypes';
import { useOfertasDaCasa } from './hooks/useOfertasDaCasa';
import { useDataSync } from './hooks/useDataSync';
import { useRelevanceMap } from './hooks/useRelevanceMap';
import { useCampanhas } from './hooks/useCampanhas';
import { overlayCampanhas, normalizeNome } from './utils/campanhasOverlay';
import { aplicarPausaOnboarding } from './utils/pausaOverlay';
import { usePausaOnboarding } from './hooks/usePausaOnboarding';
import { useParceirosAtivos } from './hooks/useParceirosAtivos';
import { useStatusOverridesMap } from './hooks/useStatusOverridesMap';
import { usePromoStatus } from './hooks/usePromoStatus';
import { useCrmNotes } from './hooks/useCrmNotes';
import { useTrelloTarefas } from './hooks/useTrelloTarefas';
import { useAuth } from './context/AuthContext';
import { useProductMode } from './context/ProductModeContext';
import { useManagerSession } from './context/ManagerSessionContext';
import { useCityFocus } from './context/CityFocusContext';
import LoginPage from './components/LoginPage';
import { useDailyAccessSync } from './hooks/useDailyAccessSync';
import { buildNoCityIndexMap } from './config/managerMapping';
import { CACHE_KEYS } from './utils/dataSync';
import { type PromoStatus, type StatusOverrideField } from './hooks/useStatusOverride';
import { useCityIds } from './hooks/useCityIds';
import { useCarteiraData } from './hooks/useCarteiraData';
import { useAcoesPromocionaisData } from './hooks/useAcoesPromocionaisData';
import { useGatewaySheetData } from './hooks/useGatewaySheetData';
import { useCrmData } from './hooks/useCrmData';
import PartnerSearchPalette from './components/PartnerSearchPalette';
import { findPartner } from './utils/partnerIdentity';

function App() {
  const { isAuthenticated, isLoading: loadingAuth, logout } = useAuth();
  const { mode, theme, isCD } = useProductMode();
  const { profile, managerFilter, setManagerFilter } = useManagerSession();
  /**
   * Foco "Cidades OKR" (cabeçalho). É aplicado aqui, nas listas que cada tela
   * recebe, e não dentro delas: assim Jornada, CRM, Carteira e KPIs respondem
   * sempre sobre o mesmo recorte. Índices de identidade (estab→cidade,
   * nome→id) ficam de fora de propósito — recortá-los quebraria a ficha de um
   * parceiro aberto por busca.
   */
  const { filtrarPorCidade, cidadeNoFoco } = useCityFocus();
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [mappingVersion, setMappingVersion] = useState(0); 
  const [showFinished, setShowFinished] = useState(false);
  const [forceRender, setForceRender] = useState(0);


  const [cityFilter, setCityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState<AbaJornada>('all');
  /**
   * Filtro composto da jornada. Local de propósito: `cityFilter`/`managerFilter`
   * são globais (alimentam CRM, Carteira, Relatórios…), então o construtor
   * NUNCA escreve neles — senão mexer num chip aqui mudaria o painel inteiro.
   */
  const [filtroJornada, setFiltroJornada] = useState<FiltroComposto>(grupoVazio);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'indice_desempenho', direction: 'asc' });
  const [selectedRow, setSelectedRow] = useState<EnrichedPerformanceRow | null>(null);
  const [partnerSearchOpen, setPartnerSearchOpen] = useState(false);
  /** Anotação rápida do diário (Ctrl/Cmd+J), disponível de qualquer tela. */
  const [anotacaoRapidaOpen, setAnotacaoRapidaOpen] = useState(false);
  const [statusSaveError, setStatusSaveError] = useState<string | null>(null);

  /**
   * Cidade escolhida no seletor das telas, respeitando o foco da OKR. Uma
   * cidade de fora do foco vira "todas" enquanto ele estiver ligado — sem isto
   * a tela ficaria vazia com um seletor apontando para uma cidade que não está
   * mais na lista. Desligar o foco devolve a escolha original.
   */
  const cityFilterEfetivo = cityFilter && !cidadeNoFoco(cityFilter) ? '' : cityFilter;

  const activeSources = isCD ? CD_DATA_SOURCES : PARTNER_DATA_SOURCES;
  const activeCacheKey = isCD ? CACHE_KEYS.cd_novos : CACHE_KEYS.marketplace;

  // 1. Data Synchronization — só inicia após autenticação
  const { data: rawRows, isLoading: loadingSync, error: syncError, lastSyncTime, isUsingCache, refreshData } = useDataSync({
    sources: activeSources,
    cacheKey: activeCacheKey,
    enabled: isAuthenticated,
    // Jornada do banco nos dois modos: marketplace e Cardápio Digital.
    dbFetchRows: isCD ? fetchJornadaCd : fetchJornadaMarketplace,
  });

  // Logo do parceiro por nome normalizado — reaproveita o merge da Carteira (dataSync.ts)
  // pro botão "Gerar Arte" de Ações Promocionais, sem precisar de nova busca.
  const logoByNome = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rawRows) {
      if (row.logo_url && row.estabelecimento) {
        const key = row.estabelecimento
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .trim();
        map[key] = row.logo_url;
      }
    }
    return map;
  }, [rawRows]);

  // CD Desempenho — mesma API do dashboard, só dispara ao abrir "Todas as Lojas"
  const desempenhoTabActive = isAuthenticated && isCD && (currentView === 'cd_desempenho' || currentView === 'churn' || partnerSearchOpen);
  const carteiraTabActive = isAuthenticated && !isCD && (
    currentView === 'carteira' || currentView === 'carteira_grupo' || currentView === 'pedido_mensal'
  );
  const acoesPromocionaisTabActive = isAuthenticated && !isCD && currentView === 'acoes_promocionais';
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
    dbFetchRows: fetchCdDesempenho,
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
    cidades: acoesPromocionaisCidades,
    totais: acoesPromocionaisTotais,
    isLoading: loadingAcoesPromocionais,
    isRefreshing: refreshingAcoesPromocionais,
    error: acoesPromocionaisError,
    lastSyncTime: acoesPromocionaisLastSync,
    refresh: refreshAcoesPromocionais,
  } = useAcoesPromocionaisData({ enabled: acoesPromocionaisTabActive });

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
    dbFetch: fetchPedidoMensalTable,
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
    dbFetch: fetchParceiroMensalTable,
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

  /**
   * Listas que as telas consomem já com o foco de cidades aplicado. O `crmPartners`
   * cru continua existindo porque é índice de identidade (ficha do parceiro,
   * Top 5 GMV): recortá-lo esvaziaria a ficha de quem foi aberto pela busca.
   */
  const crmPartnersNoFoco = useMemo(
    () => filtrarPorCidade(crmPartners, p => p.cidade),
    [crmPartners, filtrarPorCidade],
  );
  const carteiraRowsNoFoco = useMemo(
    () => filtrarPorCidade(carteiraRows, r => r.cidade),
    [carteiraRows, filtrarPorCidade],
  );
  const acoesPromocionaisCidadesNoFoco = useMemo(
    () => filtrarPorCidade(acoesPromocionaisCidades, c => c.cidade),
    [acoesPromocionaisCidades, filtrarPorCidade],
  );

  const { notesMap: crmNotasMap, getNote: getCrmNote, upsertNote: upsertCrmNote, registerContact: registerCrmContact, erro: crmNotasErro, carregando: crmNotasCarregando } = useCrmNotes();

  // As notas saíram do localStorage pro Supabase (dois CS precisam ver a mesma
  // fila). Se a tabela não existir, o CS anotaria no vazio — melhor avisar.
  useEffect(() => {
    if (crmNotasErro) {
      setStatusSaveError(`Notas e contatos do CRM não estão sendo salvos (${crmNotasErro}). Falta criar a tabela crm_notas no Supabase — ver supabase/crm_notas.sql.`);
    }
  }, [crmNotasErro]);
  const { data: trelloTarefas, refresh: refreshTrelloTarefas } = useTrelloTarefas();

  // Atribuição de CS (cidade e loja) do Supabase — publica no resolvedor
  // síncrono usado por todas as telas.
  const {
    atribuicoes: atribuicoesCs,
    error: atribuicoesCsError,
    salvarCidade: salvarCidadeCs,
    salvarParceiro: salvarParceiroCs,
  } = useAtribuicaoCs();

  // Parceiros pendentes de ativação (assinaram, ainda não lançaram) — aba
  // "Acompanhar Onboarding". Não entram na Jornada (ver netlify/functions/jornada.ts).
  const {
    pendentes: onboardingPendentes,
    isLoading: loadingOnboarding,
    isRefreshing: refreshingOnboarding,
    error: onboardingError,
    lastSyncTime: onboardingLastSync,
    refreshData: refreshOnboarding,
    // Gate plano, não por aba: esses parceiros agora também alimentam a Lista
    // jornada 28D e o CRM Jornada. Gate por view faria o `enabled` oscilar e
    // esvaziar o contador da aba "Pré-lançamento" a cada troca de tela.
  } = useOnboardingPendente({ enabled: isAuthenticated, produto: isCD ? 'cd' : undefined });

  const {
    etapasPorEstabId: onboardingEtapasTrello,
    cards: onboardingCardsTrello,
    listas: onboardingListasTrello,
    refreshTrello: refreshOnboardingTrello,
  } = useOnboardingTrello({
    // Sempre ativo (não só na aba) — a notificação de atrasados abaixo
    // precisa rechecar em background, independente de qual aba está aberta.
    enabled: isAuthenticated,
  });

  const onboardingPendentesNoFoco = useMemo(
    () => filtrarPorCidade(onboardingPendentes, p => p.cidade),
    [onboardingPendentes, filtrarPorCidade],
  );

  const tarefasPendentes = useTarefasPendentes({
    crmPartners: crmPartnersNoFoco,
    getCrmNote,
    managerFilter,
    onboardingCardsTrello,
    trelloTarefas,
    refreshOnboardingTrello,
    refreshTrelloTarefas,
    onNotificacaoClick: () => setCurrentView('tarefas_dia'),
  });

  // Fonte única de relevância (app-wide), usada por todas as telas.
  const { relevanceMap: relMap, updateRelevance: updateRel } = useRelevanceMap();
  // Pausa do onboarding: desconta da jornada os dias em que a loja não operou
  // (ver utils/pausaOverlay.ts). Sem isto, quem está parado segue sendo cobrado.
  const { pausaMap } = usePausaOnboarding();
  // Estado real de campanhas (banco), aplicado por cima do status de trabalho do CS.
  const { campanhasMap } = useCampanhas();
  // Parceiros ativos do banco — suplementam a carteira (novos sem pedido aparecem).
  const { parceiros: parceirosAtivos } = useParceirosAtivos();
  // Decisões de trabalho do CS (Supabase) — única fonte de override de campanha.
  const { overridesMap: campanhaOverrides, setOverride: setCampanhaOverride } = useStatusOverridesMap();
  // Status dos itens promocionais por parceiro/campanha (banco).
  const { promoData, loading: promoCarregando, error: promoErro } = usePromoStatus();
  /**
   * `promoData` nasce como objeto vazio mas SEMPRE truthy, então sem este
   * portão o computePromoResumo roda com mapas vazios e escreve zeros
   * fabricados na linha — indistinguíveis de zeros reais. Com ele,
   * `promo_resumo === undefined` passa a significar "ainda não sei".
   */
  const promoPronto = !promoCarregando && !promoErro;
  const promoDataOuIndefinido = promoPronto ? promoData : undefined;
  // Mapa estab_id → localidade_id (p/ saber as campanhas da cidade do parceiro).
  const estabIdToLoc = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parceirosAtivos) {
      if (p.localidadeId != null) m.set(String(p.id), String(p.localidadeId));
    }
    // `parceiros-ativos` filtra delivery = 1, então quem está em onboarding não
    // estaria aqui — e sem localidade o resumo de promoções não sabe quais
    // campanhas existem na cidade dele.
    for (const p of onboardingPendentes) {
      if (p.localidadeId != null) m.set(p.estabId, p.localidadeId);
    }
    return m;
  }, [parceirosAtivos, onboardingPendentes]);
  // Índice nome→id (do banco) p/ o overlay casar por nome quando o estab_id da
  // planilha não bate (ex: dashboard "novos formatado").
  // Nome repetido no banco (ex: 4 "Mega Lanches" em cidades diferentes) não vira
  // entrada: casar por nome ali seria sorteio, e o parceiro herdaria as campanhas
  // do homônimo. Ambíguo = fica de fora e o overlay simplesmente não casa.
  const parceirosNomeToId = useMemo(() => {
    const m = new Map<string, string>();
    const ambiguos = new Set<string>();
    for (const p of parceirosAtivos) {
      const key = normalizeNome(p.nome);
      if (!key) continue;
      if (m.has(key)) { ambiguos.add(key); continue; }
      m.set(key, String(p.id));
    }
    for (const key of ambiguos) m.delete(key);
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
    // Tendo estab_id, é SÓ por ele. O `find` com `id || nome` na mesma condição
    // devolvia o primeiro homônimo da lista (ex: "Mega Lanches" de Carandaí no
    // lugar do de Santos Dumont) e o painel de CRM/promoções mostrava os dados
    // da loja errada. Nome só quando a linha não tem id. Ver partnerIdentity.ts.
    if (estabId) return crmPartners.find(p => p.estabId === estabId) ?? null;
    const nome = selectedRow.estabelecimento?.trim();
    if (!nome) return null;
    return crmPartners.find(p => p.estabelecimento === nome) ?? null;
  }, [selectedRow, crmPartners, isCD]);

  const { setStatus: setOfertasStatus, records: ofertasRecords } = useOfertasDaCasa();
  const { getLocalidadeId, loading: cityIdsLoading } = useCityIds();

  const handleCampaignStatusChange = async (partnerId: string, campaignId: CampaignTypeId, newStatus: PromoStatus) => {
    // Campanhas descobertas dinamicamente (fora dos 3 tipos conhecidos) são somente-leitura —
    // não há onde persistir o status manual do CS pra elas (ver isEditableCampaign).
    if (!isEditableCampaign(campaignId)) return;
    if (campaignId === 'ofertas_da_casa') {
        setOfertasStatus(partnerId, promoStatusToOfertasStatus(newStatus), 'manual');
        setForceRender(prev => prev + 1);
        return;
    }
    const field = getCampaignOverrideField(campaignId);
    if (!field) return;
    // decisão de trabalho do CS → Supabase (otimista); o overlay reflete na hora
    const success = await setCampanhaOverride(partnerId, field, newStatus);
    if (!success) {
        setStatusSaveError('Não foi possível salvar o novo status. Verifique sua conexão e tente novamente.');
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
    setFiltroJornada(grupoVazio());
    setSelectedRow(null);
    setSortConfig({ key: 'indice_desempenho', direction: 'asc' });
    if (isCD && (currentView === 'carteira' || currentView === 'carteira_grupo' || currentView === 'acoes_promocionais' || currentView === 'pedido_mensal' || currentView === 'crm' || currentView === 'crm_jornada' || currentView === 'todos_parceiros')) {
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

  // Diagnóstico: cidades do dashboard sem localidade_id resolvido.
  // Roda pelo mesmo resolvedor da UI (banco → planilha), senão acusaria como
  // "não mapeada" toda cidade fora da planilha que o banco resolve sozinho.
  useEffect(() => {
    if (cityIdsLoading || rawRows.length === 0) return;
    const uniqueCidadesData = Array.from(new Set(rawRows.map(r => r.cidade).filter(Boolean)));
    const unmapped = uniqueCidadesData.filter(c => getLocalidadeId(c) === undefined);
    const mapped   = uniqueCidadesData.filter(c => getLocalidadeId(c) !== undefined);
    console.group('%c[Diagnóstico] Mapeamento de Cidades', 'color:#6366f1;font-weight:bold');
    console.log(`%cMapeadas (${mapped.length}):`, 'color:#10b981', mapped.sort().join(', '));
    if (unmapped.length > 0) {
      console.warn(`%c⚠ NÃO mapeadas (${unmapped.length}):`, 'color:#f59e0b', unmapped.sort().join(', '));
    } else {
      console.log('%c✅ Todas as cidades estão mapeadas!', 'color:#10b981');
    }
    console.groupEnd();
  }, [getLocalidadeId, cityIdsLoading, rawRows]);

  // 2. Enrichment & Permanent Filters
  /** Base enriquecida SEM o foco de cidades — é o que a tela de Gestores precisa. */
  const enrichedDataCompleto = useMemo(() => {
    const noCityIndexMap = buildNoCityIndexMap(rawRows);
    const rows = rawRows.map(row => {
      const partnerKey = row.estab_id || row.estabelecimento;
      const noCityIndex = noCityIndexMap.get(partnerKey);
      const enriched = enrichPartnerData(row, undefined, noCityIndex, mode);
      // relevância comercial da fonte única (aparece/edita no dashboard também)
      const rel = relMap[row.estab_id ?? ''] ?? relMap[enriched.estabelecimento];
      const withRel = rel != null ? { ...enriched, commercial_relevance: rel } : enriched;
      const comCampanhas = applyNomeBanco(overlayCampanhas(withRel, campanhasMap, parceirosNomeToId, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc));
      return aplicarPausaOnboarding(comCampanhas, pausaMap);
    })
      .filter((row: EnrichedPerformanceRow) => {
        const status = row.status?.toLowerCase() || '';
        if (status === 'desistencia' || status === 'desistência') return false;
        if (!showFinished && row.isFinished) return false;
        return true;
      });
    return mergeOfertasManualStatus(rows, ofertasRecords);
  }, [rawRows, mappingVersion, showFinished, forceRender, mode, ofertasRecords, relMap, campanhasMap, parceirosNomeToId, applyNomeBanco, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc, pausaMap]);

  /**
   * O que as telas de LISTA enxergam. A de Gestores fica de fora de propósito:
   * lá se escolhe o analista de cada cidade, e esconder cidades faria parecer
   * que elas sumiram do cadastro.
   */
  const enrichedData = useMemo(
    () => filtrarPorCidade(enrichedDataCompleto, r => r.cidade),
    [enrichedDataCompleto, filtrarPorCidade],
  );

  /**
   * Parceiros que assinaram e ainda não lançaram. O CS já oferece campanha pra
   * eles, então precisam aparecer na lista e no CRM — mas NÃO em `enrichedData`,
   * que alimenta a Central de KPIs, a Home e Contatos: loja que não abriu não
   * pode entrar em denominador de "% ativação de pedidos".
   */
  const preLancamentoRows = useMemo(() => {
    if (isCD) return [];
    const jaLancados = new Set<string>([
      ...enrichedDataCompleto.map(r => String(r.estab_id ?? '')),
      ...parceirosAtivos.map(p => String(p.id)),
    ]);
    const linhas = buildPreLancamentoRows({
      pendentes: onboardingPendentes,
      cards: onboardingCardsTrello,
      etapasPorEstabId: onboardingEtapasTrello,
      jaLancados,
      relMap,
      mode,
    });
    const prontas = linhas.map(row => aplicarPausaOnboarding(
      overlayCampanhas(row, campanhasMap, parceirosNomeToId, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc),
      pausaMap,
    ));
    // Card do Trello sem cidade não entra no foco da OKR: é cidade desconhecida,
    // não "talvez seja uma delas" (ver CityFocusContext).
    return filtrarPorCidade(prontas, row => row.cidade);
  }, [isCD, enrichedDataCompleto, parceirosAtivos, onboardingPendentes, onboardingCardsTrello, onboardingEtapasTrello, relMap, mode, campanhasMap, parceirosNomeToId, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc, pausaMap, filtrarPorCidade]);

  /** O que a Lista jornada 28D e o CRM Jornada enxergam: lançados + pré-lançamento. */
  const jornadaPool = useMemo(
    () => (preLancamentoRows.length === 0 ? enrichedData : [...enrichedData, ...preLancamentoRows]),
    [enrichedData, preLancamentoRows],
  );

  const indicadorEnrichedData = useMemo(
    () => {
      const base = mergeOfertasManualStatus(
        crmPartnersToEnrichedRows(crmPartners, relMap).map(r => applyNomeBanco(overlayCampanhas(r, campanhasMap, parceirosNomeToId, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc))),
        ofertasRecords,
      );
      // Suplementa com parceiros ATIVOS do banco que ainda não estão na planilha
      // (ex: recém-ativados sem pedido). Assim eles aparecem na carteira.
      const existing = new Set(base.map(r => String(r.estab_id ?? '')));
      const extras: EnrichedPerformanceRow[] = [];
      for (const p of parceirosAtivos) {
        if (existing.has(String(p.id))) continue;
        // Marketplace e Cardápio Digital são listas disjuntas (ver jornada.ts).
        // `parceirosAtivos` traz os dois de propósito (serve de índice id→cidade
        // p/ o app inteiro), então quem monta LISTA filtra pelo produto.
        if (p.cardapioDigital !== isCD) continue;
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
        extras.push(overlayCampanhas(row, campanhasMap, parceirosNomeToId, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc));
      }
      return filtrarPorCidade([...base, ...extras], r => r.cidade);
    },
    [crmPartners, relMap, forceRender, ofertasRecords, campanhasMap, parceirosAtivos, mode, isCD, parceirosNomeToId, applyNomeBanco, campanhaOverrides, promoDataOuIndefinido, estabIdToLoc, mappingVersion, filtrarPorCidade],
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
    const linhas = desempenhoRawRows.map(row => {
      const partnerKey = row.estab_id || row.estabelecimento;
      const noCityIndex = noCityIndexMap.get(partnerKey);
      return enrichDesempenhoPartnerData(row, undefined, noCityIndex, enrichMode);
    }).filter((row: EnrichedPerformanceRow) => {
      const status = row.status?.toLowerCase().trim() || '';
      return status !== 'cancelado' && status !== 'cancelada';
    });
    return filtrarPorCidade(linhas, row => row.cidade);
  }, [desempenhoRawRows, mappingVersion, mode, isCD, filtrarPorCidade]);


  /**
   * A home mostra a carteira de quem entrou, sem os filtros das telas — ela é
   * o ponto de partida do dia, não um recorte do dashboard.
   */
  const homeRows = useMemo(
    () => (managerFilter ? enrichedData.filter(row => row.analista === managerFilter) : enrichedData),
    [enrichedData, managerFilter]
  );

  /** Campos filtráveis desta tela (CD não tem campanha nem pré-lançamento). */
  const camposFiltro = useMemo(() => camposFiltraveisJornada({ isCD }), [isCD]);

  /**
   * A carteira da sessão entra como condição visível, não como filtro oculto.
   * Trocar de gestor continua sendo no seletor de sessão; aqui ela só é
   * semeada (e re-semeada se a sessão mudar por fora).
   */
  useEffect(() => {
    setFiltroJornada(atual => {
      const semGestor = atual.itens.filter(i => !(i.tipo === 'condicao' && i.origem === 'sessao'));
      if (!managerFilter) return semGestor.length === atual.itens.length ? atual : { ...atual, itens: semGestor };
      return {
        ...atual,
        itens: [
          { tipo: 'condicao' as const, id: novoId(), campoId: 'analista', operador: 'e' as const, valor: { tipo: 'texto' as const, texto: managerFilter }, origem: 'sessao' as const },
          ...semGestor,
        ],
      };
    });
  }, [managerFilter]);

  /**
   * Contexto da avaliação. `hojeISO()` (string) como dependência, e não
   * `new Date()`, senão o memo do resultado invalidaria a cada render.
   */
  const hojeDia = hojeISO();
  const ctxFiltro = useMemo<ContextoAvaliacao>(() => ({
    hoje: new Date(`${hojeDia}T00:00:00`),
    promoPronto,
    crmPronto: !crmNotasCarregando,
    notaPorParceiro: crmNotasMap,
    localidadePorEstab: estabIdToLoc,
  }), [hojeDia, promoPronto, crmNotasCarregando, crmNotasMap, estabIdToLoc]);

  /**
   * A busca do Header continua fora do construtor: é global (vale pro CRM,
   * Todos os Parceiros etc) e achar um parceiro pelo nome tem que ser mais
   * rápido que montar uma condição.
   */
  const poolBuscado = useMemo(() => {
    if (!searchQuery) return jornadaPool;
    const q = searchQuery.toLowerCase();
    return jornadaPool.filter(row => row.estabelecimento.toLowerCase().includes(q));
  }, [jornadaPool, searchQuery]);

  const resultadoFiltro = useMemo(
    () => aplicarFiltroComposto(poolBuscado, filtroJornada, camposFiltro, ctxFiltro),
    [poolBuscado, filtroJornada, camposFiltro, ctxFiltro],
  );


  // CRM Jornada: parte de `enrichedData` cru (e não de baseFilteredData) pra não
  // herdar em silêncio os filtros da tela da lista — aba de período e filtro de
  // promo/cupom fariam o kanban esconder justamente as colunas que ele existe
  // pra mostrar. Cidade/gestor/busca a própria tela aplica.
  //
  // O corte <= 28 é explícito: a jornada vem do banco com folga de dias (ver
  // comentário do filteredTableData logo abaixo).
  const crmJornadaPartners = useMemo(
    () => jornadaRowsToCrmPartners(jornadaPool.filter(row => row.dias_desde_lancamento <= 28)),
    [jornadaPool],
  );

  // A aba de período é escopo, não condição: as faixas são mutuamente
  // exclusivas e o corte da folga de dias do banco (ver jornada.ts) é regra de
  // janela de dados, não filtro do usuário. Ver utils/faixaJornada.ts.
  const contagemPorFaixa = useMemo(() => contarPorFaixa(resultadoFiltro.linhas), [resultadoFiltro]);
  /** Total da aba SEM as condições — é o "de M" do contador. */
  const totalDaAba = useMemo(
    () => poolBuscado.filter(row => estaNaAba(row, ageGroupFilter)).length,
    [poolBuscado, ageGroupFilter],
  );

  /** Traz de volta, como condição visível, quem foi barrado por não ter carteira. */
  const incluirSemCarteira = () => {
    setFiltroJornada(f => ({
      ...f,
      juncao: 'ou',
      itens: [...f.itens, { tipo: 'condicao', id: novoId(), campoId: 'carteira_indefinida', operador: 'verdadeiro', valor: { tipo: 'nenhum' } }],
    }));
  };

  /**
   * Texto do estado vazio. Aponta QUAL condição está zerando (leave-one-out) —
   * é o que separa um construtor usável de um beco sem saída.
   */
  const vazioDaTabela = useMemo(() => {
    if (resultadoFiltro.pausado) return undefined;
    const condicoes = filtroJornada.itens.filter(i => i.tipo === 'condicao');
    if (condicoes.length === 0) return undefined;

    const culpada = condicaoCulpadaPeloVazio(poolBuscado, filtroJornada, camposFiltro, ctxFiltro);
    const campoCulpado = culpada ? camposFiltro.find(c => c.id === culpada.campoId) : null;
    const nomeAba = ABAS_JORNADA.find(t => t.id === ageGroupFilter)?.label ?? 'jornada';
    const quantas = condicoes.length;

    return {
      titulo: 'Nenhum parceiro passa por esses filtros',
      descricao: [
        `Dos ${totalDaAba} parceiros de "${nomeAba}", nenhum atende`,
        quantas === 1 ? 'à condição.' : filtroJornada.juncao === 'e' ? `às ${quantas} condições ao mesmo tempo.` : `a nenhuma das ${quantas} condições.`,
        campoCulpado ? `A condição "${campoCulpado.rotulo}" é a que está zerando o resultado.` : '',
      ].filter(Boolean).join(' '),
      acoes: [
        ...(quantas >= 2 && filtroJornada.juncao === 'e'
          ? [{ rotulo: 'Trocar "e" por "ou"', onClick: () => setFiltroJornada(f => ({ ...f, juncao: 'ou' as const })) }]
          : []),
        { rotulo: 'Limpar os filtros', onClick: () => setFiltroJornada(f => ({ ...f, itens: f.itens.filter(i => i.tipo === 'condicao' && i.origem === 'sessao') })) },
      ],
    };
  }, [resultadoFiltro, filtroJornada, poolBuscado, camposFiltro, ctxFiltro, ageGroupFilter, totalDaAba]);

  let filteredTableData = resultadoFiltro.linhas.filter(row => estaNaAba(row, ageGroupFilter));

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

  // KPIs do topo da Jornada: refletem exatamente os parceiros da tabela abaixo
  // (mesmos filtros + período selecionado).
  //
  // Promoção usa promo_resumo.aprovado (mesma fonte da coluna "Promoções" da
  // tabela) em vez de campaign_statuses.super_promos — este último só reflete
  // o mapa `campanhas` (Netlify function), que fica em 0 pra praticamente todo
  // parceiro novo; promo_resumo vem do `promo-status`, item a item, e é quem
  // realmente aparece como aprovado no painel.
  //
  // Só lançados: loja que não abriu não pode entrar no denominador de "%
  // ativação de pedidos" — ela não teve chance de vender.
  const jornadaKpiRows = filteredTableData.filter(row => !row.pre_lancamento);
  const jornadaKpiTotal = jornadaKpiRows.length || 1;
  const jornadaKpiPedidosCount = jornadaKpiRows.filter(row => row.total_pedidos > 0).length;
  const jornadaKpiPromocaoCount = jornadaKpiRows.filter(row => (row.promo_resumo?.aprovado ?? 0) > 0).length;
  const jornadaKpiCupomCount = jornadaKpiRows.filter(row => getRowCampaignStatus(row, 'cupons_destaque') === 'ativo').length;

  /** Contadores do cabeçalho quando a aba Pré-lançamento está ativa. */
  const preLancamentoNaTela = filteredTableData.filter(row => row.pre_lancamento);
  const preLancamento7d = preLancamentoNaTela.filter(r => (r.pre_lancamento?.dias ?? 0) >= 7).length;
  const preLancamento14d = preLancamentoNaTela.filter(r => (r.pre_lancamento?.dias ?? 0) >= 14).length;

  const activeEnrichedPool = currentView === 'churn' || currentView === 'todos_parceiros'
    ? (isCD ? enrichedDesempenhoData : indicadorEnrichedData)
    : currentView === 'cd_desempenho'
      ? enrichedDesempenhoData
      // pool da jornada: inclui pré-lançamento, senão clicar numa dessas linhas
      // cairia no fallback e a ficha receberia uma cópia congelada
      : jornadaPool;

  const currentSelectedRow = selectedRow
    ? (findPartner(activeEnrichedPool, selectedRow) ?? selectedRow)
    : null;

  const handleRelevanceChange = (partnerId: string, score: number) => {
    if (!partnerId) return;
    void updateRel(partnerId, score);
  };

  const handleRowClick = (row: EnrichedPerformanceRow) => {
    const latest = findPartner(activeEnrichedPool, row) ?? row;
    setSelectedRow(latest);
    if (currentView !== 'dashboard' && currentView !== 'cd_desempenho' && currentView !== 'churn' && currentView !== 'todos_parceiros') {
      setCurrentView('dashboard');
    }
  };

  const searchablePartners = useMemo(() => {
    const map = new Map<string, EnrichedPerformanceRow>();
    const add = (rows: EnrichedPerformanceRow[]) => {
      for (const row of rows) {
        // Sem estab_id, nome+cidade é o mais perto de identidade que dá: só
        // pelo nome, dois homônimos de cidades diferentes viravam um resultado.
        const key = (String(row.estab_id ?? '').trim()
          || `${row.estabelecimento ?? ''}|${row.cidade ?? ''}`).trim().toLowerCase();
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
    if (isCD) {
      const inDesempenho = findPartner(enrichedDesempenhoData, row);
      setSelectedRow(inDesempenho ?? row);
      setCurrentView('cd_desempenho');
    } else {
      // Prioriza o pool real da Jornada: um estabelecimento recém-lançado
      // também aparece no pool CRM genérico (sem filtro de data), então
      // checar CRM primeiro sempre "ganhava" e mandava o usuário para a
      // tela genérica em vez da tela de onboarding de verdade.
      const inDashboard = findPartner(enrichedData, row);
      if (inDashboard) {
        setSelectedRow(inDashboard);
        setCurrentView('dashboard');
      } else {
        const inIndicador = findPartner(indicadorEnrichedData, row);
        setSelectedRow(inIndicador ?? row);
        setCurrentView('todos_parceiros');
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
      // Ctrl/Cmd+J anota no diário sem sair da tela: o hábito de "acabei de
      // fazer, anoto agora" não sobrevive a atravessar o menu.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAnotacaoRapidaOpen(prev => !prev);
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
      <OnboardingCompletoAlert />
      <Header
        currentView={currentView}
        onNavigate={setCurrentView}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onOpenPartnerSearch={() => setPartnerSearchOpen(true)}
        notificationCount={tarefasPendentes.contagemPorNivel.overdue + tarefasPendentes.contagemPorNivel.today}
        inscreverAlerta={tarefasPendentes.inscreverAlerta}
      />
      <div className="flex flex-1 min-h-0 relative">
        <NavigationSidebar 
          currentView={currentView}
          onNavigate={setCurrentView}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-900 transition-all duration-300">
          {currentView === 'home' ? (
            <HomeView rows={homeRows} onPartnerClick={handleRowClick} onNavigate={setCurrentView} />
        ) : currentView === 'cs_kpis' ? (
            <CsKpisView />
        ) : currentView === 'trello' ? (
            <TrelloView />
        ) : currentView === 'tarefas_dia' ? (
            <TarefasDoDiaView
              tarefas={tarefasPendentes.tarefasUnificadas}
              tarefasSemPrazo={tarefasPendentes.tarefasSemPrazo}
              contagemPorNivel={tarefasPendentes.contagemPorNivel}
              ativado={tarefasPendentes.ativado}
              permissao={tarefasPendentes.permissao}
              onAtivar={tarefasPendentes.ativar}
              onDesativar={tarefasPendentes.desativar}
              volume={tarefasPendentes.volume}
              onMudarVolume={tarefasPendentes.mudarVolume}
              onTestarSom={tarefasPendentes.testarSom}
              membroFiltro={tarefasPendentes.membroFiltro}
              membrosDisponiveis={tarefasPendentes.membrosDisponiveis}
              onMudarMembro={tarefasPendentes.mudarMembroFiltro}
              boardsIgnorados={tarefasPendentes.boardsIgnorados}
              boardsDisponiveis={tarefasPendentes.boardsDisponiveis}
              onToggleBoardIgnorado={tarefasPendentes.toggleBoardIgnorado}
              listasIgnoradas={tarefasPendentes.listasIgnoradas}
              listasPorBoard={tarefasPendentes.listasPorBoard}
              onToggleListaIgnorada={tarefasPendentes.toggleListaIgnorada}
              upsertCrmNote={upsertCrmNote}
              onRefreshTrello={() => { refreshOnboardingTrello(); refreshTrelloTarefas(); }}
            />
        ) : currentView === 'diario' ? (
            <DiarioView perfil={profile} partners={searchablePartners} />
        ) : currentView === 'settings' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SettingsView />
          </div>
        ) : currentView === 'about' ? (
          <AboutView />
        ) : currentView === 'managers' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ManagersView
              data={enrichedDataCompleto}
              onMappingChange={() => setMappingVersion(v => v + 1)}
              atribuicoes={atribuicoesCs}
              atribuicoesError={atribuicoesCsError}
              salvarCidade={salvarCidadeCs}
              salvarParceiro={salvarParceiroCs}
            />
          </div>
        ) : currentView === 'profile' ? (
          <ProfileView />
        ) : currentView === 'contacts' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ContactsView data={enrichedData} onRowClick={handleRowClick} managerFilter={managerFilter} />
          </div>
        ) : currentView === 'reports' ? (
          <ReportsView
            data={enrichedData}
            managerFilter={managerFilter}
            onNavigateToCrmJornada={!isCD ? () => setCurrentView('crm_jornada') : undefined}
          />
        ) : currentView === 'carteira' ? (
          <CarteiraView
            rows={carteiraRowsNoFoco}
            isLoading={loadingCarteira}
            isRefreshing={refreshingCarteira}
            error={carteiraError}
            isUsingCache={carteiraUsingCache}
            lastSyncTime={carteiraLastSync}
            onRefresh={refreshCarteiraData}
            managerFilter={managerFilter}
            onNavigateToPartner={estab => navigateToPartner({ estabelecimento: estab.nome, estab_id: String(estab.id) } as EnrichedPerformanceRow)}
          />
        ) : currentView === 'carteira_grupo' ? (
          <CarteiraPorGrupoView
            rows={carteiraRowsNoFoco}
            isLoading={loadingCarteira}
            isRefreshing={refreshingCarteira}
            error={carteiraError}
            isUsingCache={carteiraUsingCache}
            lastSyncTime={carteiraLastSync}
            onRefresh={refreshCarteiraData}
            managerFilter={managerFilter}
            onNavigateToPartner={estab => navigateToPartner({ estabelecimento: estab.nome, estab_id: String(estab.id) } as EnrichedPerformanceRow)}
          />
        ) : currentView === 'acoes_promocionais' ? (
          <AcoesPromocionaisView
            cidades={acoesPromocionaisCidadesNoFoco}
            totais={acoesPromocionaisTotais}
            isLoading={loadingAcoesPromocionais}
            isRefreshing={refreshingAcoesPromocionais}
            error={acoesPromocionaisError}
            lastSyncTime={acoesPromocionaisLastSync}
            onRefresh={refreshAcoesPromocionais}
            logoByNome={logoByNome}
            managerFilter={managerFilter}
          />
        ) : currentView === 'crm' ? (
          <CrmView
            partners={crmPartnersNoFoco}
            parseInfo={crmParseInfo}
            isLoading={loadingCrm}
            isRefreshing={refreshingCrm}
            error={crmError}
            isUsingCache={crmUsingCache}
            lastSyncTime={crmLastSync}
            onRefresh={refreshCrmData}
            managerFilter={managerFilter}
            searchQuery={searchQuery}
            cityFilter={cityFilterEfetivo}
            setCityFilter={setCityFilter}
            onStatusChange={handleStatusChange}
            onCampaignStatusChange={handleCampaignStatusChange}
            getNote={getCrmNote}
            upsertNote={upsertCrmNote}
            registerContact={registerCrmContact}
          />
        ) : currentView === 'crm_jornada' ? (
          <CrmJornadaView
            partners={crmJornadaPartners}
            managerFilter={managerFilter}
            searchQuery={searchQuery}
            cityFilter={cityFilterEfetivo}
            setCityFilter={setCityFilter}
            onCampaignStatusChange={handleCampaignStatusChange}
            getNote={getCrmNote}
            upsertNote={upsertCrmNote}
            registerContact={registerCrmContact}
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
        ) : currentView === 'onboarding' ? (
          <OnboardingView
            pendentes={onboardingPendentesNoFoco}
            isLoading={loadingOnboarding}
            isRefreshing={refreshingOnboarding}
            error={onboardingError}
            lastSyncTime={onboardingLastSync}
            onRefresh={() => { refreshOnboarding(); refreshOnboardingTrello(); }}
            managerFilter={managerFilter}
            mode={mode}
            etapasTrello={onboardingEtapasTrello}
            cardsTrello={onboardingCardsTrello}
            listasTrello={onboardingListasTrello}
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
              onCampaignStatusChange={handleCampaignStatusChange}
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
              cityFilter={cityFilterEfetivo}
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
              onCampaignStatusChange={handleCampaignStatusChange}
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
              cityFilter={cityFilterEfetivo}
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
              cityFilter={cityFilterEfetivo}
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
                onCampaignStatusChange={handleCampaignStatusChange}
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

                    {!isCD && ageGroupFilter === 'pre' ? (
                      // Percentual de ativação não diz nada sobre loja que não abriu —
                      // aqui o que importa é quanto tempo está esperando.
                      <div className="flex items-center gap-4 md:gap-6 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-slate-700 dark:text-slate-200 leading-none tabular-nums">{preLancamentoNaTela.length}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">Em pré-lançamento</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-amber-600 dark:text-amber-400 leading-none tabular-nums">{preLancamento7d}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">7+ dias</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-red-600 dark:text-red-400 leading-none tabular-nums">{preLancamento14d}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">14+ dias</p>
                        </div>
                      </div>
                    ) : !isCD && (
                      <div className="flex items-center gap-4 md:gap-6 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none tabular-nums">
                            {((jornadaKpiPedidosCount / jornadaKpiTotal) * 100).toFixed(1)}%
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">Ativação de Pedidos</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-violet-600 dark:text-violet-400 leading-none tabular-nums">
                            {((jornadaKpiPromocaoCount / jornadaKpiTotal) * 100).toFixed(1)}%
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">Captação de Promoção</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center px-1">
                          <p className="text-lg font-black text-amber-600 dark:text-amber-400 leading-none tabular-nums">
                            {((jornadaKpiCupomCount / jornadaKpiTotal) * 100).toFixed(1)}%
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1.5 whitespace-nowrap">Captação de Cupons</p>
                        </div>
                      </div>
                    )}

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


                <div className="shrink-0 flex items-center justify-between px-6 bg-slate-50/30 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex gap-6 overflow-x-auto scrollbar-hide pt-2">
                      {ABAS_JORNADA.filter(t => !isCD || t.id !== 'pre').map(tab => (
                          <button
                              key={tab.id}
                              onClick={() => setAgeGroupFilter(tab.id)}
                              className={`pb-3 pt-2 px-1 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${ageGroupFilter === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                          >
                              {tab.label}
                              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${ageGroupFilter === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                  {resultadoFiltro.pausado ? '—' : contagemPorFaixa[tab.id]}
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

                <FilterBar
                  filtro={filtroJornada}
                  setFiltro={setFiltroJornada}
                  campos={camposFiltro}
                  pool={poolBuscado}
                  ctx={ctxFiltro}
                  exibidos={filteredTableData.length}
                  total={totalDaAba}
                  abaLabel={ABAS_JORNADA.find(t => t.id === ageGroupFilter)?.label}
                  pausado={resultadoFiltro.pausado}
                  motivoPausa={resultadoFiltro.motivo}
                  incompletas={resultadoFiltro.incompletas}
                  excluidosSemCarteira={resultadoFiltro.excluidosSemCarteira}
                  onIncluirSemCarteira={incluirSemCarteira}
                />

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
                      vazio={vazioDaTabela}
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

      {anotacaoRapidaOpen && (
        <AnotacaoRapida
          onFechar={() => setAnotacaoRapidaOpen(false)}
          perfil={profile}
          partners={searchablePartners}
        />
      )}

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
