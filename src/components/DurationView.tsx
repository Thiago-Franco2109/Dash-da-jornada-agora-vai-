
import { useMemo } from 'react';
import { useOnboardingDuration } from '../hooks/useOnboardingDuration';

export default function DurationView() {
  const { data, isLoading, error, refresh } = useOnboardingDuration();

  // Calculate global averages per list
  const listAverages = useMemo(() => {
    const totals: Record<string, { name: string; sum: number; count: number }> = {};
    
    data.forEach(card => {
      card.durations.forEach(d => {
        if (!totals[d.listId]) {
          totals[d.listId] = { name: d.listName, sum: 0, count: 0 };
        }
        totals[d.listId].sum += d.durationDays;
        totals[d.listId].count += 1;
      });
    });

    return Object.values(totals)
      .map(t => ({
        name: t.name,
        average: t.count > 0 ? t.sum / t.count : 0
      }))
      .sort((a, b) => b.average - a.average);
  }, [data]);

  if (isLoading && data.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-500 font-medium italic">Analisando histórico do Trello...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-10 bg-slate-50 dark:bg-slate-900">
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 p-6 rounded-2xl text-red-800 dark:text-red-400">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined">error</span>
            <h3 className="font-bold">Erro ao carregar dados do Trello</h3>
          </div>
          <p className="text-sm opacity-90">{error}</p>
          <button 
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-800/20 hover:bg-red-200 dark:hover:bg-red-800/40 rounded-lg text-xs font-bold transition-all"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-900 min-h-screen overflow-y-auto">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-600 rounded-lg shadow-lg shadow-emerald-600/20">
                <span className="material-symbols-outlined text-white text-2xl">timer</span>
              </div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Duração do Onboarding</h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Análise de tempo de permanência em cada etapa do processo.</p>
          </div>

          <button
            onClick={refresh}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
          >
            <span className={`material-symbols-outlined text-lg ${isLoading ? 'animate-spin' : ''}`}>sync</span>
            Atualizar Trello
          </button>
        </div>

        {/* TOP STATS - AVERAGES PER LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {listAverages.slice(0, 4).map((list, idx) => (
            <div key={list.name} className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className={`size-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500`}>
                  <span className="text-sm font-black">#{idx + 1}</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-lg">Gargalo</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">{list.name}</p>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-1">{list.average.toFixed(1)} <span className="text-lg font-medium text-slate-400">dias</span></h2>
              <p className="text-xs font-medium text-slate-500">Média de permanência</p>
            </div>
          ))}
        </div>

        {/* MAIN DATA TABLE */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
          <div className="p-8 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Detalhado por Parceiro</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-900 px-3 py-1 rounded-full">{data.length} cards analisados</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Parceiro</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tempo Total</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fluxo por Etapa (Duração em dias)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data.map(card => (
                  <tr key={card.cardId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors group">
                    <td className="px-8 py-6">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">{card.cardName}</h4>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-tighter">ID: {card.cardId.slice(-6)}</p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`text-xl font-black ${card.totalOnboardingDays > 15 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                          {card.totalOnboardingDays}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Dias</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide max-w-[600px]">
                        {card.durations.map((d, i) => (
                          <div key={`${card.cardId}-${i}`} className="flex items-center shrink-0">
                            <div 
                              className={`flex flex-col items-center p-3 rounded-xl border ${d.durationDays > 5 ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800/30' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}
                              title={`${d.listName}: ${d.durationDays} dias`}
                            >
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[80px]">{d.listName}</span>
                              <span className={`text-sm font-bold ${d.durationDays > 5 ? 'text-orange-600' : 'text-slate-700 dark:text-slate-300'}`}>{d.durationDays}d</span>
                            </div>
                            {i < card.durations.length - 1 && (
                              <span className="material-symbols-outlined text-slate-300 mx-1 text-sm">chevron_right</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.length === 0 && !isLoading && (
            <div className="py-20 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">search_off</span>
              <p className="text-slate-400 font-medium">Nenhum dado de histórico encontrado no Trello.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
