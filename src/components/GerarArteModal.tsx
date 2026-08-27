import { useEffect, useMemo, useRef, useState } from 'react';
import {
    usePromoItemArte,
    formatDiasAtivos,
    formatPrecoArte,
    resolveImagemItem,
    resolveLogoUrl,
    type PromoItemArte,
} from '../hooks/usePromoItemArte';
import CatalogoItemPicker from './CatalogoItemPicker';

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
    alert: string | null;
}

interface EditableFields {
    itemName: string;
    priceOrig: string;
    pricePromo: string;
    daysText: string;
}

const BLANK_FIELDS: EditableFields = { itemName: '', priceOrig: '', pricePromo: '', daysText: 'Todos os dias' };

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

    // Cópia editável dos campos de texto — inicializada a partir do item buscado,
    // mas o usuário pode ajustar antes de gerar (ex.: nome do item mal cadastrado).
    const [fields, setFields] = useState<EditableFields | null>(null);
    const [fieldsForItemId, setFieldsForItemId] = useState<number | null>(null);

    // Preenchimento manual: cobre o caso de uma promoção recém-ativada que ainda
    // não chegou na réplica do banco (sincroniza ~1x por dia) — o usuário digita
    // os dados que já sabe (acabou de cadastrar no CMS) e gera a arte mesmo assim.
    const [manualMode, setManualMode] = useState(false);

    // Imagem do item — pré-preenchida a partir do item automático, mas sempre editável
    // (o seletor "Escolher do cardápio" também escreve aqui) nos dois modos.
    const [itemImageUrl, setItemImageUrl] = useState('');

    // A logo do parceiro (vinda da planilha) às vezes é uma URL quebrada/bloqueada
    // — dá pra colar um link alternativo aqui em vez de travar sem logo na arte.
    const [logoUrlOverride, setLogoUrlOverride] = useState(() => resolveLogoUrl(logoUrl) || '');

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
                setResult({ feedDataUrl: data.feedDataUrl, storyDataUrl: data.storyDataUrl, alert: data.alert ?? null });
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

    // Reseta os campos editáveis quando o item selecionado muda (troca de item ou
    // primeira carga) — só fora do modo manual, pra não sobrescrever o que o
    // usuário está digitando à mão.
    if (!manualMode && selectedItem && fieldsForItemId !== selectedItem.id) {
        setFieldsForItemId(selectedItem.id);
        setFields({
            itemName: selectedItem.nome,
            priceOrig: formatPrecoArte(selectedItem.precoOriginal),
            pricePromo: formatPrecoArte(selectedItem.precoPromocional),
            daysText: formatDiasAtivos(selectedItem.disponibilidadeDiaria) || 'Todos os dias',
        });
        setItemImageUrl(resolveImagemItem(selectedItem.imagem) || '');
    }

    function enterManualMode() {
        setManualMode(true);
        setFields({ ...BLANK_FIELDS });
        setItemImageUrl('');
    }

    function exitManualMode() {
        setManualMode(false);
        setFieldsForItemId(null); // força repopular fields + itemImageUrl a partir do item selecionado
    }

    function handleIframeLoad() {
        iframeRef.current?.contentWindow?.postMessage({ type: 'bigou:list-templates' }, window.location.origin);
    }

    const canProceed = !!fields && (manualMode || !!selectedItem);

    function handleGerar() {
        if (!fields || !selectedTemplateId || !canProceed) return;
        setGenError(null);
        setResult(null);
        setIsGenerating(true);
        iframeRef.current?.contentWindow?.postMessage(
            {
                type: 'bigou:generate',
                templateId: selectedTemplateId,
                row: {
                    partnerName,
                    itemName: fields.itemName,
                    priceOrig: fields.priceOrig,
                    pricePromo: fields.pricePromo,
                    daysText: fields.daysText,
                    itemImage: itemImageUrl.trim() || null,
                    logoImage: resolveLogoUrl(logoUrlOverride.trim()) || null,
                },
            },
            window.location.origin,
        );
    }

    const showGeneratorControls = manualMode || itens.length > 0;

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
                    ) : (
                        <>
                            {!manualMode && itens.length === 0 && (
                                <div className="py-6 text-center text-slate-500 dark:text-slate-400">
                                    <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">inventory_2</span>
                                    <p className="text-sm font-medium">Nenhum item promocional encontrado para este estabelecimento.</p>
                                    <p className="text-xs mt-1.5 max-w-sm mx-auto">
                                        O banco sincroniza cerca de 1x por dia — se você ativou a promoção hoje, ela pode ainda não ter chegado aqui.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={enterManualMode}
                                        className="mt-3 px-4 py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                                    >
                                        Preencher manualmente
                                    </button>
                                </div>
                            )}

                            {!manualMode && itens.length > 0 && (
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
                                                    <option key={i.id} value={i.id}>
                                                        {i.nome}{i.campanha ? ` — ${i.campanha}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {selectedItem && fields && (
                                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {selectedItem.campanha && (
                                                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded">
                                                        {selectedItem.campanha}
                                                    </span>
                                                )}
                                                {selectedItem.status === 1 && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                                        <span className="material-symbols-outlined text-[12px]">hourglass_top</span>
                                                        Pendente — aguardando aprovação do parceiro
                                                    </span>
                                                )}
                                            </div>
                                            <EditableFieldsForm
                                                fields={fields}
                                                onChange={setFields}
                                                itemImageUrl={itemImageUrl}
                                                onItemImageUrlChange={setItemImageUrl}
                                                estabelecimentoId={estabelecimentoId}
                                            />
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={enterManualMode}
                                        className="text-[11px] font-semibold text-primary hover:underline"
                                    >
                                        Ou preencher manualmente
                                    </button>
                                </>
                            )}

                            {manualMode && fields && (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Preenchimento manual</span>
                                        {itens.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={exitManualMode}
                                                className="text-[11px] font-semibold text-primary hover:underline"
                                            >
                                                Usar item encontrado
                                            </button>
                                        )}
                                    </div>
                                    <EditableFieldsForm
                                        fields={fields}
                                        onChange={setFields}
                                        itemImageUrl={itemImageUrl}
                                        onItemImageUrlChange={setItemImageUrl}
                                        estabelecimentoId={estabelecimentoId}
                                    />
                                </div>
                            )}

                            {showGeneratorControls && (
                                <>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Logo do parceiro (URL)</label>
                                        <input
                                            type="text"
                                            value={logoUrlOverride}
                                            onChange={e => setLogoUrlOverride(e.target.value)}
                                            placeholder="https://..."
                                            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-0.5">Se a logo não carregar na arte, cole aqui o link direto de outra imagem.</p>
                                    </div>

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
                                        disabled={!canProceed || !selectedTemplateId || isGenerating}
                                        className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors"
                                    >
                                        {isGenerating ? 'Gerando...' : 'Gerar Artes'}
                                    </button>

                                    {result?.alert && (
                                        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
                                            <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                                            {result.alert}
                                        </p>
                                    )}

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

/** Trata o valor digitado como centavos — "1850" vira "R$ 18,50", igual a um caixa de loja. */
function formatCentavos(digits: string): string {
    const cents = parseInt(digits || '0', 10);
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function CurrencyMaskedInput({
    value,
    onChange,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}) {
    return (
        <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={e => onChange(formatCentavos(e.target.value.replace(/\D/g, '')))}
            className={className}
        />
    );
}

interface EditableFieldsFormProps {
    fields: EditableFields;
    onChange: (fields: EditableFields) => void;
    itemImageUrl: string;
    onItemImageUrlChange: (url: string) => void;
    estabelecimentoId: number;
}

function EditableFieldsForm({ fields, onChange, itemImageUrl, onItemImageUrlChange, estabelecimentoId }: EditableFieldsFormProps) {
    return (
        <>
            <div>
                <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nome do item</label>
                    <CatalogoItemPicker
                        estabelecimentoId={estabelecimentoId}
                        onSelect={item => {
                            onChange({ ...fields, itemName: item.nome });
                            onItemImageUrlChange(resolveImagemItem(item.imagem) || '');
                        }}
                    />
                </div>
                <input
                    type="text"
                    value={fields.itemName}
                    onChange={e => onChange({ ...fields, itemName: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Preço original</label>
                    <CurrencyMaskedInput
                        value={fields.priceOrig}
                        onChange={v => onChange({ ...fields, priceOrig: v })}
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Preço promocional</label>
                    <CurrencyMaskedInput
                        value={fields.pricePromo}
                        onChange={v => onChange({ ...fields, pricePromo: v })}
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-semibold"
                    />
                </div>
            </div>
            <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Dias ativos</label>
                <input
                    type="text"
                    value={fields.daysText}
                    onChange={e => onChange({ ...fields, daysText: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                />
            </div>
            <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Imagem do item (URL)</label>
                <input
                    type="text"
                    value={itemImageUrl}
                    onChange={e => onItemImageUrlChange(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                />
            </div>
        </>
    );
}
