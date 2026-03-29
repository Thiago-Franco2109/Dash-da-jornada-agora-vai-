export type FunnelStep = {
    label: string;
    description: string;
    icon: string;
    value: number;              // raw count for your store
    pctOfFirst: number;         // % relative to Visitas (your store)
};

interface MenuFunnelProps {
    steps: FunnelStep[];
}

export default function MenuFunnel({ steps }: MenuFunnelProps) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            {/* ───── Header ───── */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span className="material-symbols-outlined text-primary text-2xl">analytics</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Análise do Cardápio</h2>
                </div>

                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/30 text-sm">
                    <span className="material-symbols-outlined text-blue-500 text-[20px] mt-0.5">info</span>
                    <span className="text-blue-800 dark:text-blue-300">
                        <strong>Métricas Reais:</strong> Os dados abaixo refletem a performance real coletada via integração em tempo real ou arquivos importados.
                    </span>
                </div>
            </div>

            {/* ───── Funnel cards ───── */}
            <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {steps.map((step, i) => {
                        // Altura da barra baseada no % real (com um mínimo para visibilidade)
                        const barH = i === 0 ? 100 : Math.max(10, step.pctOfFirst);
                        
                        return (
                            <div
                                key={step.label}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col h-full hover:border-primary/40 transition-colors"
                            >
                                {/* Card header */}
                                <div className="p-4 flex-grow">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[15px]">{step.icon}</span>
                                        {step.label}
                                    </h3>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                                        {step.value.toLocaleString('pt-BR')}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{step.description}</p>

                                    <div className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                        <span className="material-symbols-outlined text-[11px]">analytics</span>
                                        Dado Real
                                    </div>
                                </div>

                                {/* Bar container */}
                                <div className="relative h-28 w-full bg-slate-50 dark:bg-slate-900/50">
                                    <div
                                        className="absolute bottom-0 left-0 right-0 bg-primary flex flex-col items-center justify-end pb-3 transition-all duration-500"
                                        style={{ height: `${barH}%` }}
                                    >
                                        <span className="font-bold text-sm text-white">{step.pctOfFirst.toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                    * Métricas coletadas em tempo real via integração com Google Sheets / GA4.
                </p>
            </div>
        </div>
    );
}
