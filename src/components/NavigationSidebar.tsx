import { useState } from 'react';
import { useProductMode } from '../context/ProductModeContext';
import type { AppView } from '../types/views';

interface NavigationSidebarProps {
    currentView: AppView;
    onNavigate: (view: AppView) => void;
}

export default function NavigationSidebar({ currentView, onNavigate }: NavigationSidebarProps) {
    const [isPinned, setIsPinned] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { theme, isCD } = useProductMode();

    const isExpanded = isPinned || isHovered;
    const sc = theme.sidebarClasses;

    const allNavGroups: { label: string; items: { id: AppView; icon: string; label: string }[] }[] = [
        { label: 'Jornada', items: [
            { id: 'home', icon: 'home', label: 'Início' },
            { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
            ...(!isCD ? [{ id: 'carteira' as AppView, icon: 'account_balance_wallet', label: 'Carteira' }] : []),
            isCD
                ? { id: 'cd_desempenho' as AppView, icon: 'storefront', label: 'Todas as Lojas' }
                : { id: 'todos_parceiros' as AppView, icon: 'groups', label: 'Todos os Parceiros' },
            { id: 'contacts' as AppView, icon: 'contact_phone', label: 'Contatos' },
        ] },
        { label: 'Onboarding', items: [
            { id: 'onboarding', icon: 'pending_actions', label: 'Acompanhar Onboarding' },
        ] },
        { label: 'Captação de Ações', items: !isCD ? [
            { id: 'acoes_promocionais' as AppView, icon: 'local_offer', label: 'Ações Promocionais' },
            { id: 'crm' as AppView, icon: 'handshake', label: 'CRM Promoções' },
            { id: 'pedido_mensal' as AppView, icon: 'receipt_long', label: 'Pedido mensal' },
        ] : [] },
        { label: 'Análise de Cidades', items: !isCD ? [
            { id: 'carteira_grupo' as AppView, icon: 'workspaces', label: 'Cidades' },
        ] : [] },
        { label: 'Prevenção de Churn', items: [
            { id: 'churn', icon: 'trending_down', label: 'Churn' },
        ] },
        { label: 'Gestão & Relatórios', items: [
            { id: 'cs_kpis', icon: 'monitoring', label: 'KPIs CS' },
            { id: 'reports', icon: 'assessment', label: 'Relatórios' },
            { id: 'managers', icon: 'badge', label: 'Gestores' },
        ] },
        { label: 'Sistema', items: [
            { id: 'settings', icon: 'settings', label: 'Configurações' },
            { id: 'about', icon: 'info', label: 'Sobre' },
        ] },
    ];
    const navGroups = allNavGroups.filter(group => group.items.length > 0);

    return (
        <aside 
            className={`flex flex-col h-full text-white transition-all duration-300 ease-in-out z-20 shrink-0 shadow-xl relative ${sc.bg} ${sc.border} border-r ${isExpanded ? 'w-64' : 'w-16'}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Pin Toggle */}
            <div className={`flex items-center h-12 border-b ${sc.pinBorder} shrink-0 transition-all duration-300 ${isExpanded ? 'justify-end px-3' : 'justify-center'}`}>
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
                {navGroups.map((group, groupIndex) => (
                    <div key={group.label} className="flex flex-col gap-1">
                        {groupIndex > 0 && (
                            <div className={`mt-4 mb-1 h-px ${sc.divider} mx-2`} />
                        )}
                        <span className={`px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50 whitespace-nowrap transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                            {group.label}
                        </span>
                        {group.items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className={`flex items-center gap-4 px-3 py-3 rounded-xl transition-all whitespace-nowrap ${currentView === item.id ? `${sc.activeItem} shadow-sm font-bold` : 'text-white/90 hover:bg-white/10 hover:text-white font-medium'}`}
                                title={!isExpanded ? item.label : undefined}
                            >
                                <span className="material-symbols-outlined shrink-0 text-[22px]">{item.icon}</span>
                                <span className={`transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                                    {item.label}
                                </span>
                            </button>
                        ))}
                    </div>
                ))}
            </nav>

            {/* Footer Links */}
            <div className={`p-2 border-t ${sc.footerBorder} shrink-0`}>
                <a 
                    href="https://dashboad-onboarding.netlify.app/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-4 px-3 py-3 rounded-xl transition-all whitespace-nowrap text-white/90 hover:bg-white/10 hover:text-white font-medium group"
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
