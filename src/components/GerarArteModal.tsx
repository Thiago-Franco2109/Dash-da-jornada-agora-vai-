import { useEffect, useMemo, useRef, useState } from 'react';
import {
    usePromoItemArte,
    formatDiasAtivos,
    formatPrecoArte,
    resolveImagemItem,
    type PromoItemArte,
} from '../hooks/usePromoItemArte';

interface GerarArteModalProps {
    estabelecimentoId: number;
    partnerName: string;
    logoUrl?: string;
    onClose: () => void;
}

interface GeneratorTemplate {
    id: string;
    name: string;
}

interface GenerateResult {
    feedDataUrl: string;
    storyDataUrl: string;
}

const GERADOR_URL = '/gerador-artes/index.html';

export default function GerarArteModal({ estabelecimentoId, partnerName, logoUrl, onClose }: GerarArteModalProps) {
    const { itens, isLoading, error, load } = usePromoItemArte();
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [templates, setTemplates] = useState<GeneratorTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [iframeReady, setIframeReady] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genError, setGenError] = useState<string | null>(null);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => { load(estabelecimentoId); }, [estabelecimentoId, load]);

    useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'bigou:templates') {
                setTemplates(data.templates ?? []);
                setIframeReady(true);
            } else if (data.type === 'bigou:result') {
                setResult({ feedDataUrl: data.feedDataUrl, storyDataUrl: data.storyDataUrl });
                setIsGenerating(false);
            } else if (data.type === 'bigou:error') {
                setGenError(data.message || 'Erro desconhecido ao gerar a arte.');
                setIsGenerating(false);
            }
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const effectiveSelectedItemId = selectedItemId ?? itens[0]?.id ?? null;
    const selectedItem: PromoItemArte | undefined = useMemo(
        () => itens.find(i => i.id === effectiveSelectedItemId),
        [itens, effectiveSelectedItemId],
    );

    function handleIframeLoad() {
        iframeRef.current?.contentWindow?.postMessage({ type: 'bigou:list-templates' }, window.location.origin);
    }

    function handleGerar() {
        if (!selectedItem || !selectedTemplateId) return;
        setGenError(null);
        setResult(null);
        setIsGenerating(true);
        iframeRef.current?.contentWindow?.postMessage(
            {
                type: 'bigou:generate',
                templateId: selectedTemplateId,
                row: {
                    partnerName,
                    itemName: selectedItem.nome,
                    priceOrig: formatPrecoArte(selectedItem.precoOriginal),
                    pricePromo: formatPrecoArte(selectedItem.precoPromocional),
                    daysText: formatDiasAtivos(selectedItem.disponibilidadeDiaria),
                    itemImage: resolveImagemItem(selectedItem.imagem),
                    logoImage: logoUrl || null,
                },
            },
            window.location.origin,
        );
    }

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onMouseDown={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Gerar Arte - ${partnerName}`}
                className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-700 overflow-hidden"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Gerar Arte</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{partnerName}</p>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                            <span className="text-sm font-medium">Buscando item promocional...</span>
                        </div>
                    ) : error ? (
                        <div className="py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
                    ) : itens.length === 0 ? (
                        <div className="py-6 text-center text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">inventory_2</span>
                            <p className="text-sm font-medium">Nenhum item promocional ativo encontrado para este estabelecimento.</p>
                        </div>
                    ) : (
                        <>
                            {itens.length > 1 && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Item</label>
                                    <select
                                        value={effectiveSelectedItemId ?? ''}
                                        onChange={e => setSelectedItemId(Number(e.target.value))}
                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-white"
                                    >
                                        {itens.map(i => (
                                            <option key={i.id} value={i.id}>{i.nome}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedItem && (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm space-y-1">
                                    <p className="font-semibold text-slate-900 dark:text-white">{selectedItem.nome}</p>
                                    <p className="text-slate-500 dark:text-slate-400">
                                        {formatPrecoArte(selectedItem.precoOriginal)}
                                        {selectedItem.precoPromocional != null && (
                                            <> → <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatPrecoArte(selectedItem.precoPromocional)}</span></>
                                        )}
                                    </p>
                                    <p className="text-slate-400 dark:text-slate-500 text-xs">
                                        {formatDiasAtivos(selectedItem.disponibilidadeDiaria) || 'Todos os dias'}
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Template</label>
                                <select
                                    value={selectedTemplateId}
                                    onChange={e => setSelectedTemplateId(e.target.value)}
                                    disabled={!iframeReady}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-white disabled:opacity-50"
                                >
                                    <option value="">{iframeReady ? 'Selecione um template...' : 'Carregando templates...'}</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                                {iframeReady && templates.length === 0 && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                        Nenhum template salvo. Crie um na aba Templates do gerador antes de continuar.
                                    </p>
                                )}
                            </div>

                            {genError && <p className="text-sm text-red-600 dark:text-red-400">{genError}</p>}

                            <button
                                type="button"
                                onClick={handleGerar}
                                disabled={!selectedItem || !selectedTemplateId || isGenerating}
                                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors"
                            >
                                {isGenerating ? 'Gerando...' : 'Gerar Artes'}
                            </button>

                            {result && (
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div className="space-y-1.5">
                                        <img src={result.feedDataUrl} alt="Feed" className="w-full rounded-lg border border-slate-200 dark:border-slate-700" />
                                        <a href={result.feedDataUrl} download={`feed_${partnerName}.png`} className="block text-center text-xs font-semibold text-primary hover:underline">
                                            Baixar Feed
                                        </a>
                                    </div>
                                    <div className="space-y-1.5">
                                        <img src={result.storyDataUrl} alt="Story" className="w-full rounded-lg border border-slate-200 dark:border-slate-700" />
                                        <a href={result.storyDataUrl} download={`story_${partnerName}.png`} className="block text-center text-xs font-semibold text-primary hover:underline">
                                            Baixar Story
                                        </a>
                                    </div>
                                </div>
                            )}
                        </>
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

                {/* Iframe do gerador, fora da tela — só é acionado via postMessage (ver public/gerador-artes/js/hostBridge.js) */}
                <iframe
                    ref={iframeRef}
                    src={GERADOR_URL}
                    onLoad={handleIframeLoad}
                    title="Gerador de Artes"
                    aria-hidden="true"
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0 }}
                />
            </div>
        </div>
    );
}
