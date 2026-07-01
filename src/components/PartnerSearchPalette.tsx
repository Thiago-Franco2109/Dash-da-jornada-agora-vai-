import { useEffect, useMemo, useRef, useState } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';

interface PartnerSearchPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    partners: EnrichedPerformanceRow[];
    onSelect: (partner: EnrichedPerformanceRow) => void;
    isLoading?: boolean;
}

function normalizeSearch(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function matchesPartner(partner: EnrichedPerformanceRow, query: string): boolean {
    const q = normalizeSearch(query);
    if (!q) return true;
    const name = normalizeSearch(partner.estabelecimento ?? '');
    const city = normalizeSearch(partner.cidade ?? '');
    const id = normalizeSearch(String(partner.estab_id ?? ''));
    return name.includes(q) || city.includes(q) || id.includes(q);
}

const MAX_RESULTS = 12;

export default function PartnerSearchPalette({
    isOpen,
    onClose,
    partners,
    onSelect,
    isLoading = false,
}: PartnerSearchPaletteProps) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const results = useMemo(() => {
        if (!query.trim()) return partners.slice(0, MAX_RESULTS);
        return partners.filter(p => matchesPartner(p, query)).slice(0, MAX_RESULTS);
    }, [partners, query]);

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setActiveIndex(0);
        const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
        return () => window.clearTimeout(timer);
    }, [isOpen]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        if (!isOpen) return;
        const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
        activeEl?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, results.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Enter' && results[activeIndex]) {
                e.preventDefault();
                onSelect(results[activeIndex]);
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, activeIndex, onSelect, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
            onMouseDown={onClose}
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                aria-hidden
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Pesquisar parceiro"
                className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-700 overflow-hidden"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="material-symbols-outlined text-slate-400 text-[22px]">search</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Pesquisar parceiro..."
                        className="flex-1 bg-transparent text-slate-900 dark:text-white text-lg font-medium placeholder:text-slate-400 focus:outline-none"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        esc
                    </kbd>
                </div>

                <div ref={listRef} className="max-h-[min(50vh,400px)] overflow-y-auto py-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                            <span className="text-sm font-medium">Carregando parceiros...</span>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">storefront</span>
                            <p className="text-sm font-medium">Nenhum parceiro encontrado</p>
                        </div>
                    ) : (
                        results.map((partner, index) => (
                            <button
                                key={`${partner.estab_id ?? ''}-${partner.estabelecimento}`}
                                data-index={index}
                                type="button"
                                onClick={() => {
                                    onSelect(partner);
                                    onClose();
                                }}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                    index === activeIndex
                                        ? 'bg-primary/10 dark:bg-primary/20'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                }`}
                            >
                                <div className="size-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                                    {partner.logo_url ? (
                                        <img
                                            src={partner.logo_url}
                                            alt=""
                                            className="size-full object-cover"
                                        />
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-400 text-[20px]">store</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                        {partner.estabelecimento}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {partner.cidade}
                                        {partner.analista ? ` · ${partner.analista}` : ''}
                                    </p>
                                </div>
                                {index === activeIndex && (
                                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
                                        ↵
                                    </kbd>
                                )}
                            </button>
                        ))
                    )}
                </div>

                <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">↑</kbd>
                            <kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">↓</kbd>
                            navegar
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">↵</kbd>
                            abrir
                        </span>
                    </span>
                    <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] lowercase tracking-wide">
                        command+k
                    </kbd>
                </div>
            </div>
        </div>
    );
}
