/**
 * Entrada isolada só para desenvolver o visual da entrada no painel.
 *
 * O app real exige login OAuth antes de chegar nessas telas, então esta
 * página monta os componentes sozinha com dados falsos. Rode `npm run dev`
 * e abra http://localhost:5173/preview-picker.html
 *
 * Reproduz o fluxo real: a home fica atrás e o seletor por cima, para dar
 * para ver a transição de saída revelando a saudação.
 *
 * A home do CEO não aparece aqui porque depende da função `cs-kpis`, que
 * exige autenticação — ela só pode ser verificada dentro do app.
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerPickerModal from './components/ManagerPickerModal';
import { HomeGreeting } from './components/HomeView';
import AnalystHome from './components/home/AnalystHome';
import { getProfileInfo } from './config/profiles';
import type { SessionProfile } from './config/managerSession';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

/** Parceiros falsos cobrindo cada regra da pauta do dia e o pior caso da tabela. */
const MOCK_ROWS = [
    { estabelecimento: 'Açaí do Bom', cidade: 'Ubá', dias: 7, pedidos: 4, esperados: 7, stars: 3 },
    { estabelecimento: 'Pizzaria Napolitana', cidade: 'Muriaé', dias: 26, pedidos: 9, esperados: 26, stars: 5 },
    { estabelecimento: 'Doceria Sonhos', cidade: 'Cordeiro', dias: 4, pedidos: 1, esperados: 4, stars: 4 },
    { estabelecimento: 'Marmitas Fit', cidade: 'Bicas', dias: 21, pedidos: 25, esperados: 21, stars: 1 },
    { estabelecimento: 'Sushi Yama', cidade: 'Carandaí', dias: 14, pedidos: 8, esperados: 14, stars: 4 },
    { estabelecimento: 'Padaria Pão Quente', cidade: 'Barroso', dias: 12, pedidos: 11, esperados: 12, stars: 2 },
].map(m => ({
    cidade: m.cidade,
    estabelecimento: m.estabelecimento,
    status: 'ativo',
    lancamento: '',
    desempenho: '',
    week_1: 0, week_2: 0, week_3: 0, week_4: 0,
    analista: 'THIAGO',
    dias_desde_lancamento: m.dias,
    total_pedidos: m.pedidos,
    pedidos_esperados: m.esperados,
    indice_desempenho: m.pedidos / m.esperados,
    city_weight: 1,
    priority_stars: m.stars,
    isFinished: false,
})) as unknown as EnrichedPerformanceRow[];

/** `?vazio` na URL mostra a home sem nenhum parceiro na carteira. */
const EMPTY = new URLSearchParams(window.location.search).has('vazio');

export function Preview() {
    const [profile, setProfile] = useState<SessionProfile | ''>('');
    const [showPicker, setShowPicker] = useState(true);

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
            <HomeGreeting info={getProfileInfo(profile)} fallbackName="visitante">
                <AnalystHome
                    rows={EMPTY ? [] : MOCK_ROWS}
                    onPartnerClick={row => console.log('[preview] abrir parceiro:', row.estabelecimento)}
                    onNavigate={view => console.log('[preview] navegar para:', view)}
                />
            </HomeGreeting>

            <button
                type="button"
                onClick={() => { setProfile(''); setShowPicker(true); }}
                className="fixed bottom-4 right-4 z-[200] rounded-lg bg-slate-900 text-white text-xs font-bold px-4 py-2 shadow-lg"
            >
                repetir transição
            </button>

            {showPicker && (
                <ManagerPickerModal
                    onSelect={setProfile}
                    onExited={() => setShowPicker(false)}
                    onSignOut={() => console.log('[preview] sair da conta')}
                    accountEmail="claude@bigou.app"
                />
            )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Preview />
    </StrictMode>
);
