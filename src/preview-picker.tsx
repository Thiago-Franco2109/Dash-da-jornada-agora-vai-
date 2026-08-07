/**
 * Entrada isolada só para desenvolver o visual da entrada no painel.
 *
 * O app real exige login OAuth antes de chegar nessas telas, então esta
 * página monta os componentes sozinha com dados falsos. Rode `npm run dev`
 * e abra http://localhost:5173/preview-picker.html
 *
 * Reproduz o fluxo real: a home fica atrás e o seletor por cima, para dar
 * para ver a transição de saída revelando a saudação.
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerPickerModal from './components/ManagerPickerModal';
import { HomeGreeting } from './components/HomeView';
import { getProfileInfo } from './config/profiles';
import type { SessionProfile } from './config/managerSession';
import './index.css';

export function Preview() {
    const [profile, setProfile] = useState<SessionProfile | ''>('');
    const [showPicker, setShowPicker] = useState(true);

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
            <HomeGreeting info={getProfileInfo(profile)} fallbackName="visitante" />

            <button
                type="button"
                onClick={() => { setProfile(''); setShowPicker(true); }}
                className="fixed bottom-4 right-4 z-[200] rounded-lg bg-slate-900 text-white text-xs font-bold px-4 py-2 shadow-lg"
            >
                repetir transição
            </button>

            {showPicker && (
                <ManagerPickerModal
                    onSelect={setProfile}
                    onExited={() => setShowPicker(false)}
                    onSignOut={() => console.log('[preview] sair da conta')}
                    accountEmail="claude@bigou.app"
                />
            )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Preview />
    </StrictMode>
);
