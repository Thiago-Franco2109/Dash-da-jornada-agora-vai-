import { useState, useMemo, useEffect } from 'react';
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
import { PARTNER_DATA_SOURCES } from './config/dataSource';
import { enrichPartnerData, type EnrichedPerformanceRow } from './utils/calculations';
import { useDataSync } from './hooks/useDataSync';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import { useDailyAccessSync } from './hooks/useDailyAccessSync';
import { identifyManagerFromUser } from './config/managerMapping';

function App() {
  const { user, isAuthenticated, isLoading: loadingAuth, logout } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings' | 'about' | 'managers' | 'profile' | 'contacts' | 'reports'>('dashboard');
  const [mappingVersion, setMappingVersion] = useState(0); 
  const [showFinished, setShowFinished] = useState(false);


  const [cityFilter, setCityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState<'all' | '1-7' | '8-14' | '15-21' | '22-28'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'indice_desempenho', direction: 'asc' });
  const [selectedRow, setSelectedRow] = useState<EnrichedPerformanceRow | null>(null);

  // 1. Data Synchronization — só inicia após autenticação
  const { data: rawRows, isLoading: loadingSync, error: syncError, lastSyncTime, isUsingCache, refreshData } = useDataSync({
    sources: PARTNER_DATA_SOURCES,
    enabled: isAuthenticated,
  });

  // -- Live API Access Data (Unique Store Accesses) — só inicia após autenticação
  const { accessData, loadingAccess, accessError, refreshAccessData } = useDailyAccessSync({ enabled: isAuthenticated });

  // 1.1 Automatic Manager Filter based on Google Account
  useEffect(() => {
    if (isAuthenticated && user && !managerFilter) {
      const identifiedManager = identifyManagerFromUser(user);
      if (identifiedManager) {
        console.log(`[App] Gestor identificado: ${identifiedManager} (via conta: ${user.name || user.email})`);
        setManagerFilter(identifiedManager);
      }
    }
  }, [isAuthenticated, user, managerFilter]);

  // Failsafe: se houver erro de autenticação em qualquer hook, força logout
  useEffect(() => {
    const isAuthError = (err: string | null) => 
      err?.includes('401') || err?.toLowerCase().includes('unauthorized');

    if (isAuthError(syncError) || isAuthError(accessError)) {
      console.warn("[App] Erro de autenticação detectado nos hooks de sincronização. Redirecionando...");
      logout();
    }
  }, [syncError, accessError, logout]);

  // 2. Enrichment & Permanent Filters
  const enrichedData = useMemo(
    () =>
      rawRows.map(row => enrichPartnerData(row))
      .filter((row: EnrichedPerformanceRow) => {
        const status = row.status?.toLowerCase() || '';
        if (status === 'desistencia' || status === 'desistência') return false;
        if (!showFinished && row.isFinished) return false;
        return true;
      }),
    [rawRows, mappingVersion, showFinished]
  );

  // Extract unique cities and managers
  const uniqueCities = Array.from(new Set(enrichedData.map(row => row.cidade))).sort();
  const uniqueManagers = Array.from(new Set(enrichedData.map(row => row.analista || 'Desconhecido'))).filter(m => m !== 'Desconhecido').sort();

  // Filter Data
  let filteredTableData = enrichedData.filter((row: EnrichedPerformanceRow) => {
    let matches = true;
    if (cityFilter && row.cidade !== cityFilter) matches = false;
    if (searchQuery && !row.estabelecimento.toLowerCase().includes(searchQuery.toLowerCase())) matches = false;
    if (priorityFilter && row.priority_stars.toString() !== priorityFilter) matches = false;
    if (managerFilter && row.analista !== managerFilter) matches = false;

    const days = row.dias_desde_lancamento;
    if (ageGroupFilter === '1-7' && (days < 1 || days > 7)) matches = false;
    if (ageGroupFilter === '8-14' && (days < 8 || days > 14)) matches = false;
    if (ageGroupFilter === '15-21' && (days < 15 || days > 21)) matches = false;
    if (ageGroupFilter === '22-28' && (days < 22 || days > 28)) matches = false;

    return matches;
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

  const currentSelectedRow = selectedRow
    ? (enrichedData.find(r => r.estabelecimento === selectedRow.estabelecimento) ?? selectedRow)
    : null;

  const handleRowClick = (row: EnrichedPerformanceRow) => {
    const latest = enrichedData.find(r => r.estabelecimento === row.estabelecimento) ?? row;
    setSelectedRow(latest);
    if (currentView !== 'dashboard') {
      setCurrentView('dashboard');
    }
  };

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
      />
      <div className="flex flex-1 min-h-0 relative">
        <NavigationSidebar 
          currentView={currentView}
          onNavigate={setCurrentView}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-900 transition-all duration-300">
          {currentView === 'settings' ? (
          <SettingsView />
        ) : currentView === 'about' ? (
          <AboutView />
        ) : currentView === 'managers' ? (
          <ManagersView data={enrichedData} onMappingChange={() => setMappingVersion(v => v + 1)} />
        ) : currentView === 'profile' ? (
          <ProfileView />
        ) : currentView === 'contacts' ? (
          <ContactsView data={enrichedData} onRowClick={handleRowClick} />
        ) : currentView === 'reports' ? (
          <ReportsView data={enrichedData} />
        ) : (
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 xl:border-r border-slate-200 dark:border-slate-700">
            {currentSelectedRow ? (
              <PartnerDetailsView
                partner={currentSelectedRow}
                onBack={() => setSelectedRow(null)}
                dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
                onRefresh={() => setMappingVersion(v => v + 1)}
              />
            ) : (
              <>
                <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">Jornada do Parceiro – Monitoramento de 28 Dias</h1>
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

                <div className="flex items-center justify-between px-6 bg-slate-50/30 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
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
                                  {enrichedData.filter(r => {
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

                <FilterToolbar
                  cityFilter={cityFilter}
                  setCityFilter={setCityFilter}
                  cities={uniqueCities}
                  priorityFilter={priorityFilter}
                  setPriorityFilter={setPriorityFilter}
                  managerFilter={managerFilter}
                  setManagerFilter={setManagerFilter}
                  managers={uniqueManagers}
                />

                {loadingSync && rawRows.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-slate-500 font-medium">Sincronizando dados...</p>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                    <PerformanceTable
                      data={filteredTableData}
                      sortConfig={sortConfig}
                      requestSort={requestSort}
                      onRowClick={handleRowClick}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </main>
      </div>

    </div>
  );
}

export default App;
