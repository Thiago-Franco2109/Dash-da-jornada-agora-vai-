import { useEffect, useMemo, useRef, useState } from 'react';
import type { CrmPartner } from '../../types/crm';
import type { PromoStatus } from '../../hooks/useStatusOverride';
import type { CrmPartnerNote } from '../../types/crm';
import type { CampaignTypeId } from '../../config/campaignTypes';
import { KANBAN_STAGES, getPromoStatusForPartner, sumIndiceGmv, formatGmvTotal } from '../../utils/crmPipeline';
import { PartnerAvatar, StatusDropdown, formatCrmDate, formatGmv, getStatusMeta } from './crmShared';
import { DESFECHOS_LIGACAO, getDesfecho, type DesfechoLigacao, type MotivoLigacao } from '../../config/desfechoLigacao';
import { differenceInCalendarDays, isPast, isToday, parseISO } from 'date-fns';

interface CrmKanbanBoardProps {
    partners: CrmPartner[];
    localStatus: Record<string, PromoStatus>;
    campaign?: CampaignTypeId;
    /** false para campanhas descobertas dinamicamente (status calculado, sem edição manual). Default true. */
    isEditable?: boolean;
    /** false no CRM Jornada: parceiro recém-lançado não tem GMV, e o card mostra o dia da jornada no lugar. */
    showGmv?: boolean;
    /** Link pra aprovar a oferta no CMS depois do ok do parceiro. */
    getCmsUrl?: (row: CrmPartner) => string | undefined;
    /** Registra o desfecho da ligação (status + motivo + follow-up) num clique só. */
    onDesfechoLigacao?: (row: CrmPartner, desfecho: DesfechoLigacao, detalhe?: string) => void;
    /** Motivo já registrado, pro CS saber com que argumento voltar. */
    getMotivo?: (row: CrmPartner) => MotivoLigacao | null | undefined;
    getNote: (id: string) => CrmPartnerNote | undefined;
    onStatusChange?: (partnerId: string, field: 'promo_status_override' | 'cupom_status_override', newStatus: PromoStatus) => void;
    onPartnerStatusChange: (partnerId: string, newStatus: PromoStatus) => void;
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
    onEditPartner: (partnerId: string) => void;
    onRegisterContact: (partnerId: string) => void;
}

/**
 * Badge do dia da jornada. As faixas são as mesmas das abas de período da tela
 * "Lista jornada 28D" (1-14 / 15-21 / 22-28), pra não inventar um quarto
 * vocabulário de urgência no app.
 */
function JornadaDayBadge({ dias }: { dias: number }) {
    const tone = dias >= 22
        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
        : dias >= 15
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    return (
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${tone}`} title="Dia da jornada de 28 dias">
            <span className="material-symbols-outlined text-[12px]">hourglass_bottom</span>
            Dia {dias}/28
        </span>
    );
}

/**
 * O que falta pra essa campanha sair do lugar. Vem do banco, não da marcação do
 * CS — e é o que diz se a próxima ação é trabalho no CMS ou uma ligação.
 */
function ItemStateChip({ itemState, dias }: { itemState?: string; dias?: number | null }) {
    if (itemState === 'pendente') {
        // Abaixo de 3 dias não mostra: o parceiro ainda nem teve chance, e 14 chips
        // acesos ao mesmo tempo viram ruído.
        if (dias == null || dias < 3) {
            return (
                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                    Oferta pronta
                </span>
            );
        }
        const tom = dias >= 7
            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        return (
            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${tom}`} title="Oferta criada e esperando a conversa com o parceiro">
                <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                Pronta há {dias}d
            </span>
        );
    }
    if (itemState === 'rascunho') {
        return (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="O CS começou e não publicou — falta terminar no CMS">
                <span className="material-symbols-outlined text-[12px]">edit_note</span>
                Rascunho
            </span>
        );
    }
    if (itemState === 'sem_item') {
        return (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Ninguém criou oferta pra esse parceiro nessa campanha">
                <span className="material-symbols-outlined text-[12px]">block</span>
                Sem item
            </span>
        );
    }
    return null;
}

