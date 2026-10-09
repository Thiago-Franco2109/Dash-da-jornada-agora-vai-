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
import { AuthProvider } from './context/AuthContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* AuthProvider porque a tela registra QUEM tirou a loja da conta.
            Sem sessão aqui, o autor fica em branco — e o Supabase roda em modo
            mock no dev (ver src/lib/supabase.ts), então excluir não persiste. */}
        <AuthProvider>
            <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
                <OkrView />
            </div>
        </AuthProvider>
    </StrictMode>,
);
