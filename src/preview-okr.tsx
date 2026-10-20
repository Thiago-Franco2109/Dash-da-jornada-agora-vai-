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
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OkrView from './components/OkrView';
import type { EnrichedPerformanceRow } from './utils/calculations';
import { AuthProvider } from './context/AuthContext';
import './index.css';

/**
 * O clique na loja abre a ficha no app real. Aqui ele só mostra qual linha
 * chegou — é o que prova que `estab_id` é o ID numérico do banco, e não o
 * campo da planilha (que vem vazio em algumas lojas e já causou `?estabId=NaN`
 * e 400 nas functions da ficha).
 */
export function PreviewOkr() {
    const [clicado, setClicado] = useState<EnrichedPerformanceRow | null>(null);
    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
            {clicado && (
                <p className="shrink-0 px-4 py-2 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800/40">
                    abriria a ficha de <strong>{clicado.estabelecimento}</strong> · estab_id{' '}
                    <code>{String(clicado.estab_id)}</code>{' '}
                    {/^\d+$/.test(String(clicado.estab_id ?? '')) ? '✅ numérico' : '❌ inválido'}
                </p>
            )}
            <div className="flex-1 min-h-0 flex">
                <OkrView onAbrirParceiro={setClicado} />
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* AuthProvider porque a tela registra QUEM tirou a loja da conta.
            Sem sessão aqui, o autor fica em branco — e o Supabase roda em modo
            mock no dev (ver src/lib/supabase.ts), então excluir não persiste. */}
        <AuthProvider>
            <PreviewOkr />
        </AuthProvider>
    </StrictMode>,
);
