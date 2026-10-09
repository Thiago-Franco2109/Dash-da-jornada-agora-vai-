/**
 * Entrada isolada para conferir a aba "OKR do trimestre" sem passar pelo login.
 *
 * Bate na Netlify Function `okr-trimestre` servida pelo plugin de dev do
 * vite.config, então os números aqui são os mesmos do painel.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-okr.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OkrView from './components/OkrView';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
            <OkrView />
        </div>
    </StrictMode>,
);
