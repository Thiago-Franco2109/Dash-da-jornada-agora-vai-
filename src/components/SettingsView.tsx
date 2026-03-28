import { DATA_SOURCE } from '../config/dataSource';
import { GA4_CONFIG } from '../config/ga4Config';

export default function SettingsView() {
    // Verifica se as configurações do Google Sheets via Gateway parecem válidas
    const isGoogleSheetsConfigured = !!DATA_SOURCE.sheetId && DATA_SOURCE.sheetId !== 'YOUR_GOOGLE_SHEET_ID' && DATA_SOURCE.sheetId.trim() !== '';
    const isGA4Configured = GA4_CONFIG.enabled && !!GA4_CONFIG.propertyId && GA4_CONFIG.propertyId !== 'YOUR_GA4_PROPERTY_ID';

    return (
        <div className="p-8 max-w-4xl mx-auto w-full">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Configurações & Integrações</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
                Visualize de forma rápida as planilhas conectadas e os endpoints ativados neste sistema.
            </p>

            <div className="space-y-8">
                {/* Integração: Google Sheets */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined">table_chart</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Google Sheets (Bigou Gateway API)</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Planilha principal de dados dos parceiros. A sincronização automática ocorre pela API do Gateway.</p>
                            </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${isGoogleSheetsConfigured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            <span className={`size-2 rounded-full ${isGoogleSheetsConfigured ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                            {isGoogleSheetsConfigured ? 'Ativo' : 'Não Configurado'}
                        </span>
                    </div>
                    <div className="p-6">
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col gap-1 border border-slate-200 dark:border-slate-700/50">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">ID da Planilha (sheetId)</span>
                                <span className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">{DATA_SOURCE.sheetId || '—'}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col gap-1 border border-slate-200 dark:border-slate-700/50">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Aba da Planilha (range)</span>
                                <span className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">{DATA_SOURCE.range || '—'}</span>
                            </div>
                        </div>

                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Como Trocar a Planilha</h3>
                        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                            <li>Copie o ID da sua nova planilha do Google Sheets pela URL (o texto que fica entre <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">/d/</code> e <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">/edit</code>).</li>
                            <li>Verifique como se chama a aba onde os dados estão formatados.</li>
                            <li>Abra o arquivo <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">src/config/dataSource.ts</code> no seu editor.</li>
                            <li>Altere os valores de <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">sheetId</code> e <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">range</code>.</li>
                        </ol>

                        <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-sm font-mono text-slate-800 dark:text-slate-300">
                            export const DATA_SOURCE = {'{'}<br />
                            &nbsp;&nbsp;sheetId: '<strong>{DATA_SOURCE.sheetId}</strong>',<br />
                            &nbsp;&nbsp;range: '<strong>{DATA_SOURCE.range}</strong>',<br />
                            {'}'};
                        </div>
                    </div>
                </div>

                {/* Integração: Google Analytics 4 */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined">analytics</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Google Analytics 4 (GA4)</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Puxe métricas de tráfego (Sessions, Views) via GA4 Data API.</p>
                            </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${isGA4Configured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            <span className={`size-2 rounded-full ${isGA4Configured ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                            {isGA4Configured ? 'Ativo' : 'Não Configurado'}
                        </span>
                    </div>
                    <div className="p-6">
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col gap-1 border border-slate-200 dark:border-slate-700/50">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Property ID</span>
                                <span className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">{GA4_CONFIG.propertyId || '—'}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col gap-1 border border-slate-200 dark:border-slate-700/50">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Identifier Mode</span>
                                <span className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">{GA4_CONFIG.identifierMode || '—'}</span>
                            </div>
                        </div>

                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Como Configurar</h3>
                        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                            <li>Crie uma <strong>Service Account</strong> no Google Cloud e conceda a permissão "Analytics Data API Viewer".</li>
                            <li>Abra o arquivo <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">src/config/ga4Config.ts</code>.</li>
                            <li>Preencha as opções com seu <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">propertyId</code> e seu token gerado (<code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-pink-600">apiKey</code>).</li>
                        </ol>
                        <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-sm font-mono text-slate-800 dark:text-slate-300">
                            export const GA4_CONFIG = {'{'}<br />
                            &nbsp;&nbsp;enabled: {GA4_CONFIG.enabled ? 'true' : 'false'},<br />
                            &nbsp;&nbsp;propertyId: '<strong>{GA4_CONFIG.propertyId}</strong>',<br />
                            &nbsp;&nbsp;identifierMode: '{GA4_CONFIG.identifierMode}',<br />
                            {'}'};
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

