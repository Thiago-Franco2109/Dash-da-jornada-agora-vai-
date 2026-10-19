/**
 * Entrada isolada para conferir a seção "Por que caiu?" sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar na ficha do parceiro, então esta
 * página monta só a seção, com um parceiro falso apontando para um ESTAB_ID
 * real. Os dados vêm da Function `parceiro-diagnostico` (banco de verdade,
 * servida pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-diagnostico.html
 * (troque a loja pela query ?estabId=).
 *
 * Casos bons para conferir, todos reais:
 *   ?estabId=27468  40 Graus — recesso de 31 dias por falecimento do dono
 *   ?estabId=26810  Blends Burger — 100% de cancelamento, recesso automático
 *   ?estabId=28481  X Tudão — 50 recessos, mexeu em horário e entrega
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerDiagnosticoSection from './components/PartnerDiagnosticoSection';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '28481';
const nome = params.get('nome') ?? 'X Tudão Burguer';

const partner = {
    estab_id: estabId,
    estabelecimento: nome,
    cidade: 'Bom Jesus',
    status: 'ativo',
} as unknown as EnrichedPerformanceRow;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-white dark:bg-slate-900 p-8">
            <PartnerDiagnosticoSection partner={partner} />
        </div>
    </StrictMode>,
);
