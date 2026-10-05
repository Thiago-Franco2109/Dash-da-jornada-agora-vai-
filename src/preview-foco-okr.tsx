/**
 * Entrada isolada para conferir o foco "Cidades OKR" sem passar pelo login.
 *
 * Usa a lista real de parceiros ativos (Netlify Function `parceiros-ativos`,
 * servida pelo plugin de dev do vite.config), então o que aparece aqui é o
 * mesmo casamento de nome de cidade que o painel faz — incluindo os nomes
 * compostos ("Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES").
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-foco-okr.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CityFocusProvider, useCityFocus } from './context/CityFocusContext';
import CityFocusChip from './components/CityFocusChip';
import { useParceirosAtivos } from './hooks/useParceirosAtivos';
import './index.css';

export function PreviewFocoOkr() {
    const { parceiros, loading, error } = useParceirosAtivos();
    const { okrAtivo, filtrarPorCidade, cidadesOkr } = useCityFocus();

    const visiveis = useMemo(
        () => filtrarPorCidade(parceiros, p => p.cidade),
        [parceiros, filtrarPorCidade],
    );

    const porCidade = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of visiveis) m.set(p.cidade ?? '(sem cidade)', (m.get(p.cidade ?? '(sem cidade)') ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [visiveis]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="flex items-center justify-between px-6 py-3 shadow-md" style={{ backgroundColor: '#28a05e' }}>
                <h1 className="text-white font-black uppercase tracking-tight">Preview — foco Cidades OKR</h1>
                <CityFocusChip variante="header" />
            </header>

            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 pr-3 border-r border-slate-200 dark:border-slate-700">Filtros</span>
                <CityFocusChip />
                <span className="text-sm text-slate-500">
                    {loading ? 'carregando parceiros ativos…' : <><strong>{visiveis.length}</strong> de {parceiros.length} parceiros · {porCidade.length} cidades</>}
                </span>
            </div>

            <div className="p-6 space-y-4 text-slate-800 dark:text-slate-100">
                <p className="text-sm text-slate-500">
                    Foco {okrAtivo ? <strong className="text-emerald-600">ligado</strong> : <strong>desligado</strong>} · OKR: {cidadesOkr.join(', ')}
                </p>
                {error && <p className="text-sm text-red-600">Erro: {error}</p>}
                <ul className="text-sm divide-y divide-slate-200 dark:divide-slate-700 max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    {porCidade.map(([cidade, total]) => (
                        <li key={cidade} className="flex justify-between px-4 py-1.5">
                            <span>{cidade}</span>
                            <strong className="tabular-nums">{total}</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CityFocusProvider>
            <PreviewFocoOkr />
        </CityFocusProvider>
    </StrictMode>,
);
