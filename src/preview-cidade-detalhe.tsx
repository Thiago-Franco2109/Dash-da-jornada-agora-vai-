/**
 * Entrada isolada pra conferir o drill-in de cidade sem login.
 *
 * Rode `npm run dev` e abra http://localhost:5210/preview-cidade-detalhe.html
 * (`?cidade=Barroso` troca a cidade; o padrão é Muriaé, a maior.)
 *
 * Os dados são os de verdade: `cidade-detalhe` está no allowlist `DB_FNS` do
 * `vite.config.ts`, então o dev server serve o handler real contra o banco —
 * mesmo caminho do `preview-carteira-grupo`. Por isso aqui não há fixture:
 * dado congelado em arquivo nasce velho e esconde justamente o que a tela
 * existe pra mostrar.
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CidadeDetalheView from './components/CidadeDetalheView';
import './index.css';

const CIDADE = new URLSearchParams(window.location.search).get('cidade') || 'Muriaé';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="h-screen flex bg-white dark:bg-slate-900">
            <CidadeDetalheView
                cidade={CIDADE}
                divisao="THIAGO"
                onVoltar={() => console.log('voltar')}
                onNavigateToPartner={e => console.log('abrir parceiro', e)}
            />
        </div>
    </StrictMode>,
);
