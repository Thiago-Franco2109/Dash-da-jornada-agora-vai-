/**
 * Entrada isolada para conferir o Raio-x do parceiro sem passar pelo login.
 *
 * O raio-x em si vem da Function `parceiro-raio-x` (banco de verdade, servida
 * pelo dbFunctionsDevPlugin do vite.config.ts). O que NÃO dá para trazer aqui
 * é o acesso do GA: ele chega pela planilha, que exige sessão no Gateway. Por
 * isso os acessos abaixo são FIXOS — números reais medidos no GA4 em
 * 18/10–16/11/2026 (evento `access_store`, usuários únicos por
 * `estabelecimento_id`, localidade Muriaé). Servem para conferir o layout e a
 * lógica do funil; no app de verdade quem manda é a planilha.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-raio-x.html
 * (troque o parceiro pela query ?estabId=).
 *
 * Parceiros úteis pra conferir os estados:
 *   28664 Açaí du Filipi   → cardápio raso + preço acima, 0 pedidos
 *   28542 Dá Gosto Açaí    → preço 61% acima no 300ml
 *   26325 Açaí D'Jes       → líder do segmento, nada fora da curva
 *   19892 Paulu's Burger   → segmento grande (55 lojas), sem acesso mockado
 *   999999                 → parceiro inexistente (estado de erro)
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerRaioXSection from './components/PartnerRaioXSection';
import { useParceiroRaioX } from './hooks/useParceiroRaioX';
import type { StoreAccessData } from './hooks/useDailyAccessSync';
import './index.css';

const params = new URLSearchParams(window.location.search);
const estabId = params.get('estabId') ?? '28664';
const preLancamento = params.get('preLancamento') === '1';

/** Usuários únicos em `access_store` por loja, 30 dias, Muriaé (GA4, medido). */
const ACESSOS_MURIAE: Record<number, number> = {
    26325: 643, 24776: 429, 28644: 417, 19358: 401, 28542: 378, 19432: 273,
    28535: 190, 26906: 173, 23177: 164, 20753: 152, 27611: 117, 26279: 107,
    23641: 97, 25614: 60, 28664: 55, 28509: 45, 28092: 44, 21978: 42,
    24802: 33, 28197: 16, 23769: 13, 26456: 8, 25424: 7,
};
const DIAS_ACESSO = 30;

const accessData: Record<string, StoreAccessData> = Object.fromEntries(
    Object.entries(ACESSOS_MURIAE).map(([id, acessos]) => [
        `id:${id}`,
        {
            estabelecimento: '',
            estabId: id,
            acessosUnicos: acessos,
            mediaDiaria: Math.round(acessos / DIAS_ACESSO),
            ultimoDia: '2026-11-17',
            totalDias: DIAS_ACESSO,
            raw: {},
        },
    ]),
);

function PreviewRaioX() {
    const { data, loading, error } = useParceiroRaioX(estabId);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6 md:p-10">
            <div className="max-w-4xl mx-auto">
                <p className="text-xs uppercase tracking-tight font-bold text-slate-400 mb-4">
                    preview · estabId {estabId}{preLancamento && ' · pré-lançamento'} · acessos fixos do GA
                </p>
                <PartnerRaioXSection
                    raioX={data}
                    loading={loading}
                    error={error}
                    accessData={accessData}
                    diasAcesso={DIAS_ACESSO}
                    preLancamento={preLancamento}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewRaioX />
    </StrictMode>,
);
