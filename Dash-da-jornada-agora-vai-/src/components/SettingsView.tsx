import {
    PARTNER_DATA_SOURCES,
    ACCESS_DATA_SOURCE,
    LOGO_SHEET_SOURCE,
    INDICADOR_DATA_SOURCE,
    CD_NOVOS_DATA_SOURCE,
    CD_DESEMPENHO_DATA_SOURCE,
    CARTEIRA_DATA_SOURCE,
    MASTER_DATA_SOURCE,
    PEDIDO_MENSAL_DATA_SOURCE,
    PARCEIRO_MENSAL_DATA_SOURCE,
    PARCEIROS_DATA_SOURCE,
    CITY_IDS_DATA_SOURCE,
} from '../config/dataSource';

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? 'https://bigou-sheets-api.netlify.app').replace(/\/+$/, '');

type DataBaseLink = {
    id: string;
    name: string;
    description: string;
    tab?: string;
    href: string;
    apiPath?: string;
    kind: 'sheet' | 'api' | 'external';
};

function gatewaySheetPath(sheetId: string, tab: string): string {
    return `/api/sheets/${sheetId}/${encodeURIComponent(tab)}`;
}

function googleSheetUrl(sheetId: string): string {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

function buildDataBases(): DataBaseLink[] {
    const rows: DataBaseLink[] = [];

    PARTNER_DATA_SOURCES.forEach((source, index) => {
        rows.push({
            id: `partner-${index}`,
            name: index === 0 ? 'Jornada do parceiro — Thiago' : 'Jornada do parceiro — Laís',
            description: 'Parceiros, pedidos por semana, status e onboarding',
            tab: source.range,
            href: googleSheetUrl(source.sheetId),
            kind: 'sheet',
        });
    });

    rows.push(
        {
            id: 'access',
            name: 'Acessos únicos por dia',
            description: 'Acessos ao cardápio e funil (acessos → compras)',
            tab: ACCESS_DATA_SOURCE.range,
            href: googleSheetUrl(ACCESS_DATA_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'logos',
            name: 'Logos dos parceiros',
            description: 'Avatar na lista e cabeçalho da loja (parceiro_nome, logo_url)',
            tab: LOGO_SHEET_SOURCE.range,
            href: googleSheetUrl(LOGO_SHEET_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'indicador',
            name: 'Indicador (promoção e cupom)',
            description: 'Status de promoção e cupom por parceiro',
            tab: INDICADOR_DATA_SOURCE.range,
            href: googleSheetUrl(INDICADOR_DATA_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'cd-novos',
            name: 'Cardápio Digital — novos assinantes',
            description: 'Modo CD · lista de novos parceiros',
            tab: CD_NOVOS_DATA_SOURCE.range,
            href: googleSheetUrl(CD_NOVOS_DATA_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'cd-desempenho',
            name: 'Cardápio Digital — todas as lojas',
            description: 'Modo CD · desempenho e churn',
            tab: CD_DESEMPENHO_DATA_SOURCE.range,
            href: googleSheetUrl(CD_DESEMPENHO_DATA_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'carteira',
            name: 'Carteira (CIDADES_FORMATADO)',
            description: 'Resumo por cidade/grupo — cabeçalhos na linha 1 (DIVISÃO, CIDADE, GRUPO, TOTAL…)',
            tab: CARTEIRA_DATA_SOURCE.range,
            href: googleSheetUrl(CARTEIRA_DATA_SOURCE.sheetId),
            apiPath: gatewaySheetPath(CARTEIRA_DATA_SOURCE.sheetId, CARTEIRA_DATA_SOURCE.range),
            kind: 'sheet',
        },
        {
            id: 'pedido-mensal',
            name: 'Pedido mensal (planilha mestre)',
            description: 'Pedidos, comissão e cancelamento por cidade/estabelecimento',
            tab: PEDIDO_MENSAL_DATA_SOURCE.range,
            href: googleSheetUrl(MASTER_DATA_SOURCE.sheetId),
            apiPath: gatewaySheetPath(PEDIDO_MENSAL_DATA_SOURCE.sheetId, PEDIDO_MENSAL_DATA_SOURCE.range),
            kind: 'sheet',
        },
        {
            id: 'parceiro-mensal',
            name: 'Parceiro mensal — GMV (planilha mestre)',
            description: 'GMV por cidade/estabelecimento/período',
            tab: PARCEIRO_MENSAL_DATA_SOURCE.range,
            href: googleSheetUrl(MASTER_DATA_SOURCE.sheetId),
            apiPath: gatewaySheetPath(PARCEIRO_MENSAL_DATA_SOURCE.sheetId, PARCEIRO_MENSAL_DATA_SOURCE.range),
            kind: 'sheet',
        },
        {
            id: 'parceiros',
            name: 'Parceiros — status do contrato (planilha mestre)',
            description: 'Status ativo, pendente, suspenso ou cancelado por estabelecimento',
            tab: PARCEIROS_DATA_SOURCE.range,
            href: googleSheetUrl(MASTER_DATA_SOURCE.sheetId),
            apiPath: gatewaySheetPath(PARCEIROS_DATA_SOURCE.sheetId, PARCEIROS_DATA_SOURCE.range),
            kind: 'sheet',
        },
        {
            id: 'city-ids',
            name: 'Mapa de cidades (IDs)',
            description: 'Peso prioritário por cidade',
            tab: CITY_IDS_DATA_SOURCE.range,
            href: googleSheetUrl(CITY_IDS_DATA_SOURCE.sheetId),
            kind: 'sheet',
        },
        {
            id: 'gateway',
            name: 'Gateway Bigou (API + login)',
            description: 'Autenticação Google OAuth e leitura das planilhas',
            href: API_ORIGIN,
            kind: 'api',
        },
    );

    const trelloBoard = import.meta.env.VITE_TRELLO_BOARD_ID?.trim();
    if (trelloBoard) {
        rows.push({
            id: 'trello',
            name: 'Trello — duração de onboarding',
            description: 'Tempo entre etapas do fluxo comercial',
            href: `https://trello.com/b/${trelloBoard}`,
            kind: 'external',
        });
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (supabaseUrl) {
        rows.push({
            id: 'supabase',
            name: 'Supabase',
            description: 'Backend auxiliar (quando configurado)',
            href: supabaseUrl,
            kind: 'external',
        });
    }

    return rows;
}

export default function SettingsView() {
    const dataBases = buildDataBases();

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Fontes de dados
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Todas as bases conectadas ao dashboard — clique para abrir.
                </p>
            </header>

            <ul className="space-y-3">
                {dataBases.map((db) => (
                    <li
                        key={db.id}
                        className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
                    >
                        <a
                            href={db.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-4 p-4 min-w-0"
                        >
                            <div
                                className={`size-10 shrink-0 rounded-lg flex items-center justify-center ${
                                    db.kind === 'sheet'
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                                        : db.kind === 'api'
                                          ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400'
                                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[22px]">
                                    {db.kind === 'sheet' ? 'table_chart' : db.kind === 'api' ? 'cloud' : 'link'}
                                </span>
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{db.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                    {db.description}
                                </p>
                                {db.tab && (
                                    <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">
                                        Aba: {db.tab}
                                    </p>
                                )}
                                {db.apiPath && (
                                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate" title={`${API_ORIGIN}${db.apiPath}`}>
                                        API: {db.apiPath}
                                    </p>
                                )}
                            </div>

                            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
                                Abrir
                                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>

            <p className="mt-8 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                Métricas calculadas no app (índice de desempenho, prioridade) e itens “Em breve” (GMV, item mais vendido)
                não têm planilha própria — derivam ou aguardam nova integração.
            </p>
        </div>
    );
}
