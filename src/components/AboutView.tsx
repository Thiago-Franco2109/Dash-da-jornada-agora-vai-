
export default function AboutView() {
    return (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
            <div className="max-w-4xl mx-auto p-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <header className="border-b border-slate-200 dark:border-slate-800 pb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-2xl">info</span>
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Manual do Dashboard</h1>
                    </div>
                    <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl">
                        Este dashboard foi projetado para centralizar a inteligência de dados dos primeiros 28 dias de vida de um parceiro no Bigou.
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Sessão 1 */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                            <span className="material-symbols-outlined">analytics</span>
                            <h2 className="text-xl font-bold">Dados Analisados</h2>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                            <ul className="space-y-4 text-sm">
                                <li className="flex gap-3">
                                    <span className="text-primary font-bold">1.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Funil de Vendas:</strong> Cruzamento real entre acessos únicos ao cardápio e pedidos realizados.</p>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-primary font-bold">2.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Meta 30x30:</strong> Cálculo em tempo real da meta proporcional ao tempo de vida da loja (idealizado para 30 pedidos em 30 dias).</p>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-primary font-bold">3.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Saúde do Marketing:</strong> Monitoramento de Cupons e Promoções ativas na aba Indicador.</p>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Sessão 2 */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-500">
                            <span className="material-symbols-outlined">psychology</span>
                            <h2 className="text-xl font-bold">Inteligência de Priorização</h2>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                            <ul className="space-y-4 text-sm">
                                <li className="flex gap-3">
                                    <span className="text-indigo-500 font-bold">A.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Peso da Cidade:</strong> Importância estratégica de 1 a 5 baseado na praça da loja.</p>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-indigo-500 font-bold">B.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Score de Estrelas:</strong> Algoritmo que combina baixo desempenho com alta importância da cidade para alertar intervenção imediata.</p>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-indigo-500 font-bold">C.</span>
                                    <p className="text-slate-600 dark:text-slate-300"><strong>Status de Idade:</strong> Divisão em quartis (1-7, 8-14, 15-21, 22-28 dias) para foco em fases críticas.</p>
                                </li>
                            </ul>
                        </div>
                    </section>
                </div>

                <section className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
                    <div className="flex flex-col md:flex-row gap-8 items-center">
                        <div className="flex-1 space-y-4">
                            <h2 className="text-2xl font-bold">Ferramentas Externas Integradas</h2>
                            <p className="text-indigo-100 opacity-90">O dashboard atua como um hub, permitindo saltar diretamente para as ferramentas de gestão sem perder o contexto da loja.</p>
                            <div className="flex flex-wrap gap-3">
                                <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-medium">CMS Bigou</span>
                                <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-medium">Relatório de Pedidos 28D</span>
                                <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-medium">Planilha de Logs de Acesso</span>
                            </div>
                        </div>
                        <div className="size-32 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/20">
                            <span className="material-symbols-outlined text-6xl">rocket_launch</span>
                        </div>
                    </div>
                </section>

                <footer className="pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-4 text-slate-400 text-sm">
                    <p>© 2026 CS Partner Journey Dashboard</p>
                    <div className="flex gap-6">
                        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500"></span> Sistema Online</span>
                        <span>v2.4.0</span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
