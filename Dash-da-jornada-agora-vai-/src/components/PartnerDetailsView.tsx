import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { type EnrichedPerformanceRow, getInterpretationBox, getStarColor } from '../utils/calculations';
import MenuFunnel, { type FunnelStep } from './MenuFunnel';
import type { StoreAccessData } from '../hooks/useDailyAccessSync';
import { getPartnerState, updateContactDetail, finishJourney, reopenJourney, type ContactDetail } from '../config/partnerState';
import { usePartnerRelevance } from '../hooks/usePartnerRelevance';
import { useCityIds } from '../hooks/useCityIds';

interface PartnerDetailsViewProps {
    partner: EnrichedPerformanceRow;
    onBack: () => void;
    /** Live data from the unique daily accesses API */
    dailyAccessData?: StoreAccessData;
    onRefresh: () => void;
}

type TabKey = 'geral' | 'contatos' | 'promocoes' | 'historico';

const CHECKLIST_TEMPLATES = {
    w1: [
        { id: 'menu_complete', label: 'Verificar se o cardápio está completo e sem erros de ortografia' },
        { id: 'photos_min', label: 'Confirmar se há pelo menos 5 fotos de alta qualidade nos principais itens' },
        { id: 'coupon_active', label: 'Validar a ativação do Cupom de Primeira Compra' },
        { id: 'hours_check', label: 'Checar se os horários de funcionamento no app coincidem com o horário real' },
    ],
    w2: [
        { id: 'funnel_check', label: 'Analisar os primeiros acessos do funil (Acessos x Compras)' },
        { id: 'low_conversion', label: 'Identificar pratos com baixa conversão e ajustar descrições/preços' },
        { id: 'opening_punctual', label: 'Confirmar se o parceiro está abrindo a loja no horário correto' },
        { id: 'promo_campaign', label: 'Avaliar a necessidade de ativar uma nova campanha de promoção' },
    ],
    w3: [
        { id: 'delivery_time', label: 'Avaliar o tempo médio de preparo e de entrega dos pedidos' },
        { id: 'reviews_check', label: 'Checar avaliações dos clientes e feedbacks sobre os primeiros pedidos' },
        { id: 'retention_check', label: 'Analisar a recorrência de clientes (se voltaram a comprar)' },
        { id: 'delivery_promo', label: 'Sugerir promoções de frete grátis ou desconto progressivo para dias fracos' },
    ],
    w4: [
        { id: 'goal_check', label: 'Validar se atingiu a meta de ativação (30 pedidos)' },
        { id: 'final_alignment', label: 'Realizar alinhamento final e definir estratégias de pós-onboarding' },
        { id: 'satisfaction_eval', label: 'Avaliar o desempenho geral e a satisfação do parceiro' },
        { id: 'close_onboarding', label: 'Decidir pelo encerramento formal do Onboarding' },
    ]
};

