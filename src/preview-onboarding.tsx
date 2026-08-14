/**
 * Entrada isolada para conferir a aba "Acompanhar Onboarding" sem login.
 *
 * Exercita Function `onboarding-pendentes` → hook → OnboardingView de verdade.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-onboarding.html
 * (?fonte=cd para o Cardápio Digital).
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OnboardingView from './components/OnboardingView';
import { useOnboardingPendente } from './hooks/useOnboardingPendente';
import './index.css';

export function PreviewOnboarding() {
    const fonte = new URLSearchParams(window.location.search).get('fonte');
    const produto = fonte === 'cd' ? 'cd' : undefined;
    const { pendentes, isLoading, isRefreshing, error, lastSyncTime, refreshData } = useOnboardingPendente({ produto });

    return (
        <div className="h-screen flex bg-white dark:bg-slate-900">
            <OnboardingView
                pendentes={pendentes}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                error={error}
                lastSyncTime={lastSyncTime}
                onRefresh={refreshData}
                mode={produto === 'cd' ? 'cardapio_digital' : 'marketplace'}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<StrictMode><PreviewOnboarding /></StrictMode>);
