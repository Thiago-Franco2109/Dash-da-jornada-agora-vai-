/**
 * Entrada isolada para conferir a coluna Cupons da PerformanceTable (fluxo
 * Confirmado → Ativo), sem precisar de login nem do banco.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-performance-table.html
 * Não entra no build de produção.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PerformanceTable, { type CampaignStatusChangeHandler } from './components/PerformanceTable';
import type { EnrichedPerformanceRow } from './utils/calculations';
import type { PromoStatus } from './hooks/useStatusOverride';
import './index.css';

function mockRow(partial: Partial<EnrichedPerformanceRow> & { estabelecimento: string; estab_id: string; cupomStatus: PromoStatus }): EnrichedPerformanceRow {
    return {
        cidade: 'São Paulo',
        status: 'ativo',
        lancamento: '2026-01-01',
        desempenho: 'bom',
        week_1: 10, week_2: 10, week_3: 10, week_4: 10,
        dias_desde_lancamento: 60,
        total_pedidos: 40,
        pedidos_esperados: 40,
        indice_desempenho: 1,
        city_weight: 1,
        priority_stars: 3,
        campaign_statuses: { cupons_destaque: partial.cupomStatus, super_promos: 'aguardando' },
        cupom_status: partial.cupomStatus,
        promo_status: 'aguardando',
        ...partial,
    } as unknown as EnrichedPerformanceRow;
}

const INITIAL_ROWS: EnrichedPerformanceRow[] = [
    mockRow({ estabelecimento: 'Cantinho do Hot Dog', estab_id: '1', cupomStatus: 'aguardando' }),
    mockRow({ estabelecimento: 'Cia do Lanche', estab_id: '2', cupomStatus: 'ofertei' }),
    mockRow({ estabelecimento: 'Dôce', estab_id: '3', cupomStatus: 'confirmado' }),
    mockRow({ estabelecimento: 'Fest Food', estab_id: '4', cupomStatus: 'negado' }),
    mockRow({ estabelecimento: 'Império das Massas', estab_id: '5', cupomStatus: 'ativo' }),
    // Pré-lançamento: o CS marca promo e cupom ANTES da abertura, então a linha
    // clica e o dropdown abre igual às outras. Só a origem 'trello' é o caso em
    // que a loja ainda não está na réplica — o estab_id já é o do banco.
    mockRow({
        estabelecimento: 'O Porão', estab_id: '28509', cupomStatus: 'aguardando',
        cidade: 'Natividade', status: 'pendente', lancamento: '',
        dias_desde_lancamento: 0, total_pedidos: 0, pedidos_esperados: 0,
        indice_desempenho: 0, priority_stars: 0,
        pre_lancamento: { origem: 'banco', dias: 7, etapa: '[SC] Envio de senha', diasNaEtapa: 2, cardUrl: 'https://trello.com/c/exemplo' },
    } as never),
    mockRow({
        estabelecimento: 'Mordida Magica', estab_id: '28777', cupomStatus: 'aguardando',
        cidade: '', status: 'pendente', lancamento: '',
        dias_desde_lancamento: 0, total_pedidos: 0, pedidos_esperados: 0,
        indice_desempenho: 0, priority_stars: 0,
        pre_lancamento: { origem: 'trello', dias: null, etapa: 'Cadastro', diasNaEtapa: 0 },
    } as never),
];

export function PreviewPerformanceTable() {
    const [rows, setRows] = useState(INITIAL_ROWS);

    const onCampaignStatusChange: CampaignStatusChangeHandler = (partnerId, campaignId, newStatus) => {
        console.log('onCampaignStatusChange', partnerId, campaignId, newStatus);
        if (campaignId !== 'cupons_destaque') return;
        setRows(prev => prev.map(r =>
            r.estab_id === partnerId
                ? { ...r, cupom_status: newStatus, campaign_statuses: { ...r.campaign_statuses, cupons_destaque: newStatus } }
                : r,
        ));
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
            <p className="text-xs text-slate-500 mb-2">
                "Dôce" começa Confirmado (☑️). Clique no status de qualquer linha pra abrir o menu —
                repare que "Ativo" não aparece mais como opção manual, só Não ofertado / Aguard. retorno / Negado / Confirmado.
                "Império das Massas" já está Ativo (✅✅ done_all) — estado só alcançável pelo sistema.
            </p>
            <PerformanceTable
                data={rows}
                sortConfig={null}
                requestSort={() => {}}
                onRowClick={row => console.log('onRowClick', row.estab_id, row.estabelecimento)}
                onCampaignStatusChange={onCampaignStatusChange}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewPerformanceTable />
    </StrictMode>,
);
