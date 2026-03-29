import { useState } from 'react';
import { type EnrichedPerformanceRow, getInterpretationBox, getStarColor } from '../utils/calculations';
import MenuFunnel, { type FunnelStep } from './MenuFunnel';
import type { WeekOverride } from '../hooks/useManualOverrides';
import type { StoreAnalytics } from '../hooks/useAnalyticsOverrides';
import StoreAccessImport from './StoreAccessImport';
import type { StoreAccessData } from '../hooks/useDailyAccessSync';

interface PartnerDetailsViewProps {
    partner: EnrichedPerformanceRow;
    onBack: () => void;
    /** Called when the user saves manual week overrides */
    onSaveOrders: (estabelecimento: string, values: Omit<WeekOverride, 'updated_at'>) => void;
    /** Called when the user clears manual week overrides */
    onClearOrders: (estabelecimento: string) => void;
    /** The current override entry for this partner (if any) */
    override?: WeekOverride;
    /** Real analytics data for this partner (if imported) */
    storeAnalytics?: StoreAnalytics;
    /** Live data from the unique daily accesses API */
    dailyAccessData?: StoreAccessData;
    /** Callback to save imported analytics for this store */
    onSaveAnalytics: (rows: { estabelecimento: string; data: Omit<StoreAnalytics, 'imported_at'> }[]) => void;
    /** Callback to clear analytics for this store */
    onClearAnalytics: (estabelecimento: string) => void;
}

