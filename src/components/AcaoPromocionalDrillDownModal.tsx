import { useEffect, useMemo, useState } from 'react';
import type { AcaoPromocionalMetrica } from '../types/acoesPromocionais';
import { fetchAcaoPromocionalDrillDown } from '../hooks/useAcoesPromocionaisData';
import GerarArteModal from './GerarArteModal';

interface AcaoPromocionalDrillDownModalProps {
    cidade: string;
    metrica: AcaoPromocionalMetrica;
    metricaLabel: string;
    onClose: () => void;
    /** Logo do parceiro (Carteira/CRM) por nome normalizado — usado pelo botão "Gerar Arte". */
    logoByNome?: Record<string, string>;
}

function normalizeSearch(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export default function AcaoPromocionalDrillDownModal({
    cidade,
    metrica,
    metricaLabel,
    onClose,
    logoByNome,
}: AcaoPromocionalDrillDownModalProps) {
    const [estabelecimentos, setEstabelecimentos] = useState<{ id: number; nome: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [gerarArteFor, setGerarArteFor] = useState<{ id: number; nome: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        fetchAcaoPromocionalDrillDown(cidade, metrica)
            .then(res => { if (!cancelled) setEstabelecimentos(res.estabelecimentos ?? []); })
            .catch(err => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [cidade, metrica]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const filtrados = useMemo(() => {
        const q = normalizeSearch(query);
        if (!q) return estabelecimentos;
        return estabelecimentos.filter(e => normalizeSearch(e.nome).includes(q) || String(e.id).includes(q));
    }, [estabelecimentos, query]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onMouseDown={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`${metricaLabel} - ${cidade}`}
                className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-700 overflow-hidden"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {metricaLabel} - {cidade}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {isLoading ? 'Carregando…' : `${estabelecimentos.length} estabelecimento${estabelecimentos.length === 1 ? '' : 's'}`}
                    </p>
                </div>

                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                        <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Buscar estabelecimento..."
                            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                            <span className="text-sm font-medium">Carregando estabelecimentos...</span>
                        </div>
                    ) : error ? (
                        <div className="py-10 px-5 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
                    ) : filtrados.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">storefront</span>
                            <p className="text-sm font-medium">Nenhum estabelecimento encontrado</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filtrados.map(e => (
                                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <div className="min-w-0">
                                        <span className="text-xs text-slate-400 tabular-nums">{e.id}</span>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{e.nome}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setGerarArteFor(e)}
                                            title="Gerar arte deste parceiro"
                                            className="text-slate-400 hover:text-primary transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                                        </button>
                                        <a
                                            href={`https://admin.bigou.com.br/estabelecimento/cadastro/${e.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={`ID CMS: ${e.id}`}
                                            className="text-slate-400 hover:text-primary transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">launch</span>
                                        </a>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>

            {gerarArteFor && (
                <GerarArteModal
                    estabelecimentoId={gerarArteFor.id}
                    partnerName={gerarArteFor.nome}
                    logoUrl={logoByNome?.[normalizeSearch(gerarArteFor.nome)]}
                    onClose={() => setGerarArteFor(null)}
                />
            )}
        </div>
    );
}
