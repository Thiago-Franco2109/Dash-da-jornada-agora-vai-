import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CardTrelloOnboarding } from './useOnboardingTrello';
import type { TarefaTrello } from './useTrelloTarefas';
import type { CrmPartner, CrmPartnerNote, CrmFollowUpAlert } from '../types/crm';
import type { MembroTrello } from '../types/trello';
import { computeFollowUpAlerts } from '../utils/crmPipeline';
import { nivelDaTarefa, NIVEL_INDICE, type Nivel } from '../utils/trelloNivel';
import { loadPersistedSet, savePersistedSet } from '../utils/persistedSet';

/**
 * Fonte única de "o que está pendente/vencido" (CRM + Trello, todos os
 * boards) — alimenta o badge do sino, a visão "Tarefas do dia" e o alarme
 * estridente. Generaliza o motor que só existia pro board de onboarding
 * (Notification API + bipe via Web Audio, repete a cada 1min até deixar de
 * estar vencido — "nível 1": funciona com a aba aberta, mesmo minimizada,
 * sem Service Worker/push por trás).
 *
 * O alarme só dispara pra ITENS ATRASADOS (nivel 'overdue') — "hoje, ainda
 * não venceu" não precisa gritar o dia inteiro; a visão do dia mostra os 3
 * baldes (atrasado/hoje/próximos), o alarme só o primeiro.
 */

/**
 * Rótulo interno do board de onboarding. NÃO é o id real do Trello de
 * propósito: o id real só existe como env de servidor (TRELLO_BOARD_ID, usada
 * pela function), não no bundle do navegador — depender de uma `VITE_*` aqui
 * já quebrou uma vez, silenciosamente. Quem é card de onboarding se decide
 * pela ORIGEM (veio de useOnboardingTrello), não por comparar id de board.
 */
const ONBOARDING_BOARD_ID = 'onboarding';

const STORAGE_KEY_ATIVADO = 'notificacao_unificada_ativada_v1';
const STORAGE_KEY_MEMBRO = 'notificacao_unificada_membro_v1';
const STORAGE_KEY_MEMBRO_LEGADO = 'onboarding_notificacao_membro_v1';
const STORAGE_KEY_BOARDS_IGNORADOS = 'notificacao_bell_boards_ignorados_v1';
const STORAGE_KEY_LISTAS_IGNORADAS = 'notificacao_bell_listas_ignoradas_v1';
/**
 * Três relógios distintos de propósito:
 * - ALARME: com que frequência grita enquanto existir atrasado. Curto porque
 *   é só som + notificação local, não custa rede nem re-render.
 * - RECLASSIFICACAO: de quanto em quanto tempo um prazo "hoje" vira
 *   "atrasado" sozinho. Mexe em estado, então re-renderiza quem consome.
 * - DADOS: refetch do Trello. O mais caro de todos (a function faz
 *   /members/me/cards + 1 chamada por board), e a Trello limita 100 req/10s
 *   por token — por isso fica no minuto, não acompanha o alarme.
 */
const INTERVALO_ALARME_MS = 10_000;
const INTERVALO_RECLASSIFICACAO_MS = 60_000;
const INTERVALO_DADOS_MS = 60_000;
const TAG_NOTIFICACAO = 'tarefas-pendentes';

export interface TarefaUnificada {
    id: string;
    tipo: 'crm' | 'trello';
    titulo: string;
    subtitulo: string;
    due: string;
    nivel: Nivel;
    diasOffset: number;
    crm?: CrmFollowUpAlert;
    trelloCardId?: string;
    trelloCardUrl?: string;
}

interface ItemTrelloBase {
    id: string;
    nome: string;
    due: string | null;
    dueComplete: boolean;
    closed: boolean;
    cardUrl: string;
    boardId: string;
    board: string;
    listId: string;
    lista: string;
    membros: MembroTrello[];
}

/**
 * Um AudioContext só, reaproveitado: tocando a cada 10s, abrir e fechar um
 * context por bipe esbarraria no teto de contexts simultâneos do navegador.
 */
let ctxAlarme: AudioContext | null = null;

/** Bipe duplo — mesmo som já validado no alarme do board de onboarding. */
function tocarAlerta() {
    try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!ctxAlarme) ctxAlarme = new AudioCtx();
        const ctx = ctxAlarme;
        // O navegador suspende o context quando a aba fica muito tempo oculta.
        if (ctx.state === 'suspended') void ctx.resume();
        [660, 660].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            const inicio = ctx.currentTime + i * 0.25;
            gain.gain.setValueAtTime(0, inicio);
            gain.gain.linearRampToValueAtTime(0.25, inicio + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(inicio);
            osc.stop(inicio + 0.18);
        });
    } catch { /* navegador bloqueou áudio sem interação prévia — a notificação nativa já traz som próprio */ }
}

