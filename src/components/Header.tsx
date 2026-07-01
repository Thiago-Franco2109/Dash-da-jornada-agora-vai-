import { useAuth } from '../context/AuthContext';
import { useProductMode } from '../context/ProductModeContext';
import type { AppView } from '../types/views';

interface HeaderProps {
    currentView: AppView;
    onNavigate: (view: AppView) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onOpenPartnerSearch?: () => void;
}

export default function Header(props: HeaderProps) {
    const { user, logout } = useAuth();
    const { theme, toggleMode, isCD } = useProductMode();

    return (
        <header 
            className="flex items-center justify-between whitespace-nowrap border-b border-solid px-6 py-3 shadow-md z-10 transition-colors duration-500"
            style={{ 
                backgroundColor: theme.headerBg,
                borderColor: isCD ? '#0D47A1' : '#28a05e',
            }}
        >
            <div className="flex items-center gap-4">
                {/* ── Swap Button (Logo + Title) ── */}
                <button
                    onClick={toggleMode}
                    className="flex items-center gap-3 text-white group cursor-pointer select-none"
                    title={`Alternar para ${isCD ? 'Marketplace' : 'Cardápio Digital'}`}
                >
                    <div className="relative size-10 rounded-lg bg-white/20 p-1 flex items-center justify-center backdrop-blur-sm overflow-hidden group-hover:bg-white/30 transition-all duration-300">
                        <img src="/favicon.png" alt="Logo" className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" />
                        {/* Swap indicator overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 rounded-lg">
                            <span className="material-symbols-outlined text-white text-[18px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg">
                                swap_horiz
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-start">
                        <h2 className="text-white text-lg font-black leading-tight tracking-[-0.015em] uppercase transition-all duration-300">
                            {theme.headerTitle}
                        </h2>
                        <span className="text-[9px] font-bold text-white/60 uppercase tracking-wider group-hover:text-white/90 transition-colors duration-300">
                            Clique para alternar • {isCD ? 'Marketplace' : 'Cardápio Digital'}
                        </span>
                    </div>
                </button>
                
                <label className="flex flex-col min-w-40 !h-10 max-w-64">
                    <div className="flex w-full flex-1 items-stretch rounded-lg h-full overflow-hidden bg-white/10 border border-white/20 backdrop-blur-sm focus-within:bg-white/20 transition-all">
                        <div className="text-white/70 flex border-none items-center justify-center pl-4 border-r-0">
                            <span className="material-symbols-outlined text-[20px]">search</span>
                        </div>
                        <input
                            className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-white/60 px-4 rounded-l-none border-l-0 pl-2 text-sm font-medium leading-normal"
                            placeholder="Buscar parceiro..."
                            value={props.searchQuery}
                            onChange={(e) => props.setSearchQuery(e.target.value)}
                        />
                    </div>
                </label>

                {props.onOpenPartnerSearch && (
                    <button
                        type="button"
                        onClick={props.onOpenPartnerSearch}
                        className="hidden md:flex items-center gap-2 h-10 px-3 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-all text-xs font-semibold"
                        title="Pesquisar parceiro (command+k)"
                    >
                        <span className="material-symbols-outlined text-[18px]">travel_explore</span>
                        <kbd className="px-2 py-0.5 rounded bg-black/20 text-[10px] font-bold border border-white/10 lowercase tracking-wide">command+k</kbd>
                    </button>
                )}
            </div>

            <div className="flex flex-1 justify-end gap-6 overflow-x-auto scrollbar-hide">
                {/* As navegações foram movidas para a Sidebar no commit remoto */}
            </div>


            <div className="flex flex-1 justify-end items-center gap-4 pl-4 border-l border-white/20 ml-4">
                <button 
                    onClick={() => props.onNavigate('profile')}
                    className="flex items-center gap-3 text-left hover:bg-white/10 p-1.5 rounded-xl transition-colors group"
                    title="Ver meu perfil"
                >
                    <div className="hidden sm:flex flex-col items-end">
                        <span className={`text-sm font-black text-white leading-none tracking-tight transition-colors ${isCD ? 'group-hover:text-blue-100' : 'group-hover:text-emerald-100'}`}>{user?.name || user?.email}</span>
                        <span className="text-[9px] font-bold text-white/70 mt-1 uppercase tracking-tighter">
                            Acessar meu Perfil
                        </span>
                    </div>

                    {user?.picture ? (
                        <img src={user.picture} alt="Profile" className="size-9 rounded-xl border-2 border-white/30 shadow-sm group-hover:border-white/50 transition-colors" referrerPolicy="no-referrer" />
                    ) : (
                        <div className="size-9 rounded-xl bg-white/20 flex items-center justify-center border-2 border-white/30">
                            <span className="material-symbols-outlined text-white text-[20px]">person</span>
                        </div>
                    )}
                </button>

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
