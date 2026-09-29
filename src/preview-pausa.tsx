/**
 * Entrada isolada para conferir a pausa de onboarding na ficha do parceiro, sem
 * login: botão "Pausar Onboarding", modal de motivo e o estado pausado (chip no
 * cabeçalho, banner âmbar no lugar do alerta vermelho, dias descontados).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-pausa.html
 * (`?pausado=1` começa já pausado há 4 dias).
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerDetailsView from './components/PartnerDetailsView';
import { AuthProvider } from './context/AuthContext';
import { aplicarPausaOnboarding } from './utils/pausaOverlay';
import type { PausaMap } from './config/pausaOnboarding';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

// O Supabase real não tem a tabela até o .sql ser rodado (e o preview não deve
// escrever em produção): responde no lugar dele, guardando a pausa em memória.
const COMECA_PAUSADO = new URLSearchParams(window.location.search).get('pausado') === '1';
const HA_4_DIAS = new Date(Date.now() - 4 * 86400000).toISOString();

let linhaPausa: Record<string, unknown> | null = COMECA_PAUSADO
    ? {
        partner_id: '28136', pausado: true, motivo: 'problema_tecnico',
        observacao: 'Forno quebrou, técnico só vem na quinta.',
        previsao_retorno: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        pausado_em: HA_4_DIAS, pausado_por: 'Laís', retomado_em: null, dias_acumulados: 0,
    }
    : null;

const fetchReal = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input);
    if (url.includes('/rest/v1/onboarding_pausa')) {
        const metodo = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
        if (metodo === 'POST' || metodo === 'PATCH') {
            const corpo = JSON.parse(String(init?.body ?? '{}'));
            linhaPausa = Array.isArray(corpo) ? corpo[0] : corpo;
            console.log('[preview] gravaria no Supabase:', linhaPausa);
            return Promise.resolve(new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response(JSON.stringify(linhaPausa ? [linhaPausa] : []), {
            headers: { 'Content-Type': 'application/json' },
        }));
    }
    return fetchReal(input, init);
}) as typeof window.fetch;

/** Mesmo caso do print: lançado há 10 dias, zero pedido, prioridade 5. */
const lancamento = (() => {
    const d = new Date(Date.now() - 10 * 86400000);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
})();

const base = {
    cidade: 'Ubá',
    estabelecimento: 'VS Forninho Baiano',
    estab_id: '28136',
    status: 'ativo',
    lancamento,
    desempenho: '',
    week_1: 0, week_2: 0, week_3: 0, week_4: 0,
    dias_desde_lancamento: 10,
    total_pedidos: 0,
    pedidos_esperados: 11,
    indice_desempenho: 0,
    city_weight: 5,
    priority_stars: 5,
    isFinished: false,
    contacts: { w1: false, w2: false, w3: false, w4: false },
} as unknown as EnrichedPerformanceRow;

function Preview() {
    const [versao, setVersao] = useState(0);
    // Espelha o App: a linha chega já com a pausa aplicada.
    const mapa: PausaMap = linhaPausa?.pausado
        ? {
            '28136': {
                partnerId: '28136',
                pausado: true,
                motivo: linhaPausa.motivo as never,
                observacao: (linhaPausa.observacao as string) ?? null,
                previsaoRetorno: (linhaPausa.previsao_retorno as string) ?? null,
                pausadoEm: linhaPausa.pausado_em as string,
                pausadoPor: (linhaPausa.pausado_por as string) ?? null,
                retomadoEm: null,
                diasAcumulados: (linhaPausa.dias_acumulados as number) ?? 0,
            },
        }
        : {};
    const partner = aplicarPausaOnboarding(base, mapa);

    return (
        <div className="flex h-screen bg-white dark:bg-slate-900" key={versao}>
            <PartnerDetailsView
                partner={partner}
                onBack={() => console.log('[preview] voltar')}
                onRefresh={() => setVersao(v => v + 1)}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <Preview />
        </AuthProvider>
    </StrictMode>,
);
