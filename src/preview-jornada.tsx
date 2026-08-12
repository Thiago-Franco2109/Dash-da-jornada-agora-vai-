/**
 * Entrada isolada para conferir a jornada lendo do banco, sem login.
 *
 * Exercita Function `jornada` → parser original (parseGatewayTableRows) →
 * cálculos do app (dias desde o lançamento, pedidos esperados, índice).
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-jornada.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchJornadaRowsFromDb } from './utils/jornadaFromDb';
import { enrichPartnerData } from './utils/calculations';
import type { EnrichedPerformanceRow } from './utils/calculations';
import { getManagerForPartner } from './config/managerMapping';
import './index.css';

export function PreviewJornada() {
    const [linhas, setLinhas] = useState<EnrichedPerformanceRow[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        fetchJornadaRowsFromDb()
            .then(rows => setLinhas(rows.map(r => enrichPartnerData(r))))
            .catch(e => setErro(String(e)));
    }, []);

    if (erro) return <p className="p-8 text-red-600">{erro}</p>;
    if (!linhas) return <p className="p-8 text-slate-500">Carregando jornada do banco…</p>;

    const naJornada = linhas.filter(l => l.dias_desde_lancamento <= 28);
    return (
        <div className="p-8 space-y-4 text-slate-800 dark:text-slate-100">
            <h1 className="text-xl font-bold">Jornada — {linhas.length} parceiros lançados em 90 dias · {naJornada.length} dentro dos 28 dias</h1>
            <table className="text-sm border-collapse">
                <thead><tr className="text-left border-b">
                    <th className="pr-4 py-1">Parceiro</th><th className="pr-4">Cidade</th><th className="pr-4">Analista</th>
                    <th className="pr-4">Lançamento</th><th className="pr-4">Dias</th><th className="pr-4">S1</th><th className="pr-4">S2</th>
                    <th className="pr-4">S3</th><th className="pr-4">S4</th><th className="pr-4">Total</th>
                    <th className="pr-4">Esperado</th><th>Índice</th>
                </tr></thead>
                <tbody>
                    {naJornada.slice(0, 20).map(l => (
                        <tr key={l.estab_id} className="border-b border-slate-100">
                            <td className="pr-4 py-1">{l.estabelecimento}</td>
                            <td className="pr-4">{l.cidade}</td>
                            <td className="pr-4">{getManagerForPartner(l.cidade, 'Desconhecido', undefined, 'marketplace')}</td>
                            <td className="pr-4">{l.lancamento}</td>
                            <td className="pr-4">{l.dias_desde_lancamento}</td>
                            <td className="pr-4">{l.week_1}</td><td className="pr-4">{l.week_2}</td>
                            <td className="pr-4">{l.week_3}</td><td className="pr-4">{l.week_4}</td>
                            <td className="pr-4 font-semibold">{l.total_pedidos}</td>
                            <td className="pr-4">{l.pedidos_esperados}</td>
                            <td>{l.indice_desempenho}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<StrictMode><PreviewJornada /></StrictMode>);
