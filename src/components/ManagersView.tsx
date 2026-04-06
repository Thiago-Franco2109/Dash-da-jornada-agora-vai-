
import { useState, useMemo } from 'react';
import { INITIAL_CITY_MANAGER_MAP, saveManagerOverride, getManagerOverrides, type Manager } from '../config/managerMapping';
import { type EnrichedPerformanceRow } from '../utils/calculations';

interface ManagersViewProps {
    data: EnrichedPerformanceRow[];
    onMappingChange: () => void;
}

export default function ManagersView({ data, onMappingChange }: ManagersViewProps) {
    const [overrides, setOverrides] = useState(getManagerOverrides());
    const [searchTerm, setSearchTerm] = useState('');

    // Prepara a lista de todas as cidades existentes nos dados, mais as do mapa inicial
    const allCities = useMemo(() => {
        const fromData = Array.from(new Set(data.map(d => d.cidade)));
        const fromInitial = Object.keys(INITIAL_CITY_MANAGER_MAP);
        return Array.from(new Set([...fromData, ...fromInitial])).sort();
    }, [data]);

    const filteredCities = allCities.filter(city => 
        city.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleManagerChange = (city: string, manager: Manager) => {
        saveManagerOverride(city, manager);
        setOverrides(getManagerOverrides());
        onMappingChange(); // Avisa o App para re-processar os dados
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                    <div className="size-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <span className="material-symbols-outlined text-3xl">badge</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Gestão por Cidade</h1>
                        <p className="text-slate-500 text-sm">Defina qual gestor é responsável por cada cidade. Isso afeta os filtros e relatórios.</p>
                    </div>
                </div>
            </header>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="relative max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar cidade..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cidade</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gestor Responsável</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {filteredCities.map(city => {
                                const override = overrides[city];
                                const initial = INITIAL_CITY_MANAGER_MAP[city];
                                const effective = override || initial || 'DESCONHECIDO';
                                
                                return (
                                    <tr key={city} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{city}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={effective}
                                                onChange={(e) => handleManagerChange(city, e.target.value as Manager)}
                                                className={`text-sm font-medium rounded-lg px-3 py-1.5 border outline-none transition-all ${
                                                    effective === 'THIAGO' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30' :
                                                    effective === 'LAÍS' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/30' :
                                                    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                }`}
                                            >
                                                <option value="THIAGO">THIAGO</option>
                                                <option value="LAÍS">LAÍS</option>
                                                <option value="DESCONHECIDO">Sem Gestor</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {override ? (
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-800/30">
                                                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    Personalizado
                                                </span>
                                            ) : initial ? (
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Definição Padrão</span>
                                            ) : (
                                                <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600 italic">Não mapeado</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredCities.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 text-sm">
                                        Nenhuma cidade encontrada para "{searchTerm}"
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <footer className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-2xl flex items-start gap-3">
                <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                <div>
                    <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">Como funciona o Gestor Responsável?</h4>
                    <p className="text-xs text-blue-800/70 dark:text-blue-400/70 leading-relaxed">
                        As planilhas vêm com um gestor preenchido. Se você alterar nesta tela, o dashboard passará a ignorar o que está na planilha e usará a sua definição personalizada para aquela cidade.
                    </p>
                </div>
            </footer>
        </div>
    );
}
