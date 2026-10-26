import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { formatarMoedaBRL } from '../config/cdContracts';
import { type EnrichedPerformanceRow, DESEMPENHO_WEEKS_COUNT, getChurnInterpretationBox, getInterpretationBox, getStarColor, getTendenciaColor, getTendenciaLabel, getWeekValue } from '../utils/calculations';
import MenuFunnel, { type FunnelStep, type MenuFunnelSourceLink } from './MenuFunnel';
import { ACCESS_DATA_SOURCE, THIAGO_DATA_SOURCE } from '../config/dataSource';
import type { StoreAccessData } from '../hooks/useDailyAccessSync';
import { finishJourney, reopenJourney } from '../config/partnerState';
import { usePartnerRelevance } from '../hooks/usePartnerRelevance';
import { useCityIds } from '../hooks/useCityIds';
import { usePausaOnboarding } from '../hooks/usePausaOnboarding';
import { useCrmNotes } from '../hooks/useCrmNotes';
import { useAuth } from '../context/AuthContext';
import {
    MOTIVOS_PAUSA,
    diasNaPausaAtual,
    diasPausados,
    formatarDataBR,
    motivoPausaDef,
    motivoPausaLabel,
    previsaoRetornoSugerida,
    previsaoVencida,
    type MotivoPausa,
} from '../config/pausaOnboarding';
import type { CrmPartner } from '../types/crm';
import type { PromoStatus } from '../hooks/useStatusOverride';
import type { CampaignTypeId } from '../config/campaignTypes';
import PartnerPromoCrmSection from './PartnerPromoCrmSection';
import PartnerCardapioSection from './PartnerCardapioSection';
import { useCardapioAnalise } from '../hooks/useCardapioAnalise';
import { useParceiroAcesso } from '../hooks/useParceiroAcesso';
import PartnerDiagnosticoSection from './PartnerDiagnosticoSection';
import PartnerFuncionamentoSection from './PartnerFuncionamentoSection';
import PartnerPedidosSection from './PartnerPedidosSection';
import PartnerHistoricoSection from './PartnerHistoricoSection';
import { OFERTAS_DA_CASA_CAMPAIGN } from '../config/crmCampaigns';

interface PartnerDetailsViewProps {
    partner: EnrichedPerformanceRow;
    onBack: () => void;
    /** Live data from the unique daily accesses API */
    dailyAccessData?: StoreAccessData;
    onRefresh: () => void;
    viewContext?: 'journey' | 'desempenho';
    crmPartner?: CrmPartner | null;
    topCities?: string[];
    onCampaignStatusChange?: (partnerId: string, campaign: CampaignTypeId, newStatus: PromoStatus) => void;
}

type TabKey = 'geral' | 'pedidos' | 'diagnostico' | 'promocoes' | 'funcionamento' | 'historico';

/** Métrica de jornada que não se aplica a quem não lançou. Traço, nunca zero —
 *  zero é um resultado, e parceiro em pré-lançamento ainda não teve resultado. */
function TracoMetrica() {
    return <span className="text-slate-300 dark:text-slate-600">—</span>;
}

