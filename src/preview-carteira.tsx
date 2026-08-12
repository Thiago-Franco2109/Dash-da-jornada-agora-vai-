/**
 * Entrada isolada para conferir a Carteira lendo do banco, sem passar pelo login.
 *
 * Os números vêm da Function `carteira`. Divisão e grupo vêm do Supabase, que
 * localmente roda em modo mock (sem VITE_SUPABASE_URL no .env) — então aqui dá
 * para ver a edição funcionando, mas não a persistência de verdade.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-carteira.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CarteiraView from './components/CarteiraView';
import { useCarteiraData } from './hooks/useCarteiraData';
import './index.css';

export function PreviewCarteira() {
    const { rows, isLoading, isRefreshing, error, lastSyncTime, isUsingCache, refreshData } = useCarteiraData({ enabled: true });
    return (
        <div className="h-screen flex">
            <CarteiraView
                rows={rows}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                error={error}
                isUsingCache={isUsingCache}
                lastSyncTime={lastSyncTime}
                onRefresh={refreshData}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewCarteira />
    </StrictMode>,
);
