/**
 * Entrada isolada para conferir o painel de aderência da lista sem passar pelo
 * login. O app real exige OAuth antes de chegar na tela de Churn, então aqui a
 * seção é montada sozinha, com parceiros falsos apontando para ESTAB_IDs reais
 * — os horários e recessos vêm da Function `funcionamento` em modo lote
 * (servida pelo dbFunctionsDevPlugin do vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-aderencia.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AderenciaHorarioPanel from './components/AderenciaHorarioPanel';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

const PARCEIROS: [string, string, string][] = [
    ['26896', "Nai's Donuts", 'Carandaí'],
    ['27651', 'Kitutes da Day', 'Barbacena'],
    ['15224', 'Pizza Lume', 'São João del-Rei'],
    ['28052', 'Açaí Vó Nicinha', 'Barbacena'],
    ['28542', 'Dá Gosto Açaí', 'Barbacena'],
    ['27323', 'T S - Sobremesas & Açaiteria', 'Barbacena'],
    ['27689', 'Delicias da Lalá', 'Barbacena'],
    ['22393', 'Madruga Lanches', 'São João del-Rei'],
    ['28458', 'Pizzas do W', 'Barbacena'],
    ['27315', 'Adocei Açaí', 'Barbacena'],
    ['26631', 'Primuz Food', 'Barbacena'],
    ['26172', 'Lanchonete da Pequena', 'Barbacena'],
    ['26537', 'Quintal Bamboa', 'Barbacena'],
    ['28480', 'Matriz Oriental', 'Barbacena'],
    ['18401', 'Cap Jack Pizzeria', 'São João del-Rei'],
    ['24980', 'Stardonuts', 'Barbacena'],
    ['25010', 'Oba!Donuts', 'Barbacena'],
    ['25963', 'Ju Donuts', 'Barbacena'],
];

const rows = PARCEIROS.map(([estab_id, estabelecimento, cidade]) => ({
    estab_id,
    estabelecimento,
    cidade,
    status: 'ativo',
})) as unknown as EnrichedPerformanceRow[];

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
            <div className="max-w-5xl mx-auto">
                <AderenciaHorarioPanel
                    rows={rows}
                    onRowClick={row => console.log('abriria o parceiro', row.estabelecimento)}
                />
            </div>
        </div>
    </StrictMode>,
);
