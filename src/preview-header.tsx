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
import { CityFocusProvider } from './context/CityFocusContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CityFocusProvider>
            <AuthProvider>
                <ProductModeProvider>
                    <Header
                        currentView="dashboard"
                        onNavigate={view => console.log('navigate', view)}
                        searchQuery=""
                        setSearchQuery={() => {}}
                        notificationCount={2}
                    />
                </ProductModeProvider>
            </AuthProvider>
        </CityFocusProvider>
    </StrictMode>,
);
