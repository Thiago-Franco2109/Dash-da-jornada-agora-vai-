import { useAuth } from '../context/AuthContext';

interface HeaderProps {
    currentView: 'dashboard' | 'settings' | 'about' | 'managers';
    onNavigate: (view: 'dashboard' | 'settings' | 'about' | 'managers') => void;
    onToggleReports: () => void;
    reportsOpen: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export default function Header({ currentView, onNavigate, onToggleReports, reportsOpen, searchQuery, setSearchQuery }: HeaderProps) {
    const { user, logout } = useAuth();

    return (
        <header 
            className="flex items-center justify-between whitespace-nowrap border-b border-solid border-emerald-600 px-6 py-3 shadow-md z-10"
            style={{ backgroundColor: '#32ba72' }}
        >
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 text-white">
                    <div className="size-10 rounded-lg bg-white/20 p-1 flex items-center justify-center backdrop-blur-sm overflow-hidden">
                        <img src="/favicon.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <h2 className="text-white text-lg font-black leading-tight tracking-[-0.015em] uppercase">
                        Jornada de novos parceiros
                    </h2>
                </div>
                
                <label className="flex flex-col min-w-40 !h-10 max-w-64">
                    <div className="flex w-full flex-1 items-stretch rounded-lg h-full overflow-hidden bg-white/10 border border-white/20 backdrop-blur-sm focus-within:bg-white/20 transition-all">
                        <div className="text-white/70 flex border-none items-center justify-center pl-4 border-r-0">
                            <span className="material-symbols-outlined text-[20px]">search</span>
                        </div>
                        <input
                            className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-white/60 px-4 rounded-l-none border-l-0 pl-2 text-sm font-medium leading-normal"
                            placeholder="Buscar parceiro..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </label>
            </div>

            <div className="flex flex-1 justify-end gap-6 overflow-x-auto scrollbar-hide">
                <div className="hidden md:flex items-center gap-1 text-white">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${currentView === 'dashboard' ? 'bg-white text-[#32ba72] shadow-sm' : 'text-white hover:bg-white/10'}`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => onNavigate('managers')}
                        className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${currentView === 'managers' ? 'bg-white text-[#32ba72] shadow-sm' : 'text-white hover:bg-white/10'}`}
                    >
                        Gestores
                    </button>
                    <button
                        onClick={onToggleReports}
                        className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${reportsOpen ? 'bg-white text-[#32ba72] shadow-sm' : 'text-white hover:bg-white/10'}`}
                    >
                        Relatórios
                    </button>
                    <button
                        onClick={() => onNavigate('settings')}
                        className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${currentView === 'settings' ? 'bg-white text-[#32ba72] shadow-sm' : 'text-white hover:bg-white/10'}`}
                    >
                        Config.
                    </button>
                    <button
                        onClick={() => onNavigate('about')}
                        className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-2 opacity-60 hover:opacity-100 transition-all text-white ${currentView === 'about' ? 'underline decoration-2 underline-offset-4' : ''}`}
                    >
                        Sobre
                    </button>
                    <a
                        href="https://dashboad-onboarding.netlify.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full text-white hover:bg-white/10 flex items-center gap-1.5 transition-all"
                    >
                        Admin
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    </a>
                </div>
            </div>


            <div className="flex flex-1 justify-end items-center gap-4 pl-4 border-l border-white/20 ml-4">
                <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-black text-white leading-none tracking-tight">{user?.name}</span>
                    <span className="text-[9px] font-bold text-white/70 mt-1 uppercase tracking-tighter">
                        Logado como CS
                    </span>
                </div>

                {user?.picture && (
                    <img src={user.picture} alt="Profile" className="size-9 rounded-xl border-2 border-white/30 shadow-sm" referrerPolicy="no-referrer" />
                )}

                <button
                    onClick={() => logout()}
                    className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    title="Sair do sistema"
                >
                    <span className="material-symbols-outlined">logout</span>
                </button>
            </div>
        </header>
    );
}
