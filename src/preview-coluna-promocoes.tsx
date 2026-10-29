/**
 * Entrada isolada para conferir a NOVA coluna Promoções (trilha + veredito +
 * modal), lado a lado com o desenho antigo, usando DADOS REAIS do banco de
 * teste — o dev server expõe a Function `promo-status` (ver vite.config.ts).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-coluna-promocoes.html
 * Não entra no build de produção.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { usePromoStatus, computePromoResumo, type PromoResumo } from './hooks/usePromoStatus';
import PromoColuna from './components/promo/PromoColuna';
import { ESTADO_META, ORDEM_ESTADOS } from './components/promo/promoEstado';
import './index.css';

/** Os mesmos parceiros da tela "1 a 7 dias" que motivou o redesenho. */
const PARCEIROS = [
    { id: '28623', nome: 'Batata Imperial', cidade: 'Muriaé', loc: '14' },
    { id: '28644', nome: 'Casa do Açaí', cidade: 'Muriaé', loc: '14' },
    { id: '28636', nome: 'Fishy Fresh', cidade: 'Cláudio', loc: '121' },
    { id: '28641', nome: 'Lanches do Batista', cidade: 'Ervália', loc: '91' },
    { id: '25769', nome: 'Lanchonete Sob Nova Direção', cidade: 'Muriaé', loc: '14' },
    { id: '28619', nome: 'Mordida Magica', cidade: 'Cordeiro / Cantagalo', loc: '111' },
    { id: '28633', nome: 'Noite Paulista Adega', cidade: 'Santos Dumont', loc: '23' },
    { id: '28649', nome: 'Pousando no Açaí', cidade: 'Cordeiro / Cantagalo', loc: '111' },
];

/** Reprodução do desenho ANTIGO, só pra comparação visual nesta tela. */
const SLOTS_ANTIGOS = [
    { key: 'pendente', icon: 'pending', tone: 'text-orange-600' },
    { key: 'aprovado', icon: 'check_circle', tone: 'text-emerald-600' },
    { key: 'rascunho', icon: 'edit_note', tone: 'text-slate-500' },
    { key: 'semItem', icon: 'block', tone: 'text-red-500' },
] as const;

function ColunaAntiga({ r }: { r: PromoResumo }) {
    if (!r.pendente && !r.aprovado && !r.rascunho && !r.semItem) {
        return <span className="text-[13px] text-slate-300">—</span>;
    }
    return (
        <div className="inline-flex items-center">
            {SLOTS_ANTIGOS.map(slot => {
                const n = r[slot.key];
                if (!n) return <span key={slot.key} className="w-7" />;
                return (
                    <span key={slot.key} className={`w-7 inline-flex items-center justify-center gap-0.5 ${slot.tone}`}>
                        <span className="material-symbols-outlined text-[14px] leading-none">{slot.icon}</span>
                        <span className="text-[11px] font-bold tabular-nums leading-none">{n}</span>
                    </span>
                );
            })}
        </div>
    );
}

export function PreviewColunaPromocoes() {
    const { promoData, loading, error } = usePromoStatus();
    const ordem = promoData.campanhas.map(c => c.nome);

    return (
        <div className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950">
            <div className="mx-auto max-w-4xl">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Coluna Promoções — antes e depois</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Dados reais do banco de teste. Clique na célula nova pra abrir o puxadinho.
                </p>

                {loading && <p className="mt-6 text-sm text-slate-500">Carregando promo-status…</p>}
                {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

                {!loading && !error && (
                    <>
                        <div className="mt-6 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                            {ORDEM_ESTADOS.map(e => (
                                <span key={e} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300" title={ESTADO_META[e].descricao}>
                                    <span className={`h-[11px] w-[9px] rounded-[2px] ${ESTADO_META[e].segmento} ${e === 'sem item' ? 'ring-1 ring-inset ring-slate-300' : ''}`} />
                                    {ESTADO_META[e].label}
                                </span>
                            ))}
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                <span className="h-[3px] w-[9px] rounded-full bg-slate-200 dark:bg-slate-700" />
                                não roda na cidade
                            </span>
                        </div>

                        <table className="mt-4 w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                                <tr>
                                    <th className="px-4 py-3 text-left">Estabelecimento</th>
                                    <th className="px-4 py-3 text-left">Cidade</th>
                                    <th className="px-2 py-3 text-center">Antes</th>
                                    <th className="px-2 py-3 text-center">Depois</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {PARCEIROS.map((p, i) => {
                                    const resumo = computePromoResumo(p.id, p.loc, promoData);
                                    return (
                                        <tr key={p.id}>
                                            <td className="px-4 py-4 font-semibold text-slate-800 dark:text-slate-100">{p.nome}</td>
                                            <td className="px-4 py-4 text-slate-500">{p.cidade}</td>
                                            <td className="px-2 py-4 text-center"><ColunaAntiga r={resumo} /></td>
                                            <td className="px-2 py-4 text-center">
                                                <PromoColuna
                                                    resumo={resumo}
                                                    ordemCampanhas={ordem}
                                                    localidadeId={p.loc}
                                                    rowIndex={i}
                                                    totalRows={PARCEIROS.length}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewColunaPromocoes />
    </StrictMode>,
);
