import { useMemo, useState } from 'react';
import { useCatalogoItens, resolveImagemItem } from '../hooks/usePromoItemArte';

interface CatalogoItemPickerProps {
    estabelecimentoId: number;
    onSelect: (item: { nome: string; imagem: string | null }) => void;
}

function normalizeSearch(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Painel expansível pra escolher nome + foto de qualquer item do cardápio do
 * parceiro (não só os em promoção) — cobre o caso de o parceiro ainda não ter
 * item criado na campanha (banco de teste sincroniza ~1x/dia).
 */
export default function CatalogoItemPicker({ estabelecimentoId, onSelect }: CatalogoItemPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { itens, isLoading, error, load } = useCatalogoItens();

    function handleOpen() {
        const next = !open;
        setOpen(next);
        if (next && itens.length === 0 && !isLoading) {
            load(estabelecimentoId);
        }
    }

    const filtrados = useMemo(() => {
        const q = normalizeSearch(query);
        if (!q) return itens;
        return itens.filter(i => normalizeSearch(i.nome).includes(q));
    }, [itens, query]);

    return (
        <div>
            <button
                type="button"
                onClick={handleOpen}
                className="text-[11px] font-semibold text-primary hover:underline"
            >
                {open ? 'Fechar cardápio' : 'Escolher do cardápio'}
            </button>

            {open && (
                <div className="mt-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 space-y-1.5">
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar item do cardápio..."
                        autoFocus
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                    />

                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                        {isLoading ? (
                            <p className="px-2.5 py-3 text-xs text-slate-400 text-center">Carregando cardápio...</p>
                        ) : error ? (
                            <p className="px-2.5 py-3 text-xs text-red-500 text-center">{error}</p>
                        ) : filtrados.length === 0 ? (
                            <p className="px-2.5 py-3 text-xs text-slate-400 text-center">Nenhum item encontrado.</p>
                        ) : (
                            filtrados.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        onSelect({ nome: item.nome, imagem: item.imagem });
                                        setOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                >
                                    {item.imagem ? (
                                        <img
                                            src={resolveImagemItem(item.imagem) ?? undefined}
                                            alt=""
                                            className="size-8 rounded object-cover shrink-0 bg-slate-100 dark:bg-slate-800"
                                        />
                                    ) : (
                                        <span className="size-8 rounded shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                                            <span className="material-symbols-outlined text-[16px]">image_not_supported</span>
                                        </span>
                                    )}
                                    <span className="truncate">{item.nome}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
