import { useMemo, useState } from 'react';
import type { CrmPartner } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CrmPartnerNote } from '../../types/crm';
import type { CampaignTypeId } from '../../config/campaignTypes';
import { KANBAN_STAGES, getPromoStatusForPartner, sumIndiceGmv, formatGmvTotal } from '../../utils/crmPipeline';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv, getStatusMeta } from './crmShared';
import { isPast, isToday, parseISO } from 'date-fns';

interface CrmKanbanBoardProps {
    partners: CrmPartner[];
    localStatus: Record<string, PromoStatus>;
    campaign?: CampaignTypeId;
    /** false para campanhas descobertas dinamicamente (status calculado, sem edição manual). Default true. */
    isEditable?: boolean;
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
    isEditable = true,
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

        return KANBAN_STAGES.map(stage => {
            const cards = map.get(stage.id) ?? [];
            return { ...stage, cards, total: sumIndiceGmv(cards) };
        });
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
                    className={`flex-shrink-0 w-72 flex flex-col rounded-xl border bg-slate-100 dark:bg-slate-800/40 transition-colors ${
                        dropTarget === col.id ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200 dark:border-slate-700/60'
                    }`}
                    onDragOver={e => {
                        if (!isEditable) return;
                        e.preventDefault();
                        setDropTarget(col.id);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={e => {
                        if (!isEditable) return;
                        e.preventDefault();
                        handleDrop(col.id);
                    }}
                >
                    <div className="px-3.5 py-3 border-b border-slate-200 dark:border-slate-700/60">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{col.label}</p>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {formatGmvTotal(col.total)} · {col.cards.length} {col.cards.length === 1 ? 'parceiro' : 'parceiros'}
                        </p>
                    </div>

                    <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
                        {col.cards.map((row, idx) => {
                            const note = getNote(row.partnerId);
                            const fbClass = followUpBadge(note?.nextFollowUp);

                            return (
                                <div
                                    key={`${row.partnerId}::${row.cidade}::${idx}`}
                                    draggable={isEditable}
                                    onDragStart={() => isEditable && setDraggingId(row.partnerId)}
                                    onDragEnd={() => {
                                        setDraggingId(null);
                                        setDropTarget(null);
                                    }}
                                    className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all ${
                                        isEditable ? 'cursor-grab active:cursor-grabbing' : ''
                                    } ${draggingId === row.partnerId ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <PartnerAvatar row={row} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                                                {row.estabelecimento}
                                            </p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                {row.cidade} · {row.analista || 'Sem gestor'}
                                            </p>
                                        </div>
                                    </div>

                                    {note?.nextFollowUp && fbClass && (
                                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded mt-2 inline-flex items-center gap-1 ${fbClass}`}>
                                            <span className="material-symbols-outlined text-[12px]">event</span>
                                            {formatCrmDate(note.nextFollowUp)}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatGmv(row)}</span>
                                        <div className="flex items-center gap-1">
                                            {isEditable ? (
                                                <StatusDropdown
                                                    partnerId={row.partnerId}
                                                    currentStatus={getPromoStatusForPartner(row, localStatus, campaign)}
                                                    onStatusChange={onStatusChange}
                                                    onPartnerStatusChange={onPartnerStatusChange}
                                                    onCampaignStatusChange={onCampaignStatusChange}
                                                    campaign={campaign}
                                                    compact
                                                />
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 rounded-full font-bold px-2 py-0.5 text-[10px] ${getStatusMeta(getPromoStatusForPartner(row, localStatus, campaign)).badge}`}>
                                                    <span>{getStatusMeta(getPromoStatusForPartner(row, localStatus, campaign)).icon}</span>
                                                </span>
                                            )}
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
                            <p className="text-center text-xs text-slate-400 py-8">{isEditable ? 'Arraste cards aqui' : 'Nenhum parceiro'}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
