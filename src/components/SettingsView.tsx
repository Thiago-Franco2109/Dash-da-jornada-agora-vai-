import { DATA_SOURCE, ACCESS_DATA_SOURCE, LOGO_SHEET_SOURCE } from '../config/dataSource';
import { GA4_CONFIG } from '../config/ga4Config';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'https://bigou-sheets-api.netlify.app';

type LineageStatus = 'connected' | 'conditional' | 'computed' | 'none' | 'planned';

const statusMeta: Record<
    LineageStatus,
    { label: string; className: string; dot: string }
> = {
    connected: {
        label: 'Fonte ativa',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
        dot: 'bg-emerald-500 shadow-[0_0_8px_rgb(16,185,129)]',
    },
    conditional: {
        label: 'Depende dos dados',
        className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    computed: {
        label: 'Calculado no app',
        className: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300',
        dot: 'bg-sky-500',
    },
    none: {
        label: 'Sem fonte no sistema',
        className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
        dot: 'bg-slate-400',
    },
    planned: {
        label: 'Planejado / não usado',
        className: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
        dot: 'bg-violet-500',
    },
};

export default function SettingsView() {
    const isMainSheetOk = !!DATA_SOURCE.type;
    const isAccessSheetOk = !!ACCESS_DATA_SOURCE.type;
    const isLogoSheetOk = !!LOGO_SHEET_SOURCE.type;
    const isGA4Placeholder =
        !GA4_CONFIG.propertyId || GA4_CONFIG.propertyId === 'YOUR_GA4_PROPERTY_ID';

    const lineageRows: Array<{
        title: string;
        where: string;
        source: string;
        status: LineageStatus;
        detail: string;
    }> = [
        {
            title: 'Login e sessão',
            where: 'Toda a aplicação',
            source: `Bigou Gateway · ${API_ORIGIN}`,
            status: 'connected',
            detail: 'Google OAuth e cookies httpOnly. Sem backend próprio no dashboard.',
        },
        {
            title: 'Parceiros, pedidos por semana, status, lançamento, analista',
            where: 'Tabela principal, filtros, tela da loja (bloco onboarding)',
            source: `Proxy (${DATA_SOURCE.type}) · aba “${DATA_SOURCE.range}”`,
            status: isMainSheetOk ? 'connected' : 'none',
            detail:
                'Colunas mapeadas pelo cabeçalho da linha 1. Valores errados ou vazios geram NaN ou campos em branco.',
        },
        {
            title: 'Logos dos parceiros',
            where: 'Lista (avatar) e cabeçalho da tela da loja',
            source: `Proxy (${LOGO_SHEET_SOURCE.type}) · aba “${LOGO_SHEET_SOURCE.range}”`,
            status: isLogoSheetOk ? 'connected' : 'none',
            detail:
                'A cada sincronização o app busca o mapa Estabelecimento → URL na aba de logos via proxy seguro. A URL da planilha de logos tem prioridade sobre a coluna da planilha principal.',
        },
        {
            title: 'Acessos únicos (totais, média, último dia)',
            where: 'Tela da loja · bloco “Acessos ao Cardápio (tempo real)”',
            source: `Proxy (${ACCESS_DATA_SOURCE.type}) · aba “${ACCESS_DATA_SOURCE.range}”`,
            status: isAccessSheetOk ? 'connected' : 'none',
            detail:
                'Cabeçalhos de coluna no formato de data (YYYY-M-D). Nome da loja alinhado por texto (case/acentos normalizados).',
        },
        {
            title: 'Funil Acessos → Compras (e % na barra)',
            where: 'Tela da loja · “Análise do Cardápio”',
            source: 'Derivação: pedidos (planilha principal) + acessos únicos (planilha de acessos)',
            status: 'conditional',
            detail:
                'Compras = soma das semanas da planilha principal. Acessos = total único da planilha de acessos. Se faltar uma das duas fontes, o funil mostra só o que existir ou fica indisponível.',
        },
        {
            title: 'Índice de desempenho e prioridade (estrelas)',
            where: 'Coluna Índice e Prioridade na lista',
            source: 'Calculado no navegador a partir de pedidos vs. meta proporcional aos dias',
            status: 'computed',
            detail:
                'Não é taxa de conversão de acessos; é desempenho frente à meta de onboarding (30 pedidos em 28 dias).',
        },
        {
            title: 'Taxa de conversão / GMV / item mais vendido / fotos no cardápio',
            where: 'Painel “Métricas detalhadas” na tela da loja',
            source: 'Nenhuma integração implementada',
            status: 'none',
            detail:
                'Exibidos como “Em breve”. Para dados reais será preciso nova coluna, aba ou API.',
        },
        {
            title: 'Google Analytics 4 (GA4)',
            where: '— (nenhuma tela consome hoje)',
            source: 'Arquivo ga4Config.ts',
            status: 'planned',
            detail: [
                'A configuração existe no repositório, mas o app não chama a Data API do GA4 nesta versão.',
                isGA4Placeholder ? 'O propertyId ainda está como placeholder.' : 'Mesmo com propertyId preenchido, nada no UI consome até haver integração no código.',
                !GA4_CONFIG.enabled ? 'Integração desativada (enabled: false) em ga4Config.' : '',
            ]
                .filter(Boolean)
                .join(' '),
        },
    ];

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8 md:mb-10">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-4">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-3xl">hub</span>
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            Fontes de dados
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm md:text-base leading-relaxed">
                            Mapa do que cada parte do dashboard consome: integrações ativas, dados calculados e lacunas onde
                            a interface ainda não tem fonte real.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <span className={`size-1.5 rounded-full ${statusMeta.connected.dot}`} />
                        Fonte ativa
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <span className={`size-1.5 rounded-full ${statusMeta.conditional.dot}`} />
                        Depende dos dados
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <span className={`size-1.5 rounded-full ${statusMeta.computed.dot}`} />
                        Calculado no app
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <span className={`size-1.5 rounded-full ${statusMeta.none.dot}`} />
                        Sem fonte
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <span className={`size-1.5 rounded-full ${statusMeta.planned.dot}`} />
                        Planejado
                    </span>
                </div>
            </header>

            {/* Mapa principal */}
            <section className="mb-10">
                <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                    O que alimenta cada área
                </h2>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lineageRows.map((row) => {
                            const sm = statusMeta[row.status];
                            return (
                                <div
                                    key={row.title}
                                    className="p-4 md:p-5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-6">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                                                    {row.title}
                                                </h3>
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${sm.className}`}
                                                >
                                                    <span className={`size-1.5 rounded-full ${sm.dot}`} />
                                                    {sm.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                <span className="font-semibold text-slate-600 dark:text-slate-300">
                                                    Onde aparece:{' '}
                                                </span>
                                                {row.where}
                                            </p>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                                    Fonte:{' '}
                                                </span>
                                                {row.source}
                                            </p>
                                        </div>
                                        <p className="lg:max-w-md text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-l-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-6">
                                            {row.detail}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                {/* Planilha principal */}
                <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <span className="material-symbols-outlined">table_view</span>
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900 dark:text-white">Planilha principal</h2>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Parceiros e pedidos
                                </p>
                            </div>
                        </div>
                        <span
                            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${isMainSheetOk ? statusMeta.connected.className : statusMeta.none.className}`}
                        >
                            {isMainSheetOk ? 'Configurado' : 'Pendente'}
                        </span>
                    </div>
                    <dl className="space-y-3 text-sm">
                        <div>
                            <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID da Planilha</dt>
                            <dd className="font-mono text-xs text-emerald-600 dark:text-emerald-400 italic">
                                [Configurado no Servidor / Protegido]
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aba</dt>
                            <dd className="font-mono text-xs text-slate-800 dark:text-slate-200">{DATA_SOURCE.range}</dd>
                        </div>
                    </dl>
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status do Proxy</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                            Ativo via chave: <code className="bg-white dark:bg-slate-900 px-1 rounded">{DATA_SOURCE.type}</code>
                        </p>
                    </div>

                    <p className="mt-4 text-[11px] text-amber-800 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 leading-relaxed">
                        Cabeçalhos esperados na linha 1 (ex.: Cidade, ID, Estabelecimento, Status, Lancamento, Responsavel,
                        Week_1…Week_4). Opcional: coluna de URL para logo (logo_url / Logo).
                    </p>
                </section>

                {/* Planilha de acessos */}
                <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <span className="material-symbols-outlined">data_exploration</span>
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900 dark:text-white">Planilha de acessos</h2>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Acessos únicos por dia
                                </p>
                            </div>
                        </div>
                        <span
                            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${isAccessSheetOk ? statusMeta.connected.className : statusMeta.none.className}`}
                        >
                            {isAccessSheetOk ? 'Configurado' : 'Pendente'}
                        </span>
                    </div>
                    <dl className="space-y-3 text-sm">
                        <div>
                            <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID da Planilha</dt>
                            <dd className="font-mono text-xs text-indigo-600 dark:text-indigo-400 italic">
                                [Configurado no Servidor / Protegido]
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aba</dt>
                            <dd className="font-mono text-xs text-slate-800 dark:text-slate-200">
                                {ACCESS_DATA_SOURCE.range}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status do Proxy</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-indigo-500 animate-pulse" />
                            Ativo via chave: <code className="bg-white dark:bg-slate-900 px-1 rounded">{ACCESS_DATA_SOURCE.type}</code>
                        </p>
                    </div>
                </section>
            </div>

            {/* Referência logos + API + overrides */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-500">image</span>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Planilha de logos</h3>
                        </div>
                        <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isLogoSheetOk ? statusMeta.connected.className : statusMeta.none.className}`}
                        >
                            {isLogoSheetOk ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                        Consumida através de proxy seguro para proteger o acesso aos dados.
                    </p>
                    <dl className="text-[11px] space-y-1 mb-3 font-mono text-slate-600 dark:text-slate-400 break-all">
                        <div>
                            <dt className="font-bold text-slate-500 uppercase tracking-wider">Mapeamento Proxy</dt>
                            <dd>{LOGO_SHEET_SOURCE.type}</dd>
                        </div>
                        <div>
                            <dt className="font-bold text-slate-500 uppercase tracking-wider">Aba</dt>
                            <dd>{LOGO_SHEET_SOURCE.range}</dd>
                        </div>
                    </dl>
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-slate-500">cloud</span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gateway (API)</h3>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                        Variável de ambiente <code className="text-[11px] bg-white dark:bg-slate-900 px-1 rounded">VITE_API_ORIGIN</code>
                        . Se não estiver definida, usa o padrão abaixo.
                    </p>
                    <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">{API_ORIGIN}</p>
                </section>
            </div>

            <section className="rounded-2xl border border-slate-200 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 p-6 mb-8">
                <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-violet-600 dark:text-violet-400">edit_note</span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ajustes locais (não são planilha)</h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Valores de pedidos editados manualmente na tela da loja ficam no <strong>localStorage</strong> do seu
                    navegador. Eles sobrescrevem temporariamente os números vindos da planilha principal só para você,
                    até restaurar o original.
                </p>
            </section>

            <footer className="pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400">
                Partner Journey Dashboard · mapa de dados e integrações
            </footer>
        </div>
    );
}
