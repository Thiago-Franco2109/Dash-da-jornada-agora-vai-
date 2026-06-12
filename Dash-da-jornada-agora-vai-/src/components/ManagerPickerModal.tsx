import type { Manager } from '../config/managerMapping';

interface ManagerPickerModalProps {
    onSelect: (manager: Manager) => void;
}

const OPTIONS: { id: Manager; label: string; description: string }[] = [
    { id: 'THIAGO', label: 'Thiago', description: 'Minhas cidades e parceiros' },
    { id: 'LAÍS', label: 'Laís', description: 'Minhas cidades e parceiros' },
];

export default function ManagerPickerModal({ onSelect }: ManagerPickerModalProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div
                className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6"
                role="dialog"
                aria-modal="true"
                aria-labelledby="manager-picker-title"
            >
                <h2 id="manager-picker-title" className="text-xl font-bold text-slate-900 dark:text-white">
                    Quem é você?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    Escolha uma vez — o painel filtra suas cidades e parceiros em todas as abas até você sair da página.
                </p>

                <div className="mt-6 grid gap-3">
                    {OPTIONS.map(option => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelect(option.id)}
                            className="flex flex-col items-start w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                        >
                            <span className="font-semibold text-slate-900 dark:text-white">{option.label}</span>
                            <span className="text-xs text-slate-500 mt-0.5">{option.description}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
