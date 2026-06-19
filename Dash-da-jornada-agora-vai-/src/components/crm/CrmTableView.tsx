import type { CrmPartner, CrmPartnerNote } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { OfertasDaCasaStatus } from '../../types/crmCampaigns';
import { OFERTAS_DA_CASA_CAMPAIGN, OFERTAS_DA_CASA_STATUS_OPTIONS, getOfertasDaCasaStatusMeta, isTopPriorityCity } from '../../config/crmCampaigns';
import { normalizeParceiroContratoStatus } from '../../utils/parceirosSheet';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv } from './crmShared';
import { isPast, isToday, parseISO } from 'date-fns';

interface CrmTableViewProps {
    partners: CrmPartner[];
    sorted: CrmPartner[];
    partnersInCityCount: number;
    cityFilter: string;
    isLoading: boolean;
    gmvHeader: string;
    topCities: string[];
    localStatus: Record<string, PromoStatus>;
    getNote: (id: string) => CrmPartnerNote | undefined;
    getPromoStatus: (row: CrmPartner) => PromoStatus;
    getOfertasStatus: (id: string) => OfertasDaCasaStatus;
    setOfertasStatus: (id: string, status: OfertasDaCasaStatus, source: 'manual') => void;
    getCmsPromoUrl: (base: string, city: string) => string;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange: (partnerId: string, newStatus: PromoStatus) => void;
    onEditPartner: (partnerId: string) => void;
    onRegisterContact: (partnerId: string) => void;
}

function partnerStatusBadge(status: string) {
    const norm = normalizeParceiroContratoStatus(status);
    switch (norm) {
        case 'ativo': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
        case 'pendente': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
        case 'suspenso': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        case 'cancelado': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
}

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

export default function CrmTableView({
    partners,
    sorted,
    partnersInCityCount,
    cityFilter,
    isLoading,
    gmvHeader,
    topCities,
    getPromoStatus,
    getNote,
    getOfertasStatus,
    setOfertasStatus,
    getCmsPromoUrl,
    onStatusChange,
    onPartnerStatusChange,
    onEditPartner,
    onRegisterContact,
}: CrmTableViewProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Exibindo <span className="font-bold text-slate-900 dark:text-white">{sorted.length.toLocaleString('pt-BR')}</span>
                    {' '}de{' '}
                    <span className="font-bold">{partnersInCityCount.toLocaleString('pt-BR')}</span>
                    {' '}parceiro{sorted.length !== 1 ? 's' : ''}
                    {cityFilter ? <> em <span className="font-bold text-primary">{cityFilter}</span></> : null}
                </p>
            </div>
            {isLoading && partners.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
                    <p className="text-slate-500 text-sm">Carregando dados do CRM…</p>
                </div>
            ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4">handshake</span>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Nenhum parceiro neste recorte</h3>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1250px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Parceiro</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cidade</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gestor</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">GMV {gmvHeader}</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Promoção</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Cupom PARC.</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ofertas da casa</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Último contato</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Follow-up</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Notas</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sorted.map(row => {
                                const id = row.partnerId;
                                const note = getNote(id);
                                const hasNotes = Boolean(note?.notes?.trim());
                                const promoStatus = getPromoStatus(row);

                                return (
                                    <tr key={`${id}-${row.cidade}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2.5">
                                                <PartnerAvatar row={row} />
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.estabelecimento || row.estabId || '—'}</p>
                                                    {row.estabId && <p className="text-[10px] text-slate-400 font-mono">#{row.estabId}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{row.cidade}</td>
                                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{row.analista || '—'}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${partnerStatusBadge(row.statusParceiro)}`}>
                                                {row.statusParceiro || '—'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">{formatGmv(row)}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col gap-1 min-w-[140px]">
                                                <StatusDropdown partnerId={id} currentStatus={promoStatus} onStatusChange={onStatusChange} onPartnerStatusChange={onPartnerStatusChange} />
                                                <span className="text-[10px] text-slate-500 font-mono">{row.promoResumo}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    row.hasCupomAtivo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                                }`}>
                                                    {row.hasCupomAtivo ? 'Ativo' : 'Sem cupom'}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono text-center">{row.cupomResumo}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col items-center gap-1 min-w-[130px]">
                                                {isTopPriorityCity(row.cidade, topCities) && (
                                                    <span className="text-[9px] font-bold uppercase text-amber-600">Top 5 GMV</span>
                                                )}
                                                <select
                                                    value={getOfertasStatus(id)}
                                                    onChange={e => setOfertasStatus(id, e.target.value as OfertasDaCasaStatus, 'manual')}
                                                    className={`w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold px-2 ${getOfertasDaCasaStatusMeta(getOfertasStatus(id)).badge}`}
                                                >
                                                    {OFERTAS_DA_CASA_STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                                <a href={getCmsPromoUrl(OFERTAS_DA_CASA_CAMPAIGN.cmsBaseUrl, row.cidade)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline">
                                                    <span className="material-symbols-outlined text-[14px]">launch</span> CMS
                                                </a>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{formatCrmDate(note?.lastContact)}</td>
                                        <td className={`py-3 px-4 text-sm ${followUpClass(note?.nextFollowUp)}`}>{formatCrmDate(note?.nextFollowUp)}</td>
                                        <td className="py-3 px-4 max-w-[160px]">
                                            {hasNotes ? <p className="text-xs text-slate-600 dark:text-slate-400 truncate" title={note?.notes}>{note?.notes}</p> : <span className="text-xs text-slate-400 italic">—</span>}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <button type="button" onClick={() => onRegisterContact(id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Registrar contato hoje">
                                                    <span className="material-symbols-outlined text-[18px]">call</span>
                                                </button>
                                                <button type="button" onClick={() => onEditPartner(id)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar notas">
                                                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
