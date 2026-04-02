
import type { EnrichedPerformanceRow } from '../utils/calculations';

interface ReportsViewProps {
    data: EnrichedPerformanceRow[];
}

export default function ReportsView({ data }: ReportsViewProps) {
    // 1. Relatório: Lojas S/ Ações de Cupom/Promo (Apenas lojas não-desistentes)
    const pendingActions = data.filter(
        row => 
            row.promo_status !== 'ativo' && 
            row.cupom_status !== 'ativo'
    ).sort((a, b) => b.dias_desde_lancamento - a.dias_desde_lancamento); // Mais antigos primeiro

    // 2. Relatório: Progresso na Ativação (30 pedidos / 30 dias)
    // Mostra as lojas que devem estar crescendo, limitadas a no máximo 30 dias na meta teórica
    // Ordenar primeiramente pelos piores índices (lojas perigando)
    const activationProgress = [...data]
        .sort((a, b) => {
            const percA = a.pedidos_esperados > 0 ? (a.total_pedidos / a.pedidos_esperados) : 0;
            const percB = b.pedidos_esperados > 0 ? (b.total_pedidos / b.pedidos_esperados) : 0;
            return percA - percB;
        });

    return (
        <div className="p-6 space-y-8">

                {/* BLOCO 1: Sem Promo/Cupom */}
                <section>
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
                        <span className="material-symbols-outlined text-orange-500">warning</span>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                            Pendência de Atrações (Sem Promo/Cupom)
                        </h2>
                        <span className="ml-auto bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            {pendingActions.length} Lojas
                        </span>
                    </div>

                    {pendingActions.length === 0 ? (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500">
                            <span className="material-symbols-outlined text-4xl mb-2 text-green-500">check_circle</span>
                            <p>Todas as lojas ativas possuem pelo menos um Cupom ou Promoção rodando!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingActions.map(store => (
                                <div key={store.estab_id || store.estabelecimento} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-start justify-between">
                                            <h3 className="font-bold text-slate-900 dark:text-white truncate" title={store.estabelecimento}>
                                                {store.estabelecimento}
                                            </h3>
                                            <span className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                                {store.dias_desde_lancamento} dias
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center mt-1">
                                            <span className="material-symbols-outlined text-[14px] mr-1">location_on</span>
                                            {store.cidade}
                                        </p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3">
                                        <div className="flex items-center text-sm">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400 mr-1">person</span>
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">{store.analista}</span>
                                        </div>
                                        {(store.promo_status === 'aguardando' || store.cupom_status === 'aguardando') && (
                                            <span className="text-[10px] text-yellow-600 bg-yellow-100 px-2 py-[2px] rounded uppercase font-bold tracking-wide">
                                                Aguardando
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* BLOCO 2: Meta 30 Pedidos / 30 Dias */}
                <section>
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 mt-8">
                        <span className="material-symbols-outlined text-blue-500">trending_up</span>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                            Progresso na Ativação (Meta 30x30)
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400 border-collapse">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Estabelecimento / Analista</th>
                                        <th className="px-6 py-4 text-center">Dias (Idade)</th>
                                        <th className="px-6 py-4 text-center">Atingimento (Pedidos / Meta)</th>
                                        <th className="px-6 py-4 w-1/3">Progresso Visual</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {activationProgress.map(store => {
                                        const expected = calculateExpectedOrders(store.dias_desde_lancamento);
                                        const total = store.total_pedidos;
                                        // Atingimento absoluto limitando a 100%
                                        const progressRaw = Math.round((total / 30) * 100);
                                        const progressAbs = Math.min(100, progressRaw);
                                        
                                        // Índice em realação ao que deveria estar hoje (1.0 = na meta, < 1.0 = atrasado)
                                        const index = expected > 0 ? (total / expected) : (total > 0 ? 1 : 0);
                                        
                                        let barColor = 'bg-blue-500';
                                        if (store.dias_desde_lancamento > 5) {
                                            if (index < 0.5) barColor = 'bg-red-500';
                                            else if (index < 1.0) barColor = 'bg-yellow-500';
                                            else barColor = 'bg-green-500';
                                        }

                                        return (
                                            <tr key={store.estab_id || store.estabelecimento} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-900 dark:text-white truncate w-48 lg:w-64">
                                                        {store.estabelecimento}
                                                    </div>
                                                    <div className="text-xs mt-1 truncate w-48 lg:w-64">
                                                        {store.cidade} • {store.analista}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                                        {store.dias_desde_lancamento} / 30
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center tabular-nums font-medium text-slate-700 dark:text-slate-300">
                                                    <span className="text-lg">{total}</span>
                                                    <span className="text-slate-400 mx-1">/</span>
                                                    <span>{expected}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                                                                style={{ width: `${progressAbs}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs font-bold w-10 text-right ${index >= 1.0 || progressRaw >= 100 ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`}>
                                                            {progressRaw}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

        </div>
    );
}

// Utils inside this file to avoid breaking imports since we only need the local math logic
function calculateExpectedOrders(dias: number): number {
    if (dias === 0) return 0;
    const cappedDays = Math.min(dias, 28); // Matches the rule in calculations.ts that caps expectancies to 28/30 
    return Math.round((cappedDays / 28) * 30);
}
