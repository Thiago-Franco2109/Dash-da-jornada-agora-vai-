/**
 * Entrada isolada para conferir a Carteira por Grupo, sem passar pelo login.
 *
 * Mesma fonte de dados da Carteira normal (Function `carteira` + Supabase
 * para divisão/grupo, que localmente roda em modo mock).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-carteira-grupo.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CarteiraPorGrupoView from './components/CarteiraPorGrupoView';
import { useCarteiraData } from './hooks/useCarteiraData';
import './index.css';

export function PreviewCarteiraPorGrupo() {
    const { rows, isLoading, isRefreshing, error, lastSyncTime, isUsingCache, refreshData } = useCarteiraData({ enabled: true });
    return (
        <div className="h-screen flex">
            <CarteiraPorGrupoView
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
        <PreviewCarteiraPorGrupo />
    </StrictMode>,
);
