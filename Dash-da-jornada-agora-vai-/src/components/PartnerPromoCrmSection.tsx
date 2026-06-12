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
import { useOfertasDaCasa } from '../hooks/useOfertasDaCasa';
import { useCrmNotes } from '../hooks/useCrmNotes';
import { formatBRL } from '../utils/crmData';

type PromoSubTab = 'campanhas' | 'crm';

const CRM_STATUS_OPTIONS: { value: PromoStatus; label: string; badge: string }[] = [
    { value: 'aguardando', label: 'Não ofertado', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { value: 'ofertei', label: 'Aguardando retorno', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    { value: 'negado', label: 'Negado', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    { value: 'ativo', label: 'Promo ativa', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
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
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Promoções & Cupons</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Gerenciamento de atrativos no cardápio para impulsionar conversão</p>
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
                                    <span className="material-symbols-outlined text-[24px]">home_work</span>
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

                        {/* Promoção especial */}
                        <CampaignCard
                            icon="percent"
                            title="Promoção Ativa"
                            description="Garante que o parceiro possua descontos diretos em produtos no cardápio."
                            status={partner.promo_status}
                            href={promoUrl}
                            localidadeId={localidadeId}
                            cityIdsLoading={cityIdsLoading}
                        />

                        {/* Cupom */}
                        <CampaignCard
                            icon="confirmation_number"
                            title="Cupom Exclusivo"
                            description="Cupons exclusivos para primeira compra ou retenção de clientes."
                            status={partner.cupom_status}
                            href={cupomUrl}
                            localidadeId={localidadeId}
                            cityIdsLoading={cityIdsLoading}
                        />
                    </div>
                </div>
            )}

            {subTab === 'crm' && (
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-violet-500">handshake</span>
                                CRM — Prospecção de Promoções
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Funil de oferta para {partner.estabelecimento}
                                {isTopCity ? ' · cidade prioritária (top 5 GMV)' : ''}
                            </p>
                        </div>
                        {onNavigateToCrm && (
                            <button
                                type="button"
                                onClick={onNavigateToCrm}
                                className="shrink-0 text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                                Abrir CRM completo
                                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            </button>
                        )}
                    </div>

                    {crmPartner ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Metric label={`GMV ${crmPartner.gmvMesLabel || 'mês'}`} value={crmPartner.indiceGmv != null ? formatBRL(crmPartner.indiceGmv) : '—'} />
                            <Metric label="Promo INDICADOR" value={crmPartner.promoResumo || '—'} small />
                            <Metric label="Cupom INDICADOR" value={crmPartner.cupomResumo || '—'} small />
                            <Metric label="Itens PROMO-ESPECIAL" value={String(crmPartner.promoItensAtivos)} />
                        </div>
                    ) : (
                        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                            Dados do INDICADOR_FORMATADO ainda não carregados. Abra a aba CRM Promoções ou aguarde a sincronização.
                        </p>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Status prospecção (promo)</p>
                            <div className="flex flex-wrap gap-2">
                                {CRM_STATUS_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handlePromoStatusChange(opt.value)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-opacity ${
                                            crmPromoStatus === opt.value ? opt.badge : 'bg-slate-100 text-slate-500 opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ofertas da casa</p>
                            <select
                                value={ofertasStatus}
                                onChange={e => setStatus(pid, e.target.value as OfertasDaCasaStatus, 'manual')}
                                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3"
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
                                fullWidth
                            />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <p className="text-xs text-slate-500">Último contato</p>
                            <p className="font-semibold text-slate-800 dark:text-white">{formatDate(note?.lastContact)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <p className="text-xs text-slate-500">Próximo follow-up</p>
                            <p className="font-semibold text-slate-800 dark:text-white">{formatDate(note?.nextFollowUp)}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas da prospecção</label>
                        <textarea
                            value={editNotes || note?.notes || ''}
                            onChange={e => setEditNotes(e.target.value)}
                            rows={3}
                            placeholder="Ex.: Ofereci campanha Ofertas da casa, aguardando retorno do gerente..."
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm resize-none"
                        />
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas — Ofertas da casa</label>
                        <textarea
                            value={ofertasNotes || ofertasRecord?.notes || ''}
                            onChange={e => setOfertasNotes(e.target.value)}
                            rows={2}
                            placeholder="Detalhes específicos da campanha Ofertas da casa..."
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm resize-none"
                        />
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Próximo follow-up</label>
                        <input
                            type="date"
                            value={editFollowUp || note?.nextFollowUp || ''}
                            onChange={e => setEditFollowUp(e.target.value)}
                            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                        <button
                            type="button"
                            onClick={saveCrmNotes}
                            className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg"
                        >
                            Salvar CRM
                        </button>
                        <button
                            type="button"
                            onClick={() => registerContact(pid)}
                            className="px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 rounded-lg flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[18px]">call</span>
                            Registrar contato hoje
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
    return (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`font-bold text-slate-900 dark:text-white mt-1 ${small ? 'text-xs font-mono' : 'text-lg'}`}>{value}</p>
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
    icon,
    title,
    description,
    status,
    href,
    localidadeId,
    cityIdsLoading,
}: {
    icon: string;
    title: string;
    description: string;
    status?: string;
    href: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
}) {
    return (
        <div className="flex items-center justify-between p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                    <span className="material-symbols-outlined text-[24px]">{icon}</span>
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
