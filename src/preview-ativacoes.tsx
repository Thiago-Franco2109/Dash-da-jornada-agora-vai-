/**
 * Entrada isolada para conferir a aba "Ativação de campanhas" sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar em Relatórios, então esta página monta
 * só a aba. Os dados vêm da Function `ativacoes-campanhas` (banco de verdade,
 * servida pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-ativacoes.html
 * (filtre por gestor com ?gestor=NOME).
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AtivacaoCampanhasTab } from './components/ReportsView';
import './index.css';

const managerFilter = new URLSearchParams(window.location.search).get('gestor') ?? '';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
            <AtivacaoCampanhasTab managerFilter={managerFilter} />
        </div>
    </StrictMode>,
);
