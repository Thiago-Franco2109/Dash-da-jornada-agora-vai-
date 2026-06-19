import { useMemo, useState } from 'react';
import type { CrmPartner, CrmPartnerNote } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import { getPromoStatusForPartner } from '../../utils/crmPipeline';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv, getStatusMeta } from './crmShared';
import { isPast, isToday, parseISO } from 'date-fns';

interface CrmListViewProps {
    partners: CrmPartner[];
    localStatus: Record<string, PromoStatus>;
    getNote: (id: string) => CrmPartnerNote | undefined;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange: (partnerId: string, newStatus: PromoStatus) => void;
    onEditPartner: (partnerId: string) => void;
    onRegisterContact: (partnerId: string) => void;
}

type GroupBy = 'none' | 'stage' | 'manager' | 'city';

function followUpClass(iso: string | null | undefined) {
    if (!iso) return 'text-slate-400';
    try {
        const d = parseISO(iso);
        if (isPast(d) && !isToday(d)) return 'text-red-600 font-bold';
        if (isToday(d)) return 'text-amber-600 font-bold';
        return 'text-slate-600 dark:text-slate-400';
    } catch {
        return 'text-slate-400';
    }
}

export default function CrmListView({
    partners,
    localStatus,
    getNote,
    onStatusChange,
    onPartnerStatusChange,
    onEditPartner,
    onRegisterContact,
}: CrmListViewProps) {
    const [groupBy, setGroupBy] = useState<GroupBy>('stage');

    const groups = useMemo(() => {
        const map = new Map<string, CrmPartner[]>();

        for (const row of partners) {
            let key: string;
            switch (groupBy) {
                case 'stage':
                    key = getStatusMeta(getPromoStatusForPartner(row, localStatus)).label;
                    break;
                case 'manager':
                    key = row.analista || 'Sem gestor';
                    break;
                case 'city':
                    key = row.cidade || 'Sem cidade';
                    break;
                default:
                    key = 'Todos';
            }
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(row);
        }

        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
    }, [partners, groupBy, localStatus]);

    const renderRow = (row: CrmPartner) => {
        const note = getNote(row.partnerId);
        const promoStatus = getPromoStatusForPartner(row, localStatus);
        const meta = getStatusMeta(promoStatus);

        return (
            <div
                key={row.partnerId}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
                <PartnerAvatar row={row} size="sm" />
                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 md:gap-4 items-center">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{row.estabelecimento}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                            {row.cidade} · {row.analista || 'Sem gestor'} · {formatGmv(row)}
                        </p>
                        {note?.notes && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5" title={note.notes}>{note.notes}</p>
                        )}
                    </div>
                    <StatusDropdown
                        partnerId={row.partnerId}
                        currentStatus={promoStatus}
                        onStatusChange={onStatusChange}
                        onPartnerStatusChange={onPartnerStatusChange}
                        compact
                    />
                    <div className="text-right">
                        <p className={`text-xs ${followUpClass(note?.nextFollowUp)}`}>
                            {note?.nextFollowUp ? formatCrmDate(note.nextFollowUp) : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">follow-up</p>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                        <span className={`hidden md:inline text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                            {meta.icon}
                        </span>
                        <button type="button" onClick={() => onRegisterContact(row.partnerId)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                            <span className="material-symbols-outlined text-[18px]">call</span>
                        </button>
                        <button type="button" onClick={() => onEditPartner(row.partnerId)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <span className="material-symbols-outlined text-[18px]">edit_note</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-white">{partners.length}</span> parceiros
                </p>
                <select
                    value={groupBy}
                    onChange={e => setGroupBy(e.target.value as GroupBy)}
                    className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs px-2"
                >
                    <option value="none">Sem agrupamento</option>
                    <option value="stage">Agrupar por estágio</option>
                    <option value="manager">Agrupar por gestor</option>
                    <option value="city">Agrupar por cidade</option>
                </select>
            </div>

            {groupBy === 'none' ? (
                <div>{partners.map(renderRow)}</div>
            ) : (
                groups.map(([label, items]) => (
                    <div key={label}>
                        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</span>
                            <span className="text-xs font-bold text-slate-500">{items.length}</span>
                        </div>
                        {items.map(renderRow)}
                    </div>
                ))
            )}

            {partners.length === 0 && (
                <p className="p-12 text-center text-sm text-slate-500">Nenhum parceiro neste recorte.</p>
            )}
        </div>
    );
}