function suportado(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
}

/** Primeira ativação: se já existia filtro de membro do alarme antigo, carrega ele uma vez (segue valendo só pro board de onboarding). */
function membroInicial(): string | null {
    try {
        const atual = localStorage.getItem(STORAGE_KEY_MEMBRO);
        if (atual != null) return atual || null;
        const legado = localStorage.getItem(STORAGE_KEY_MEMBRO_LEGADO);
        if (legado) localStorage.setItem(STORAGE_KEY_MEMBRO, legado);
        return legado || null;
    } catch {
        return null;
    }
}

export interface UseTarefasPendentesParams {
    crmPartners: CrmPartner[];
    getCrmNote: (id: string) => CrmPartnerNote | undefined;
    managerFilter?: string;
    onboardingCardsTrello: CardTrelloOnboarding[];
    trelloTarefas: TarefaTrello[];
    refreshOnboardingTrello: () => void;
    refreshTrelloTarefas: () => void;
    upcomingDays?: number;
    /** Chamado quando o usuário clica na notificação nativa — leva pra "Tarefas do dia". */
    onNotificacaoClick?: () => void;
}

export function useTarefasPendentes({
    crmPartners,
    getCrmNote,
    managerFilter = '',
    onboardingCardsTrello,
    trelloTarefas,
    refreshOnboardingTrello,
    refreshTrelloTarefas,
    upcomingDays = 3,
    onNotificacaoClick,
}: UseTarefasPendentesParams) {
    const [ativado, setAtivado] = useState<boolean>(() => {
        try { return localStorage.getItem(STORAGE_KEY_ATIVADO) === 'on'; } catch { return false; }
    });
    const [permissao, setPermissao] = useState<NotificationPermission | 'unsupported'>(
        suportado() ? Notification.permission : 'unsupported',
    );
    const [membroFiltro, setMembroFiltro] = useState<string | null>(membroInicial);
    const [boardsIgnorados, setBoardsIgnorados] = useState<Set<string>>(() => loadPersistedSet(STORAGE_KEY_BOARDS_IGNORADOS));
    const [listasIgnoradas, setListasIgnoradas] = useState<Set<string>>(() => loadPersistedSet(STORAGE_KEY_LISTAS_IGNORADAS));
    const [agora, setAgora] = useState(() => new Date());

    const mudarMembroFiltro = useCallback((id: string | null) => {
        setMembroFiltro(id);
        try {
            if (id) localStorage.setItem(STORAGE_KEY_MEMBRO, id);
            else localStorage.removeItem(STORAGE_KEY_MEMBRO);
        } catch { /* ignore */ }
    }, []);

    const toggleBoardIgnorado = useCallback((id: string) => {
        setBoardsIgnorados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            savePersistedSet(STORAGE_KEY_BOARDS_IGNORADOS, next);
            return next;
        });
    }, []);

    const toggleListaIgnorada = useCallback((id: string) => {
        setListasIgnoradas(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            savePersistedSet(STORAGE_KEY_LISTAS_IGNORADAS, next);
            return next;
        });
    }, []);

    const ativar = useCallback(async () => {
        if (!suportado()) return;
        let perm = Notification.permission;
        if (perm === 'default') {
            perm = await Notification.requestPermission();
            setPermissao(perm);
        }
        if (perm !== 'granted') return;
        setAtivado(true);
        try { localStorage.setItem(STORAGE_KEY_ATIVADO, 'on'); } catch { /* ignore */ }
    }, []);

    const desativar = useCallback(() => {
        setAtivado(false);
        try { localStorage.setItem(STORAGE_KEY_ATIVADO, 'off'); } catch { /* ignore */ }
    }, []);

    // Todos os cards do Trello, de todos os boards, num formato só — board de
    // onboarding (busca completa, qualquer membro) + demais boards via
    // /members/me/cards, que já traz de volta os cards do onboarding
    // atribuídos ao dono do token. Dedupe por id de CARD (não por id de board,
    // que o cliente não conhece), com a fonte de onboarding vencendo: é ela que
    // tem a etapa certa e é ela que o filtro de membro entende.
    const trelloUnificado = useMemo<ItemTrelloBase[]>(() => {
        const idsOnboarding = new Set(onboardingCardsTrello.map(c => c.id));
        const doOnboarding: ItemTrelloBase[] = onboardingCardsTrello.map(c => ({
            id: c.id,
            nome: c.nome,
            due: c.due,
            dueComplete: c.dueComplete,
            closed: c.closed,
            cardUrl: c.cardUrl,
            boardId: ONBOARDING_BOARD_ID,
            board: 'Onboarding',
            listId: c.listId,
            lista: c.etapa,
            membros: c.membros,
        }));
        const doResto: ItemTrelloBase[] = trelloTarefas
            .filter(t => !idsOnboarding.has(t.id))
            .map(t => ({
                id: t.id,
                nome: t.nome,
                due: t.due,
                dueComplete: t.dueComplete,
                closed: t.closed,
                cardUrl: t.cardUrl,
                boardId: t.boardId,
                board: t.board,
                listId: t.listId,
                lista: t.lista,
                membros: t.membros,
            }));
        return [...doOnboarding, ...doResto];
    }, [onboardingCardsTrello, trelloTarefas]);

    const boardsDisponiveis = useMemo(() => {
        const porId = new Map<string, string>();
        for (const t of trelloUnificado) porId.set(t.boardId, t.board);
        return [...porId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [trelloUnificado]);

    const listasPorBoard = useMemo(() => {
        const mapa = new Map<string, { id: string; name: string }[]>();
        const vistos = new Set<string>();
        for (const t of trelloUnificado) {
            if (vistos.has(t.listId)) continue;
            vistos.add(t.listId);
            const lista = mapa.get(t.boardId) ?? [];
            lista.push({ id: t.listId, name: t.lista });
            mapa.set(t.boardId, lista);
        }
        for (const lista of mapa.values()) lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return mapa;
    }, [trelloUnificado]);

    // Só membros do board de onboarding: é o único lugar onde o filtro vale
    // (ver o filtro em tarefasUnificadas).
    const membrosDisponiveis = useMemo(() => {
        const porId = new Map<string, MembroTrello>();
        for (const t of trelloUnificado) {
            if (t.boardId !== ONBOARDING_BOARD_ID) continue;
            for (const m of t.membros) porId.set(m.id, m);
        }
        return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [trelloUnificado]);

    // Lista final ordenada (atrasado > hoje > próximos), CRM + Trello juntos.
    const tarefasUnificadas = useMemo<TarefaUnificada[]>(() => {
        const crmFiltrados = managerFilter ? crmPartners.filter(p => p.analista === managerFilter) : crmPartners;
        const crmAlerts = computeFollowUpAlerts(crmFiltrados, getCrmNote, upcomingDays);
        const doCrm: TarefaUnificada[] = crmAlerts.map(alert => ({
            id: `crm:${alert.partnerId}`,
            tipo: 'crm',
            titulo: alert.partner.estabelecimento,
            subtitulo: `${alert.partner.cidade}${alert.partner.analista ? ` · ${alert.partner.analista}` : ''}`,
            due: alert.nextFollowUp,
            nivel: alert.level,
            diasOffset: alert.daysOffset,
            crm: alert,
        }));

        const doTrello: TarefaUnificada[] = [];
        for (const item of trelloUnificado) {
            if (item.closed || item.dueComplete || !item.due) continue;
            if (boardsIgnorados.has(item.boardId) || listasIgnoradas.has(item.listId)) continue;
            // Filtro de membro vale SÓ no board de onboarding. Ali o board vem
            // inteiro (qualquer membro), então escolher "quem sou eu" é o que
            // separa os meus cards dos dos outros. Nos demais boards a origem é
            // /members/me/cards, que já vem filtrado pelo dono do TOKEN —
            // aplicar o filtro de novo zerava tudo, porque quem está marcado no
            // card lá é o dono do token, não necessariamente quem escolheu aqui.
            if (membroFiltro && item.boardId === ONBOARDING_BOARD_ID && !item.membros.some(m => m.id === membroFiltro)) continue;

            const { nivel, diasOffset } = nivelDaTarefa(item.due, agora);
            if (nivel === 'sem_prazo') continue;
            if (nivel === 'upcoming' && (diasOffset ?? 0) > upcomingDays) continue;

            doTrello.push({
                id: `trello:${item.id}`,
                tipo: 'trello',
                titulo: item.nome,
                subtitulo: `${item.board} · ${item.lista}`,
                due: item.due,
                nivel,
                diasOffset: diasOffset ?? 0,
                trelloCardId: item.id,
                trelloCardUrl: item.cardUrl,
            });
        }

        return [...doCrm, ...doTrello].sort(
            (a, b) => NIVEL_INDICE[a.nivel] - NIVEL_INDICE[b.nivel] || a.diasOffset - b.diasOffset,
        );
    }, [crmPartners, getCrmNote, managerFilter, upcomingDays, trelloUnificado, boardsIgnorados, listasIgnoradas, membroFiltro, agora]);

    const contagemPorNivel = useMemo(() => {
        const counts = { overdue: 0, today: 0, upcoming: 0 };
        for (const t of tarefasUnificadas) counts[t.nivel as 'overdue' | 'today' | 'upcoming']++;
        return counts;
    }, [tarefasUnificadas]);

    // Relógio próprio: reclassifica a cada 1min mesmo sem novo dado chegar —
    // um prazo "hoje" vira "atrasado" na hora certa, não só no próximo fetch.
    useEffect(() => {
        const id = setInterval(() => setAgora(new Date()), INTERVALO_RECLASSIFICACAO_MS);
        return () => clearInterval(id);
    }, []);

    // Reconsulta os dados a cada 1min só enquanto o alarme está ativo — sem
    // isso ninguém fora da aba de onboarding/Trello teria dado fresco.
    const refreshOnboardingRef = useRef(refreshOnboardingTrello);
    const refreshTrelloRef = useRef(refreshTrelloTarefas);
    useEffect(() => { refreshOnboardingRef.current = refreshOnboardingTrello; }, [refreshOnboardingTrello]);
    useEffect(() => { refreshTrelloRef.current = refreshTrelloTarefas; }, [refreshTrelloTarefas]);

    useEffect(() => {
        if (!ativado) return;
        refreshOnboardingRef.current();
        refreshTrelloRef.current();
        const id = setInterval(() => {
            refreshOnboardingRef.current();
            refreshTrelloRef.current();
        }, INTERVALO_DADOS_MS);
        return () => clearInterval(id);
    }, [ativado]);

    // Alarme em relógio PRÓPRIO (a cada 10s), não preso ao recálculo da lista:
    // assim ele insiste no ritmo que o CS pediu sem obrigar o app a
    // re-renderizar na mesma cadência. Lê os atrasados de uma ref pra não
    // precisar recriar o intervalo a cada mudança de lista.
    //
    // tag+renotify SUBSTITUEM a notificação anterior (não empilha no centro do
    // sistema) mas tocam som de novo a cada vez, e só param quando o conjunto
    // de atrasados esvaziar — ou seja, quando o CS reagendar.
    const onNotificacaoClickRef = useRef(onNotificacaoClick);
    useEffect(() => { onNotificacaoClickRef.current = onNotificacaoClick; }, [onNotificacaoClick]);

    const atrasadosRef = useRef<TarefaUnificada[]>([]);
    useEffect(() => {
        atrasadosRef.current = tarefasUnificadas.filter(t => t.nivel === 'overdue');
    }, [tarefasUnificadas]);

    useEffect(() => {
        if (!ativado || permissao !== 'granted') return;

        const gritar = () => {
            const atrasados = atrasadosRef.current;
            if (atrasados.length === 0) return;

            const titulo = atrasados.length === 1 ? '1 tarefa atrasada' : `${atrasados.length} tarefas atrasadas`;
            const nomes = atrasados.slice(0, 4).map(t => t.titulo).join(' · ');
            const corpo = atrasados.length > 4 ? `${nomes} · +${atrasados.length - 4} mais` : nomes;

            try {
                const opcoes: NotificationOptions & { renotify?: boolean } = {
                    body: corpo,
                    icon: '/favicon.png',
                    tag: TAG_NOTIFICACAO,
                    renotify: true,
                    requireInteraction: true,
                    silent: false,
                };
                const notif = new Notification(titulo, opcoes);
                notif.onclick = () => {
                    window.focus();
                    onNotificacaoClickRef.current?.();
                };
            } catch { /* ignore */ }
            tocarAlerta();
        };

        gritar();
        const id = setInterval(gritar, INTERVALO_ALARME_MS);
        return () => clearInterval(id);
    }, [ativado, permissao]);

    return {
        tarefasUnificadas,
        contagemPorNivel,
        ativado,
        permissao,
        ativar,
        desativar,
        membroFiltro,
        mudarMembroFiltro,
        membrosDisponiveis,
        boardsIgnorados,
        toggleBoardIgnorado,
        boardsDisponiveis,
        listasIgnoradas,
        toggleListaIgnorada,
        listasPorBoard,
    };
}