/** Quantos dias desde o último contato. null quando nunca houve. */
function diasDesdeContato(iso: string | null | undefined): number | null {
    if (!iso) return null;
    try {
        return differenceInCalendarDays(new Date(), parseISO(iso));
    } catch {
        return null;
    }
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

/**
 * Botão de ligação: abre os desfechos possíveis e grava tudo num clique —
 * contato, status, motivo e quando voltar. Antes eram três ações separadas
 * (ligar, registrar, arrastar) e por isso ninguém marcava nada.
 */
function BotaoLigacao({ onDesfecho }: { onDesfecho: (d: DesfechoLigacao, detalhe?: string) => void }) {
    const [aberto, setAberto] = useState(false);
    const [detalhe, setDetalhe] = useState('');
    const [pedindoDetalhe, setPedindoDetalhe] = useState<DesfechoLigacao | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!aberto) return;
        const fechar = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setAberto(false);
                setPedindoDetalhe(null);
            }
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [aberto]);

    const escolher = (d: DesfechoLigacao) => {
        if (d.pedeDetalhe) { setPedindoDetalhe(d); return; }
        onDesfecho(d);
        setAberto(false);
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setAberto(v => !v)}
                className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                title="Registrar ligação"
            >
                <span className="material-symbols-outlined text-[16px]">call</span>
            </button>
            {aberto && (
                <div className="absolute z-50 right-0 mt-1 w-64 rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
                    <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700">
                        Como foi a ligação?
                    </p>
                    {pedindoDetalhe ? (
                        <div className="p-3 space-y-2">
                            <input
                                autoFocus
                                value={detalhe}
                                onChange={e => setDetalhe(e.target.value)}
                                placeholder="Qual foi o motivo?"
                                className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-200"
                            />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setPedindoDetalhe(null)} className="text-xs px-2 py-1 text-slate-500">Voltar</button>
                                <button
                                    type="button"
                                    onClick={() => { onDesfecho(pedindoDetalhe, detalhe.trim() || undefined); setAberto(false); setPedindoDetalhe(null); setDetalhe(''); }}
                                    className="text-xs font-bold px-3 py-1 rounded-lg bg-primary text-white"
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>
                    ) : (
                        DESFECHOS_LIGACAO.map(d => (
                            <button
                                key={d.motivo}
                                type="button"
                                onClick={() => escolher(d)}
                                className="w-full flex items-start gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-left"
                            >
                                <span className="material-symbols-outlined text-[15px] text-slate-400 mt-0.5">{d.icon}</span>
                                <span className="min-w-0">
                                    {d.label}
                                    <span className="block text-[10px] text-slate-400">
                                        {d.voltarEmDias == null ? 'sai da fila' : `voltar em ${d.voltarEmDias}d`}
                                    </span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function CrmKanbanBoard({
    partners,
    localStatus,
    campaign = 'super_promos',
    isEditable = true,
    showGmv = true,
    getCmsUrl,
    onDesfechoLigacao,
    getMotivo,
    getNote,
    onStatusChange,
    onPartnerStatusChange,
    onCampaignStatusChange,
    onEditPartner,
    onRegisterContact,
}: CrmKanbanBoardProps) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<PromoStatus | null>(null);

    // Cupons de destaque tem um estágio manual a mais ("Confirmado") entre o pedido
    // de retorno e a ativação real — só o banco leva pra "Ativo" (ver campanhasOverlay.ts).
    const isCupons = campaign === 'cupons_destaque';
    const stages = useMemo(() => {
        if (!isCupons) return KANBAN_STAGES;
        const ativoIdx = KANBAN_STAGES.findIndex(s => s.id === 'ativo');
        const withConfirmado = [...KANBAN_STAGES];
        withConfirmado.splice(ativoIdx, 0, { id: 'confirmado', label: 'Confirmado' });
        return withConfirmado;
    }, [isCupons]);

    const isDropDisabled = (stageId: PromoStatus) => isCupons && stageId === 'ativo';

    const columns = useMemo(() => {
        const map = new Map<PromoStatus, CrmPartner[]>();
        for (const stage of stages) map.set(stage.id, []);

        for (const row of partners) {
            const status = getPromoStatusForPartner(row, localStatus, campaign);
            if (map.has(status)) map.get(status)!.push(row);
            else map.get('aguardando')!.push(row);
        }

        // Quem está a uma ligação da ativação vem primeiro: oferta pronta, depois
        // rascunho, depois sem item. Oferta parada há 7+ dias fura a fila — senão
        // um parceiro do dia 4 esquecido há 10 dias só apareceria lá pelo dia 22,
        // quando a janela de 28 já está fechando.
        const peso = (row: CrmPartner) => {
            const c = row.campaigns?.[campaign];
            if (c?.itemState === 'pendente') return (c.pendenteDias ?? 0) >= 7 ? -1 : 0;
            if (c?.itemState === 'rascunho') return 1;
            if (c?.itemState === 'sem_item') return 2;
            return 0;
        };

        return stages.map(stage => {
            const cards = (map.get(stage.id) ?? []).slice().sort((a, b) => {
                const d = peso(a) - peso(b);
                if (d !== 0) return d;
                return (b.diasDesdeLancamento ?? 0) - (a.diasDesdeLancamento ?? 0);
            });
            return { ...stage, cards, total: sumIndiceGmv(cards) };
        });
    }, [partners, localStatus, campaign, stages]);

    const handleDrop = (stage: PromoStatus) => {
        if (!draggingId || isDropDisabled(stage)) return;
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
                        if (!isEditable || isDropDisabled(col.id)) return;
                        e.preventDefault();
                        setDropTarget(col.id);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={e => {
                        if (!isEditable || isDropDisabled(col.id)) return;
                        e.preventDefault();
                        handleDrop(col.id);
                    }}
                >
                    <div className="px-3.5 py-3 border-b border-slate-200 dark:border-slate-700/60">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                            {col.label}
                            {isDropDisabled(col.id) && (
                                <span className="material-symbols-outlined text-[13px] text-slate-400" title="Só o sistema move parceiros pra cá, quando o banco confirma">lock</span>
                            )}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {showGmv && `${formatGmvTotal(col.total)} · `}
                            {col.cards.length} {col.cards.length === 1 ? 'parceiro' : 'parceiros'}
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

                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <ItemStateChip
                                            itemState={row.campaigns?.[campaign]?.itemState}
                                            dias={row.campaigns?.[campaign]?.pendenteDias}
                                        />
                                        {(() => {
                                            const motivo = getMotivo?.(row);
                                            const d = getDesfecho(motivo);
                                            if (!d || d.motivo === 'sim') return null;
                                            return (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" title={d.label}>
                                                    <span className="material-symbols-outlined text-[12px]">{d.icon}</span>
                                                    {d.chip}
                                                </span>
                                            );
                                        })()}
                                        {(() => {
                                            // Sem isto o card fica idêntico depois de registrar a ligação —
                                            // e no dia seguinte o mesmo parceiro é cobrado de novo.
                                            const d = diasDesdeContato(note?.lastContact);
                                            if (d == null) return null;
                                            return (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[12px]">call</span>
                                                    {d === 0 ? 'Falei hoje' : `Falei há ${d}d`}
                                                </span>
                                            );
                                        })()}
                                        {note?.nextFollowUp && fbClass && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 ${fbClass}`}>
                                                <span className="material-symbols-outlined text-[12px]">event</span>
                                                {formatCrmDate(note.nextFollowUp)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
                                        {row.diasDesdeLancamento != null ? (
                                            <JornadaDayBadge dias={row.diasDesdeLancamento} />
                                        ) : (
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatGmv(row)}</span>
                                        )}
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
                                            {(() => {
                                                const url = getCmsUrl?.(row);
                                                if (!url) return null;
                                                return (
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        className="p-1 rounded text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                                        title="Abrir a campanha no CMS pra aprovar"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                    </a>
                                                );
                                            })()}
                                            {onDesfechoLigacao ? (
                                                <BotaoLigacao onDesfecho={(d, detalhe) => onDesfechoLigacao(row, d, detalhe)} />
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => onRegisterContact(row.partnerId)}
                                                    className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                    title="Registrar contato"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">call</span>
                                                </button>
                                            )}
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
