import { useEffect, useState, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CardDetalhe } from '../../hooks/useTrelloCardDetalhe';
import { CardLabels, MemberAvatars } from './TrelloCardVisual';

/** Converte só o padrão de link markdown `[texto](url)` em <a> de verdade — resto fica como texto puro (sem risco de XSS, sem parser de markdown completo). */
function renderDescricao(desc: string): ReactNode[] {
    const partes: ReactNode[] = [];
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = regex.exec(desc))) {
        if (m.index > ultimo) partes.push(<span key={i++}>{desc.slice(ultimo, m.index)}</span>);
        partes.push(
            <a key={i++} href={m[2]} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {m[1]}
            </a>,
        );
        ultimo = m.index + m[0].length;
    }
    if (ultimo < desc.length) partes.push(<span key={i++}>{desc.slice(ultimo)}</span>);
    return partes;
}

function formatarBytes(bytes: number | null): string {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconeAnexo(tipo: string): string {
    if (tipo.startsWith('image/')) return 'image';
    if (tipo.startsWith('video/')) return 'movie';
    if (!tipo) return 'link';
    return 'description';
}

function Avatar({ nome, iniciais, avatarUrl }: { nome: string; iniciais: string; avatarUrl: string | null }) {
    return avatarUrl ? (
        <img src={`${avatarUrl}/50.png`} alt={nome} title={nome} className="w-6 h-6 rounded-full shrink-0 object-cover" />
    ) : (
        <span
            title={nome}
            className="w-6 h-6 rounded-full shrink-0 bg-slate-400 text-white text-[10px] font-bold flex items-center justify-center"
        >
            {iniciais}
        </span>
    );
}

interface CardDetalheModalProps {
    aberto: boolean;
    card: CardDetalhe | null;
    isLoading: boolean;
    error: string | null;
    onFechar: () => void;
    onComentar: (texto: string) => Promise<void>;
    enviandoComentario: boolean;
    erroComentario: string | null;
}

/** Renderize com `key={cardIdAberto ?? 'fechado'}` (do useTrelloCardDetalhe) — reseta o rascunho do comentário ao trocar de card, sem precisar de useEffect. */
export default function CardDetalheModal({
    aberto,
    card,
    isLoading,
    error,
    onFechar,
    onComentar,
    enviandoComentario,
    erroComentario,
}: CardDetalheModalProps) {
    const [rascunho, setRascunho] = useState('');

    useEffect(() => {
        if (!aberto) return;
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        document.addEventListener('keydown', onEsc);
        return () => document.removeEventListener('keydown', onEsc);
    }, [aberto, onFechar]);

    if (!aberto) return null;

    const enviar = async () => {
        const texto = rascunho.trim();
        if (!texto) return;
        try {
            await onComentar(texto);
            setRascunho('');
        } catch {
            // erro já fica visível via erroComentario — mantém o rascunho pra não perder o texto
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-start sm:items-center justify-center p-0 sm:p-6 bg-black/50" onClick={onFechar}>
            <div
                className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Card do Trello</p>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{card?.nome ?? 'Carregando…'}</h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {card && (
                            <a
                                href={card.cardUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir no Trello"
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={onFechar}
                            title="Fechar"
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                    {isLoading && <p className="text-center text-sm text-slate-400 py-8">Carregando card…</p>}
                    {error && (
                        <p className="text-center text-sm text-red-600 dark:text-red-400 py-8">{error}</p>
                    )}

                    {card && (
                        <>
                            {card.labels.length > 0 && <CardLabels labels={card.labels} />}

                            <div className="flex flex-wrap gap-6">
                                {card.due && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Prazo</p>
                                        <p className={`text-sm font-medium ${card.dueComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                            {format(parseISO(card.due), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            {card.dueComplete && ' · concluído'}
                                        </p>
                                    </div>
                                )}
                                {card.membros.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Membros</p>
                                        <MemberAvatars membros={card.membros} />
                                    </div>
                                )}
                            </div>

                            {card.descricao && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Descrição</p>
                                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                        {renderDescricao(card.descricao)}
                                    </div>
                                </div>
                            )}

                            {card.checklists.map(cl => {
                                const feitos = cl.itens.filter(i => i.feito).length;
                                return (
                                    <div key={cl.id}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{cl.nome}</p>
                                            <span className="text-[11px] text-slate-400">{feitos}/{cl.itens.length}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mb-2 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all"
                                                style={{ width: cl.itens.length ? `${(feitos / cl.itens.length) * 100}%` : '0%' }}
                                            />
                                        </div>
                                        <ul className="space-y-1">
                                            {cl.itens.map(it => (
                                                <li key={it.id} className="flex items-center gap-2 text-sm">
                                                    <span className={`material-symbols-outlined text-[16px] shrink-0 ${it.feito ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-600'}`}>
                                                        {it.feito ? 'check_box' : 'check_box_outline_blank'}
                                                    </span>
                                                    <span className={it.feito ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}>{it.nome}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}

                            {card.anexos.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                        Anexos ({card.anexos.length})
                                    </p>
                                    <ul className="space-y-1">
                                        {card.anexos.map(a => (
                                            <li key={a.id}>
                                                <a
                                                    href={a.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">{iconeAnexo(a.tipo)}</span>
                                                    <span className="truncate">{a.nome}</span>
                                                    {a.bytes != null && <span className="text-slate-400 text-xs shrink-0">{formatarBytes(a.bytes)}</span>}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Comentários ({card.comentarios.length})
                                </p>
                                <div className="space-y-3 mb-3">
                                    {card.comentarios.map(c => (
                                        <div key={c.id} className="flex items-start gap-2.5">
                                            <Avatar nome={c.autor.nome} iniciais={c.autor.iniciais} avatarUrl={c.autor.avatarUrl} />
                                            <div className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.autor.nome}</span>
                                                    <span className="text-[10px] text-slate-400 shrink-0">
                                                        {format(parseISO(c.data), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap mt-0.5">{c.texto}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <div className="w-6 h-6 rounded-full bg-primary/20 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <textarea
                                            value={rascunho}
                                            onChange={e => setRascunho(e.target.value)}
                                            placeholder="Escreva um comentário…"
                                            rows={2}
                                            disabled={enviandoComentario}
                                            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none resize-none disabled:opacity-60"
                                        />
                                        {erroComentario && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{erroComentario}</p>}
                                        <div className="flex justify-end mt-1.5">
                                            <button
                                                type="button"
                                                onClick={enviar}
                                                disabled={enviandoComentario || !rascunho.trim()}
                                                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {enviandoComentario ? (
                                                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-[16px]">send</span>
                                                )}
                                                Comentar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
