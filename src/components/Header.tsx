import { useAuth } from '../context/AuthContext';

interface HeaderProps {
    currentView: 'dashboard' | 'settings';
    onNavigate: (view: 'dashboard' | 'settings') => void;
    onToggleReports: () => void;
    reportsOpen: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export default function Header({ currentView, onNavigate, onToggleReports, reportsOpen, searchQuery, setSearchQuery }: HeaderProps) {
    const { user, logout } = useAuth();

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3 shadow-sm z-10">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 text-slate-900 dark:text-white">
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">monitoring</span>
                    </div>
                    <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">
                        CS Partner Journey
                    </h2>
                </div>
                
                <label className="flex flex-col min-w-40 !h-10 max-w-64">
                    <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                        <div className="text-slate-500 flex border-none bg-slate-100 dark:bg-slate-800 items-center justify-center pl-4 rounded-l-lg border-r-0">
                            <span className="material-symbols-outlined text-[20px]">search</span>
                        </div>
                        <input
                            className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-slate-100 dark:bg-slate-800 focus:border-none h-full placeholder:text-slate-500 px-4 rounded-l-none border-l-0 pl-2 text-sm font-normal leading-normal"
                            placeholder="Buscar parceiro..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </label>
            </div>

            <div className="flex flex-1 justify-end gap-8">
                <div className="hidden md:flex items-center gap-4 text-slate-900 dark:text-white">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors ${currentView === 'dashboard' ? 'text-primary bg-primary/5' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={onToggleReports}
                        className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors ${reportsOpen ? 'text-primary bg-primary/5' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        Relatórios
                    </button>
                    <button
                        onClick={() => onNavigate('settings')}
                        className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors ${currentView === 'settings' ? 'text-primary bg-primary/5' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        Configurações
                    </button>
                    <a
                        href="https://dashboad-onboarding.netlify.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium px-3 py-2 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5"
                    >
                        Painel Onboarding
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    </a>
                </div>
            </div>

            <div className="flex flex-1 justify-end items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white leading-none">{user?.name}</span>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                        {user?.email}
                    </span>
                </div>

                {user?.picture && (
                    <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" />
                )}

                <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-4">
                    <button
                        onClick={() => logout()}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                        title="Sair do sistema"
                    >
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