export default function PartnerDetailsView({
    partner,
    onBack,
    dailyAccessData,
    onRefresh,
    viewContext = 'journey',
    crmPartner,
    topCities = [],
    onCampaignStatusChange,
}: PartnerDetailsViewProps) {
    const isDesempenho = viewContext === 'desempenho';
    /**
     * Parceiro que assinou e ainda não abriu. A ficha abre pra ele porque o CS
     * apresenta promoções e cupons ANTES do lançamento — a aba Promoções é o
     * motivo de ele estar aqui. O que não existe é a jornada: nenhum dos
     * números de 28 dias (dias ativo, pedidos esperados, índice, prioridade)
     * tem significado antes da abertura, então viram traço em vez de zero.
     */
    const preLanc = partner.pre_lancamento;
    const [activeTab, setActiveTab] = useState<TabKey>('geral');
    
    const interpretation = isDesempenho
        ? getChurnInterpretationBox(partner.risco_churn ?? partner.priority_stars)
        : getInterpretationBox(partner.priority_stars);
    const progressPercentage = Math.min(100, Math.round((partner.total_pedidos / 30) * 100));
    
    const { relevance, updateRelevance, loading: relevanceLoading } = usePartnerRelevance(partner.estab_id || partner.estabelecimento);

    // Cardápio e acesso do lojista: só o estab_id numérico serve — parceiro que vem só
    // da planilha não existe no banco do CMS e os hooks devolvem null sem chamar nada.
    const { data: cardapioAnalise, loading: cardapioLoading, error: cardapioError } = useCardapioAnalise(partner.estab_id);
    const { data: parceiroAcesso } = useParceiroAcesso(partner.estab_id);
    const { getCmsPromoUrl, getLocalidadeId, loading: cityIdsLoading } = useCityIds();

    const BASE_PROMO_URL = 'https://admin.bigou.com.br/campanha/promocao/cadastro/26';
    // O estab_id entra junto de propósito: com ele o localidade_id sai do banco,
    // sem depender de o nome da cidade bater com a planilha de IDs.
    const promoUrl = getCmsPromoUrl(BASE_PROMO_URL, partner.cidade, partner.estab_id);
    const ofertasDaCasaUrl = getCmsPromoUrl(OFERTAS_DA_CASA_CAMPAIGN.cmsBaseUrl, partner.cidade, partner.estab_id);
    const localidadeId = getLocalidadeId(partner.cidade, partner.estab_id);

    // Cupom: vai direto para a aba de cupons do estabelecimento
    const cupomUrl = partner.estab_id
        ? `https://admin.bigou.com.br/estabelecimento/cadastro/${partner.estab_id}/cupons`
        : 'https://admin.bigou.com.br/estabelecimento';

    // ── Pausa do onboarding ──────────────────────────────────────────────
    // Parceiro que parou de operar (cozinha parada, sem entregador, reforma)
    // continuava sendo medido contra a meta de 28 dias e reaparecia na fila de
    // ligação todo dia. Pausar congela o relógio — ver config/pausaOnboarding.ts.
    const { user } = useAuth();
    const { pausaMap, pausar, retomar } = usePausaOnboarding();
    const { getNote, upsertNote } = useCrmNotes();

    const partnerKey = String(partner.estab_id ?? '');
    const pausa = partnerKey ? pausaMap[partnerKey] : undefined;
    const pausado = !!pausa?.pausado;
    const diasEmPausa = diasNaPausaAtual(pausa);
    const diasDescontados = diasPausados(pausa);
    const retornoVencido = previsaoVencida(pausa);

    const [modalPausa, setModalPausa] = useState(false);
    const [motivoPausa, setMotivoPausa] = useState<MotivoPausa>(MOTIVOS_PAUSA[0].motivo);
    const [obsPausa, setObsPausa] = useState('');
    const [previsaoPausa, setPrevisaoPausa] = useState('');
    const [salvandoPausa, setSalvandoPausa] = useState(false);

    const defMotivoPausa = motivoPausaDef(motivoPausa) ?? MOTIVOS_PAUSA[0];
    const pausaIncompleta = defMotivoPausa.pedeDetalhe && !obsPausa.trim();

    const abrirModalPausa = () => {
        const inicial = MOTIVOS_PAUSA[0];
        setMotivoPausa(inicial.motivo);
        setObsPausa('');
        setPrevisaoPausa(previsaoRetornoSugerida(inicial));
        setModalPausa(true);
    };

    const escolherMotivoPausa = (motivo: MotivoPausa) => {
        setMotivoPausa(motivo);
        const def = motivoPausaDef(motivo);
        if (def) setPrevisaoPausa(previsaoRetornoSugerida(def));
    };

    /** Previsão de retorno vira follow-up: pausado some das filas, e sem isso ninguém lembraria de voltar. */
    const agendarRetorno = (dataISO: string) => {
        const alvo = new Date(`${dataISO}T09:00:00`);
        if (Number.isNaN(alvo.getTime())) return;
        const atual = getNote(partnerKey)?.nextFollowUp;
        // Não atropela cobrança já marcada para depois da volta.
        if (atual && new Date(atual).getTime() >= alvo.getTime()) return;
        void upsertNote(partnerKey, { nextFollowUp: alvo.toISOString() });
    };

    const confirmarPausa = async () => {
        if (pausaIncompleta || !partnerKey) return;
        setSalvandoPausa(true);
        const ok = await pausar(partnerKey, {
            motivo: motivoPausa,
            observacao: obsPausa,
            previsaoRetorno: previsaoPausa || null,
            pausadoPor: user?.name || user?.email || null,
        });
        setSalvandoPausa(false);
        if (!ok) {
            window.alert('Não consegui salvar a pausa. Tente de novo em instantes.');
            return;
        }
        if (previsaoPausa) agendarRetorno(previsaoPausa);
        setModalPausa(false);
        onRefresh();
    };

    const handleRetomar = async () => {
        if (!window.confirm(`Retomar o onboarding de ${partner.estabelecimento}? A contagem de dias ativos volta a correr a partir de hoje.`)) return;
        const ok = await retomar(partnerKey);
        if (!ok) {
            window.alert('Não consegui salvar a retomada. Tente de novo em instantes.');
            return;
        }
        onRefresh();
    };

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

    const funnelSourceLinks: MenuFunnelSourceLink[] = (() => {
        const links: MenuFunnelSourceLink[] = [
            {
                href: `https://docs.google.com/spreadsheets/d/${ACCESS_DATA_SOURCE.sheetId}/edit`,
                label: 'Planilha de acessos',
                description: `Aba "${ACCESS_DATA_SOURCE.range}" — acessos únicos por dia`,
                icon: 'table_chart',
            },
            {
                href: `https://docs.google.com/spreadsheets/d/${THIAGO_DATA_SOURCE.sheetId}/edit`,
                label: 'Planilha de onboarding',
                description: `Aba "${THIAGO_DATA_SOURCE.range}" — pedidos confirmados por semana`,
                icon: 'description',
            },
        ];

        if (partner.estab_id) {
            links.unshift({
                href: getReportsUrl(partner.estab_id),
                label: 'Analytics Bigou',
                description: 'Relatório de pedidos desta loja (últimos 28 dias)',
                icon: 'assessment',
            });
        }

        return links;
    })();

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
                                    {/* `status` de quem não lançou é o 'pendente' de fallback da jornada —
                                        pintado de vermelho ele lê como loja com problema. E prioridade é
                                        nota de desempenho: sem pedido, 0 estrelas não é "despriorizado". */}
                                    {preLanc ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ring-1 ring-inset bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 ring-sky-600/20">
                                            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                                            Pré-lançamento
                                            {preLanc.dias != null && (
                                                <span className="text-sky-600/80 dark:text-sky-500/80">
                                                    · {preLanc.dias === 0 ? 'assinou hoje' : `${preLanc.dias}d de onboarding`}
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <>
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
                                        </>
                                    )}

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

                                    {pausado && (
                                        <div
                                            className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800/30 text-sm font-black uppercase tracking-widest"
                                            title={`${motivoPausaLabel(pausa?.motivo)} — ${diasEmPausa === 0 ? 'pausado hoje' : `pausado há ${diasEmPausa} ${diasEmPausa === 1 ? 'dia' : 'dias'}`}`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">pause_circle</span>
                                            Onboarding pausado
                                        </div>
                                    )}
                                </div>
                                {/* O card do Trello não sabe a cidade e preLancamento.ts não inventa
                                    uma — sem o guarda, sobra o alfinete sozinho. */}
                                {partner.cidade ? (
                                    <p className="text-slate-500 dark:text-slate-400 mt-2 flex items-center">
                                        <span className="material-symbols-outlined text-[16px] mr-1">location_on</span>
                                        {partner.cidade}
                                    </p>
                                ) : null}
                                
                                {partner.estab_id && (
                                    <div className="flex items-center gap-2 mt-4">
                                        {/* Finalizar/Pausar mexem no relógio dos 28 dias, que só começa na
                                            abertura — antes disso não há jornada pra encerrar nem pausar.
                                            No lugar, o card do onboarding, que é onde a loja está de fato. */}
                                        {preLanc?.cardUrl && (
                                            <a
                                                href={preLanc.cardUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white rounded-md px-3 py-1.5 text-sm font-bold transition-colors shadow-sm group"
                                                title={preLanc.etapa ? `Etapa atual: ${preLanc.etapa}` : 'Card de onboarding no Trello'}
                                            >
                                                <span className="material-symbols-outlined text-[18px] mr-1.5 group-hover:scale-110 transition-transform">view_kanban</span>
                                                Card do onboarding
                                            </a>
                                        )}

                                        {!preLanc && (<>
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

                                        {!isDesempenho && !partner.isFinished && (
                                            <button
                                                onClick={pausado ? handleRetomar : abrirModalPausa}
                                                title={pausado
                                                    ? 'Voltar a contar os dias da jornada'
                                                    : 'Parceiro não está operando: congela dias ativos, meta e cobrança'}
                                                className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-bold transition-all shadow-sm ${
                                                    pausado
                                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/30'
                                                        : 'bg-amber-500 text-white hover:bg-amber-600'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-[18px] mr-1.5">
                                                    {pausado ? 'play_circle' : 'pause_circle'}
                                                </span>
                                                {pausado ? 'Retomar Onboarding' : 'Pausar Onboarding'}
                                            </button>
                                        )}
                                        </>)}

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
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'pedidos' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('pedidos')}
                    >
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        Pedidos
                    </button>
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'promocoes' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('promocoes')}
                    >
                        <span className="material-symbols-outlined text-[18px]">local_offer</span>
                        Promoções
                    </button>
                    <button 
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'funcionamento' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('funcionamento')}
                    >
                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                        Funcionamento
                    </button>
                    <button
                        className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'diagnostico' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        onClick={() => setActiveTab('diagnostico')}
                    >
                        <span className="material-symbols-outlined text-[18px]">troubleshoot</span>
                        Por que caiu?
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
                            {/* Interpretation Box — pausado, a leitura de desempenho não se aplica:
                                cobrar meta de quem não está operando é o erro que a pausa resolve. */}
                            {preLanc ? (
                                <div className="p-4 rounded-xl border flex items-start gap-3 bg-sky-50 dark:bg-sky-900/10 border-sky-200 dark:border-sky-800/30">
                                    <span className="material-symbols-outlined text-sky-700 dark:text-sky-400">rocket_launch</span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-sky-800 dark:text-sky-400">
                                            Parceiro ainda não lançou
                                            {preLanc.dias != null && (
                                                <> — {preLanc.dias === 0 ? 'assinou hoje' : `${preLanc.dias} ${preLanc.dias === 1 ? 'dia' : 'dias'} desde a assinatura`}</>
                                            )}
                                            {preLanc.etapa && <> · {preLanc.etapa}</>}
                                        </p>
                                        <p className="text-sm text-sky-800/90 dark:text-sky-300/90 mt-1">
                                            Use a aba <strong>Promoções</strong> pra deixar campanha e cupom marcados antes da
                                            abertura — assim a loja entra no app com ação no ar desde o primeiro dia.
                                        </p>
                                        <p className="text-xs text-sky-700/80 dark:text-sky-400/80 mt-1.5">
                                            Os 28 dias de jornada só começam a contar quando a loja abre, então dias ativo,
                                            pedidos esperados, índice e prioridade aparecem como traço.
                                            {preLanc.origem === 'trello' && (
                                                <> Esta loja entrou hoje: os dados do banco (cardápio, horários, pedidos) aparecem amanhã, quando a réplica alcançar.</>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            ) : pausado ? (
                                <div className="p-4 rounded-xl border flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30">
                                    <span className="material-symbols-outlined text-amber-700 dark:text-amber-400">pause_circle</span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-amber-800 dark:text-amber-400">
                                            {diasEmPausa === 0
                                                ? 'Onboarding pausado hoje'
                                                : `Onboarding pausado há ${diasEmPausa} ${diasEmPausa === 1 ? 'dia' : 'dias'}`}
                                            {' — '}{motivoPausaLabel(pausa?.motivo)}
                                        </p>
                                        {pausa?.observacao && (
                                            <p className="text-sm text-amber-800/90 dark:text-amber-300/90 mt-1">“{pausa.observacao}”</p>
                                        )}
                                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                                            A contagem de dias ativos, a meta e a cobrança estão congeladas.
                                            {pausa?.previsaoRetorno && (
                                                <> Previsão de retorno: <strong>{formatarDataBR(pausa.previsaoRetorno)}</strong>{retornoVencido ? ' (vencida — confirme com o parceiro)' : ''}.</>
                                            )}
                                            {pausa?.pausadoPor && <> Pausado por {pausa.pausadoPor}.</>}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-4 rounded-xl border flex items-start gap-3 ${interpretation.bg} ${interpretation.border}`}>
                                    <span className={`material-symbols-outlined ${interpretation.textClass}`}>{interpretation.icon}</span>
                                    <p className={`text-sm font-medium mt-0.5 ${interpretation.textClass}`}>
                                        {interpretation.text}
                                    </p>
                                </div>
                            )}

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                                <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-4">
                                    {isDesempenho ? 'Métricas de Desempenho' : 'Métricas de Onboarding'}
                                </h3>
                                <div className={`grid gap-6 ${isDesempenho ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7' : 'grid-cols-2 md:grid-cols-4'}`}>
                                    {isDesempenho ? (
                                        <>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos (12 sem.)</p>
                                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.total_pedidos}</p>
                                                <p className="text-xs text-slate-400 mt-1">Média: {(partner.media_semanal ?? 0).toFixed(1)}/sem</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Semana atual</p>
                                                <p className="mt-1 text-2xl font-semibold text-primary">{partner.week_1}</p>
                                                <p className="text-xs text-slate-400 mt-1">Últimos 7 dias (S1)</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tendência</p>
                                                <p className={`mt-1 text-2xl font-semibold ${getTendenciaColor(partner.tendencia_pedidos || 'estavel')}`}>
                                                    {getTendenciaLabel(partner.tendencia_pedidos || 'estavel')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Semanas zeradas</p>
                                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.semanas_zeradas ?? 0}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Desempenho</p>
                                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{partner.desempenho || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Contrato (MRR)</p>
                                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                                    {partner.valor_contrato != null ? formatarMoedaBRL(partner.valor_contrato) : '—'}
                                                </p>
                                                {/* Rótulos já vêm legíveis do Trello ("Pix", "Cartão de Crédito"). */}
                                                {(partner.contrato_plano || partner.contrato_pagamento) && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {[partner.contrato_plano, partner.contrato_pagamento].filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                                {partner.contrato_derivado_do_total && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                                                        derivado do total do contrato
                                                    </p>
                                                )}
                                                {partner.contrato_card_url && (
                                                    <a
                                                        href={partner.contrato_card_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                                                    >
                                                        ver card no Trello
                                                    </a>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos/dia</p>
                                                <p className={`mt-1 text-2xl font-semibold ${partner.mrr_em_risco ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                                    {(partner.pedidos_por_dia ?? 0).toFixed(1)}
                                                </p>
                                                {partner.mrr_em_risco && (
                                                    <p className="text-xs text-red-500 mt-1 font-medium">MRR em risco (&lt; 1/dia)</p>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Dias Ativo</p>
                                        {/* Zero aqui leria como "lançou hoje". Quem não abriu não tem dia 0: não tem dia. */}
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                            {preLanc ? <TracoMetrica /> : partner.dias_desde_lancamento}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            {preLanc ? 'Sem lançamento' : `Lançado: ${partner.lancamento}`}
                                        </p>
                                        {!preLanc && diasDescontados > 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                                                {diasDescontados} {diasDescontados === 1 ? 'dia descontado' : 'dias descontados'} por pausa
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos Reais</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                            {preLanc ? <TracoMetrica /> : partner.total_pedidos}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pedidos Esperados</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                            {preLanc ? <TracoMetrica /> : partner.pedidos_esperados}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Índice Perfor.</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                                            {preLanc ? <TracoMetrica /> : partner.indice_desempenho.toFixed(2)}
                                        </p>
                                    </div>
                                        </>
                                    )}
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

                                {/* Barra em 0% numa loja fechada lê como "não vendeu nada" — mas a
                                    meta de 30 pedidos nem começou a valer. */}
                                {!isDesempenho && !preLanc && (
                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Progresso para a Meta de Ativação (30 Pedidos)</span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{progressPercentage}%</span>
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                                            <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${progressPercentage}%` }}></div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* As quatro semanas são a grade dos 28 dias. Zeradas numa loja que
                                ainda não abriu, elas inventam um histórico que não existe. */}
                            {!preLanc && (
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                                {/* Section header */}
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-slate-900 dark:text-white font-bold text-lg">
                                        {isDesempenho
                                            ? 'Pedidos por Semana (últimas 12 semanas)'
                                            : 'Pedidos por Semana (Primeiros 28 Dias)'}
                                    </h3>
                                </div>

                                {/* Week cards – static */}
                                <div className={`grid gap-3 ${isDesempenho ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6' : 'grid-cols-4'}`}>
                                    {Array.from({ length: isDesempenho ? DESEMPENHO_WEEKS_COUNT : 4 }, (_, i) => i + 1).map(w => {
                                        const pedidos = isDesempenho ? getWeekValue(partner, w) : partner[`week_${w}` as 'week_1' | 'week_2' | 'week_3' | 'week_4'];
                                        const isCurrentWeek = isDesempenho && w === 1;
                                        return (
                                            <div
                                                key={w}
                                                className={`flex flex-col items-center justify-center p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-lg border shadow-sm ${
                                                    isCurrentWeek
                                                        ? 'border-primary/40 ring-2 ring-primary/20'
                                                        : 'border-slate-100 dark:border-slate-800'
                                                }`}
                                            >
                                                <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-1 sm:mb-2 text-center ${isCurrentWeek ? 'text-primary' : 'text-slate-500'}`}>
                                                    Semana {w}
                                                    {isCurrentWeek && (
                                                        <span className="block normal-case font-normal text-[9px] sm:text-[10px] mt-0.5">últimos 7 dias</span>
                                                    )}
                                                </span>
                                                <span className={`text-xl sm:text-2xl font-bold ${isCurrentWeek ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                                                    {pedidos}
                                                </span>
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
                            )}
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
                                        </p>
                                        {cardapioAnalise?.maisVendido ? (
                                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                                {cardapioAnalise.maisVendido.nome}
                                                <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                                                    {cardapioAnalise.maisVendido.vendas} vendas
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-base font-medium text-slate-400 dark:text-slate-500">
                                                {cardapioLoading ? 'Carregando…' : '---'}
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                                            Fotos no Cardápio
                                        </p>
                                        {cardapioAnalise && cardapioAnalise.resumo.totalItens > 0 ? (
                                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                                {cardapioAnalise.resumo.comFoto} de {cardapioAnalise.resumo.totalItens}
                                                <span className={`ml-2 text-sm font-normal ${cardapioAnalise.resumo.pctSemFoto > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {cardapioAnalise.resumo.pctSemFoto}% sem foto
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-base font-medium text-slate-400 dark:text-slate-500">
                                                {cardapioLoading ? 'Carregando…' : '---'}
                                            </p>
                                        )}
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

                        {/* Diagnóstico do cardápio (itens sem foto, promoções no ar, acesso do lojista) */}
                        <div className="lg:col-span-3 mt-2">
                            <PartnerCardapioSection
                                analise={cardapioAnalise}
                                acesso={parceiroAcesso}
                                loading={cardapioLoading}
                                error={cardapioError}
                            />
                        </div>

                        {/* Análise do Cardápio – full width funnel */}
                        <div className="lg:col-span-3 mt-2">
                            {funnel.length > 0 ? (
                                <MenuFunnel steps={funnel} sourceLinks={funnelSourceLinks} />
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

                {/* Relatório de pedidos: a section faz o próprio fetch, então as 3 queries
                    do banco só saem quando a aba é aberta. */}
                {activeTab === 'pedidos' && (
                    <PartnerPedidosSection partner={partner} />
                )}


                {activeTab === 'promocoes' && (
                    <PartnerPromoCrmSection
                        partner={partner}
                        crmPartner={crmPartner}
                        topCities={topCities}
                        promoUrl={promoUrl}
                        ofertasDaCasaUrl={ofertasDaCasaUrl}
                        cupomUrl={cupomUrl}
                        localidadeId={localidadeId != null ? String(localidadeId) : null}
                        cityIdsLoading={cityIdsLoading}
                        onCampaignStatusChange={onCampaignStatusChange}
                    />
                )}

                {activeTab === 'funcionamento' && (
                    <PartnerFuncionamentoSection partner={partner} />
                )}

                {activeTab === 'diagnostico' && (
                    <PartnerDiagnosticoSection partner={partner} />
                )}

                {activeTab === 'historico' && (
                    <PartnerHistoricoSection partner={partner} />
                )}
            </div>

            {/* Pausar Onboarding */}
            {modalPausa && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => !salvandoPausa && setModalPausa(false)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-amber-500 text-[28px]">pause_circle</span>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pausar onboarding</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                        {partner.estabelecimento} para de contar dias ativos, sai da fila de cobrança e deixa de ser
                                        medido contra a meta de 30 pedidos enquanto estiver parado.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-5">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    Por que o parceiro não está operando?
                                </label>
                                <div className="space-y-1.5">
                                    {MOTIVOS_PAUSA.map(m => (
                                        <button
                                            key={m.motivo}
                                            onClick={() => escolherMotivoPausa(m.motivo)}
                                            className={`w-full flex items-center gap-2.5 text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                                                motivoPausa === m.motivo
                                                    ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700'
                                                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                                            <span className="font-medium">{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    O que o parceiro falou {defMotivoPausa.pedeDetalhe ? '(obrigatório)' : '(opcional)'}
                                </label>
                                <textarea
                                    value={obsPausa}
                                    onChange={e => setObsPausa(e.target.value)}
                                    rows={3}
                                    placeholder="Ex.: fogão industrial quebrou, técnico só na semana que vem."
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    Previsão de retorno
                                </label>
                                <input
                                    type="date"
                                    value={previsaoPausa}
                                    onChange={e => setPrevisaoPausa(e.target.value)}
                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                                    Vira tarefa do dia: como o parceiro sai das filas enquanto pausado, esta é a data em que ele volta
                                    a aparecer pra você confirmar se retomou. Deixe em branco pra não agendar.
                                </p>
                            </div>
                        </div>

                        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setModalPausa(false)}
                                disabled={salvandoPausa}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarPausa}
                                disabled={salvandoPausa || pausaIncompleta}
                                title={pausaIncompleta ? 'Descreva o motivo para pausar' : undefined}
                                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="material-symbols-outlined text-[18px] mr-1.5">pause_circle</span>
                                {salvandoPausa ? 'Salvando…' : 'Pausar onboarding'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
