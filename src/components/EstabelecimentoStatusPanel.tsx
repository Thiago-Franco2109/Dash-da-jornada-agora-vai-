import { useEstabelecimentoSummary, type EstabelecimentoStatusCount } from '../hooks/useEstabelecimentos';

/**
 * Painel do "gabarito de churn" — distribuição real de status de contrato
 * vinda direto do banco de teste (tabela `estabelecimento`, campo `delivery`).
 *
 * É read-only e autônomo (usa o hook internamente). Se a sessão expirou ou o
 * banco estiver indisponível, mostra um aviso discreto em vez de quebrar a tela.
 */

// status que interessam pro churn, na ordem de exibição, com estilo
const HIGHLIGHT: { key: string; label: string; classes: string }[] = [
    { key: 'ativo',       label: 'Ativos',       classes: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300' },
    { key: 'cancelado',   label: 'Cancelados',   classes: 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-300' },
    { key: 'suspenso',    label: 'Suspensos',    classes: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300' },
    { key: 'desistencia', label: 'Desistências', classes: 'border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-300' },
];

function countFor(byStatus: EstabelecimentoStatusCount[], key: string): number {
    return byStatus.find(s => s.status === key)?.total ?? 0;
}

export default function EstabelecimentoStatusPanel() {
    const { summary, loading, error, refetch } = useEstabelecimentoSummary();

    return (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-indigo-500">database</span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Status de contrato (banco de teste)
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Gabarito histórico de churn · tabela <code>estabelecimento</code>
                        </p>
                    </div>
                </div>
                <button
                    onClick={refetch}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    title="Recarregar do banco"
                >
                    Atualizar
                </button>
            </div>

            {loading ? (
                <p className="mt-3 text-sm text-slate-400">Carregando do banco…</p>
            ) : error ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                    Não foi possível carregar do banco: {error}
                </p>
            ) : summary ? (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {HIGHLIGHT.map(item => (
                        <div key={item.key} className={`rounded-lg border p-3 ${item.classes}`}>
                            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{item.label}</p>
                            <p className="mt-1 text-2xl font-bold">
                                {countFor(summary.byStatus, item.key).toLocaleString('pt-BR')}
                            </p>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
