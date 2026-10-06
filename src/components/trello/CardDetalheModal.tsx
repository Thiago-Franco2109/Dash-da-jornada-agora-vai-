import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CardDetalhe, ComentarioDetalhe } from '../../hooks/useTrelloCardDetalhe';
import { CardLabels, MemberAvatars } from './TrelloCardVisual';

/**
 * URL de anexo do Trello -> URL da nossa function que serve a imagem.
 * As URLs do Trello respondem 401 pro navegador (exigem header com o token,
 * que é server-only) — ver netlify/functions/trello-anexo.ts.
 * Devolve null pra qualquer URL que não seja anexo de card do Trello.
 */
function urlAnexoProxy(url: string): string | null {
    const m = url.match(/^https?:\/\/(?:www\.)?trello\.com\/1\/cards\/([a-f0-9]{24})\/attachments\/([a-f0-9]{24})(?:\/previews\/([a-f0-9]{24}))?\//i);
    if (!m) return null;
    const params = new URLSearchParams({ cardId: m[1], anexoId: m[2] });
    if (m[3]) params.set('previewId', m[3]);
    return `/.netlify/functions/trello-anexo?${params}`;
}

/** Monta a URL da miniatura de um anexo já existente no card. */
function urlMiniaturaAnexo(cardId: string, anexoId: string, previewId: string | null): string {
    const params = new URLSearchParams({ cardId, anexoId });
    if (previewId) params.set('previewId', previewId);
    return `/.netlify/functions/trello-anexo?${params}`;
}

/**
 * Markdown-lite do Trello: imagem `![alt](url)` e link `[texto](url)`. O resto
 * fica texto puro — sem parser completo, sem risco de XSS.
 *
 * Imagem só é renderizada quando o anexo é do próprio Trello (passa pelo nosso
 * proxy); de qualquer outro host vira link, pra não buscar imagem de terceiro.
 */
function renderTextoTrello(texto: string): ReactNode[] {
    const partes: ReactNode[] = [];
    const regex = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = regex.exec(texto))) {
        if (m.index > ultimo) partes.push(<span key={i++}>{texto.slice(ultimo, m.index)}</span>);
        const [, bang, rotulo, url] = m;
        const proxy = bang ? urlAnexoProxy(url) : null;
        if (proxy) {
            partes.push(
                <a key={i++} href={proxy} target="_blank" rel="noreferrer" className="block my-1.5">
                    <img
                        src={proxy}
                        alt={rotulo || 'anexo'}
                        loading="lazy"
                        className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                    />
                </a>,
            );
        } else {
            partes.push(
                <a key={i++} href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {rotulo || url}
                </a>,
            );
        }
        ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) partes.push(<span key={i++}>{texto.slice(ultimo)}</span>);
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

