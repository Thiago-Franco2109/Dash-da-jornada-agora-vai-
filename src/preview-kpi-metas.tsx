/**
 * Entrada isolada para conferir os três KPIs do cabeçalho da Jornada coloridos
 * contra a meta, sem login.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-kpi-metas.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import JornadaKpiMetas from './components/JornadaKpiMetas';
import './index.css';

/** Cenários: o do print, um que bate tudo e um que não bate nada. */
const CENARIOS = [
  { nome: 'Print real — 1 a 7 dias, gestor Thiago (5 parceiros)', total: 5, pedidos: 4, promocao: 3, cupom: 1 },
  { nome: 'Tudo na meta', total: 10, pedidos: 10, promocao: 9, cupom: 7 },
  { nome: 'Tudo no vermelho', total: 10, pedidos: 5, promocao: 3, cupom: 1 },
  { nome: 'Tela vazia', total: 0, pedidos: 0, promocao: 0, cupom: 0 },
  // O "+N" da marcação do CS: o percentual NÃO sobe com ele de propósito —
  // aquele número tem meta e é medido no banco (ver JornadaKpiMetas).
  { nome: 'Com 2 marcadas como "Promo ativa" esperando o banco', total: 10, pedidos: 9, promocao: 5, cupom: 6, marcados: 2 },
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-10 space-y-8 bg-white dark:bg-slate-900 min-h-screen">
      {CENARIOS.map(c => (
        <div key={c.nome} className="space-y-2">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.nome}</p>
          <div className="flex">
            <JornadaKpiMetas total={c.total} pedidosCount={c.pedidos} promocaoCount={c.promocao} cupomCount={c.cupom} promocaoMarcadoCount={(c as { marcados?: number }).marcados ?? 0} />
          </div>
        </div>
      ))}
    </div>
  </StrictMode>
);
