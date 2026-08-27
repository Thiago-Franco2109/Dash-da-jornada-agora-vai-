/**
 * Entrada isolada para conferir o botão "Gerar Arte" dentro de
 * PartnerPromoCrmSection (aba Promoções da página do parceiro), sem login.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-promo-crm.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerPromoCrmSection from './components/PartnerPromoCrmSection';
import type { EnrichedPerformanceRow } from './utils/calculations';
import type { CrmPartner } from './types/crm';
import './index.css';

const mockPartner = {
    cidade: 'Além Paraíba',
    estabelecimento: '#Salvou',
    estab_id: '28136',
    status: 'ativo',
    lancamento: '2024-01-01',
    desempenho: 'bom',
    week_1: 10, week_2: 12, week_3: 15, week_4: 14,
    logo_url: 'https://labcinco.nyc3.cdn.digitaloceanspaces.com/bigou/item/045f8034-bbe9-42db-b03b-108229d294b8.jpg',
    promo_campanhas: ['Super Promos!'],
    dias_desde_lancamento: 200,
    total_pedidos: 51,
    pedidos_esperados: 40,
    indice_desempenho: 1.2,
    city_weight: 1,
    priority_stars: 3,
} as unknown as EnrichedPerformanceRow;

const mockCrmPartner = {
    partnerId: '28136',
    campaigns: {
        super_promos: { status: 'ofertei', resumo: '1 item na PROMO-ESPECIAL', itemCount: 1, hasActive: false },
        ofertas_da_casa: { status: 'aguardando', resumo: '—', itemCount: 0, hasActive: false },
        cupons_destaque: { status: 'aguardando', resumo: '—', itemCount: 0, hasActive: false },
    },
} as unknown as CrmPartner;

export function PreviewPromoCrm() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
            <PartnerPromoCrmSection
                partner={mockPartner}
                crmPartner={mockCrmPartner}
                promoUrl="https://admin.bigou.com.br/campanha/promocao/cadastro/26?localidade_id=1"
                ofertasDaCasaUrl="https://admin.bigou.com.br/campanha/promocao/cadastro/31?localidade_id=1"
                cupomUrl="https://admin.bigou.com.br/estabelecimento/cadastro/28136/cupons"
                localidadeId="1"
                onStatusChange={(id, field, status) => console.log('onStatusChange', id, field, status)}
                onCampaignStatusChange={(id, campaign, status) => console.log('onCampaignStatusChange', id, campaign, status)}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewPromoCrm />
    </StrictMode>,
);
