/**
 * Entrada isolada para conferir a aba Pedidos sem passar pelo login.
 *
 * O app real exige OAuth antes de chegar no detalhe do parceiro, então esta página
 * monta só a seção, com um parceiro falso apontando para um ESTAB_ID real. Os dados
 * vêm da Function `pedido-relatorio` (banco de verdade, servida pelo
 * dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-pedidos.html
 * (troque o parceiro pela query ?estabId=).
 *
 * Parceiros úteis pra conferir os estados:
 *   23404 Bulky's Burger  → maior volume da base (2.1k pedidos em 60 dias)
 *   25166                 → o que mais sofre com o índice (ver FORCE INDEX na function)
 *   18171                 → campeão de vendas é cópia de campanha
 *   785                   → top de vendas com itens já inativados
 *   999999                → parceiro inexistente (estado vazio)
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerPedidosSection from './components/PartnerPedidosSection';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '23404';
const nome = params.get('nome') ?? "Bulky's Burger";

const partner = {
    estab_id: estabId,
    estabelecimento: nome,
    cidade: 'Carandaí',
    status: 'ativo',
} as unknown as EnrichedPerformanceRow;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6 md:p-10">
            <div className="max-w-6xl mx-auto">
                <p className="text-xs uppercase tracking-tight font-bold text-slate-400 mb-4">
                    preview · estabId {estabId} · {nome}
                </p>
                <PartnerPedidosSection partner={partner} />
            </div>
        </div>
    </StrictMode>,
);
