import { useMemo, useState } from 'react';
import type { CrmPartner } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CrmPartnerNote } from '../../types/crm';
import type { CampaignTypeId } from '../../config/campaignTypes';
import { KANBAN_STAGES, getPromoStatusForPartner } from '../../utils/crmPipeline';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv } from './crmShared';
import { isPast, isToday, parseISO } from 'date-fns';

interface CrmKanbanBoardProps {
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

function followUpBadge(iso: string | null | undefined) {
    if (!iso) return null;
    try {
        const d = parseISO(iso);
        if (isPast(d) && !isToday(d)) return 'bg-red-100 text-red-700 dark:bg-red-900/40';
        if (isToday(d)) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40';
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800';
    } catch {
        return null;
    }
}

export default function CrmKanbanBoard({
    partners,
    localStatus,
    campaign = 'super_promos',
    getNote,
    onStatusChange,
    onPartnerStatusChange,
    onCampaignStatusChange,
    onEditPartner,
    onRegisterContact,
}: CrmKanbanBoardProps) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<PromoStatus | null>(null);

    const columns = useMemo(() => {
        const map = new Map<PromoStatus, CrmPartner[]>();
        for (const stage of KANBAN_STAGES) map.set(stage.id, []);

        for (const row of partners) {
            const status = getPromoStatusForPartner(row, localStatus, campaign);
            if (map.has(status)) map.get(status)!.push(row);
            else map.get('aguardando')!.push(row);
        }

        return KANBAN_STAGES.map(stage => ({
            ...stage,
            cards: map.get(stage.id) ?? [],
        }));
    }, [partners, localStatus, campaign]);

    const handleDrop = (stage: PromoStatus) => {
        if (!draggingId) return;
        if (onCampaignStatusChange) onCampaignStatusChange(draggingId, campaign, stage);
        else onStatusChange?.(draggingId, 'promo_status_override', stage);
        onPartnerStatusChange(draggingId, stage);
        setDraggingId(null);
        setDropTarget(null);
    };

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
            {columns.map(col => (
                <div
                    key={col.id}
                    className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 transition-colors ${
                        dropTarget === col.id ? 'border-primary ring-2 ring-primary/30' : col.color
                    }`}
                    onDragOver={e => {
                        e.preventDefault();
                        setDropTarget(col.id);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={e => {
                        e.preventDefault();
                        handleDrop(col.id);
                    }}
                >
                    <div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-slate-600">{col.icon}</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{col.label}</span>
                        </div>
                        <span className="text-xs font-bold bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full">
                            {col.cards.length}
                        </span>
                    </div>

                    <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
                        {col.cards.map((row, idx) => {
                            const note = getNote(row.partnerId);
                            const fbClass = followUpBadge(note?.nextFollowUp);

                            return (
                                <div
                                    key={`${row.partnerId}::${row.cidade}::${idx}`}
                                    draggable
                                    onDragStart={() => setDraggingId(row.partnerId)}
                                    onDragEnd={() => {
                                        setDraggingId(null);
                                        setDropTarget(null);
                                    }}
                                    className={`bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                                        draggingId === row.partnerId ? 'opacity-50' : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-2 mb-2">
                                        <PartnerAvatar row={row} size="sm" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                                {row.estabelecimento}
                                            </p>
                                            <p className="text-[10px] text-slate-500 truncate">{row.cidade}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-1 mb-2">
                                        <span className="text-[10px] font-medium text-slate-500">{row.analista || '—'}</span>
                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{formatGmv(row)}</span>
                                    </div>

                                    {note?.nextFollowUp && fbClass && (
                                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-flex items-center gap-1 ${fbClass}`}>
                                            <span className="material-symbols-outlined text-[12px]">event</span>
                                            {formatCrmDate(note.nextFollowUp)}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <StatusDropdown
                                            partnerId={row.partnerId}
                                            currentStatus={getPromoStatusForPartner(row, localStatus, campaign)}
                                            onStatusChange={onStatusChange}
                                            onPartnerStatusChange={onPartnerStatusChange}
                                            onCampaignStatusChange={onCampaignStatusChange}
                                            campaign={campaign}
                                            compact
                                        />
                                        <div className="flex gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => onRegisterContact(row.partnerId)}
                                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                title="Registrar contato"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">call</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onEditPartner(row.partnerId)}
                                                className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                title="Editar notas"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {col.cards.length === 0 && (
                            <p className="text-center text-xs text-slate-400 py-8">Arraste cards aqui</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
