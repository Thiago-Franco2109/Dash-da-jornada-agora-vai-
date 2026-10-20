/**
 * Entrada isolada para conferir a aba Histórico sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar no detalhe do parceiro, então esta
 * página monta só a seção, com um parceiro falso apontando para um ESTAB_ID
 * real. Os dados vêm da Function `parceiro-historico` (banco de verdade,
 * servida pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-historico.html
 * (troque a loja pela query ?estabId= e a janela pela ?meses=).
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerHistoricoSection from './components/PartnerHistoricoSection';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '26807';
const nome = params.get('nome') ?? 'Calx Hamburgueria e Comida de Boteco';
const meses = Number(params.get('meses')) || 12;

const partner = {
    estab_id: estabId,
    estabelecimento: nome,
    cidade: 'Barroso',
    status: 'ativo',
} as unknown as EnrichedPerformanceRow;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-white dark:bg-slate-900 p-8">
            <PartnerHistoricoSection partner={partner} mesesIniciais={meses} />
        </div>
    </StrictMode>,
);
