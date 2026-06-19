import { useState } from 'react';
import type { CrmFollowUpAlert } from '../../types/crm';
import { formatCrmDate } from './crmShared';

interface CrmFollowUpAlertsProps {
    alerts: CrmFollowUpAlert[];
    onPartnerClick: (partnerId: string) => void;
}

const LEVEL_META = {
    overdue: {
        label: 'Atrasados',
        icon: 'error',
        header: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    },
    today: {
        label: 'Hoje',
        icon: 'today',
        header: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    },
    upcoming: {
        label: 'Próximos 3 dias',
        icon: 'schedule',
        header: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/50 text-sky-900 dark:text-sky-200',
        badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    },
};

export default function CrmFollowUpAlerts({ alerts, onPartnerClick }: CrmFollowUpAlertsProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const visible = alerts.filter(a => !dismissed.has(a.partnerId));
    if (visible.length === 0) return null;

    const overdue = visible.filter(a => a.level === 'overdue');
    const today = visible.filter(a => a.level === 'today');
    const upcoming = visible.filter(a => a.level === 'upcoming');

    const groups = [
        { key: 'overdue' as const, items: overdue },
        { key: 'today' as const, items: today },
        { key: 'upcoming' as const, items: upcoming },
    ].filter(g => g.items.length > 0);

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setCollapsed(v => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600">notifications_active</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Alertas de follow-up
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-bold">
                        {visible.length}
                    </span>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                    {collapsed ? 'expand_more' : 'expand_less'}
                </span>
            </button>

            {!collapsed && (
                <div className="p-4 space-y-4">
                    {groups.map(group => {
                        const meta = LEVEL_META[group.key];
                        return (
                            <div key={group.key} className={`rounded-lg border p-3 ${meta.header}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">{meta.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${meta.badge}`}>
                                        {group.items.length}
                                    </span>
                                </div>
                                <ul className="space-y-1.5">
                                    {group.items.map(alert => (
                                        <li
                                            key={alert.partnerId}
                                            className="flex items-center justify-between gap-2 rounded-lg bg-white/70 dark:bg-slate-900/50 px-3 py-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onPartnerClick(alert.partnerId)}
                                                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                                            >
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                                    {alert.partner.estabelecimento}
                                                </p>
                                                <p className="text-[11px] text-slate-500 truncate">
                                                    {alert.partner.cidade}
                                                    {alert.partner.analista ? ` · ${alert.partner.analista}` : ''}
                                                    {' · '}
                                                    {formatCrmDate(alert.nextFollowUp)}
                                                    {alert.level === 'overdue' && alert.daysOffset < 0 && (
                                                        <span className="text-red-600 font-bold ml-1">
                                                            ({Math.abs(alert.daysOffset)}d atraso)
                                                        </span>
                                                    )}
                                                </p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDismissed(prev => new Set([...prev, alert.partnerId]))}
                                                className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                title="Dispensar alerta"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">close</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
