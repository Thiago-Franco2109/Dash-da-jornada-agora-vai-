/**
 * Entrada isolada para conferir a aba Indicador sem login.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-indicador.html
 * (`?offline=1` força o fallback sem a Function crm-gmv, usando a série
 * `gmvMensal` dos parceiros mockados.)
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import IndicadorView from './components/IndicadorView';
import type { CrmPartner } from './types/crm';
import './index.css';

const OFFLINE = new URLSearchParams(window.location.search).get('offline') === '1';

const MESES = ['dez./25', 'jan./26', 'fev./26', 'mar./26', 'abr./26', 'mai./26', 'jun./26', 'jul./26', 'ago./26', 'set./26', 'out./26', 'nov./26'];

function campanha(resumo: string) {
    return { status: 'aguardando' as const, resumo, itemCount: 0, hasActive: false };
}

/** Os mesmos parceiros do print da planilha, com GMV plausível mês a mês. */
function parceiro(
    cidade: string,
    estabId: string,
    nome: string,
    contrato: string,
    cupom: string,
    base: number,
): CrmPartner {
    const gmvMensal = MESES.map((label, i) => ({
        label,
        // variação determinística: serve para olhar formatação e ordenação
        value: Math.round((base * (0.6 + ((i * 7919) % 100) / 125)) * 100) / 100,
    }));
    // uma loja negativa para conferir o vermelho (estorno maior que o faturado)
    if (estabId === '27748') gmvMensal[gmvMensal.length - 1] = { label: MESES[MESES.length - 1], value: -383 };
    if (estabId === '27153') gmvMensal.forEach((m, i) => { if (i < 10) m.value = 0; });

    return {
        partnerId: estabId,
        cidade,
        estabId,
        estabelecimento: nome,
        statusParceiro: contrato,
        indiceGmv: gmvMensal[gmvMensal.length - 1].value,
        indiceGmvRaw: '',
        gmvMesLabel: MESES[MESES.length - 1],
        gmvMensal,
        campaigns: {
            ofertas_da_casa: campanha('—'),
            super_promos: campanha('—'),
            cupons_destaque: campanha(cupom),
        },
        campaignStatuses: { ofertas_da_casa: 'aguardando', super_promos: 'aguardando', cupons_destaque: 'aguardando' },
        promoResumo: '—',
        cupomResumo: cupom,
        promoItensAtivos: 0,
        cupomCount: 0,
        promoStatus: 'aguardando',
        cupomStatus: 'aguardando',
        hasPromoAtiva: false,
        hasCupomAtivo: false,
    } as CrmPartner;
}

const partners: CrmPartner[] = [
    parceiro('Além Paraíba', '18171', 'Nathália Lanches', 'ativo', 'APROV: 1', 18205),
    parceiro('Além Paraíba', '21802', '44 Vila Bar', 'ativo', '—', 6452),
    parceiro('Além Paraíba', '21432', 'Mega Lanches És', 'ativo', '—', 5421),
    parceiro('Além Paraíba', '18167', 'Covil - Hamburgueria', 'ativo', '—', 3839),
    parceiro('Além Paraíba', '16656', 'Carvalho Lanches', 'ativo', 'APROV: 8', 8370),
    parceiro('Além Paraíba', '27153', 'Adega Rubí', 'ativo', '—', 120),
    parceiro('Além Paraíba', '27748', 'Açaí do Carlos', 'ativo', '—', 909),
    parceiro('Além Paraíba', '19385', 'Hot-Dog Rustter', 'cancelado', '—', 450),
    parceiro('Muriaé', '24101', 'Açaí du Filipi', 'ativo', 'APROV: 2', 2310),
    parceiro('Bicas', '23877', 'Açaí Point', 'ativo', '—', 4120),
    parceiro('Santos Dumont', '25512', 'Honori Almoço e Jantar', 'ativo', 'APROV: 1', 7740),
    parceiro('Espera Feliz', '26113', 'Luigi Sorvetes', 'suspenso', '—', 1980),
];

/** `?stress=1` repete os mocks até 1.480 linhas — o tamanho real da carteira. */
const STRESS = new URLSearchParams(window.location.search).get('stress') === '1';
const lista: CrmPartner[] = STRESS
    ? Array.from({ length: 1480 }, (_, i) => {
        const base = partners[i % partners.length];
        return { ...base, partnerId: `s${i}`, estabId: String(90000 + i), estabelecimento: `${base.estabelecimento} ${i}` };
    })
    : partners;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="flex h-screen flex-col bg-white dark:bg-slate-900">
            <IndicadorView
                partners={OFFLINE ? lista.map(p => ({ ...p })) : lista}
                isLoading={false}
                error={null}
                isUsingCache={false}
                lastSyncTime={new Date()}
                onRefresh={() => console.log('refresh')}
                onPartnerClick={(id) => console.log('abrir parceiro', id)}
            />
        </div>
    </StrictMode>,
);
