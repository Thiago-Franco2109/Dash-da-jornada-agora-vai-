import type { CrmViewMode } from '../../types/crm';
import { CRM_VIEW_MODES } from '../../utils/crmPipeline';

interface CrmViewModeSwitcherProps {
    viewMode: CrmViewMode;
    onChange: (mode: CrmViewMode) => void;
}

export default function CrmViewModeSwitcher({ viewMode, onChange }: CrmViewModeSwitcherProps) {
    return (
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto scrollbar-hide">
            {CRM_VIEW_MODES.map(mode => (
                <button
                    key={mode.id}
                    type="button"
                    onClick={() => onChange(mode.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        viewMode === mode.id
                            ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">{mode.icon}</span>
                    {mode.label}
                </button>
            ))}
        </div>
    );
}
