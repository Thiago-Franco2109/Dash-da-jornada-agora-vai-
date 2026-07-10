import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import type { CrmPartner } from '../types/crm';
import type { OfertasDaCasaStatus } from '../types/crmCampaigns';
import type { PromoStatus } from '../hooks/useStatusOverride';
import {
    OFERTAS_DA_CASA_CAMPAIGN,
    OFERTAS_DA_CASA_STATUS_OPTIONS,
    getOfertasDaCasaStatusMeta,
    isTopPriorityCity,
} from '../config/crmCampaigns';
import { CAMPAIGN_TYPES, getCampaignConfig } from '../config/campaignTypes';
import CampaignIcons from './CampaignIcons';
import { useOfertasDaCasa } from '../hooks/useOfertasDaCasa';
import { useCrmNotes } from '../hooks/useCrmNotes';
import { formatBRL } from '../utils/crmData';

type PromoSubTab = 'campanhas' | 'crm';

const CRM_STATUS_OPTIONS: { value: PromoStatus; label: string; icon: string; badge: string; ring: string }[] = [
    { value: 'aguardando', label: 'Não ofertado', icon: 'campaign', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', ring: 'ring-red-500/30' },
    { value: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', ring: 'ring-orange-500/30' },
    { value: 'negado', label: 'Negado', icon: 'cancel', badge: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300', ring: 'ring-slate-400/30' },
    { value: 'ativo', label: 'Promo ativa', icon: 'verified', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', ring: 'ring-emerald-500/30' },
];

interface PartnerPromoCrmSectionProps {
    partner: EnrichedPerformanceRow;
    crmPartner?: CrmPartner | null;
    topCities?: string[];
    promoUrl: string;
    ofertasDaCasaUrl: string;
    cupomUrl: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onNavigateToCrm?: () => void;
}

function partnerKey(partner: EnrichedPerformanceRow): string {
    return String(partner.estab_id || partner.estabelecimento);
}

export default function PartnerPromoCrmSection({
    partner,
    crmPartner,
    topCities = [],
    promoUrl,
    ofertasDaCasaUrl,
    cupomUrl,
    localidadeId,
    cityIdsLoading,
    onStatusChange,
    onNavigateToCrm,
}: PartnerPromoCrmSectionProps) {
    const [subTab, setSubTab] = useState<PromoSubTab>('campanhas');
    const [crmPromoStatus, setCrmPromoStatus] = useState<PromoStatus>(
        () => (crmPartner?.promoStatus ?? partner.promo_status ?? 'aguardando') as PromoStatus,
    );
    const [editNotes, setEditNotes] = useState('');
    const [editFollowUp, setEditFollowUp] = useState('');
    const [ofertasNotes, setOfertasNotes] = useState('');

    const pid = crmPartner?.partnerId ?? partnerKey(partner);
    const { getStatus, setStatus, getRecord, setNotes: setOfertasNotesRecord } = useOfertasDaCasa();
    const { getNote, upsertNote, registerContact } = useCrmNotes();

    const ofertasStatus = getStatus(pid);
    const ofertasMeta = getOfertasDaCasaStatusMeta(ofertasStatus);
    const isTopCity = isTopPriorityCity(partner.cidade, topCities);
    const note = getNote(pid);
    const ofertasRecord = getRecord(pid);

    const handlePromoStatusChange = (status: PromoStatus) => {
        setCrmPromoStatus(status);
        onStatusChange?.(pid, 'promo_status_override', status);
    };

    const openCrmEdit = () => {
        setEditNotes(note?.notes ?? '');
        setEditFollowUp(note?.nextFollowUp ?? '');
        setOfertasNotes(ofertasRecord?.notes ?? '');
        setSubTab('crm');
    };

    const saveCrmNotes = () => {
        upsertNote(pid, { notes: editNotes, nextFollowUp: editFollowUp || null });
        setOfertasNotesRecord(pid, ofertasNotes);
    };

    const formatDate = (iso: string | null | undefined) => {
        if (!iso) return '—';
        try {
            return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
        } catch {
            return iso;
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                <button
                    type="button"
                    onClick={() => setSubTab('campanhas')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                        subTab === 'campanhas'
                            ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">local_offer</span>
                    Campanhas
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab('crm')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                        subTab === 'crm'
                            ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">handshake</span>
                    CRM — Prospecção
                </button>
            </div>

            {subTab === 'campanhas' && (
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8">
                    <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-violet-500 text-3xl">local_offer</span>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Campanhas Promocionais</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Ofertas da Casa, Super Promos e Cupons de destaque — conforme coluna CAMPANHA na planilha</p>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        {/* Ofertas da casa — prioridade top 5 */}
                        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl border shadow-sm ${
                            isTopCity
                                ? 'bg-amber-50/80 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
                                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                        }`}>
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className="size-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                                    <CampaignIcons icons={getCampaignConfig('ofertas_da_casa').icons} iconClassName="text-[24px]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="text-lg font-bold text-slate-800 dark:text-white">
                                            {OFERTAS_DA_CASA_CAMPAIGN.name}
                                        </h4>
                                        {isTopCity && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-200 text-amber-900 dark:bg-amber-800/50 dark:text-amber-200">
                                                <span className="material-symbols-outlined text-[12px]">star</span>
                                                Top 5 GMV
                                            </span>
                                        )}
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${ofertasMeta.badge}`}>
                                            <span className="material-symbols-outlined text-[12px]">{ofertasMeta.icon}</span>
                                            {ofertasMeta.label}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {OFERTAS_DA_CASA_CAMPAIGN.description}
                                    </p>
                                        {ofertasRecord?.source === 'auto' && (
                                            <p className="text-[10px] text-slate-400 mt-1">Atualizado automaticamente</p>
                                        )}
                                        {crmPartner && crmPartner.campaigns.ofertas_da_casa.itemCount > 0 && (
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {crmPartner.campaigns.ofertas_da_casa.itemCount} item(ns) na planilha (CAMPANHA: Ofertas da Casa)
                                            </p>
                                        )}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        Participação (manual)
                                    </label>
                                    <select
                                        value={ofertasStatus}
                                        onChange={e => setStatus(pid, e.target.value as OfertasDaCasaStatus, 'manual')}
                                        className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200"
                                    >
                                        {OFERTAS_DA_CASA_STATUS_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={openCrmEdit}
                                        className="text-xs font-semibold text-violet-600 hover:underline text-left"
                                    >
                                        Anotar no CRM →
                                    </button>
                                </div>
                                <CmsManageLink
                                    href={ofertasDaCasaUrl}
                                    localidadeId={localidadeId}
                                    cityIdsLoading={cityIdsLoading}
                                    label="Abrir campanha no CMS"
                                />
                            </div>
                        </div>

                        {/* Super Promos */}
                        <CampaignCard
                            icons={getCampaignConfig('super_promos').icons}
                            title="Super Promos"
                            description="Campanha de descontos em itens selecionados do cardápio (col. CAMPANHA: Super Promos!)."
                            status={crmPartner?.campaigns.super_promos.status ?? partner.promo_status}
                            itemCount={crmPartner?.campaigns.super_promos.itemCount}
                            href={promoUrl}
                            localidadeId={localidadeId}
                            cityIdsLoading={cityIdsLoading}
                        />

                        {/* Cupons de destaque */}
                        <CampaignCard
                            icons={getCampaignConfig('cupons_destaque').icons}
                            title="Cupons de destaque"
                            description="Cupons promocionais de destaque para conversão e retenção."
                            status={crmPartner?.campaigns.cupons_destaque.status ?? partner.cupom_status}
                            itemCount={crmPartner?.campaigns.cupons_destaque.itemCount}
                            href={cupomUrl}
                            localidadeId={localidadeId}
                            cityIdsLoading={cityIdsLoading}
                        />
                    </div>
                </div>
            )}

            {subTab === 'crm' && (
                <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    {/* Header com faixa de destaque */}
                    <div className="relative px-6 sm:px-8 pt-7 pb-6 bg-gradient-to-r from-violet-50 via-white to-white dark:from-violet-900/20 dark:via-slate-800/50 dark:to-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-4 min-w-0">
                                <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-300 shrink-0 shadow-sm">
                                    <span className="material-symbols-outlined text-[26px]">handshake</span>
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                        CRM — Prospecção de Promoções
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="truncate">Funil de oferta para {partner.estabelecimento}</span>
                                        {isTopCity && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-200 text-amber-900 dark:bg-amber-800/50 dark:text-amber-200">
                                                <span className="material-symbols-outlined text-[12px]">star</span>
                                                Top 5 GMV
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            {onNavigateToCrm && (
                                <button
                                    type="button"
                                    onClick={onNavigateToCrm}
                                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-violet-700 bg-white hover:bg-violet-50 border border-violet-200 shadow-sm transition-colors dark:bg-slate-800 dark:text-violet-300 dark:border-violet-800/50 dark:hover:bg-slate-700"
                                >
                                    Abrir CRM completo
                                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="p-6 sm:p-8 space-y-7">
                    {crmPartner ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                            <Metric icons={['payments']} accent="emerald" label={`GMV ${crmPartner.gmvMesLabel || 'mês'}`} value={crmPartner.indiceGmv != null ? formatBRL(crmPartner.indiceGmv) : '—'} />
                            {CAMPAIGN_TYPES.map(c => (
                                <Metric
                                    key={c.id}
                                    icons={c.icons}
                                    accent={c.accent}
                                    label={c.label}
                                    value={crmPartner.campaigns[c.id].resumo}
                                    small
                                />
                            ))}
                        </div>
                        ) : (
                            <div className="flex items-start gap-3 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
                                <span className="material-symbols-outlined text-[20px] shrink-0">info</span>
                                <span>Dados do INDICADOR_FORMATADO ainda não carregados. Abra a aba CRM Promoções ou aguarde a sincronização.</span>
                            </div>
                        )}

                        <div className="grid lg:grid-cols-2 gap-6">
                            {/* Status prospecção como funil */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-violet-500">filter_alt</span>
                                    Status prospecção (promo)
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {CRM_STATUS_OPTIONS.map(opt => {
                                        const selected = crmPromoStatus === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => handlePromoStatusChange(opt.value)}
                                                className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all ${
                                                    selected
                                                        ? `${opt.badge} border-transparent ring-2 ${opt.ring} shadow-sm`
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 hover:border-slate-300 hover:text-slate-600 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                                                <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Ofertas da casa */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <CampaignIcons icons={getCampaignConfig('ofertas_da_casa').icons} className="text-amber-500" iconClassName="text-[16px]" />
                                    Ofertas da casa
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <select
                                        value={ofertasStatus}
                                        onChange={e => setStatus(pid, e.target.value as OfertasDaCasaStatus, 'manual')}
                                        className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-colors"
                                    >
                                        {OFERTAS_DA_CASA_STATUS_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <CmsManageLink
                                        href={ofertasDaCasaUrl}
                                        localidadeId={localidadeId}
                                        cityIdsLoading={cityIdsLoading}
                                        label="Abrir campanha no CMS"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Linha do tempo de contato */}
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                <span className="size-9 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 shrink-0">
                                    <span className="material-symbols-outlined text-[18px]">history</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Último contato</p>
                                    <p className="font-bold text-slate-800 dark:text-white">{formatDate(note?.lastContact)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-50/60 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/30">
                                <span className="size-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-300 shrink-0">
                                    <span className="material-symbols-outlined text-[18px]">event_upcoming</span>
                                </span>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Próximo follow-up</p>
                                    <p className="font-bold text-slate-800 dark:text-white">{formatDate(note?.nextFollowUp)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Notas e agendamento */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-5 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">edit_note</span>
                                    Notas da prospecção
                                </label>
                                <textarea
                                    value={editNotes || note?.notes || ''}
                                    onChange={e => setEditNotes(e.target.value)}
                                    rows={3}
                                    placeholder="Ex.: Ofereci campanha Ofertas da casa, aguardando retorno do gerente..."
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-colors dark:text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <CampaignIcons icons={getCampaignConfig('ofertas_da_casa').icons} className="text-amber-500" iconClassName="text-[16px]" />
                                    Notas — Ofertas da casa
                                </label>
                                <textarea
                                    value={ofertasNotes || ofertasRecord?.notes || ''}
                                    onChange={e => setOfertasNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Detalhes específicos da campanha Ofertas da casa..."
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-colors dark:text-white"
                                />
                            </div>
                            <div className="space-y-2 sm:max-w-xs">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                    Agendar próximo follow-up
                                </label>
                                <input
                                    type="date"
                                    value={editFollowUp || note?.nextFollowUp || ''}
                                    onChange={e => setEditFollowUp(e.target.value)}
                                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-colors dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/60 -mt-1">
                            <button
                                type="button"
                                onClick={saveCrmNotes}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 mt-5"
                            >
                                <span className="material-symbols-outlined text-[18px]">save</span>
                                Salvar CRM
                            </button>
                            <button
                                type="button"
                                onClick={() => registerContact(pid)}
                                className="px-5 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40 rounded-xl flex items-center gap-1.5 transition-colors mt-5"
                            >
                                <span className="material-symbols-outlined text-[18px]">call</span>
                                Registrar contato hoje
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Metric({
    label,
    value,
    small,
    icons,
    accent = 'slate',
}: {
    label: string;
    value: string;
    small?: boolean;
    icons?: readonly string[];
    accent?: 'violet' | 'emerald' | 'amber' | 'slate' | 'indigo';
}) {
    const accents: Record<string, string> = {
        violet: 'text-violet-600 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30',
        emerald: 'text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30',
        amber: 'text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30',
        indigo: 'text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30',
        slate: 'text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
    };
    return (
        <div className="relative p-4 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all">
            {icons && icons.length > 0 && (
                <span className={`absolute top-3 right-3 size-7 rounded-lg flex items-center justify-center ${accents[accent]}`}>
                    <CampaignIcons icons={icons} iconClassName="text-[14px]" />
                </span>
            )}
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pr-8 leading-tight">{label}</p>
            <p className={`font-bold text-slate-900 dark:text-white mt-2 ${small ? 'text-sm font-mono break-words' : 'text-2xl'}`}>{value}</p>
        </div>
    );
}

function CmsManageLink({
    href,
    localidadeId,
    cityIdsLoading,
    label = 'Gerenciar no CMS',
    fullWidth,
}: {
    href: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
    label?: string;
    fullWidth?: boolean;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col items-center justify-center gap-1 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg font-bold transition-colors min-w-[140px] ${
                fullWidth ? 'w-full' : ''
            }`}
            title={localidadeId ? `Campanha cadastro/31 · localidade_id=${localidadeId}` : 'ID da cidade não mapeado — link genérico'}
        >
            <span className="flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-[18px]">launch</span>
                {label}
            </span>
            {localidadeId ? (
                <span className="text-[10px] font-normal text-indigo-400 dark:text-indigo-500">
                    localidade_id={localidadeId}
                </span>
            ) : cityIdsLoading ? (
                <span className="text-[10px] font-normal text-indigo-300 animate-pulse">carregando cidade...</span>
            ) : (
                <span className="text-[10px] font-normal text-amber-500">cidade não mapeada</span>
            )}
        </a>
    );
}

function CampaignCard({
    icons,
    title,
    description,
    status,
    itemCount,
    href,
    localidadeId,
    cityIdsLoading,
}: {
    icons: readonly string[];
    title: string;
    description: string;
    status?: string;
    itemCount?: number;
    href: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
}) {
    return (
        <div className="flex items-center justify-between p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                    <CampaignIcons icons={icons} iconClassName="text-[24px]" />
                </div>
                <div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h4>
                        {status === 'ativo' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                Ativo no Painel
                            </span>
                        )}
                        {status === 'aguardando' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                Aguardando Configuração
                            </span>
                        )}
                        {(!status || status === 'inativo') && (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                                <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                                Não Configurado
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
                    {itemCount != null && itemCount > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1">{itemCount} item(ns) na planilha PROMO-ESPECIAL</p>
                    )}
                </div>
            </div>
            <CmsManageLink
                href={href}
                localidadeId={localidadeId}
                cityIdsLoading={cityIdsLoading}
            />
        </div>
    );
}
