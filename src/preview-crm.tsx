/**
 * Entrada isolada para conferir o CRM lendo do banco, sem passar pelo login.
 *
 * Exercita a cadeia inteira: Functions (crm-base + crm-cupons + crm-gmv) →
 * tabelas montadas em crmFromDb → parseCrmPartners → CrmPartner[]. As
 * planilhas não respondem aqui (exigem OAuth), então o que aparecer veio
 * necessariamente do banco.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-crm.html
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useCrmData } from './hooks/useCrmData';
import './index.css';

export function PreviewCrm() {
    const { partners, parseInfo, isLoading, error } = useCrmData({ enabled: true });

    if (isLoading) return <p className="p-8 text-slate-500">Carregando CRM do banco…</p>;

    const comPromo = partners.filter(p => p.campaigns.super_promos.status === 'ativo').length;
    const comCupom = partners.filter(p => p.campaigns.cupons_destaque.status === 'ativo').length;
    const comGmv = partners.filter(p => (p.indiceGmv ?? 0) > 0).length;

    return (
        <div className="p-8 space-y-4 text-slate-800 dark:text-slate-100">
            <h1 className="text-xl font-bold">CRM — {partners.length} parceiros</h1>
            {error && <p className="text-red-600">erro: {error}</p>}
            <p className="text-sm">
                super promos ativos: {comPromo} · cupons ativos: {comCupom} · com GMV no mês: {comGmv}
                {parseInfo ? ` · linhas no indicador: ${parseInfo.indicadorRows}` : ''}
            </p>
            <table className="text-sm border-collapse">
                <thead>
                    <tr className="text-left border-b">
                        <th className="pr-4 py-1">Parceiro</th>
                        <th className="pr-4">Cidade</th>
                        <th className="pr-4">Contrato</th>
                        <th className="pr-4">GMV {partners[0]?.gmvMesLabel}</th>
                        <th className="pr-4">Promos</th>
                        <th className="pr-4">Cupons</th>
                        <th className="pr-4">Analista</th>
                        <th>Histórico</th>
                    </tr>
                </thead>
                <tbody>
                    {partners.slice(0, 25).map(p => (
                        <tr key={p.partnerId} className="border-b border-slate-100">
                            <td className="pr-4 py-1">{p.estabelecimento}</td>
                            <td className="pr-4">{p.cidade}</td>
                            <td className="pr-4">{p.statusParceiro}</td>
                            <td className="pr-4">{p.indiceGmvRaw}</td>
                            <td className="pr-4">{p.campaigns.super_promos.resumo} ({p.campaigns.super_promos.status})</td>
                            <td className="pr-4">{p.campaigns.cupons_destaque.resumo} ({p.campaigns.cupons_destaque.status})</td>
                            <td className="pr-4">{p.analista ?? '—'}</td>
                            <td className="text-xs text-slate-500">
                                {(p.gmvMensal ?? []).map(m => `${m.label}: ${m.value.toFixed(0)}`).join(' · ')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewCrm />
    </StrictMode>,
);
