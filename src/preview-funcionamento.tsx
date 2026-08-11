/**
 * Entrada isolada para conferir a aba Funcionamento sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar no detalhe do parceiro, então esta
 * página monta só a seção, com um parceiro falso apontando para um ESTAB_ID
 * real. Os dados vêm da Function `funcionamento` (banco de verdade, servida
 * pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-funcionamento.html
 * (troque o ESTAB_ID pela query ?estabId=).
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerFuncionamentoSection from './components/PartnerFuncionamentoSection';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '28442';
const nome = params.get('nome') ?? 'Blend & Pão Delivery';

const partner = {
    estab_id: estabId,
    estabelecimento: nome,
    cidade: 'Carandaí',
    status: 'ativo',
} as unknown as EnrichedPerformanceRow;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-white dark:bg-slate-900 p-8">
            <PartnerFuncionamentoSection partner={partner} />
        </div>
    </StrictMode>,
);
