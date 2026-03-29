import { DATA_SOURCE, ACCESS_DATA_SOURCE } from '../config/dataSource';
import { GA4_CONFIG } from '../config/ga4Config';

export default function SettingsView() {
    // Verifica se as configurações do Google Sheets via Gateway parecem válidas
    const isGoogleSheetsConfigured = !!DATA_SOURCE.sheetId && DATA_SOURCE.sheetId !== 'YOUR_GOOGLE_SHEET_ID' && DATA_SOURCE.sheetId.trim() !== '';
    const isAccessSheetConfigured = !!ACCESS_DATA_SOURCE.sheetId && ACCESS_DATA_SOURCE.sheetId.trim() !== '';
    const isGA4Configured = GA4_CONFIG.enabled && !!GA4_CONFIG.propertyId && GA4_CONFIG.propertyId !== 'YOUR_GA4_PROPERTY_ID';

    // Link direto para a planilha
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${DATA_SOURCE.sheetId}/edit`;
    const accessSheetUrl = `https://docs.google.com/spreadsheets/d/${ACCESS_DATA_SOURCE.sheetId}/edit`;
    
    const logoSheetId = '1Y5_TXSIi2RFyd_uUMXcWLQTQ52Oy8kCwYZrnlj6a5Xk'; // ID vindo do syncSheets.js legado, mantido para referência
    const logoSheetUrl = `https://docs.google.com/spreadsheets/d/${logoSheetId}/edit`;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-10">
                <div className="flex items-center gap-3 mb-2">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-3xl">settings_input_component</span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Status de Monitoramento</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-medium italic">
                            Painel de controle técnico das integrações ativas
                        </p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Coluna Principal: Fontes de Dados */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Fonte Principal: Google Sheets */}
                    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden hover:border-primary/30 transition-all duration-300">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="size-10 bg-green-500 text-white rounded-xl shadow-lg shadow-green-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined">table_view</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-none mb-1">Coração de Dados</h2>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Google Sheets API Gateway</p>
                                </div>
                            </div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${isGoogleSheetsConfigured ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                <span className={`size-2 rounded-full animate-pulse ${isGoogleSheetsConfigured ? 'bg-green-500 shadow-[0_0_8px_rgb(34,197,94)]' : 'bg-slate-400'}`}></span>
                                {isGoogleSheetsConfigured ? 'Live & Sincronizado' : 'Inativo'}
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 group hover:border-primary/30 transition-colors">
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">ID da Planilha Ativa</label>
                                    <p className="font-mono text-sm text-slate-800 dark:text-slate-200 truncate select-all">{DATA_SOURCE.sheetId || 'Nenhum'}</p>
                                    <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-all">
                                        Abrir Planilha no Google <span className="material-symbols-outlined text-sm">open_in_new</span>
                                    </a>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 group hover:border-primary/30 transition-colors">
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Aba de Dados (Sheet Name)</label>
                                    <p className="font-mono text-sm text-slate-800 dark:text-slate-200">{DATA_SOURCE.range || 'Nenhuma'}</p>
                                    <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                        <span className="material-symbols-outlined text-sm">filter_none</span> Mapeamento Dinâmico
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                    <h4 className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-400 mb-3">
                                        <span className="material-symbols-outlined text-lg">priority_high</span> 
                                        Ação Crítica de Estrutura
                                    </h4>
                                    <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed mb-4">
                                        O Gateway mapeia as colunas pela <strong>LINHA 1</strong> da aba <code>{DATA_SOURCE.range}</code>. 
                                        Se nomes não baterem exatamente, os dados aparecerão como <code className="bg-amber-200/50 dark:bg-amber-500/20 px-1 rounded italic font-bold">NaN</code> ou em branco.
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                        {['Cidade', 'ID', 'Estabelecimento', 'Status', 'Lancamento'].map((h, i) => (
                                            <div key={h} className="bg-white/60 dark:bg-black/20 p-2 rounded-lg text-center border border-amber-200 dark:border-amber-500/10">
                                                <span className="text-[10px] font-bold block text-amber-900/40 dark:text-amber-400/30 uppercase leading-none mb-1">Col {String.fromCharCode(65+i)}1</span>
                                                <span className="text-[11px] font-black text-amber-900 dark:text-amber-400 truncate">{h}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* API de Acessos Únicos Rápidos (NEW) */}
                    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden hover:border-primary/30 transition-all duration-300">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="size-10 bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined">data_exploration</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-none mb-1">Acessos da Loja</h2>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Gateway Analytics Dinâmico</p>
                                </div>
                            </div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${isAccessSheetConfigured ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                <span className={`size-2 rounded-full animate-pulse ${isAccessSheetConfigured ? 'bg-indigo-500 shadow-[0_0_8px_rgb(99,102,241)]' : 'bg-slate-400'}`}></span>
                                {isAccessSheetConfigured ? 'Conectado' : 'Offline'}
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 group hover:border-primary/30 transition-colors">
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">ID Relatório Acessos</label>
                                <p className="font-mono text-sm text-slate-800 dark:text-slate-200 truncate select-all">{ACCESS_DATA_SOURCE.sheetId || '—'}</p>
                                <a href={accessSheetUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-all">
                                    Ver Fonte de Acessos <span className="material-symbols-outlined text-sm">open_in_new</span>
                                </a>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Sincroniza automaticamente a quantidade de visitas estimadas no <strong>Funil de Vendas</strong> dos parceiros, melhorando a precisão da conversão.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Logos Spreadsheet (Secondary Source) */}
                    <section className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="p-5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="size-10 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl flex items-center justify-center">
                                    <span className="material-symbols-outlined">image_search</span>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 leading-none mb-1">Repositório de Logos</h2>
                                    <p className="text-xs text-slate-500 font-medium">Planilha de ativos visuais (Mapeamento Estabelecimento → Logo)</p>
                                </div>
                            </div>
                            <a href={logoSheetUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2">
                                Ver Repositório <span className="material-symbols-outlined text-sm">external_link</span>
                            </a>
                        </div>
                    </section>
                </div>

                {/* Coluna Lateral: Analytics & Técnicos */}
                <div className="space-y-6">
                    
                    {/* Integração GA4 */}
                    <section className="bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl p-1 shadow-xl shadow-orange-500/10">
                        <div className="bg-white dark:bg-slate-900 rounded-[calc(1.5rem-2px)] p-6 h-full">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="size-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                                    <span className="material-symbols-outlined">analytics</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Google Analytics</h3>
                            </div>
                            
                            <div className="space-y-4 mb-6">
                                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-500">Status da API</span>
                                    <span className={`font-bold ${isGA4Configured ? 'text-green-500' : 'text-slate-400'}`}>
                                        {isGA4Configured ? 'CONECTADO' : 'AGUARDANDO'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-500">Property ID</span>
                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{isGA4Configured ? GA4_CONFIG.propertyId : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-500">Modo de Identificação</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{GA4_CONFIG.identifierMode}</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl">
                                <p className="text-[11px] leading-relaxed text-slate-500 italic">
                                    As métricas de sessões e visualizações são puxadas em tempo de execução via GA4 Data API, comparando o ID do estabelecimento no dashboard com as dimensões customizadas do Google.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Fontes Legadas / Overrides */}
                    <section className="bg-slate-900 dark:bg-white rounded-3xl p-6 shadow-xl dark:shadow-none">
                        <h3 className="text-sm font-black text-white dark:text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">layers</span> Camada de Dados
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 dark:bg-slate-100 border border-white/5 dark:border-slate-200">
                                <div className="size-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-sm">edit_note</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-indigo-300 dark:text-indigo-400 uppercase tracking-tighter">Manual Overrides</p>
                                    <p className="text-[11px] text-white/70 dark:text-slate-600 leading-tight">Ajustes manuais locais salvos por você em cada parceiro.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 dark:bg-slate-100 border border-white/5 dark:border-slate-200">
                                <div className="size-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-sm">upload_file</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-pink-300 dark:text-pink-400 uppercase tracking-tighter">Bulk CSV Analytics</p>
                                    <p className="text-[11px] text-white/70 dark:text-slate-600 leading-tight">Dados de acessos importados via upload de arquivo CSV.</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <footer className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center justify-center gap-3">
                    <span className="h-px w-8 bg-slate-200 dark:bg-slate-800"></span> 
                    Arquitetura de Dados 2026 
                    <span className="h-px w-8 bg-slate-200 dark:bg-slate-800"></span>
                </p>
                <div className="flex justify-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 uppercase">React 19</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 uppercase">Vite 7</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 uppercase">Tailwind 4</span>
                </div>
            </footer>
        </div>
    );
}

