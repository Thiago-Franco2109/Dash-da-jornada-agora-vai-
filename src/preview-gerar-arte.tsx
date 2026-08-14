/**
 * Entrada isolada para conferir o GerarArteModal (Geração Avulsa automática),
 * sem passar pelo login. Usa a Function REAL `promo-item-arte` (banco de
 * teste) com um estabelecimento real conhecido por ter promoção vigente.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-gerar-arte.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import GerarArteModal from './components/GerarArteModal';
import './index.css';

export function PreviewGerarArte() {
    const [open, setOpen] = useState(true);
    return (
        <div className="h-screen flex items-center justify-center bg-slate-100">
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                >
                    Abrir Gerar Arte
                </button>
            )}
            {open && (
                <GerarArteModal
                    estabelecimentoId={28136}
                    partnerName="#Salvou"
                    logoUrl="https://labcinco.nyc3.cdn.digitaloceanspaces.com/bigou/item/045f8034-bbe9-42db-b03b-108229d294b8.jpg"
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewGerarArte />
    </StrictMode>,
);
