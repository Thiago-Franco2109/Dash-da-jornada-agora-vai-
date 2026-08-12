/**
 * Entrada isolada para conferir a tela de Gestores sem login.
 *
 * O Supabase roda em modo mock aqui (sem VITE_SUPABASE_URL no .env), então a
 * atribuição não persiste — dá para ver a lista, as contagens e a interação,
 * não a gravação. Os parceiros vêm do banco de verdade (Function `jornada`).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-gestores.html
 * (?fonte=cd para o Cardápio Digital).
 *
 * Não entra no build de produção.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ManagersView from './components/ManagersView';
import { fetchJornadaMarketplace, fetchCdDesempenho } from './utils/jornadaFromDb';
import { enrichPartnerData, type EnrichedPerformanceRow } from './utils/calculations';
import { useAtribuicaoCs } from './hooks/useAtribuicaoCs';
import { ProductModeProvider } from './context/ProductModeContext';
import './index.css';

export function PreviewGestores() {
    const [linhas, setLinhas] = useState<EnrichedPerformanceRow[]>([]);
    const { atribuicoes, salvarCidade, salvarParceiro } = useAtribuicaoCs();
    const fonte = new URLSearchParams(window.location.search).get('fonte') ?? 'marketplace';

    useEffect(() => {
        const buscar = fonte === 'cd' ? fetchCdDesempenho : fetchJornadaMarketplace;
        buscar().then(rows => setLinhas(rows.map(r => enrichPartnerData(r)))).catch(console.error);
    }, [fonte]);

    return (
        <ManagersView
            data={linhas}
            onMappingChange={() => {}}
            atribuicoes={atribuicoes}
            salvarCidade={salvarCidade}
            salvarParceiro={salvarParceiro}
        />
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ProductModeProvider>
            <PreviewGestores />
        </ProductModeProvider>
    </StrictMode>,
);
