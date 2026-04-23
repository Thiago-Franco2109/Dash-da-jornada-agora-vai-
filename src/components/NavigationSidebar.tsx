import { useState } from 'react';

interface NavigationSidebarProps {
    currentView: 'dashboard' | 'settings' | 'about' | 'managers' | 'profile' | 'contacts' | 'reports';
    onNavigate: (view: 'dashboard' | 'settings' | 'about' | 'managers' | 'profile' | 'contacts' | 'reports') => void;
}

export default function NavigationSidebar({ currentView, onNavigate }: NavigationSidebarProps) {
    const [isPinned, setIsPinned] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const isExpanded = isPinned || isHovered;

    const navItems = [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'reports', icon: 'assessment', label: 'Relatórios' },
        { id: 'contacts', icon: 'contact_phone', label: 'Contatos' },
        { id: 'managers', icon: 'badge', label: 'Gestores' },
    ] as const;

    const secondaryItems = [
        { id: 'settings', icon: 'settings', label: 'Configurações' },
        { id: 'about', icon: 'info', label: 'Sobre' },
    ] as const;

    return (
        <aside 
            className={`flex flex-col h-full bg-emerald-800 text-white transition-all duration-300 ease-in-out z-20 shrink-0 border-r border-emerald-900 shadow-xl relative ${isExpanded ? 'w-64' : 'w-16'}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Pin Toggle */}
            <div className={`flex items-center h-12 border-b border-emerald-700/50 shrink-0 transition-all duration-300 ${isExpanded ? 'justify-end px-3' : 'justify-center'}`}>
                {isExpanded ? (
                    <button 
                        onClick={() => setIsPinned(!isPinned)} 
                        className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors flex items-center gap-2"
                        title={isPinned ? 'Desafixar menu' : 'Fixar menu aberto'}
                    >
                        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Menu</span>
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isPinned ? "'FILL' 1" : "'FILL' 0" }}>
                            push_pin
                        </span>
                    </button>
                ) : (
                    <span className="material-symbols-outlined text-[20px] opacity-50">menu</span>
                )}
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 flex flex-col gap-1 px-2 scrollbar-hide">
                {navItems.map(item => (
                    <button 
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`flex items-center gap-4 px-3 py-3 rounded-xl transition-all whitespace-nowrap ${currentView === item.id ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-emerald-50 hover:bg-white/10 hover:text-white font-medium'}`}
                        title={!isExpanded ? item.label : undefined}
                    >
                        <span className="material-symbols-outlined shrink-0 text-[22px]">{item.icon}</span>
                        <span className={`transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                            {item.label}
                        </span>
                    </button>
                ))}



                <div className="mt-8 mb-4 h-px bg-emerald-600/50 mx-2" />

                {secondaryItems.map(item => (
                    <button 
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`flex items-center gap-4 px-3 py-3 rounded-xl transition-all whitespace-nowrap ${currentView === item.id ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-emerald-50 hover:bg-white/10 hover:text-white font-medium'}`}
                        title={!isExpanded ? item.label : undefined}
                    >
                        <span className="material-symbols-outlined shrink-0 text-[22px]">{item.icon}</span>
                        <span className={`transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            {/* Footer Links */}
            <div className="p-2 border-t border-emerald-600/50 shrink-0">
                <a 
                    href="https://dashboad-onboarding.netlify.app/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-4 px-3 py-3 rounded-xl transition-all whitespace-nowrap text-emerald-50 hover:bg-white/10 hover:text-white font-medium group"
                    title={!isExpanded ? 'Área Administrativa' : undefined}
                >
                    <span className="material-symbols-outlined shrink-0 text-[22px]">admin_panel_settings</span>
                    <div className={`flex items-center justify-between flex-1 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                        <span>Área Admin</span>
                        <span className="material-symbols-outlined text-[16px] opacity-50 group-hover:opacity-100">open_in_new</span>
                    </div>
                </a>
            </div>
        </aside>
    );
}
