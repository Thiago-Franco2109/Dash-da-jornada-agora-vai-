/**
 * Entrada isolada para conferir o Kanban/Lista do CRM (estilo Pipedrive) com dados
 * mockados, sem precisar de login nem do banco.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-crm-board.html
 * Não entra no build de produção.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CrmKanbanBoard from './components/crm/CrmKanbanBoard';
import CrmListView from './components/crm/CrmListView';
import type { CrmPartner, CrmPartnerNote } from './types/crm';
import type { PromoStatus } from './hooks/useStatusOverride';
import './index.css';

function mockPartner(partial: Partial<CrmPartner> & { partnerId: string; estabelecimento: string }): CrmPartner {
    const status: PromoStatus = (partial.promoStatus as PromoStatus) ?? 'aguardando';
    return {
        cidade: 'São Paulo',
        estabId: partial.partnerId,
        statusParceiro: 'ativo',
        indiceGmv: 22000,
        indiceGmvRaw: 'R$ 22.000',
        gmvMesLabel: 'ago/26',
        campaigns: {
            super_promos: { status, resumo: '—', itemCount: 0, hasActive: status === 'ativo' },
            ofertas_da_casa: { status, resumo: '—', itemCount: 0, hasActive: status === 'ativo' },
            cupons_destaque: { status, resumo: '—', itemCount: 0, hasActive: status === 'ativo' },
        },
        promoResumo: '—',
        cupomResumo: '—',
        promoItensAtivos: 0,
        cupomCount: 0,
        promoStatus: status,
        cupomStatus: status,
        hasPromoAtiva: status === 'ativo',
        hasCupomAtivo: status === 'ativo',
        campaignStatuses: {} as CrmPartner['campaignStatuses'],
        analista: 'Thiago Franco',
        ...partial,
    };
}

const PARTNERS: CrmPartner[] = [
    mockPartner({ partnerId: '1', estabelecimento: '[Amostra] Tony Turner', cidade: 'São Paulo', indiceGmv: 30000, indiceGmvRaw: 'R$ 30.000', promoStatus: 'aguardando' }),
    mockPartner({ partnerId: '2', estabelecimento: '[Amostra] iTable', cidade: 'Campinas', indiceGmv: 7000, indiceGmvRaw: 'R$ 7.000', promoStatus: 'ofertei' }),
    mockPartner({ partnerId: '3', estabelecimento: '[Amostra] Damone', cidade: 'Santos', indiceGmv: 15000, indiceGmvRaw: 'R$ 15.000', promoStatus: 'ofertei' }),
    mockPartner({ partnerId: '4', estabelecimento: '[Amostra] Phyllis & Cie', cidade: 'São Paulo', indiceGmv: 16000, indiceGmvRaw: 'R$ 16.000', promoStatus: 'negado' }),
    mockPartner({ partnerId: '5', estabelecimento: '[Amostra] SoRock', cidade: 'Osasco', indiceGmv: 31000, indiceGmvRaw: 'R$ 31.000', promoStatus: 'ativo' }),
    mockPartner({ partnerId: '6', estabelecimento: '[Amostra] Lorean', cidade: 'Guarulhos', indiceGmv: 22000, indiceGmvRaw: 'R$ 22.000', promoStatus: 'ativo' }),
];

const NOTES: Record<string, CrmPartnerNote> = {
    '2': { partnerId: '2', notes: 'Aguardando retorno do dono.', lastContact: '2026-08-20', nextFollowUp: '2026-08-24', updatedAt: '2026-08-20' },
    '5': { partnerId: '5', notes: '', lastContact: null, nextFollowUp: '2026-08-20', updatedAt: '2026-08-18' },
};

export function PreviewCrmBoard() {
    const [view, setView] = useState<'kanban' | 'list'>('kanban');
    const [localStatus, setLocalStatus] = useState<Record<string, PromoStatus>>({});

    const getNote = (id: string) => NOTES[id];
    const onPartnerStatusChange = (partnerId: string, newStatus: PromoStatus) =>
        setLocalStatus(prev => ({ ...prev, [partnerId]: newStatus }));

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => setView('kanban')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === 'kanban' ? 'bg-primary text-white' : 'bg-white border border-slate-200'}`}>Kanban</button>
                <button type="button" onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === 'list' ? 'bg-primary text-white' : 'bg-white border border-slate-200'}`}>Lista</button>
            </div>

            {view === 'kanban' ? (
                <CrmKanbanBoard
                    partners={PARTNERS}
                    localStatus={localStatus}
                    getNote={getNote}
                    onPartnerStatusChange={onPartnerStatusChange}
                    onEditPartner={id => console.log('editar', id)}
                    onRegisterContact={id => console.log('contato', id)}
                />
            ) : (
                <CrmListView
                    partners={PARTNERS}
                    localStatus={localStatus}
                    getNote={getNote}
                    onPartnerStatusChange={onPartnerStatusChange}
                    onEditPartner={id => console.log('editar', id)}
                    onRegisterContact={id => console.log('contato', id)}
                />
            )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewCrmBoard />
    </StrictMode>,
);
