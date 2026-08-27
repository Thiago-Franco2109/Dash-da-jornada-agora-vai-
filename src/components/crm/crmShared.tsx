import { useState, useRef, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CampaignTypeId } from '../../config/campaignTypes';
import { formatBRL } from '../../utils/crmData';
import type { CrmPartner } from '../../types/crm';

export const STATUS_OPTIONS: { value: PromoStatus; icon: string; label: string; color: string; badge: string }[] = [
    { value: 'aguardando', icon: '🔴', label: 'Não ofertado', color: 'text-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { value: 'ofertei', icon: '🟠', label: 'Aguardando retorno', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    { value: 'negado', icon: '⛔', label: 'Negado', color: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    { value: 'confirmado', icon: '☑️', label: 'Confirmado', color: 'text-sky-600', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    { value: 'ativo', icon: '✅', label: 'Promo ativa', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { value: 'inativo', icon: '➖', label: 'Inativo', color: 'text-slate-400', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500' },
];

export function getStatusMeta(status?: PromoStatus) {
    return STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[0];
}

/**
 * Opções que o CS pode escolher manualmente, por campanha. 'confirmado' só existe pra
 * Cupons de destaque (fluxo de confirmação); 'ativo' nunca é escolhível ali — só o
 * sistema chega nesse estado quando o banco confirma de verdade (ver campanhasOverlay.ts).
 */
function selectableStatusOptions(campaign?: CampaignTypeId) {
    if (campaign === 'cupons_destaque') {
        return STATUS_OPTIONS.filter(o => o.value !== 'ativo' && o.value !== 'inativo');
    }
    return STATUS_OPTIONS.filter(o => o.value !== 'confirmado');
}

export function formatCrmDate(iso: string | null | undefined) {
    if (!iso) return '—';
    try {
        return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
        return iso;
    }
}

export function formatGmv(row: CrmPartner) {
    if (row.indiceGmv != null && row.indiceGmv > 0) return formatBRL(row.indiceGmv);
    if (row.indiceGmvRaw && row.indiceGmvRaw !== '—') return row.indiceGmvRaw;
    return '—';
}

export function PartnerAvatar({ row, size = 'md' }: { row: CrmPartner; size?: 'sm' | 'md' }) {
    const cls = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
    if (row.logoUrl) {
        return <img src={row.logoUrl} alt="" className={`${cls} rounded-lg border border-slate-200 object-cover`} />;
    }
    return (
        <div className={`${cls} rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 border border-slate-200 dark:border-slate-700`}>
            {(row.estabelecimento || row.cidade || '??').slice(0, 2).toUpperCase()}
        </div>
    );
}

export function StatusDropdown({
    partnerId,
    currentStatus,
    onStatusChange,
    onPartnerStatusChange,
    onCampaignStatusChange,
    campaign,
    compact = false,
}: {
    partnerId: string;
    currentStatus?: PromoStatus;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange?: (partnerId: string, newStatus: PromoStatus) => void;
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
    campaign?: CampaignTypeId;
    compact?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const meta = getStatusMeta(currentStatus);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full font-bold cursor-pointer hover:opacity-80 transition-opacity ${meta.badge} ${
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
                }`}
            >
                <span>{meta.icon}</span>
                {!compact && meta.label}
                <span className="material-symbols-outlined text-[14px] opacity-60">expand_more</span>
            </button>
            {open && (
                <div className="absolute z-50 left-0 mt-1 w-48 rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
                    {selectableStatusOptions(campaign).map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                if (onCampaignStatusChange && campaign) {
                                    onCampaignStatusChange(partnerId, campaign, opt.value);
                                } else {
                                    onStatusChange?.(partnerId, 'promo_status_override', opt.value);
                                }
                                onPartnerStatusChange?.(partnerId, opt.value);
                                setOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 ${opt.color} ${currentStatus === opt.value ? 'bg-slate-50 dark:bg-slate-700/60 font-bold' : ''}`}
                        >
                            <span>{opt.icon}</span>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
