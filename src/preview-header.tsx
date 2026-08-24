/**
 * Entrada isolada para conferir o título do Header sem login.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-header.html
 * Não entra no build de produção.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header';
import { ProductModeProvider } from './context/ProductModeContext';
import { AuthProvider } from './context/AuthContext';
import type { CrmFollowUpAlert } from './types/crm';
import type { TarefaTrello } from './hooks/useTrelloTarefas';
import './index.css';

const mockCrmAlerts = [
    { partnerId: '1', partner: { estabelecimento: '[Amostra] Tony Turner', cidade: 'São Paulo' }, nextFollowUp: '2026-08-20', level: 'overdue', daysOffset: -4 },
    { partnerId: '2', partner: { estabelecimento: '[Amostra] iTable', cidade: 'Campinas' }, nextFollowUp: '2026-08-24', level: 'today', daysOffset: 0 },
] as unknown as CrmFollowUpAlert[];

const mockTrelloTasks = [
    { id: 't1', nome: 'Ligar pro Damone', due: '2026-08-22T00:00:00.000Z', dueComplete: false, boardId: 'b1', board: 'Prospecção', listId: 'l1', lista: 'Fazendo', cardUrl: 'https://trello.com/c/mock1' },
] as unknown as TarefaTrello[];

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <ProductModeProvider>
                <Header
                    currentView="dashboard"
                    onNavigate={view => console.log('navigate', view)}
                    searchQuery=""
                    setSearchQuery={() => {}}
                    crmAlerts={mockCrmAlerts}
                    trelloTasks={mockTrelloTasks}
                />
            </ProductModeProvider>
        </AuthProvider>
    </StrictMode>,
);