/** "2026-09-10T08:00:00.000Z" -> "2026-09-10T08:00" (formato de <input type="datetime-local">). */
function paraDatetimeLocal(iso: string): string {
    const d = parseISO(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Um comentário já postado: mostra o texto (com imagens) e, se for meu, deixa editar/excluir. */
function Comentario({ comentario, souAutor, onEditar, onExcluir }: {
    comentario: ComentarioDetalhe;
    souAutor: boolean;
    onEditar: (texto: string) => Promise<void>;
    onExcluir: () => Promise<void>;
}) {
    const [editando, setEditando] = useState(false);
    const [rascunho, setRascunho] = useState(comentario.texto);
    const [salvando, setSalvando] = useState(false);
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

    const salvar = async () => {
        const texto = rascunho.trim();
        if (!texto || texto === comentario.texto) {
            setEditando(false);
            return;
        }
        setSalvando(true);
        try {
            await onEditar(texto);
            setEditando(false);
        } catch {
            // erro aparece no rodapé do modal — mantém o texto editado em tela
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async () => {
        setSalvando(true);
        try {
            await onExcluir();
        } catch {
            setConfirmandoExclusao(false);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="flex items-start gap-2.5 group">
            <Avatar nome={comentario.autor.nome} iniciais={comentario.autor.iniciais} avatarUrl={comentario.autor.avatarUrl} />
            <div className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{comentario.autor.nome}</span>
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-400">
                            {format(parseISO(comentario.data), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </span>
                        {souAutor && !editando && !confirmandoExclusao && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { setRascunho(comentario.texto); setEditando(true); }}
                                    title="Editar comentário"
                                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmandoExclusao(true)}
                                    title="Excluir comentário"
                                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {confirmandoExclusao ? (
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-600 dark:text-slate-300">Excluir esse comentário do Trello?</span>
                        <button
                            type="button"
                            onClick={excluir}
                            disabled={salvando}
                            className="text-xs font-bold px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                            Excluir
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmandoExclusao(false)}
                            disabled={salvando}
                            className="text-xs font-medium px-2 py-0.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : editando ? (
                    <div className="mt-1">
                        <textarea
                            value={rascunho}
                            onChange={e => setRascunho(e.target.value)}
                            rows={3}
                            disabled={salvando}
                            autoFocus
                            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/20 resize-y disabled:opacity-60"
                        />
                        <div className="flex justify-end gap-1.5 mt-1">
                            <button
                                type="button"
                                onClick={() => setEditando(false)}
                                disabled={salvando}
                                className="text-xs font-medium px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={salvar}
                                disabled={salvando || !rascunho.trim()}
                                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap mt-0.5">
                        {renderTextoTrello(comentario.texto)}
                    </div>
                )}
            </div>
        </div>
    );
}

interface AnexoPendente {
    id: string;
    arquivo: File;
    previewUrl: string;
}

interface CardDetalheModalProps {
    aberto: boolean;
    card: CardDetalhe | null;
    meuId: string;
    isLoading: boolean;
    error: string | null;
    onFechar: () => void;
    onComentar: (texto: string, arquivos: File[]) => Promise<void>;
    onEditarComentario: (comentarioId: string, texto: string) => Promise<void>;
    onExcluirComentario: (comentarioId: string) => Promise<void>;
    enviandoComentario: boolean;
    erroComentario: string | null;
    onEditarPrazo: (due: string | null) => Promise<void>;
    salvandoPrazo: boolean;
    erroPrazo: string | null;
}

/** Renderize com `key={cardIdAberto ?? 'fechado'}` (do useTrelloCardDetalhe) — reseta o rascunho do comentário ao trocar de card, sem precisar de useEffect. */
export default function CardDetalheModal({
    aberto,
    card,
    meuId,
    isLoading,
    error,
    onFechar,
    onComentar,
    onEditarComentario,
    onExcluirComentario,
    enviandoComentario,
    erroComentario,
    onEditarPrazo,
    salvandoPrazo,
    erroPrazo,
}: CardDetalheModalProps) {
    const [rascunho, setRascunho] = useState('');
    const [pendentes, setPendentes] = useState<AnexoPendente[]>([]);
    const [arrastando, setArrastando] = useState(false);
    const [editandoPrazo, setEditandoPrazo] = useState(false);
    const [valorPrazo, setValorPrazo] = useState('');
    const inputArquivoRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!aberto) return;
        const onEsc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        document.addEventListener('keydown', onEsc);
        return () => document.removeEventListener('keydown', onEsc);
    }, [aberto, onFechar]);

    // Miniatura local usa object URL — sem revogar, vaza memória a cada print
    // colado. Só no unmount: com [pendentes] nas deps, colar a 2ª imagem
    // revogava a URL da 1ª e quebrava a miniatura dela. Remover/enviar já
    // revogam item a item.
    const pendentesRef = useRef<AnexoPendente[]>([]);
    useEffect(() => { pendentesRef.current = pendentes; }, [pendentes]);
    useEffect(() => () => { pendentesRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl)); }, []);

    if (!aberto) return null;

    const adicionarArquivos = (arquivos: File[]) => {
        if (arquivos.length === 0) return;
        setPendentes(prev => [
            ...prev,
            ...arquivos.map(arquivo => ({
                id: `${arquivo.name}-${arquivo.size}-${Date.now()}-${Math.random()}`,
                arquivo,
                previewUrl: URL.createObjectURL(arquivo),
            })),
        ]);
    };

    const removerPendente = (id: string) => {
        setPendentes(prev => {
            const alvo = prev.find(p => p.id === id);
            if (alvo) URL.revokeObjectURL(alvo.previewUrl);
            return prev.filter(p => p.id !== id);
        });
    };

    /** Print da área de transferência vem como item de arquivo no clipboard. */
    const aoColar = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const arquivos = Array.from(e.clipboardData?.files ?? []);
        if (arquivos.length === 0) return;
        e.preventDefault();
        adicionarArquivos(arquivos);
    };

    const aoSoltar = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setArrastando(false);
        adicionarArquivos(Array.from(e.dataTransfer?.files ?? []));
    };

    const enviar = async () => {
        const texto = rascunho.trim();
        if (!texto && pendentes.length === 0) return;
        const arquivos = pendentes.map(p => p.arquivo);
        try {
            await onComentar(texto, arquivos);
            pendentes.forEach(p => URL.revokeObjectURL(p.previewUrl));
            setPendentes([]);
            setRascunho('');
        } catch {
            // erro já fica visível via erroComentario — mantém rascunho e anexos
        }
    };

    const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void enviar();
        }
    };

    const abrirEdicaoPrazo = () => {
        setValorPrazo(card?.due ? paraDatetimeLocal(card.due) : '');
        setEditandoPrazo(true);
    };

    const salvarPrazo = async () => {
        if (!valorPrazo) return;
        try {
            await onEditarPrazo(new Date(valorPrazo).toISOString());
            setEditandoPrazo(false);
        } catch {
            // erro já fica visível via erroPrazo — mantém o formulário aberto
        }
    };

    const removerPrazo = async () => {
        try {
            await onEditarPrazo(null);
            setEditandoPrazo(false);
        } catch {
            // erro já fica visível via erroPrazo
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
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Prazo</p>
                                    {editandoPrazo ? (
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="datetime-local"
                                                value={valorPrazo}
                                                onChange={e => setValorPrazo(e.target.value)}
                                                disabled={salvandoPrazo}
                                                className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                            <button
                                                type="button"
                                                onClick={salvarPrazo}
                                                disabled={salvandoPrazo || !valorPrazo}
                                                title="Salvar"
                                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-40"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">check</span>
                                            </button>
                                            {card.due && (
                                                <button
                                                    type="button"
                                                    onClick={removerPrazo}
                                                    disabled={salvandoPrazo}
                                                    title="Remover prazo"
                                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setEditandoPrazo(false)}
                                                disabled={salvandoPrazo}
                                                title="Cancelar"
                                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={abrirEdicaoPrazo}
                                            className="group flex items-center gap-1.5 text-sm font-medium"
                                        >
                                            {card.due ? (
                                                <span className={card.dueComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}>
                                                    {format(parseISO(card.due), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                    {card.dueComplete && ' · concluído'}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic">Sem prazo</span>
                                            )}
                                            <span className="material-symbols-outlined text-[15px] text-slate-300 dark:text-slate-600 group-hover:text-primary">edit</span>
                                        </button>
                                    )}
                                    {erroPrazo && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{erroPrazo}</p>}
                                </div>
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
                                        {renderTextoTrello(card.descricao)}
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
                                        {card.anexos.map(a => {
                                            const ehImagem = a.tipo.startsWith('image/');
                                            const miniatura = ehImagem ? urlMiniaturaAnexo(card.id, a.id, a.previewId) : null;
                                            return (
                                                <li key={a.id}>
                                                    <a
                                                        href={miniatura ?? a.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary hover:underline"
                                                    >
                                                        {miniatura ? (
                                                            <img
                                                                src={miniatura}
                                                                alt=""
                                                                loading="lazy"
                                                                className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                                            />
                                                        ) : (
                                                            <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">{iconeAnexo(a.tipo)}</span>
                                                        )}
                                                        <span className="truncate">{a.nome}</span>
                                                        {a.bytes != null && <span className="text-slate-400 text-xs shrink-0">{formatarBytes(a.bytes)}</span>}
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Comentários ({card.comentarios.length})
                                </p>
                                {card.comentarios.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">Nenhum comentário ainda — escreva um aí embaixo.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {card.comentarios.map(c => (
                                            <Comentario
                                                key={c.id}
                                                comentario={c}
                                                souAutor={!!meuId && c.autorId === meuId}
                                                onEditar={texto => onEditarComentario(c.id, texto)}
                                                onExcluir={() => onExcluirComentario(c.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {card && (
                    <div
                        className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-5 py-3"
                        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                        onDragLeave={() => setArrastando(false)}
                        onDrop={aoSoltar}
                    >
                        <div className="flex items-start gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-primary/20 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <textarea
                                    value={rascunho}
                                    onChange={e => setRascunho(e.target.value)}
                                    onPaste={aoColar}
                                    onKeyDown={aoTeclar}
                                    placeholder="Escreva um comentário… (cole um print com Ctrl+V)"
                                    rows={2}
                                    disabled={enviandoComentario}
                                    className={`w-full text-sm rounded-xl border bg-white dark:bg-slate-800 px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none resize-none disabled:opacity-60 ${
                                        arrastando ? 'border-primary border-dashed bg-primary/5' : 'border-slate-200 dark:border-slate-700'
                                    }`}
                                />

                                {pendentes.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {pendentes.map(p => (
                                            <div key={p.id} className="relative group">
                                                {p.arquivo.type.startsWith('image/') ? (
                                                    <img
                                                        src={p.previewUrl}
                                                        alt={p.arquivo.name}
                                                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                                                    />
                                                ) : (
                                                    <div
                                                        title={p.arquivo.name}
                                                        className="w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-0.5 bg-slate-50 dark:bg-slate-800 px-1"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px] text-slate-400">{iconeAnexo(p.arquivo.type)}</span>
                                                        <span className="text-[9px] text-slate-400 truncate max-w-full">{p.arquivo.name}</span>
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => removerPendente(p.id)}
                                                    disabled={enviandoComentario}
                                                    title="Remover"
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-red-500 disabled:opacity-50"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                                <span className="absolute bottom-0 inset-x-0 text-[9px] text-center text-white bg-black/50 rounded-b-lg">
                                                    {formatarBytes(p.arquivo.size)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {erroComentario && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{erroComentario}</p>}

                                <div className="flex items-center justify-between gap-2 mt-1.5">
                                    <div className="flex items-center gap-1">
                                        <input
                                            ref={inputArquivoRef}
                                            type="file"
                                            multiple
                                            className="hidden"
                                            onChange={e => {
                                                adicionarArquivos(Array.from(e.target.files ?? []));
                                                e.target.value = '';
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => inputArquivoRef.current?.click()}
                                            disabled={enviandoComentario}
                                            title="Anexar arquivo"
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">attach_file</span>
                                        </button>
                                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                                            Cole, arraste ou escolha um arquivo · ⌘/Ctrl+Enter envia
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={enviar}
                                        disabled={enviandoComentario || (!rascunho.trim() && pendentes.length === 0)}
                                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                    >
                                        {enviandoComentario ? (
                                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                        ) : (
                                            <span className="material-symbols-outlined text-[16px]">send</span>
                                        )}
                                        {enviandoComentario && pendentes.length > 0 ? 'Enviando anexo…' : 'Comentar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
