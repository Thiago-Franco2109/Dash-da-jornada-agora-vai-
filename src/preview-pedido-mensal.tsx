/**
 * Entrada isolada para conferir o Pedido mensal lendo do banco, sem login.
 *
 * Exercita Function `pedido-mensal` → tabelas montadas em pedidoMensalFromDb
 * → parsers originais. Mostra os totais por mês para dar para comparar com o
 * que a planilha trazia.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-pedido-mensal.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchPedidoMensalFromDb } from './utils/pedidoMensalFromDb';
import { parsePedidoMensalTable, formatPedidoMensalBRL } from './utils/pedidoMensal';
import { parseParceiroMensalTable } from './utils/parceiroMensal';
import './index.css';

export function PreviewPedidoMensal() {
    const [estado, setEstado] = useState<{ pedido: ReturnType<typeof parsePedidoMensalTable>; parceiro: ReturnType<typeof parseParceiroMensalTable> } | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        fetchPedidoMensalFromDb()
            .then(t => setEstado({
                pedido: parsePedidoMensalTable(t.pedidoMensal),
                parceiro: parseParceiroMensalTable(t.parceiroMensal),
            }))
            .catch(e => setErro(String(e)));
    }, []);

    if (erro) return <p className="p-8 text-red-600">{erro}</p>;
    if (!estado) return <p className="p-8 text-slate-500">Carregando pedido mensal do banco…</p>;

    const porMes = new Map<string, { lojas: number; aceitos: number; cancelados: number; incentivos: number; comissaoLiq: number; novos: number; gmv: number }>();
    for (const r of estado.pedido) {
        const chave = r.monthStart ? `${r.monthStart.getFullYear()}-${String(r.monthStart.getMonth() + 1).padStart(2, '0')}` : '—';
        const cur = porMes.get(chave) ?? { lojas: 0, aceitos: 0, cancelados: 0, incentivos: 0, comissaoLiq: 0, novos: 0, gmv: 0 };
        cur.lojas++; cur.aceitos += r.pedidosAceitos; cur.cancelados += r.pedidosCancelados;
        cur.incentivos += r.incentivos; cur.comissaoLiq += r.comissaoLiq; cur.novos += r.novosUsuarios;
        porMes.set(chave, cur);
    }
    for (const r of estado.parceiro) {
        const chave = r.monthStart ? `${r.monthStart.getFullYear()}-${String(r.monthStart.getMonth() + 1).padStart(2, '0')}` : '—';
        const cur = porMes.get(chave);
        if (cur) cur.gmv += r.gmvBruto;
    }

    return (
        <div className="p-8 space-y-4 text-slate-800 dark:text-slate-100">
            <h1 className="text-xl font-bold">Pedido mensal — {estado.pedido.length} linhas · {estado.parceiro.length} em parceiro mensal</h1>
            <table className="text-sm border-collapse">
                <thead><tr className="text-left border-b">
                    <th className="pr-6 py-1">Mês</th><th className="pr-6">Lojas</th><th className="pr-6">Aceitos</th>
                    <th className="pr-6">Cancelados</th><th className="pr-6">Incentivos</th><th className="pr-6">Comissão líq.</th>
                    <th className="pr-6">Novos usuários</th><th>GMV bruto</th>
                </tr></thead>
                <tbody>
                    {[...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, v]) => (
                        <tr key={mes} className="border-b border-slate-100">
                            <td className="pr-6 py-1">{mes}</td>
                            <td className="pr-6">{v.lojas}</td>
                            <td className="pr-6">{v.aceitos.toLocaleString('pt-BR')}</td>
                            <td className="pr-6">{v.cancelados.toLocaleString('pt-BR')}</td>
                            <td className="pr-6">{formatPedidoMensalBRL(v.incentivos)}</td>
                            <td className="pr-6">{formatPedidoMensalBRL(v.comissaoLiq)}</td>
                            <td className="pr-6">{v.novos.toLocaleString('pt-BR')}</td>
                            <td>{formatPedidoMensalBRL(v.gmv)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(<StrictMode><PreviewPedidoMensal /></StrictMode>);
