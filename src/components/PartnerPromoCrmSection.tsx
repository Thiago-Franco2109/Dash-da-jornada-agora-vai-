import { useRef, useState } from 'react';
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
import { CAMPAIGN_TYPES, getCampaignConfig, resolveCampaignTypeId, type CampaignTypeId } from '../config/campaignTypes';
import type { PromoCampanhaStatus } from '../hooks/usePromoStatus';
import CampaignIcons from './CampaignIcons';
import { useOfertasDaCasa } from '../hooks/useOfertasDaCasa';
import { useCrmNotes } from '../hooks/useCrmNotes';
import { formatBRL } from '../utils/crmData';
import GerarArteModal from './GerarArteModal';

type CardTone = 'active' | 'pending' | 'denied' | 'idle';

/**
 * Cor = estado (o que precisa de atenção), não categoria.
 * Na tabela, a trilha lateral de cada linha é o único lugar onde a cor de estado aparece forte.
 */
const TONE_STYLES: Record<CardTone, { rail: string; stamp: string; dot: string }> = {
    active: { rail: 'bg-emerald-500', stamp: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
    pending: { rail: 'bg-amber-500', stamp: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
    denied: { rail: 'bg-rose-500', stamp: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500' },
    idle: { rail: 'bg-slate-400 dark:bg-slate-500', stamp: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400' },
};

/** Identidade da campanha vive no ícone (convenção de campaignTypes.ts), nunca no estado. */
const ACCENT_STYLES: Record<'amber' | 'violet' | 'indigo', string> = {
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
};

/**
 * Estados de item promocional vindos de promo_resumo.detalhe.
 * Semântica travada pelo briefing: pendente = disponível pro dono ativar;
 * sem item = campanha na cidade mas sem item pro parceiro; aprovado = ativo no painel.
 */
const PROMO_STATUS_TONE: Record<PromoCampanhaStatus, { tone: CardTone; label: string }> = {
    pendente: { tone: 'pending', label: 'Pendente' },
    aprovado: { tone: 'active', label: 'Aprovada' },
    rascunho: { tone: 'idle', label: 'Rascunho' },
    'sem item': { tone: 'denied', label: 'Sem item' },
};

/** Cupons mantêm o modelo antigo (StatusDropdown) — 5 valores, não promo_resumo. */
const CUPOM_TONE: Record<string, { tone: CardTone; label: string }> = {
    ativo: { tone: 'active', label: 'Ativo' },
    aguardando: { tone: 'denied', label: 'Não ofertado' },
    ofertei: { tone: 'pending', label: 'Aguard. retorno' },
    negado: { tone: 'idle', label: 'Negado' },
    inativo: { tone: 'idle', label: '—' },
};

/**
 * Lê o estado real da campanha em promo_resumo.detalhe (somente leitura).
 * Retorna null quando promo_resumo ainda não chegou, pra o chamador cair no fallback.
 */
function campaignStateFromResumo(
    partner: EnrichedPerformanceRow,
    id: CampaignTypeId,
): { tone: CardTone; label: string } | null {
    const resumo = partner.promo_resumo;
    if (!resumo?.detalhe) return null;
    const entry = resumo.detalhe.find(d => resolveCampaignTypeId(d.campanha) === id);
    if (!entry) return { tone: 'idle', label: 'Não ofertada na cidade' };
    return PROMO_STATUS_TONE[entry.status];
}

const OFERTAS_TONE: Record<OfertasDaCasaStatus, CardTone> = {
    desconhecido: 'idle',
    nao_ofertado: 'denied',
    aguardando_retorno: 'pending',
    participando: 'active',
    nao_participando: 'idle',
};

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
    const [crmPromoStatus, setCrmPromoStatus] = useState<PromoStatus>(
        () => (crmPartner?.promoStatus ?? partner.promo_status ?? 'aguardando') as PromoStatus,
    );
    const [editNotes, setEditNotes] = useState('');
    const [editFollowUp, setEditFollowUp] = useState('');
    const [ofertasNotes, setOfertasNotes] = useState('');
    const [gerarArteOpen, setGerarArteOpen] = useState(false);
    const crmSectionRef = useRef<HTMLDivElement>(null);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    const estabelecimentoId = partner.estab_id ? Number(partner.estab_id) : null;
    const canGerarArte = estabelecimentoId != null && !Number.isNaN(estabelecimentoId);

    const pid = crmPartner?.partnerId ?? partnerKey(partner);
    const { getStatus, setStatus, getRecord, setNotes: setOfertasNotesRecord } = useOfertasDaCasa();
    const { getNote, upsertNote, registerContact } = useCrmNotes();

    const ofertasStatus = getStatus(pid);
    const ofertasMeta = getOfertasDaCasaStatusMeta(ofertasStatus);
    const isTopCity = isTopPriorityCity(partner.cidade, topCities);
    const note = getNote(pid);
    const ofertasRecord = getRecord(pid);

    const superPromosAtiva = !!partner.promo_campanhas?.includes('Super Promos!');
    const dbActiveCampaigns = [
        ...(partner.promo_campanhas ?? []),
        ...(partner.cupom_status === 'ativo' ? ['Cupons de destaque'] : []),
    ];

    // Estado real do banco por campanha. Fallback = comportamento anterior
    // (só promo_campanhas) enquanto promo_resumo não carregou.
    const superPromosState = campaignStateFromResumo(partner, 'super_promos') ?? {
        tone: superPromosAtiva ? ('active' as CardTone) : ('pending' as CardTone),
        label: superPromosAtiva ? 'Ativa no painel' : 'Não configurada',
    };
    const cupomState = CUPOM_TONE[partner.cupom_status ?? 'inativo'] ?? CUPOM_TONE.inativo;

    const handlePromoStatusChange = (status: PromoStatus) => {
        setCrmPromoStatus(status);
        onStatusChange?.(pid, 'promo_status_override', status);
    };

    const openCrmEdit = () => {
        setEditNotes(note?.notes ?? '');
        setEditFollowUp(note?.nextFollowUp ?? '');
        setOfertasNotes(ofertasRecord?.notes ?? '');
        crmSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        notesRef.current?.focus();
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
        <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            {/* Cabeçalho da seção + resumo do banco */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                <div>
                    <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                        Campanhas Promocionais
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Estado real do banco (campanhas vigentes) + gestão do CS
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">
                        Campanhas ativas no banco
                    </span>
                    {dbActiveCampaigns.length > 0 ? (
                        dbActiveCampaigns.map(c => (
                            <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                {c}
                            </span>
                        ))
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-300/60 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-slate-600/40">
                            <span className="size-1.5 rounded-full bg-slate-400" />
                            Nenhuma
                        </span>
                    )}
                </div>
            </div>

            {/* Tabela de campanhas — uma linha por campanha, mesma leitura de estado + ação para todas */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden">
                <div className="hidden lg:grid grid-cols-[minmax(0,2fr)_150px_190px_215px] gap-4 px-6 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/30">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">Campanha</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">Estado</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">Participação</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 text-right">Ação</span>
                </div>

                <CampaignRow
                    icons={getCampaignConfig('ofertas_da_casa').icons}
                    accent="amber"
                    title={OFERTAS_DA_CASA_CAMPAIGN.name}
                    description={OFERTAS_DA_CASA_CAMPAIGN.description}
                    tone={OFERTAS_TONE[ofertasStatus] ?? 'idle'}
                    toneLabel={ofertasMeta.label}
                    flag={isTopCity ? 'Top 5 GMV' : undefined}
                    itemCount={crmPartner?.campaigns.ofertas_da_casa.itemCount}
                    itemCountLabel="na planilha"
                    footnote={ofertasRecord?.source === 'auto' ? 'Atualizado automaticamente' : undefined}
                    manual={{
                        value: ofertasStatus,
                        onChange: val => setStatus(pid, val as OfertasDaCasaStatus, 'manual'),
                    }}
                    onOpenCrm={openCrmEdit}
                    href={ofertasDaCasaUrl}
                    cmsLabel="Abrir campanha no CMS"
                    localidadeId={localidadeId}
                    cityIdsLoading={cityIdsLoading}
                    onGerarArte={canGerarArte ? () => setGerarArteOpen(true) : undefined}
                />

                <CampaignRow
                    icons={getCampaignConfig('super_promos').icons}
                    accent="violet"
                    title="Super Promos"
                    description="Campanha de descontos em itens selecionados do cardápio."
                    tone={superPromosState.tone}
                    toneLabel={superPromosState.label}
                    itemCount={crmPartner?.campaigns.super_promos.itemCount}
                    itemCountLabel="na PROMO-ESPECIAL"
                    href={promoUrl}
                    localidadeId={localidadeId}
                    cityIdsLoading={cityIdsLoading}
                    onGerarArte={canGerarArte ? () => setGerarArteOpen(true) : undefined}
                />

                <CampaignRow
                    icons={getCampaignConfig('cupons_destaque').icons}
                    accent="indigo"
                    title="Cupons de destaque"
                    description="Cupons promocionais de destaque para conversão e retenção."
                    tone={cupomState.tone}
                    toneLabel={cupomState.label}
                    itemCount={crmPartner?.campaigns.cupons_destaque.itemCount}
                    itemCountLabel="na PROMO-ESPECIAL"
                    href={cupomUrl}
                    localidadeId={localidadeId}
                    cityIdsLoading={cityIdsLoading}
                    isLast
                />
            </div>

            {/* CRM — Prospecção: dados de nível parceiro (não por campanha), sempre visível abaixo da tabela */}
            <div ref={crmSectionRef} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden scroll-mt-6">
                <div className="relative px-6 sm:px-8 pt-7 pb-6 bg-gradient-to-r from-violet-50 via-white to-white dark:from-violet-900/20 dark:via-slate-800/50 dark:to-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                            <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-300 shrink-0 shadow-sm">
                                <span className="material-symbols-outlined text-[26px]">handshake</span>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                    CRM — Prospecção
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
                                ref={notesRef}
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

            {gerarArteOpen && canGerarArte && (
                <GerarArteModal
                    estabelecimentoId={estabelecimentoId!}
                    partnerName={partner.estabelecimento}
                    logoUrl={partner.logo_url}
                    onClose={() => setGerarArteOpen(false)}
                />
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
    emphasis = 'solid',
}: {
    href: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
    label?: string;
    /** 'solid' = a campanha depende de uma ação; 'quiet' = já está no ar, só consulta */
    emphasis?: 'solid' | 'quiet';
}) {
    // A trilha de estado da linha já sinaliza urgência — o botão não repete o grito.
    // A diferença aqui é só de contorno: pendente ganha moldura, no ar fica sem.
    const outlined = emphasis === 'solid';
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between gap-2 w-full rounded-xl px-3.5 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 ${
                outlined
                    ? 'text-slate-800 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-600'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
            }`}
            title={localidadeId ? `Campanha no CMS · localidade_id=${localidadeId}` : 'ID da cidade não mapeado — link genérico'}
        >
            <span className="flex flex-col min-w-0 text-left">
                <span className="text-[13px] font-bold truncate">{label}</span>
                {localidadeId ? (
                    <span className="text-[10px] font-medium opacity-60 truncate">localidade_id={localidadeId}</span>
                ) : cityIdsLoading ? (
                    <span className="text-[10px] font-medium opacity-60 truncate">carregando cidade…</span>
                ) : (
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 truncate">
                        cidade não mapeada
                    </span>
                )}
            </span>
            <span className="material-symbols-outlined text-[18px] shrink-0 opacity-60">arrow_outward</span>
        </a>
    );
}

function CampaignRow({
    icons,
    accent,
    title,
    description,
    tone,
    toneLabel,
    flag,
    itemCount,
    itemCountLabel,
    footnote,
    manual,
    onOpenCrm,
    href,
    cmsLabel,
    localidadeId,
    cityIdsLoading,
    isLast,
    onGerarArte,
}: {
    icons: readonly string[];
    accent: 'amber' | 'violet' | 'indigo';
    title: string;
    description: string;
    tone: CardTone;
    toneLabel: string;
    flag?: string;
    itemCount?: number;
    itemCountLabel?: string;
    footnote?: string;
    manual?: { value: OfertasDaCasaStatus; onChange: (val: string) => void };
    onOpenCrm?: () => void;
    href: string;
    cmsLabel?: string;
    localidadeId?: string | null;
    cityIdsLoading?: boolean;
    isLast?: boolean;
    onGerarArte?: () => void;
}) {
    const { rail, stamp, dot } = TONE_STYLES[tone];
    const hasCount = itemCount != null && itemCount > 0;
    // Campanha no ar não pede ação: o CTA recua para link. Parada, vira botão sólido.
    const needsAction = tone !== 'active';

    return (
        <div
            className={`relative grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_150px_190px_215px] gap-x-4 gap-y-3 items-start px-6 py-5 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/20 ${
                !isLast ? 'border-b border-slate-100 dark:border-slate-700/50' : ''
            }`}
        >
            {/* Trilha de estado — único lugar onde a cor de status aparece forte */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${rail}`} aria-hidden="true" />

            {/* Campanha */}
            <div className="flex items-start gap-3 pl-2 min-w-0">
                <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${ACCENT_STYLES[accent]}`}>
                    <CampaignIcons icons={icons} iconClassName="text-[20px]" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-snug">
                            {title}
                        </h4>
                        {flag && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                {flag}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
                    {(hasCount || footnote) && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                            {hasCount && (
                                <span>
                                    <span className="font-bold tabular-nums text-slate-500 dark:text-slate-300">{itemCount}</span>
                                    {` ${itemCount === 1 ? 'item' : 'itens'} ${itemCountLabel}`}
                                </span>
                            )}
                            {footnote && <span className="text-slate-400">{footnote}</span>}
                        </p>
                    )}
                </div>
            </div>

            {/* Estado */}
            <div className="pl-2 lg:pl-0 lg:pt-2">
                <span className="lg:hidden block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 mb-1">Estado</span>
                <p className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.09em] ${stamp}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${dot}`} />
                    {toneLabel}
                </p>
            </div>

            {/* Participação */}
            <div className="pl-2 lg:pl-0">
                <span className="lg:hidden block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 mb-1">Participação</span>
                {manual ? (
                    <select
                        value={manual.value}
                        onChange={e => manual.onChange(e.target.value)}
                        className="w-full h-9 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500 outline-none transition-colors"
                    >
                        {OFERTAS_DA_CASA_STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                ) : (
                    <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                )}
            </div>

            {/* Ação */}
            <div className="pl-2 lg:pl-0 flex flex-col items-stretch lg:items-end gap-2">
                <CmsManageLink
                    href={href}
                    label={cmsLabel}
                    localidadeId={localidadeId}
                    cityIdsLoading={cityIdsLoading}
                    emphasis={needsAction ? 'solid' : 'quiet'}
                />
                {onGerarArte && (
                    <button
                        type="button"
                        onClick={onGerarArte}
                        className="flex items-center justify-center gap-1.5 w-full rounded-xl px-3.5 py-2 text-[13px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                        Gerar Arte
                    </button>
                )}
                {onOpenCrm && (
                    <button
                        type="button"
                        onClick={onOpenCrm}
                        className="self-start lg:self-end text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                    >
                        Anotar no CRM
                    </button>
                )}
            </div>
        </div>
    );
}
