import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CartaoTrelloVisual, LabelTrello, MembroTrello } from '../../types/trello';
import { NIVEL_META, type Nivel } from '../../utils/trelloNivel';

/**
 * Peças visuais de card do Trello (labels, avatares, badges de checklist/
 * comentários/anexos, e o "Quadro" kanban genérico) — compartilhadas entre
 * a aba Trello (todos os cards atribuídos a mim) e o Quadro da Acompanhar
 * Onboarding (todos os cards de UM board específico).
 */

// Paleta de cores de label do Trello (aproximação visual dos tokens atuais
// do produto — não crítico ser pixel-perfect, só "parecido").
const TRELLO_LABEL_COLORS: Record<string, string> = {
    green: '#4BCE97', green_dark: '#1F845A', green_light: '#BAF3DB',
    yellow: '#F5CD47', yellow_dark: '#946F00', yellow_light: '#F8E6A0',
    orange: '#FEA362', orange_dark: '#C25100', orange_light: '#FFDCC7',
    red: '#F87168', red_dark: '#C9372C', red_light: '#FFD5D2',
    purple: '#9F8FEF', purple_dark: '#6E5DC6', purple_light: '#DFD8FD',
    blue: '#579DFF', blue_dark: '#0C66E4', blue_light: '#CCE0FF',
    sky: '#6CC3E0', sky_dark: '#227D9B', sky_light: '#C6EDFB',
    lime: '#94C748', lime_dark: '#4C6B1F', lime_light: '#D3F1A7',
    pink: '#E774BB', pink_dark: '#AE4787', pink_light: '#FDD0EC',
    black: '#8590A2', black_dark: '#626F86', black_light: '#DCDFE4',
};

function corDoLabel(cor: string | null): string {
    return (cor && TRELLO_LABEL_COLORS[cor]) || '#94A3B8';
}

/** Cor de texto legível sobre os tons "_light" (claros) — os demais já são escuros o bastante pra texto branco. */
function corDoTextoDoLabel(cor: string | null): string {
    return cor?.endsWith('_light') ? '#1F2937' : '#FFFFFF';
}

