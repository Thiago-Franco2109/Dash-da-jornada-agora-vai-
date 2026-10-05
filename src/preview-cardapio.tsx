/**
 * Entrada isolada para conferir a Análise do Cardápio sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar no detalhe do parceiro, então esta página
 * monta só a seção. Os dados vêm das Functions `cardapio-analise` e `parceiro-acesso`
 * (banco de verdade, servidas pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-cardapio.html
 * (troque o parceiro pela query ?estabId=).
 *
 * Parceiros úteis pra conferir os estados:
 *   26171 Tempero da Roça  → 69% sem foto, 3 promoções furadas (todas sem foto)
 *   23404 Bulky's Burger   → nenhuma promoção no ar, campeão com 645 vendas
 *   16611 Betinho Lanches  → acessa 97% por computador
 *   999999                 → parceiro inexistente (estado vazio)
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerCardapioSection from './components/PartnerCardapioSection';
import { useCardapioAnalise } from './hooks/useCardapioAnalise';
import { useParceiroAcesso } from './hooks/useParceiroAcesso';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '26171';

function PreviewCardapio() {
    const { data, loading, error } = useCardapioAnalise(estabId);
    const { data: acesso } = useParceiroAcesso(estabId);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6 md:p-10">
            <div className="max-w-5xl mx-auto">
                <p className="text-xs uppercase tracking-tight font-bold text-slate-400 mb-4">
                    preview · estabId {estabId}
                </p>
                <PartnerCardapioSection
                    analise={data}
                    acesso={acesso}
                    loading={loading}
                    error={error}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewCardapio />
    </StrictMode>,
);