const STATUS_OPTIONS = [
    { value: 'pendente' as const, label: 'Pendente', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    { value: 'aguardando_retorno' as const, label: 'Aguardando Retorno', color: 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border border-orange-200/50 dark:border-orange-900/30' },
    { value: 'em_andamento' as const, label: 'Em Andamento', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/30' },
    { value: 'finalizado' as const, label: 'Finalizado', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30' },
    { value: 'negado' as const, label: 'Negado', color: 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50 dark:border-red-900/30' },
];

export default function PartnerDetailsView({ partner, onBack, dailyAccessData, onRefresh }: PartnerDetailsViewProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('geral');
    
    // States for contact details and notes drafting
    const [localDetails, setLocalDetails] = useState<Record<'w1' | 'w2' | 'w3' | 'w4', ContactDetail>>({
        w1: { completed: false, status: 'pendente' },
        w2: { completed: false, status: 'pendente' },
        w3: { completed: false, status: 'pendente' },
        w4: { completed: false, status: 'pendente' },
    });

    const [notesDraft, setNotesDraft] = useState<Record<'w1' | 'w2' | 'w3' | 'w4', string>>({
        w1: '',
        w2: '',
        w3: '',
        w4: '',
    });

    const [urlInputs, setUrlInputs] = useState<Record<'w1' | 'w2' | 'w3' | 'w4', string>>({
        w1: '',
        w2: '',
        w3: '',
        w4: '',
    });
    // State to control collapsed view of contact cards when marked completed

    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // Sync from partner state when changing partners
    useEffect(() => {
        const state = getPartnerState(partner.estab_id || partner.estabelecimento);
        const details = state.contactDetails || {
            w1: { completed: state.contacts.w1, status: state.contacts.w1 ? 'finalizado' : 'pendente' },
            w2: { completed: state.contacts.w2, status: state.contacts.w2 ? 'finalizado' : 'pendente' },
            w3: { completed: state.contacts.w3, status: state.contacts.w3 ? 'finalizado' : 'pendente' },
            w4: { completed: state.contacts.w4, status: state.contacts.w4 ? 'finalizado' : 'pendente' },
        };
        
        setLocalDetails(details as any);
        setNotesDraft({
            w1: details.w1?.notes || '',
            w2: details.w2?.notes || '',
            w3: details.w3?.notes || '',
            w4: details.w4?.notes || '',
        });
    }, [partner.estab_id, partner.estabelecimento, partner.contacts]);

    const handleUpdateDetail = (week: 'w1' | 'w2' | 'w3' | 'w4', field: keyof ContactDetail, value: any) => {
        setLocalDetails(prev => {
            const currentDetail = prev[week] || { completed: false, status: 'pendente' };
            const updatedDetail = { ...currentDetail, [field]: value };
            return { ...prev, [week]: updatedDetail };
        });
        updateContactDetail(partner.estab_id || partner.estabelecimento, week, { [field]: value });
        onRefresh();
    };

    const handleToggleChecklist = (week: 'w1' | 'w2' | 'w3' | 'w4', itemId: string) => {
        const currentDetail = localDetails[week] || { completed: false, status: 'pendente' };
        const currentChecklist = currentDetail.checklist || {};
        const newChecklist = { ...currentChecklist, [itemId]: !currentChecklist[itemId] };
        handleUpdateDetail(week, 'checklist', newChecklist);
    };

    const handleToggleCompleted = (week: 'w1' | 'w2' | 'w3' | 'w4') => {
        const currentDetail = localDetails[week] || { completed: false, status: 'pendente' };
        const newCompleted = !currentDetail.completed;
        const newStatus = newCompleted ? 'finalizado' : 'pendente';
        
        setLocalDetails(prev => ({
            ...prev,
            [week]: {
                ...prev[week],
                completed: newCompleted,
                status: newStatus
            }
        }));

        updateContactDetail(partner.estab_id || partner.estabelecimento, week, {
            completed: newCompleted,
            status: newStatus
        });
        onRefresh();
    };

    const compressAndAddImage = (week: 'w1' | 'w2' | 'w3' | 'w4', file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                    
                    const currentDetail = localDetails[week] || { completed: false, status: 'pendente' };
                    const currentImages = currentDetail.images || [];
                    const newImages = [...currentImages, compressedBase64];
                    handleUpdateDetail(week, 'images', newImages);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    
    const handleAddImageUrl = (week: 'w1' | 'w2' | 'w3' | 'w4') => {
        const url = urlInputs[week];
        if (!url || !url.trim()) return;
        const currentDetail = localDetails[week] || { completed: false, status: 'pendente' };
        const currentImages = currentDetail.images || [];
        const newImages = [...currentImages, url.trim()];
        handleUpdateDetail(week, 'images', newImages);
        setUrlInputs(prev => ({ ...prev, [week]: '' }));
    };
    const handlePaste = (week: 'w1' | 'w2' | 'w3' | 'w4', e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        compressAndAddImage(week, file);
                    }
                }
            }
        }
    };

    const handleDeleteImage = (week: 'w1' | 'w2' | 'w3' | 'w4', imageIndex: number) => {
        const currentDetail = localDetails[week] || { completed: false, status: 'pendente' };
        const currentImages = currentDetail.images || [];
        const newImages = currentImages.filter((_, idx) => idx !== imageIndex);
        handleUpdateDetail(week, 'images', newImages);
    };

    const interpretation = getInterpretationBox(partner.priority_stars);
    const progressPercentage = Math.min(100, Math.round((partner.total_pedidos / 30) * 100));
    
    const { relevance, updateRelevance, loading: relevanceLoading } = usePartnerRelevance(partner.estab_id || partner.estabelecimento);
    const { getCmsPromoUrl, getLocalidadeId, loading: cityIdsLoading } = useCityIds();

    const BASE_PROMO_URL = 'https://admin.bigou.com.br/campanha/promocao/cadastro/26';
    const promoUrl     = getCmsPromoUrl(BASE_PROMO_URL, partner.cidade);
    const localidadeId = getLocalidadeId(partner.cidade);

    // Cupom: vai direto para a aba de cupons do estabelecimento
    const cupomUrl = partner.estab_id
        ? `https://admin.bigou.com.br/estabelecimento/cadastro/${partner.estab_id}/cupons`
        : 'https://admin.bigou.com.br/estabelecimento';

    const handleToggleJourney = () => {
        if (partner.isFinished) {
            reopenJourney(partner.estab_id || partner.estabelecimento);
        } else {
            if (window.confirm(`Deseja encerrar a jornada de ${partner.estabelecimento}?`)) {
                finishJourney(partner.estab_id || partner.estabelecimento);
            }
        }
        onRefresh();
    };

    // ---- Reports URL helper ----
    const getReportsUrl = (estabId: string | number) => {
        const end = new Date();
        const start = subDays(end, 28);
        const startStr = `${format(start, 'yyyy-MM-dd')} 00:00:00`;
        const endStr = `${format(end, 'yyyy-MM-dd')} 23:59:59`;
        return `https://admin.bigou.com.br/relatorio/pedidos?data_inicio=${encodeURIComponent(startStr)}&data_fim=${encodeURIComponent(endStr)}&estabelecimentos=${estabId}`;
    };

    // ---- Funil: apenas dados reais das planilhas integradas (acessos + pedidos) ----
    const orders = partner.total_pedidos;
    const hasLiveAPI = !!dailyAccessData && dailyAccessData.acessosUnicos > 0;

    const funnel: FunnelStep[] = (() => {
        if (hasLiveAPI && dailyAccessData) {
            const acessos = dailyAccessData.acessosUnicos;
            const pctCompras = acessos > 0 ? parseFloat(((orders / acessos) * 100).toFixed(2)) : 0;
            return [
                {
                    label: 'Acessos',
                    description: 'acessos únicos (planilha integrada)',
                    icon: 'visibility',
                    value: acessos,
                    pctOfFirst: 100,
                },
                {
                    label: 'Compras',
                    description: 'pedidos confirmados (onboarding)',
                    icon: 'shopping_cart',
                    value: orders,
                    pctOfFirst: pctCompras,
                },
            ];
        }
        // Sem planilha de acessos: exibe só pedidos confirmados vindos da planilha principal
        if (orders > 0) {
            return [
                {
                    label: 'Compras',
                    description: 'pedidos confirmados (onboarding)',
                    icon: 'shopping_cart',
                    value: orders,
                    pctOfFirst: 100,
                },
            ];
        }
        return [];
    })();
    // ------------------------------------------------------------------------------

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-y-auto">
            {/* Header Sticky Container */}
            <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-20 border-b border-slate-200 dark:border-slate-800">
                <div className="px-6 pt-6 flex items-center justify-between">
                    <div className="w-full">
                        <button
                            onClick={onBack}
                            className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-4 group"
                        >
                            <span className="material-symbols-outlined text-[18px] mr-1 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                            Voltar para a lista
                        </button>
                        <div className="flex items-start gap-4">
                            {partner.logo_url ? (
                                <img src={partner.logo_url} alt={partner.estabelecimento} className="size-24 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md object-cover mt-1" />
                            ) : (
                                <div className="size-24 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 mt-1">
                                    <span className="material-symbols-outlined text-5xl">store</span>
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight truncate">
                                        {partner.estabelecimento}
                                    </h1>
                                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${partner.status === 'ativo'
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-emerald-600/20'
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 ring-red-600/20'
                                        }`}>
                                        {partner.status}
                                    </span>

                                    <div className={`flex items-center border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 bg-white dark:bg-slate-800 ${getStarColor(partner.priority_stars)}`}>
                                        <span className="material-symbols-outlined text-[18px] mr-1">star</span>
                                        <span className="text-sm font-bold text-slate-800 dark:text-white">Prioridade {partner.priority_stars}</span>
                                    </div>

                                    {/* Relevância Comercial (Supabase) */}
                                    <div className="flex items-center gap-2 border border-indigo-100 dark:border-indigo-900/30 rounded-md px-3 py-1 bg-indigo-50/50 dark:bg-indigo-900/10">
                                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-tighter">Relevância Comercial:</span>
                                        <div className="flex items-center">
                                            {[1, 2, 3, 4, 5].map((score) => (
                                                <button
                                                    key={score}
                                                    onClick={() => updateRelevance(score)}
                                                    disabled={relevanceLoading}
                                                    className={`material-symbols-outlined text-[20px] transition-all ${
                                                        relevance && relevance >= score 
                                                        ? 'text-amber-500 fill-1' 
                                                        : 'text-slate-300 dark:text-slate-600'
                                                    } hover:scale-125 disabled:opacity-50`}
                                                    style={{ fontVariationSettings: relevance && relevance >= score ? "'FILL' 1" : "'FILL' 0" }}
                                                >
                                                    grade
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {partner.isFinished && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-100 dark:border-emerald-800/30 text-sm font-black uppercase tracking-widest">
                                            <span className="material-symbols-outlined text-[18px]">verified</span>
                                            Jornada Finalizada
                                        </div>
                                    )}
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 mt-2 flex items-center">
                                    <span className="material-symbols-outlined text-[16px] mr-1">location_on</span>
                                    {partner.cidade}
                                </p>
                                
                                {partner.estab_id && (
                                    <div className="flex items-center gap-2 mt-4">
                                        <button
                                            onClick={handleToggleJourney}
                                            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-bold transition-all shadow-sm ${
                                                partner.isFinished 
                                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300' 
                                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px] mr-1.5 italic">
                                                {partner.isFinished ? 'settings_backup_restore' : 'check_circle'}
                                            </span>
                                            {partner.isFinished ? 'Reabrir Jornada' : 'Finalizar Onboarding'}
                                        </button>
                                        <a
                                            href={`https://admin.bigou.com.br/estabelecimento/cadastro/${partner.estab_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors shadow-sm group"
                                            title={`ID CMS: ${partner.estab_id}`}
                                        >
                                            <span className="material-symbols-outlined text-[18px] mr-1.5 group-hover:scale-110 transition-transform">launch</span>
                                            Ir para CMS
                                        </a>

                                        <a
                                            href={getReportsUrl(partner.estab_id)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors shadow-sm group"
                                            title="Ver Relatório de Pedidos (Últimos 28 dias)"
                                        >
                                            <span className="material-symbols-outlined text-[18px] mr-1.5 group-hover:scale-110 transition-transform">assessment</span>
                                            Ver Relatórios
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="px-6 flex gap-6 mt-6">
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'geral' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('geral')}
                    >
                        <span className="material-symbols-outlined text-[18px]">dashboard</span>
                        Visão Geral
                    </button>
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'contatos' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('contatos')}
                    >
                        <span className="material-symbols-outlined text-[18px]">support_agent</span>
                        Pontos de Contato
                    </button>
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'promocoes' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('promocoes')}
                    >
                        <span className="material-symbols-outlined text-[18px]">local_offer</span>
                        Promoções
                    </button>
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'historico' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('historico')}
                    >
                        <span className="material-symbols-outlined text-[18px]">history</span>
                        Histórico
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-6">
                {activeTab === 'geral' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Left Column: Basic Info & Current Metrics */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Interpretation Box */}
                            <div className={`p-4 rounded-xl border flex items-start gap-3 ${interpretation.bg} ${interpretation.border}`}>
                                <span className={`material-symbols-outlined ${interpretation.textClass}`}>{interpretation.icon}</span>
                                <p className={`text-sm font-medium mt-0.5 ${interpretation.textClass}`}>
                                    {interpretation.text}
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                                <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-4">Métricas de Onboarding</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Dias Ativo</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.dias_desde_lancamento}</p>
                                        <p className="text-xs text-slate-400 mt-1">Lançado: {partner.lancamento}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos Reais</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.total_pedidos}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos Esperados</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.pedidos_esperados}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Índice Perfor.</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.indice_desempenho.toFixed(2)}</p>
                                    </div>
                                </div>

                                {/* Acessos ao Cardápio (Live API) */}
                                {hasLiveAPI && (
                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="size-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_6px_rgb(99,102,241)]"></span>
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Acessos ao Cardápio <span className="text-xs text-indigo-500 font-semibold">(tempo real)</span></h4>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800/30">
                                                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mb-1">Total no Período</p>
                                                <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">{dailyAccessData!.acessosUnicos.toLocaleString('pt-BR')}</p>
                                                <p className="text-[10px] text-indigo-500 mt-0.5">{dailyAccessData!.totalDias} dias com dados</p>
                                            </div>
                                            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                                <p className="text-xs text-slate-500 font-semibold mb-1">Média / Dia</p>
                                                <p className="text-xl font-bold text-slate-800 dark:text-white">{dailyAccessData!.mediaDiaria}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">acessos únicos</p>
                                            </div>
                                            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                                <p className="text-xs text-slate-500 font-semibold mb-1">Último Dia</p>
                                                <p className="text-xl font-bold text-slate-800 dark:text-white">{dailyAccessData!.lastDayAcessos}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">acessos</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Progress Towards 30 */}
                                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Progresso para a Meta de Ativação (30 Pedidos)</span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">{progressPercentage}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                                        <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${progressPercentage}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                                {/* Section header */}
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-slate-900 dark:text-white font-bold text-lg">Pedidos por Semana (Primeiros 28 Dias)</h3>
                                </div>

                                {/* Week cards – static */}
                                <div className="grid grid-cols-4 gap-4">
                                    {([1, 2, 3, 4] as const).map(w => {
                                        const key = `week_${w}` as 'week_1' | 'week_2' | 'week_3' | 'week_4';
                                        return (
                                            <div key={w} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Semana {w}</span>
                                                <span className="text-2xl font-bold text-slate-900 dark:text-white">{partner[key]}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Total */}
                                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center flex-wrap gap-2">
                                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Pedidos Confirmados:</span>
                                    <span className="text-lg font-bold text-slate-900 dark:text-white">{partner.total_pedidos}</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-6">
                            {/* Métricas Detalhadas */}
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/30 p-6">
                                <div className="flex items-center mb-4">
                                    <span className="material-symbols-outlined text-indigo-500 mr-2">analytics</span>
                                    <h3 className="text-slate-900 dark:text-white font-bold text-lg">Métricas Detalhadas</h3>
                                </div>

                                <div className="space-y-5">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                            Taxa de Conversão
                                            {hasLiveAPI && (
                                                <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 uppercase tracking-tight">Ativo</span>
                                            )}
                                        </p>
                                        {hasLiveAPI && dailyAccessData ? (
                                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                                                {((partner.total_pedidos / dailyAccessData.acessosUnicos) * 100).toFixed(2)}%
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-lg font-semibold text-slate-400 dark:text-slate-500">Aguardando dados</p>
                                        )}
                                    </div>

                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                            Item Mais Vendido
                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Em breve</span>
                                        </p>
                                        <p className="mt-1 text-base font-medium text-slate-400 dark:text-slate-500">---</p>
                                    </div>

                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                            Fotos no Cardápio
                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Em breve</span>
                                        </p>
                                        <p className="mt-1 text-base font-medium text-slate-400 dark:text-slate-500">---</p>
                                    </div>

                                    <div className="pt-4 border-t border-indigo-100 dark:border-indigo-800/30">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            Peso Prioritário Estratégico (Cidade)
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-slate-700 dark:text-slate-300">{partner.city_weight} / 5</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Análise do Cardápio – full width funnel */}
                        <div className="lg:col-span-3 mt-2">
                            {funnel.length > 0 ? (
                                <MenuFunnel steps={funnel} />
                            ) : (
                                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                                    <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl">analytics</span>
                                    <h3 className="font-semibold text-slate-700 dark:text-slate-300">Análise do Cardápio indisponível</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                                        Nenhum dado de acessos (planilha integrada) nem pedidos confirmados para montar o funil. Verifique a planilha de acessos em tempo real ou os pedidos desta loja.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'contatos' && (
                    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8 pb-12">
                        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                                        <span className="material-symbols-outlined text-[28px]">support_agent</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acompanhamento e Checkpoints</h2>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm">Registre reuniões, analise a loja e acompanhe o progresso das conversas.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-8">
                                {(['w1', 'w2', 'w3', 'w4'] as const).map((w, idx) => {
                                    const detail = localDetails[w] || { completed: false, status: 'pendente' };
                                    const checked = detail.completed;
                                    const dayLabel = (idx + 1) * 7;
                                    const template = CHECKLIST_TEMPLATES[w];
                                    const currentStatus = STATUS_OPTIONS.find(o => o.value === detail.status) || STATUS_OPTIONS[0];

                                    return (
                                        <div 
                                            key={w} 
                                            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                                                checked 
                                                ? 'bg-emerald-50/20 dark:bg-emerald-950/5 border-emerald-200 dark:border-emerald-800/40 shadow-emerald-500/5' 
                                                : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                                            }`}
                                        >
                                            {/* Card Header */}
                                            <div className="px-6 py-5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`size-12 rounded-full flex items-center justify-center font-black text-base border-2 transition-all ${
                                                        checked 
                                                        ? 'bg-emerald-100 border-emerald-400 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-400 shadow-sm' 
                                                        : 'bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500'
                                                    }`}>
                                                        D{dayLabel}
                                                    </div>
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className={`font-bold text-base md:text-lg ${checked ? 'text-emerald-900 dark:text-emerald-355' : 'text-slate-800 dark:text-slate-205'}`}>
                                                                Contato de Acompanhamento {idx + 1}
                                                            </h3>
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${currentStatus.color}`}>
                                                                {currentStatus.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-0.5">
                                                            Realizar contato no dia chave {dayLabel} do Onboarding do parceiro.
                                                        </p>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => handleToggleCompleted(w)}
                                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm cursor-pointer ${
                                                        checked 
                                                        ? 'bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50 dark:bg-slate-850 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-slate-750' 
                                                        : 'bg-indigo-650 hover:bg-indigo-700 text-white border border-transparent'
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">
                                                        {checked ? 'check_circle' : 'radio_button_unchecked'}
                                                    </span>
                                                    {checked ? 'Concluído' : 'Marcar como Feito'}
                                                </button>
                                            </div>

                                            {/* Card Content Grid */}
                                            { !checked && (
                                            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                {/* Left Column: Store Checklist & Status/Date */}
                                                <div className="space-y-6">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-indigo-505 text-[18px]">storefront</span>
                                                            O que analisar na loja (Checklist)
                                                        </h4>
                                                        <div className="space-y-2.5 bg-slate-50/40 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                                                            {template.map(item => {
                                                                const isChecked = !!detail.checklist?.[item.id];
                                                                return (
                                                                    <button
                                                                        key={item.id}
                                                                        onClick={() => handleToggleChecklist(w, item.id)}
                                                                        className="w-full flex items-start text-left gap-3 text-sm group cursor-pointer py-1.5 focus:outline-none"
                                                                    >
                                                                        <span className={`material-symbols-outlined text-[20px] transition-colors select-none mt-0.5 ${
                                                                            isChecked 
                                                                            ? 'text-emerald-500' 
                                                                            : 'text-slate-400 group-hover:text-indigo-500'
                                                                        }`}>
                                                                            {isChecked ? 'check_box' : 'check_box_outline_blank'}
                                                                        </span>
                                                                        <span className={`leading-relaxed transition-all ${
                                                                            isChecked 
                                                                            ? 'text-slate-405 dark:text-slate-500 line-through' 
                                                                            : 'text-slate-700 dark:text-slate-300'
                                                                        }`}>
                                                                            {item.label}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                                Data do Contato
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={detail.date || ''}
                                                                onChange={(e) => handleUpdateDetail(w, 'date', e.target.value)}
                                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors dark:text-white"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[14px]">flag</span>
                                                                Situação da Conversa
                                                            </label>
                                                            <div className="relative">
                                                                <select
                                                                    value={detail.status || 'pendente'}
                                                                    onChange={(e) => handleUpdateDetail(w, 'status', e.target.value as any)}
                                                                    className="w-full h-10 pl-3 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors appearance-none dark:text-white cursor-pointer"
                                                                >
                                                                    {STATUS_OPTIONS.map(opt => (
                                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Column: Notes & Images */}
                                                <div className="space-y-6">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                                <span className="material-symbols-outlined text-indigo-505 text-[18px]">chat</span>
                                                                Registro da Conversa (Anotações)
                                                            </h4>
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">salva automático ao clicar fora</span>
                                                        </div>
                                                        <textarea
                                                            placeholder="Descreva aqui o que foi conversado com o parceiro, quais acordos foram feitos e observações importantes..."
                                                            value={notesDraft[w]}
                                                            onChange={(e) => setNotesDraft(prev => ({ ...prev, [w]: e.target.value }))}
                                                            onBlur={() => handleUpdateDetail(w, 'notes', notesDraft[w])}
                                                            rows={4}
                                                            className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors resize-none dark:text-white leading-relaxed"
                                                        />
                                                    </div>

                                                    <div>
                                                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-indigo-505 text-[18px]">add_photo_alternate</span>
                                                            Prints e Fotos do Contato
                                                        </h4>
                                                        
                                                        <div className="space-y-3">
                                                            {/* Image input buttons */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                {/* File Upload Button */}
                                                                <label 
                                                                    className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-300 hover:border-indigo-500 dark:border-slate-700 dark:hover:border-indigo-400 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors text-xs font-bold text-slate-600 dark:text-slate-350 select-none"
                                                                    onPaste={(e) => handlePaste(w, e)}
                                                                    tabIndex={0}
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">upload</span>
                                                                    Anexar Imagem Local
                                                                    <input 
                                                                        type="file" 
                                                                        accept="image/*" 
                                                                        onChange={(e) => {
                                                                            if (e.target.files && e.target.files[0]) {
                                                                                compressAndAddImage(w, e.target.files[0]);
                                                                            }
                                                                        }} 
                                                                        className="hidden" 
                                                                    />
                                                                </label>
                                                                
                                                                {/* URL Input Bar */}
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Link de imagem..."
                                                                        value={urlInputs[w]}
                                                                        onChange={(e) => setUrlInputs(prev => ({ ...prev, [w]: e.target.value }))}
                                                                        className="flex-1 px-3 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors dark:text-white"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddImageUrl(w)}
                                                                        className="px-3 h-10 bg-slate-800 hover:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-colors whitespace-nowrap cursor-pointer"
                                                                    >
                                                                        Adicionar
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Gallery Grid */}
                                                            {detail.images && detail.images.length > 0 && (
                                                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 pt-1.5">
                                                                    {detail.images.map((img, imgIdx) => (
                                                                        <div 
                                                                            key={imgIdx} 
                                                                            className="relative aspect-square rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm group cursor-zoom-in"
                                                                            onClick={() => setLightboxImage(img)}
                                                                        >
                                                                            <img 
                                                                                src={img} 
                                                                                alt={`Anexo ${imgIdx + 1}`} 
                                                                                className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                                                                            />
                                                                            {/* Hover Zoom overlay icon */}
                                                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                                <span className="material-symbols-outlined text-white text-[18px]">zoom_in</span>
                                                                            </div>
                                                                            {/* Delete Button */}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm("Excluir esta imagem?")) {
                                                                                        handleDeleteImage(w, imgIdx);
                                                                                    }
                                                                                }}
                                                                                className="absolute top-1 right-1 size-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors border border-red-500/10 focus:outline-none cursor-pointer"
                                                                                title="Remover anexo"
                                                                            >
                                                                                <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) }
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'promocoes' && (
                    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8">
                            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                                <span className="material-symbols-outlined text-violet-500 text-3xl">local_offer</span>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Promoções & Cupons</h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Gerenciamento de atrativos no cardápio para impulsionar conversão</p>
                                </div>
                            </div>

                            <div className="grid gap-6">
                                {/* Promoção */}
                                <div className="flex items-center justify-between p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                                            <span className="material-symbols-outlined text-[24px]">percent</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-lg font-bold text-slate-800 dark:text-white">Promoção Ativa</h4>
                                                {partner.promo_status === 'ativo' && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        Ativo no Painel
                                                    </span>
                                                )}
                                                {partner.promo_status === 'aguardando' && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">
                                                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                                                        Aguardando Configuração
                                                    </span>
                                                )}
                                                {(!partner.promo_status || partner.promo_status === 'inativo') && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                                                        <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                                                        Não Configurado
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Garante que o parceiro possua descontos diretos em produtos no cardápio.</p>
                                        </div>
                                    </div>
                                    <a 
                                        href={promoUrl}
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex flex-col items-center gap-1 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg font-bold transition-colors min-w-[140px]"
                                        title={localidadeId ? `Abre com localidade_id=${localidadeId}` : cityIdsLoading ? 'Carregando ID da cidade...' : 'ID da cidade não encontrado — link genérico'}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px]">launch</span>
                                            Gerenciar no CMS
                                        </span>
                                        {localidadeId ? (
                                            <span className="text-[10px] font-normal text-indigo-400 dark:text-indigo-500">
                                                localidade_id={localidadeId}
                                            </span>
                                        ) : cityIdsLoading ? (
                                            <span className="text-[10px] font-normal text-indigo-300 animate-pulse">carregando cidade...</span>
                                        ) : (
                                            <span className="text-[10px] font-normal text-amber-500">⚠ cidade não mapeada</span>
                                        )}
                                    </a>
                                </div>

                                {/* Cupom */}
                                <div className="flex items-center justify-between p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="size-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                                            <span className="material-symbols-outlined text-[24px]">confirmation_number</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-lg font-bold text-slate-800 dark:text-white">Cupom Exclusivo</h4>
                                                {partner.cupom_status === 'ativo' && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        Ativo no Painel
                                                    </span>
                                                )}
                                                {partner.cupom_status === 'aguardando' && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">
                                                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                                                        Aguardando Configuração
                                                    </span>
                                                )}
                                                {(!partner.cupom_status || partner.cupom_status === 'inativo') && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                                                        <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                                                        Não Configurado
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cupons exclusivos para primeira compra ou retenção de clientes.</p>
                                        </div>
                                    </div>
                                    <a
                                        href={cupomUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex flex-col items-center gap-1 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg font-bold transition-colors min-w-[140px]"
                                        title={localidadeId ? `Abre com localidade_id=${localidadeId}` : cityIdsLoading ? 'Carregando ID da cidade...' : 'ID da cidade não encontrado — link genérico'}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px]">launch</span>
                                            Gerenciar no CMS
                                        </span>
                                        {localidadeId ? (
                                            <span className="text-[10px] font-normal text-indigo-400 dark:text-indigo-500">
                                                localidade_id={localidadeId}
                                            </span>
                                        ) : cityIdsLoading ? (
                                            <span className="text-[10px] font-normal text-indigo-300 animate-pulse">carregando cidade...</span>
                                        ) : (
                                            <span className="text-[10px] font-normal text-amber-500">⚠ cidade não mapeada</span>
                                        )}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'historico' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 flex flex-col items-center gap-4 text-center">
                            <div className="size-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <span className="material-symbols-outlined text-4xl">history_edu</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Histórico de Interações</h3>
                                <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto">
                                    Em breve você poderá registrar anotações, atas de reuniões e ver a linha do tempo de tudo o que aconteceu com este parceiro.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Lightbox Modal */}
            {lightboxImage && (
                <div 
                    className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setLightboxImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
                        <img 
                            src={lightboxImage} 
                            alt="Visualização ampliada" 
                            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200 border border-slate-750/30"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                            className="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors focus:outline-none cursor-pointer"
                            onClick={() => setLightboxImage(null)}
                        >
                            <span className="material-symbols-outlined text-[24px]">close</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