export function CardLabels({ labels, compact = false }: { labels: LabelTrello[]; compact?: boolean }) {
    return (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mb-1' : 'mb-1.5'}`}>
            {labels.map(l => (
                <span
                    key={l.id}
                    className={`inline-flex items-center rounded font-bold ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
                    style={{ backgroundColor: corDoLabel(l.cor), color: corDoTextoDoLabel(l.cor) }}
                    title={l.nome}
                >
                    {l.nome}
                </span>
            ))}
        </div>
    );
}

export function MemberAvatars({ membros }: { membros: MembroTrello[] }) {
    if (membros.length === 0) return null;
    const visiveis = membros.slice(0, 3);
    const resto = membros.length - visiveis.length;
    return (
        <div className="flex items-center -space-x-1.5 shrink-0">
            {visiveis.map(m => (
                m.avatarUrl ? (
                    <img
                        key={m.id}
                        src={`${m.avatarUrl}/30.png`}
                        alt={m.nome}
                        title={m.nome}
                        className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 object-cover"
                    />
                ) : (
                    <span
                        key={m.id}
                        title={m.nome}
                        className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-400 text-white text-[9px] font-bold flex items-center justify-center"
                    >
                        {m.iniciais}
                    </span>
                )
            ))}
            {resto > 0 && (
                <span className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-bold flex items-center justify-center">
                    +{resto}
                </span>
            )}
        </div>
    );
}

/** Descrição / checklist / comentários / anexos / avatares — os "badges" do card, igual ao Trello real. */
export function CardMetaBadges({ tarefa, className = '' }: { tarefa: CartaoTrelloVisual; className?: string }) {
    const nada = !tarefa.temDescricao && !tarefa.checklist && tarefa.comentarios === 0 && tarefa.anexos === 0 && tarefa.membros.length === 0;
    if (nada) return null;
    return (
        <div className={`flex items-center flex-wrap gap-2 text-[11px] text-slate-400 dark:text-slate-500 ${className}`}>
            {tarefa.temDescricao && (
                <span className="material-symbols-outlined text-[14px]" title="Tem descrição">subject</span>
            )}
            {tarefa.checklist && (
                <span
                    className={`inline-flex items-center gap-0.5 ${tarefa.checklist.feitos === tarefa.checklist.total ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                    title="Checklist"
                >
                    <span className="material-symbols-outlined text-[14px]">check_box</span>
                    {tarefa.checklist.feitos}/{tarefa.checklist.total}
                </span>
            )}
            {tarefa.comentarios > 0 && (
                <span className="inline-flex items-center gap-0.5" title="Comentários">
                    <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                    {tarefa.comentarios}
                </span>
            )}
            {tarefa.anexos > 0 && (
                <span className="inline-flex items-center gap-0.5" title="Anexos">
                    <span className="material-symbols-outlined text-[14px]">attach_file</span>
                    {tarefa.anexos}
                </span>
            )}
            {tarefa.membros.length > 0 && <MemberAvatars membros={tarefa.membros} />}
        </div>
    );
}

export interface ColunaQuadro<T extends CartaoTrelloVisual> {
    key: string;
    titulo: string;
    subtitulo?: string;
    itens: { tarefa: T; nivel: Nivel; daysOffset: number | null }[];
}

/** Réplica do quadro do Trello: uma coluna por lista, na mesma ordem visual do board real. */
export function QuadroBoard<T extends CartaoTrelloVisual>({ colunas, itemVazioLabel = 'Nenhum card aqui' }: {
    colunas: ColunaQuadro<T>[];
    itemVazioLabel?: string;
}) {
    return (
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl">
            <div className="flex items-start gap-3 h-full pb-2">
                {colunas.map(c => (
                    <div key={c.key} className="w-72 shrink-0 flex flex-col rounded-xl bg-slate-100 dark:bg-slate-800/60 max-h-full">
                        <div className="px-3 py-2.5 shrink-0">
                            {c.subtitulo && <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 truncate">{c.subtitulo}</p>}
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={c.titulo}>
                                {c.titulo} <span className="font-normal text-slate-400">({c.itens.length})</span>
                            </p>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
                            {c.itens.length === 0 ? (
                                <p className="px-1 py-2 text-xs text-slate-400 italic">{itemVazioLabel}</p>
                            ) : (
                                c.itens.map(({ tarefa, nivel, daysOffset }) => (
                                    <QuadroCard key={tarefa.id} tarefa={tarefa} nivel={nivel} daysOffset={daysOffset} />
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QuadroCard<T extends CartaoTrelloVisual>({ tarefa, nivel, daysOffset }: { tarefa: T; nivel: Nivel; daysOffset: number | null }) {
    const abrirCard = () => window.open(tarefa.cardUrl, '_blank', 'noopener,noreferrer');
    return (
        <div
            onClick={abrirCard}
            className={`cursor-pointer rounded-lg bg-white dark:bg-slate-900 shadow-sm hover:shadow-md ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2.5 transition-shadow ${tarefa.closed ? 'opacity-60' : ''}`}
        >
            {tarefa.labels.length > 0 && <CardLabels labels={tarefa.labels} />}
            <p className={`text-sm font-semibold text-slate-800 dark:text-slate-100 ${tarefa.dueComplete ? 'line-through opacity-60' : ''}`}>
                {tarefa.nome}
            </p>
            {(tarefa.due || tarefa.closed || tarefa.dueComplete) && (
                <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                    {tarefa.due && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${NIVEL_META[nivel].badge}`}>
                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                            {format(parseISO(tarefa.due), 'dd/MM', { locale: ptBR })}
                            {nivel === 'overdue' && daysOffset != null && ` · ${Math.abs(daysOffset)}d atraso`}
                        </span>
                    )}
                    {tarefa.closed && (
                        <span className="material-symbols-outlined text-[14px] text-slate-400" title="Card arquivado no Trello">archive</span>
                    )}
                    {tarefa.dueComplete && (
                        <span className="material-symbols-outlined text-[14px] text-emerald-600" title="Marcado como concluído no Trello">check_circle</span>
                    )}
                </div>
            )}
            <CardMetaBadges tarefa={tarefa} className="mt-2 justify-between" />
        </div>
    );
}
