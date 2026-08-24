import { useMemo, useState } from 'react';
import type { CrmPartner, CrmPartnerNote } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CampaignTypeId } from '../../config/campaignTypes';
import { getPromoStatusForPartner } from '../../utils/crmPipeline';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv, getStatusMeta } from './crmShared';
import { isPast, isToday, parseISO } from 'date-fns';

interface CrmListViewProps {
    partners: CrmPartner[];
    localStatus: Record<string, PromoStatus>;
    campaign?: CampaignTypeId;
    getNote: (id: string) => CrmPartnerNote | undefined;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange: (partnerId: string, newStatus: PromoStatus) => void;
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
    onEditPartner: (partnerId: string) => void;
    onRegisterContact: (partnerId: string) => void;
}

type GroupBy = 'none' | 'stage' | 'manager' | 'city';

const COLUMN_COUNT = 7;

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
    campaign = 'super_promos',
    getNote,
    onStatusChange,
    onPartnerStatusChange,
    onCampaignStatusChange,
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
                    key = getStatusMeta(getPromoStatusForPartner(row, localStatus, campaign)).label;
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
    }, [partners, groupBy, localStatus, campaign]);

    const renderRow = (row: CrmPartner, idx: number) => {
        const note = getNote(row.partnerId);
        const promoStatus = getPromoStatusForPartner(row, localStatus, campaign);

        return (
            <tr key={`${row.partnerId}::${row.cidade}::${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                        <PartnerAvatar row={row} size="sm" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{row.estabelecimento}</p>
                            {note?.notes && (
                                <p className="text-[11px] text-slate-400 truncate" title={note.notes}>{note.notes}</p>
                            )}
                        </div>
                    </div>
                </td>
                <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{row.cidade}</td>
                <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{row.analista || '—'}</td>
                <td className="py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300 text-right">{formatGmv(row)}</td>
                <td className="py-3 px-4">
                    <StatusDropdown
                        partnerId={row.partnerId}
                        currentStatus={promoStatus}
                        onStatusChange={onStatusChange}
                        onPartnerStatusChange={onPartnerStatusChange}
                        onCampaignStatusChange={onCampaignStatusChange}
                        campaign={campaign}
                        compact
                    />
                </td>
                <td className={`py-3 px-4 text-sm ${followUpClass(note?.nextFollowUp)}`}>
                    {note?.nextFollowUp ? formatCrmDate(note.nextFollowUp) : '—'}
                </td>
                <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => onRegisterContact(row.partnerId)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Registrar contato">
                            <span className="material-symbols-outlined text-[18px]">call</span>
                        </button>
                        <button type="button" onClick={() => onEditPartner(row.partnerId)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar notas">
                            <span className="material-symbols-outlined text-[18px]">edit_note</span>
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    const groupHeaderRow = (label: string, count: number) => (
        <tr key={`group-${label}`} className="bg-slate-50 dark:bg-slate-800/50">
            <td colSpan={COLUMN_COUNT} className="py-2 px-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</span>
                    <span className="text-xs font-bold text-slate-500">{count}</span>
                </div>
            </td>
        </tr>
    );

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
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

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Parceiro</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cidade</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gestor</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Valor</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Próximo follow-up</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {partners.length === 0 ? (
                            <tr>
                                <td colSpan={COLUMN_COUNT} className="p-12 text-center text-sm text-slate-500">Nenhum parceiro neste recorte.</td>
                            </tr>
                        ) : groupBy === 'none' ? (
                            partners.map((row, i) => renderRow(row, i))
                        ) : (
                            groups.flatMap(([label, items]) => [
                                groupHeaderRow(label, items.length),
                                ...items.map((row, i) => renderRow(row, i)),
                            ])
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
