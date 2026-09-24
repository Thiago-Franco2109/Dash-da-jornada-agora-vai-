/**
 * Entrada isolada para conferir a visão "Tarefas do dia" sem login e sem
 * depender de dado real vencer justo hoje.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-tarefas.html
 * Não entra no build de produção.
 */
import { useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TarefasDoDiaView from './components/TarefasDoDiaView';
import type { TarefaUnificada } from './hooks/useTarefasPendentes';
import type { CrmFollowUpAlert } from './types/crm';
import type { MembroTrello } from './types/trello';
import './index.css';

const agora = new Date();
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();
const horasNaFrente = (h: number) => new Date(agora.getTime() + h * 3600_000).toISOString();

const crmAtrasado = {
    partnerId: 'p1',
    partner: { estabelecimento: '[Amostra] Tony Turner', cidade: 'São Paulo', analista: 'THIAGO' },
    nextFollowUp: horasAtras(5),
    level: 'overdue',
    diasOffset: 0,
    notes: 'Disse que ia montar a promo no fim de semana',
} as unknown as CrmFollowUpAlert;

const crmHoje = {
    partnerId: 'p2',
    partner: { estabelecimento: '[Amostra] iTable', cidade: 'Campinas', analista: 'LAÍS' },
    nextFollowUp: horasNaFrente(3),
    level: 'today',
    diasOffset: 0,
    notes: '',
} as unknown as CrmFollowUpAlert;

const tarefas: TarefaUnificada[] = [
    {
        id: 'crm:p1', tipo: 'crm', titulo: crmAtrasado.partner.estabelecimento,
        subtitulo: `${crmAtrasado.partner.cidade} · ${crmAtrasado.partner.analista}`,
        due: crmAtrasado.nextFollowUp, nivel: 'overdue', diasOffset: 0, crm: crmAtrasado,
    },
    {
        id: 'trello:t1', tipo: 'trello', titulo: 'Ligar pro Damone',
        subtitulo: 'Prospecção · Fazendo',
        due: horasAtras(2), nivel: 'overdue', diasOffset: 0,
        trelloCardId: 't1', trelloCardUrl: 'https://trello.com/c/mock1',
    },
    {
        id: 'crm:p2', tipo: 'crm', titulo: crmHoje.partner.estabelecimento,
        subtitulo: `${crmHoje.partner.cidade} · ${crmHoje.partner.analista}`,
        due: crmHoje.nextFollowUp, nivel: 'today', diasOffset: 0, crm: crmHoje,
    },
    {
        id: 'trello:t2', tipo: 'trello', titulo: 'Enviar arte pro parceiro',
        subtitulo: '[SC] Parceiros em Queda · A fazer',
        due: horasNaFrente(30), nivel: 'upcoming', diasOffset: 1,
        trelloCardId: 't2', trelloCardUrl: 'https://trello.com/c/mock2',
    },
];

const membrosMock: MembroTrello[] = [
    { id: 'm1', nome: 'Thiago Franco', iniciais: 'TF', avatarUrl: null },
    { id: 'm2', nome: 'Laís', iniciais: 'L', avatarUrl: null },
];

function PreviewTarefas() {
    const [ativado, setAtivado] = useState(false);
    const [membroFiltro, setMembroFiltro] = useState<string | null>(null);
    const [boardsIgnorados, setBoardsIgnorados] = useState<Set<string>>(new Set());
    const [listasIgnoradas, setListasIgnoradas] = useState<Set<string>>(new Set());

    return (
        <TarefasDoDiaView
            tarefas={tarefas}
            contagemPorNivel={{
                overdue: tarefas.filter(t => t.nivel === 'overdue').length,
                today: tarefas.filter(t => t.nivel === 'today').length,
                upcoming: tarefas.filter(t => t.nivel === 'upcoming').length,
            }}
            ativado={ativado}
            permissao="granted"
            onAtivar={() => setAtivado(true)}
            onDesativar={() => setAtivado(false)}
            membroFiltro={membroFiltro}
            membrosDisponiveis={membrosMock}
            onMudarMembro={setMembroFiltro}
            boardsIgnorados={boardsIgnorados}
            boardsDisponiveis={[{ id: 'b1', name: 'Prospecção' }, { id: 'b2', name: '[SC] Parceiros em Queda' }]}
            onToggleBoardIgnorado={id => setBoardsIgnorados(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            })}
            listasIgnoradas={listasIgnoradas}
            listasPorBoard={new Map([
                ['b1', [{ id: 'l1', name: 'Fazendo' }]],
                ['b2', [{ id: 'l2', name: 'A fazer' }]],
            ])}
            onToggleListaIgnorada={id => setListasIgnoradas(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            })}
            upsertCrmNote={async (partnerId, patch) => { console.log('upsertCrmNote', partnerId, patch); return true; }}
            onRefreshTrello={() => console.log('onRefreshTrello')}
        />
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <div className="h-screen bg-slate-50 dark:bg-slate-900">
            <PreviewTarefas />
        </div>
    </StrictMode>,
);
