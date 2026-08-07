/**
 * Entrada isolada só para desenvolver o visual do seletor de perfil.
 *
 * O app real exige login OAuth antes de chegar nessa tela, então esta página
 * monta o componente sozinho com props falsas. Rode `npm run dev` e abra
 * http://localhost:5173/preview-picker.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerPickerModal from './components/ManagerPickerModal';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ManagerPickerModal
            onSelect={manager => console.log('[preview] perfil escolhido:', manager)}
            onSignOut={() => console.log('[preview] sair da conta')}
            accountEmail="claude@bigou.app"
        />
    </StrictMode>
);
