import {
    buildAllPromoCupomFilterOptions,
    PROMO_CUPOM_FIELD_OPTIONS,
    type PromoCupomFilterValue,
} from '../config/promoCupomFilter';

interface FilterToolbarProps {
    cityFilter: string;
    setCityFilter: (city: string) => void;
    cities: string[];
    priorityFilter: string;
    setPriorityFilter: (priority: string) => void;
    managerFilter: string;
    setManagerFilter: (manager: string) => void;
    managers: string[];
    showPromoCupomFilter?: boolean;
    promoCupomFilter?: PromoCupomFilterValue | '';
    setPromoCupomFilter?: (value: PromoCupomFilterValue | '') => void;
    promoCupomFilterCounts?: Partial<Record<PromoCupomFilterValue, number>>;
}

export default function FilterToolbar({
    cityFilter, setCityFilter, cities,
    priorityFilter, setPriorityFilter,
    managerFilter, setManagerFilter, managers,
    showPromoCupomFilter = false,
    promoCupomFilter = '',
    setPromoCupomFilter,
    promoCupomFilterCounts,
}: FilterToolbarProps) {
    const promoCupomOptions = buildAllPromoCupomFilterOptions();
    const groups = PROMO_CUPOM_FIELD_OPTIONS.map(f => f.label);

    return (
        <div className="px-6 py-4 flex gap-3 items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2 shrink-0 border-r border-slate-200 dark:border-slate-700 pr-4">Filtros</span>

            <div className="relative flex shrink-0 items-center h-9 justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary">
                <span className="text-slate-700 dark:text-slate-300 text-sm font-medium mr-1">Cidade:</span>
                <select
                    className="bg-none border-none focus:ring-0 bg-transparent text-sm w-full py-0 pl-1 pr-7 text-slate-700 dark:text-slate-300 outline-none cursor-pointer min-w-[130px] appearance-none"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                >
                    <option value="">Todas</option>
                    {cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                    ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 pointer-events-none text-slate-400 text-[18px]">keyboard_arrow_down</span>
            </div>

            <div className="relative flex shrink-0 items-center h-9 justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary">
                <span className="material-symbols-outlined text-slate-400 text-[18px] mr-1">flag</span>
                <select
                    className="bg-none border-none focus:ring-0 bg-transparent text-sm w-full py-0 pl-1 pr-7 text-slate-700 dark:text-slate-300 outline-none cursor-pointer min-w-[170px] appearance-none"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                >
                    <option value="">Prioridade: Todas</option>
                    <option value="5">Crítico (5★)</option>
                    <option value="4">Baixo Desempenho (4★)</option>
                    <option value="3">Atenção (3★)</option>
                    <option value="2">Na Média (2★)</option>
                    <option value="1">Excelente (1★)</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 pointer-events-none text-slate-400 text-[18px]">keyboard_arrow_down</span>
            </div>

            <div className="relative flex shrink-0 items-center h-9 justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary">
                <span className="material-symbols-outlined text-slate-400 text-[18px] mr-1">person</span>
                <select
                    className="bg-none border-none focus:ring-0 bg-transparent text-sm w-full py-0 pl-1 pr-7 text-slate-700 dark:text-slate-300 outline-none cursor-pointer min-w-[140px] appearance-none"
                    value={managerFilter}
                    onChange={(e) => setManagerFilter(e.target.value)}
                >
                    <option value="">Gestor: Todos (sessão)</option>
                    {managers.map((manager) => (
                        <option key={manager} value={manager}>{manager}</option>
                    ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 pointer-events-none text-slate-400 text-[18px]">keyboard_arrow_down</span>
            </div>

            {showPromoCupomFilter && setPromoCupomFilter && (
                <div className="relative flex shrink-0 items-center h-9 justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary">
                    <span className="material-symbols-outlined text-slate-400 text-[18px] mr-1">sell</span>
                    <select
                        className="bg-none border-none focus:ring-0 bg-transparent text-sm w-full py-0 pl-1 pr-7 text-slate-700 dark:text-slate-300 outline-none cursor-pointer min-w-[200px] max-w-[280px] appearance-none"
                        value={promoCupomFilter}
                        onChange={(e) => setPromoCupomFilter(e.target.value as PromoCupomFilterValue | '')}
                    >
                        <option value="">Status: Todos</option>
                        {groups.map(group => (
                            <optgroup key={group} label={group}>
                                {promoCupomOptions
                                    .filter(opt => opt.group === group)
                                    .map(opt => {
                                        const count = promoCupomFilterCounts?.[opt.value];
                                        return (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}{count != null ? ` (${count})` : ''}
                                            </option>
                                        );
                                    })}
                            </optgroup>
                        ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 pointer-events-none text-slate-400 text-[18px]">keyboard_arrow_down</span>
                </div>
            )}
        </div>
    );
}
