/**
 * Entrada isolada para conferir a aba "Trello" sem login.
 *
 * Exercita Function `trello-tarefas` → hook → TrelloView de verdade.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-trello.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TrelloView from './components/TrelloView';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="h-screen flex bg-white dark:bg-slate-900">
            <TrelloView />
        </div>
    </StrictMode>,
);
