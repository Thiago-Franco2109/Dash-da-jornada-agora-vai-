import { useState, useMemo } from 'react';
import type { CrmPartner, CrmPartnerNote } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import { CAMPAIGN_TYPES, getCampaignConfig, type CampaignTypeId } from '../config/campaignTypes';
import CampaignIcons from './CampaignIcons';
import CrmKanbanBoard from './crm/CrmKanbanBoard';
import CrmFollowUpAlerts from './crm/CrmFollowUpAlerts';
import { computeFollowUpAlerts, filterCrmPartners, getPromoStatusForPartner } from '../utils/crmPipeline';
import { crmCitiesMatch } from '../utils/crmData';

/**
 * CRM Jornada 28D — mesmo kanban do CRM Promoções, mas só com os parceiros
 * dentro da janela crítica de 28 dias, e com o dia da jornada visível no card.
 *
 * Não busca nada: recebe pronto o recorte de `enrichedData` que a tela da
 * jornada já carrega. Também não guarda override otimista de status como o
 * CrmView — ali é preciso porque o useCrmData só reflete override após resync;
 * aqui `enrichedData` já depende de `campanhaOverrides`, que atualiza na hora.
 */

const CAMPAIGN_STORAGE_KEY = 'crm_jornada_campanha_v1';

interface CrmJornadaViewProps {
    partners: CrmPartner[];
    managerFilter?: string;
    searchQuery?: string;
    cityFilter?: string;
    setCityFilter?: (city: string) => void;
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
    getNote: (partnerId: string) => CrmPartnerNote | undefined;
    upsertNote: (partnerId: string, patch: Partial<Pick<CrmPartnerNote, 'notes' | 'lastContact' | 'nextFollowUp'>>) => void;
    registerContact: (partnerId: string) => void;
}

export default function CrmJornadaView({
    partners,
    managerFilter = '',
    searchQuery = '',
    cityFilter = '',
    setCityFilter,
    onCampaignStatusChange,
    getNote,
    upsertNote,
    registerContact,
}: CrmJornadaViewProps) {
    const [campanha, setCampanha] = useState<CampaignTypeId>(
        () => localStorage.getItem(CAMPAIGN_STORAGE_KEY) || 'super_promos',
    );
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editNotes, setEditNotes] = useState('');
    const [editFollowUp, setEditFollowUp] = useState('');

    const campaignConfig = getCampaignConfig(campanha);

    const visiveis = useMemo(
        () => filterCrmPartners(partners, {
            cityFilter,
            managerFilter,
            searchQuery,
            campaign: campanha,
            crmCitiesMatch,
        }),
        [partners, cityFilter, managerFilter, searchQuery, campanha],
    );

    const cidades = useMemo(
        () => Array.from(new Set(partners.map(p => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        [partners],
    );

    const followUpAlerts = useMemo(() => computeFollowUpAlerts(visiveis, getNote), [visiveis, getNote]);

    /** Quantos ainda não estão com a campanha ativa — o número que o CS quer zerar. */
    const faltamAtivar = useMemo(
        () => visiveis.filter(p => getPromoStatusForPartner(p, {}, campanha) !== 'ativo').length,
        [visiveis, campanha],
    );

    const urgentes = useMemo(
        () => visiveis.filter(p => (p.diasDesdeLancamento ?? 0) >= 22 && getPromoStatusForPartner(p, {}, campanha) !== 'ativo').length,
        [visiveis, campanha],
    );

    const trocarCampanha = (id: CampaignTypeId) => {
        setCampanha(id);
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, id);
    };

    const openEdit = (id: string) => {
        const note = getNote(id);
        setEditingId(id);
        setEditNotes(note?.notes ?? '');
        setEditFollowUp(note?.nextFollowUp ?? '');
    };

    const saveEdit = () => {
        if (!editingId) return;
        upsertNote(editingId, { notes: editNotes, nextFollowUp: editFollowUp || null });
        setEditingId(null);
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        CRM Jornada 28D
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                            <CampaignIcons icons={campaignConfig.icons} iconClassName="text-[16px]" />
                            {campaignConfig.label}
                        </span>
                        <span className="text-slate-400">
                            · Ativação de campanhas nos primeiros 28 dias
                            {managerFilter ? ` · Gestor: ${managerFilter}` : ''}
                        </span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                        {visiveis.length} {visiveis.length === 1 ? 'parceiro' : 'parceiros'} na jornada
                        {faltamAtivar > 0 && ` · ${faltamAtivar} ainda sem ${campaignConfig.shortLabel.toLowerCase()}`}
                        {urgentes > 0 && (
                            <span className="text-red-500 font-bold"> · {urgentes} no prazo final (dia 22+)</span>
                        )}
                    </p>
                </div>

                <CrmFollowUpAlerts alerts={followUpAlerts} onPartnerClick={openEdit} />

                <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Qual campanha você vai trabalhar?</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {CAMPAIGN_TYPES.map(c => {
                            const selected = campanha === c.id;
                            const semAtivar = partners.filter(p =>
                                getPromoStatusForPartner(p, {}, c.id) !== 'ativo',
                            ).length;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => trocarCampanha(c.id)}
                                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                                        selected
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                >
                                    <CampaignIcons
                                        icons={c.icons}
                                        iconClassName={`text-[22px] ${selected ? 'text-primary' : 'text-slate-400'}`}
                                    />
                                    <div className="min-w-0">
                                        <p className={`text-sm font-bold truncate ${selected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>{c.label}</p>
                                        <p className="text-[11px] text-slate-400 truncate">{semAtivar} pra ativar</p>
                                    </div>
                                    {selected && <span className="material-symbols-outlined text-primary text-[18px] ml-auto shrink-0">check_circle</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {setCityFilter && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="material-symbols-outlined text-primary text-[22px]">location_city</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Cidade</span>
                        </div>
                        <select
                            value={cityFilter}
                            onChange={e => setCityFilter(e.target.value)}
                            className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm px-3 text-slate-700 dark:text-slate-200 font-medium"
                        >
                            <option value="">Todas as cidades ({cidades.length})</option>
                            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {cityFilter && (
                            <button type="button" onClick={() => setCityFilter('')} className="shrink-0 text-xs font-semibold text-primary hover:underline px-2">
                                Limpar filtro
                            </button>
                        )}
                    </div>
                )}

                {visiveis.length === 0 ? (
                    <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">inbox</span>
                        <p className="text-sm text-slate-500">Nenhum parceiro na jornada com os filtros atuais.</p>
                    </div>
                ) : (
                    <CrmKanbanBoard
                        partners={visiveis}
                        localStatus={{}}
                        campaign={campanha}
                        showGmv={false}
                        getNote={getNote}
                        onPartnerStatusChange={() => { /* status re-deriva do enrichedData */ }}
                        onCampaignStatusChange={onCampaignStatusChange}
                        onEditPartner={openEdit}
                        onRegisterContact={registerContact}
                    />
                )}
            </div>

            {editingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditingId(null)}>
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notas e follow-up</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Próximo follow-up</label>
                            <input
                                type="date"
                                value={editFollowUp}
                                onChange={e => setEditFollowUp(e.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notas</label>
                            <textarea
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                rows={4}
                                placeholder="Ex: falei com o dono, vai montar a promo no fim de semana..."
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 resize-none"
                            />
                        </div>
                        <p className="text-[11px] text-slate-400">
                            As notas são por parceiro e compartilhadas com o CRM Promoções.
                        </p>
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                Cancelar
                            </button>
                            <button type="button" onClick={saveEdit} className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors">
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
