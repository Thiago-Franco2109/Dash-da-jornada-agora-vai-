/**
 * Entrada isolada pra conferir a coluna CONTRATO e os cards de MRR com os
 * contratos reais do Trello, sem precisar de login nem das Netlify Functions.
 *
 * A fixture em src/__fixtures__/contratos-cd.json é um retrato da resposta de
 * netlify/functions/cd-contratos.ts — mesmo formato que o hook consome.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-contratos-cd.html
 * Não entra no build de produção.
 */
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import CDDesempenhoView from './components/CDDesempenhoView';
import { enrichDesempenhoPartnerData } from './utils/calculations';
import type { EnrichedPerformanceRow } from './utils/calculations';
import type { ContratoCD, ContratosCD } from './hooks/useContratosCD';
import type { PerformanceRow } from './components/PerformanceTable';
import { CityFocusProvider } from './context/CityFocusContext';
import fixture from './__fixtures__/contratos-cd.json';
import './index.css';

/** Linhas como vêm da planilha CD_TODOS_DESEMPENHO: estab_id na coluna B. */
function linha(cidade: string, estabId: string, nome: string, semanas: number[]): PerformanceRow {
    return {
        cidade,
        estab_id: estabId,
        estabelecimento: nome,
        status: 'ativo',
        lancamento: '',
        desempenho: '',
        week_1: semanas[0] ?? 0,
        week_2: semanas[1] ?? 0,
        week_3: semanas[2] ?? 0,
        week_4: semanas[3] ?? 0,
    } as unknown as PerformanceRow;
}

/**
 * Casos escolhidos pra cobrir cada caminho da derivação:
 *  - 28210 LS Lanchonete: campo "Mensalidade" direto
 *  - 28170 Rosestolato: id do marketplace, contrato no card 28204 (alias por CNPJ)
 *  - 26530 Like Açaí: alias por nome+localidade (CPF num cadastro, CNPJ no outro)
 *  - 28062 Nani Lanches: valor derivado de 719,10 ÷ 12
 *  - 27987 Bebelinda: 719,10 rotulado "Assinatura Mensal" — cai no teto
 *  - 28484 X Tudão: cobra no banco mas o card está como Teste Grátis → sem valor
 *  - 99999 Loja Fantasma: id que não existe em card nenhum → coluna vazia
 */
const LINHAS: PerformanceRow[] = [
    linha('Espera Feliz', '28210', 'LS Lanchonete', [0, 0, 0, 0]),
    linha('Natividade', '28170', 'Lanchonete Rosestolato', [0, 0, 0, 0]),
    linha('Além Paraíba', '26530', 'Like Açaí', [12, 10, 9, 11]),
    linha('Além Paraíba', '28062', 'Nani Lanches', [3, 2, 4, 1]),
    linha('Macabu', '27987', 'Bebelinda Burguer', [20, 18, 22, 19]),
    linha('Além Paraíba', '28484', 'X Tudão Lanches', [1, 0, 2, 0]),
    linha('Barroso', '99999', 'Loja Fantasma', [0, 0, 0, 0]),
];

export function PreviewContratosCD() {
    const contratos: ContratosCD = useMemo(() => {
        const porEstabelecimento = new Map<number, ContratoCD>();
        for (const c of fixture.contratos as ContratoCD[]) {
            porEstabelecimento.set(c.estabelecimento_id, c);
        }
        for (const [alias, canonico] of Object.entries(fixture.aliases as Record<string, number>)) {
            const contrato = porEstabelecimento.get(canonico);
            if (contrato && !porEstabelecimento.has(Number(alias))) {
                porEstabelecimento.set(Number(alias), contrato);
            }
        }
        return {
            porEstabelecimento,
            mrrTotal: fixture.mrr_total,
            contratosAtivos: fixture.contratos_ativos,
            atualizadoEm: new Date(fixture.atualizado_em),
        };
    }, []);

    const rows: EnrichedPerformanceRow[] = useMemo(
        () => LINHAS.map(r => enrichDesempenhoPartnerData(r, undefined, undefined, 'cardapio_digital', contratos.porEstabelecimento)),
        [contratos],
    );

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
            <CDDesempenhoView
                data={rows}
                isLoading={false}
                error={null}
                isUsingCache={false}
                lastSyncTime={new Date()}
                onRefresh={() => undefined}
                searchQuery=""
                cityFilter=""
                setCityFilter={() => undefined}
                priorityFilter=""
                setPriorityFilter={() => undefined}
                managerFilter=""
                setManagerFilter={() => undefined}
                sortConfig={{ key: 'risco_churn', direction: 'desc' }}
                requestSort={() => undefined}
                onRowClick={() => undefined}
                preset="all"
                dataSource="cd_desempenho"
                carteiraContratos={contratos}
                contratosError={null}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CityFocusProvider>
            <PreviewContratosCD />
        </CityFocusProvider>
    </StrictMode>,
);