export default function PartnerDetailsView({ partner, onBack, onSaveOrders, onClearOrders, override, storeAnalytics, dailyAccessData, onSaveAnalytics, onClearAnalytics }: PartnerDetailsViewProps) {
    const interpretation = getInterpretationBox(partner.priority_stars);
    const progressPercentage = Math.min(100, Math.round((partner.total_pedidos / 30) * 100));

    // ---- Edit-order state ------------------------------------------------
    const [editMode, setEditMode] = useState(false);
    const [editValues, setEditValues] = useState({
        week_1: partner.week_1,
        week_2: partner.week_2,
        week_3: partner.week_3,
        week_4: partner.week_4,
    });
    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleEditOpen = () => {
        setEditValues({
            week_1: partner.week_1,
            week_2: partner.week_2,
            week_3: partner.week_3,
            week_4: partner.week_4,
        });
        setEditMode(true);
        setSaveSuccess(false);
    };

    const handleSave = () => {
        onSaveOrders(partner.estabelecimento, editValues);
        setSaveSuccess(true);
        setEditMode(false);
    };

    const handleReset = () => {
        onClearOrders(partner.estabelecimento);
        setSaveSuccess(false);
    };

    const hasOverride = !!override;

    // ---- Funnel data generation ------------------------------------------------
    // We derive a plausible funnel from the confirmed orders.
    // Assumption: confirmed orders represent ~20% conversion from visits.
    // The intermediate steps are scaled accordingly.
    // These are simulated; replace with GA4 real data when available.
    const orders = partner.total_pedidos;

    // If real analytics data was imported, use it for the funnel
    const hasRealAnalytics = !!storeAnalytics;
    const hasLiveAPI = !!dailyAccessData && dailyAccessData.acessosUnicos > 0;

    // Para o funil, usamos a média diária de acessos projetada para 28 dias
    // Isso é comparável com os pedidos que também são contados em um período fixo
    const funnelVisits = (() => {
        if (hasLiveAPI) {
            // Projeta a média diária para o período de 28 dias do onboarding
            return dailyAccessData!.mediaDiaria * 28;
        }
        return 0;
    })();

    const funnel: FunnelStep[] = (() => {
        if (hasRealAnalytics && storeAnalytics!.sessoes > 0) {
            const { sessoes, visualizacoes, sacola, revisao, concluidos } = storeAnalytics!;
            const pctOf = (v: number) => sessoes > 0 ? parseFloat(((v / sessoes) * 100).toFixed(2)) : 0;
            return [
                { label: 'Visitas', description: 'visitaram seu cardápio', icon: 'visibility', value: sessoes, pctOfFirst: 100 },
                { label: 'Visualizações', description: 'visualizaram algum item', icon: 'menu_book', value: visualizacoes, pctOfFirst: pctOf(visualizacoes) },
                { label: 'Sacola', description: 'adicionaram itens', icon: 'shopping_bag', value: sacola, pctOfFirst: pctOf(sacola) },
                { label: 'Revisão', description: 'revisaram o pedido', icon: 'fact_check', value: revisao, pctOfFirst: pctOf(revisao) },
                { label: 'Concluídos', description: 'concluíram o pedido', icon: 'check_circle', value: concluidos, pctOfFirst: pctOf(concluidos) },
            ];
        }

        if (funnelVisits === 0) return [];
        const label = 'Acessos (proj. 28d)';
        const desc = `${dailyAccessData!.mediaDiaria}/dia × 28 dias`;
        return [
            { label, description: desc, icon: 'visibility', value: funnelVisits, pctOfFirst: 100 },
            { label: 'Visualizações', description: 'visualizaram algum item', icon: 'menu_book', value: Math.round(funnelVisits * 0.4985), pctOfFirst: 49.85 },
            { label: 'Sacola', description: 'adicionaram itens', icon: 'shopping_bag', value: Math.round(funnelVisits * 0.2706), pctOfFirst: 27.06 },
            { label: 'Revisão', description: 'revisaram o pedido', icon: 'fact_check', value: Math.round(funnelVisits * 0.2676), pctOfFirst: 26.76 },
            { label: 'Concluídos', description: 'concluíram o pedido', icon: 'check_circle', value: orders, pctOfFirst: funnelVisits > 0 ? parseFloat(((orders / funnelVisits) * 100).toFixed(2)) : 0 },
        ];
    })();
    // ---------------------------------------------------------------------------

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
                <div>
                    <button
                        onClick={onBack}
                        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-4 group"
                    >
                        <span className="material-symbols-outlined text-[18px] mr-1 group-hover:-translate-x-1 transition-transform">arrow_back</span>
                        Voltar para a lista
                    </button>
                    <div className="flex items-center gap-4">
                        {partner.logo_url ? (
                            <img src={partner.logo_url} alt={partner.estabelecimento} className="size-24 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md object-cover" />
                        ) : (
                            <div className="size-24 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700">
                                <span className="material-symbols-outlined text-5xl">store</span>
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight">
                                    {partner.estabelecimento}
                                </h1>
                                <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${partner.status === 'ativo'
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 ring-green-600/20'
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 ring-red-600/20'
                                    }`}>
                                    {partner.status}
                                </span>

                                <div className={`flex items-center ml-2 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 bg-white dark:bg-slate-800 ${getStarColor(partner.priority_stars)}`}>
                                    <span className="material-symbols-outlined text-[18px] mr-1">star</span>
                                    <span className="text-sm font-bold text-slate-800 dark:text-white">Prioridade {partner.priority_stars}</span>
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">
                                <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">location_on</span>
                                {partner.cidade}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

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
                                <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${progressPercentage}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                        {/* Section header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-slate-900 dark:text-white font-bold text-lg">Pedidos por Semana (Primeiros 28 Dias)</h3>
                                {hasOverride && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                                        <span className="material-symbols-outlined text-[12px]">edit</span>
                                        Editado manualmente
                                    </span>
                                )}
                                {saveSuccess && !hasOverride && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                        <span className="material-symbols-outlined text-[12px]">check</span>
                                        Salvo!
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {hasOverride && (
                                    <button
                                        onClick={handleReset}
                                        className="text-xs text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                                        Restaurar original
                                    </button>
                                )}
                                {!editMode ? (
                                    <button
                                        onClick={handleEditOpen}
                                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                        Editar pedidos
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setEditMode(false)}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">save</span>
                                            Salvar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Week cards – static or editable */}
                        <div className="grid grid-cols-4 gap-4">
                            {([1, 2, 3, 4] as const).map(w => {
                                const key = `week_${w}` as 'week_1' | 'week_2' | 'week_3' | 'week_4';
                                return (
                                    <div key={w} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Semana {w}</span>
                                        {editMode ? (
                                            <input
                                                type="number"
                                                min={0}
                                                value={editValues[key]}
                                                onChange={e => setEditValues(prev => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                className="w-full text-center text-2xl font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-primary/30 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                        ) : (
                                            <span className="text-2xl font-bold text-slate-900 dark:text-white">{partner[key]}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Total & last-updated */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center flex-wrap gap-2">
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Pedidos Confirmados:</span>
                            <span className="text-lg font-bold text-slate-900 dark:text-white">{partner.total_pedidos}</span>
                        </div>
                        {hasOverride && override?.updated_at && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                Última edição manual: {new Date(override.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right Column: Future Metrics Placeholders */}
                <div className="space-y-6">
                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/30 p-6">
                        <div className="flex items-center mb-4">
                            <span className="material-symbols-outlined text-indigo-500 mr-2">analytics</span>
                            <h3 className="text-slate-900 dark:text-white font-bold text-lg">Métricas Detalhadas</h3>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 border-b border-indigo-100 dark:border-indigo-800/30 pb-4">
                            Métricas aprofundadas a serem integradas nas próximas atualizações.
                        </p>

                        <div className="space-y-5">
                            <div>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                    Taxa de Conversão
                                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Em breve</span>
                                </p>
                                <p className="mt-1 text-lg font-semibold text-slate-400 dark:text-slate-500">--%</p>
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
                <div className="lg:col-span-3 mt-2 space-y-4">
                    {/* Funnel section – shows real or simulated data */}
                    {funnel.length > 0 ? (
                        <MenuFunnel steps={funnel} />
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl">analytics</span>
                            <h3 className="font-semibold text-slate-700 dark:text-slate-300">Análise do Cardápio indisponível</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                                Nenhuma integração de acessos (Planilha GA4 ou Sessões) foi detectada para esta loja. Importe um CSV abaixo ou verifique a planilha de acessos em tempo real.
                            </p>
                        </div>
                    )}

                    {/* Import panel – always visible so user can load/clear access data */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <span className="material-symbols-outlined text-blue-500 text-2xl">upload_file</span>
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Importar Dados de Acesso</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    CSV com Sessões, Visualizações, Sacola, Revisão e Concluídos para esta loja
                                </p>
                            </div>
                            {hasRealAnalytics && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                    Dados reais importados
                                </span>
                            )}
                        </div>
                        <div className="p-6">
                            <StoreAccessImport
                                filterEstabelecimento={partner.estabelecimento}
                                onImport={onSaveAnalytics}
                                lastImportedAt={storeAnalytics?.imported_at}
                                onClear={() => onClearAnalytics(partner.estabelecimento)}
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
