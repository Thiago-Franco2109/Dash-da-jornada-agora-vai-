import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import Header from './components/Header';
import FilterToolbar from './components/FilterToolbar';
import PerformanceTable from './components/PerformanceTable';
import type { SortConfig } from './components/PerformanceTable';
import PartnerDetailsView from './components/PartnerDetailsView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import AboutView from './components/AboutView';
import { DATA_SOURCE } from './config/dataSource';
import { enrichPartnerData, type EnrichedPerformanceRow } from './utils/calculations';
import { useDataSync } from './hooks/useDataSync';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import { useDailyAccessSync } from './hooks/useDailyAccessSync';

function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings' | 'about'>('dashboard');
  const [reportsOpen, setReportsOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState<'all' | '1-7' | '8-14' | '15-21' | '22-28'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'indice_desempenho', direction: 'asc' });
  const [selectedRow, setSelectedRow] = useState<EnrichedPerformanceRow | null>(null);

  const { data: syncData, isLoading: loadingSync, error: syncError, lastSyncTime, isUsingCache, refreshData } = useDataSync({
    sheetId: DATA_SOURCE.sheetId,
    range: DATA_SOURCE.range
  });


  // -- Live API Access Data (Unique Store Accesses) ---------------------------
  const { accessData, loadingAccess, refreshAccessData } = useDailyAccessSync();

  // Enrich Data
  const enrichedData = useMemo(() =>
    syncData
      .map(row => enrichPartnerData(row))
      .filter(row => {
        const status = row.status?.toLowerCase() || '';
        return status !== 'desistencia' && status !== 'desistência';
      }),
    [syncData]
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

    // Age Group Filter
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

      // Handle specific types
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




  // Keep selectedRow in sync
  const currentSelectedRow = selectedRow
    ? (enrichedData.find(r => r.estabelecimento === selectedRow.estabelecimento) ?? selectedRow)
    : null;

  // Always pass the latest enriched version on click.
  const handleRowClick = (row: EnrichedPerformanceRow) => {
    const latest = enrichedData.find(r => r.estabelecimento === row.estabelecimento) ?? row;
    setSelectedRow(latest);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Auth Gate
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden relative bg-white dark:bg-slate-900">
      <Header currentView={currentView} onNavigate={setCurrentView} onToggleReports={() => setReportsOpen(o => !o)} reportsOpen={reportsOpen} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      <main className="flex flex-1 flex-col xl:flex-row h-full">
        {currentView === 'settings' ? (
          <SettingsView />
        ) : currentView === 'about' ? (
          <AboutView />
        ) : (
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 xl:border-r border-slate-200 dark:border-slate-700">
            {currentSelectedRow ? (
              <PartnerDetailsView
                partner={currentSelectedRow}
                onBack={() => setSelectedRow(null)}
                dailyAccessData={accessData[currentSelectedRow.estabelecimento.toLowerCase()]}
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
                      
                      {syncError && (
                        <div className="ml-9 p-2 bg-amber-100/50 dark:bg-amber-800/20 rounded border border-amber-200/50 dark:border-amber-700/30">
                          <p className="text-[11px] font-mono uppercase tracking-wider mb-1 opacity-70">Detalhe técnico do erro:</p>
                          <p className="text-xs font-mono break-all">{syncError}</p>
                        </div>
                      )}
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

                {/* Age Group Tabs */}
                <div className="border-b border-slate-200 dark:border-slate-800 px-6 flex gap-6 overflow-x-auto scrollbar-hide bg-slate-50/30 dark:bg-slate-900/50 pt-2">
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

                {loadingSync ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-slate-500 font-medium">Sincronizando dados...</p>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 divide-y divide-slate-100 dark:divide-slate-800">

                    {/* Table */}
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

      {/* Reports Drawer Overlay */}
      {reportsOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={() => setReportsOpen(false)}
          />
          {/* Panel */}
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">assessment</span>
                Relatórios
              </h2>
              <button
                onClick={() => setReportsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <ReportsView data={enrichedData} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
