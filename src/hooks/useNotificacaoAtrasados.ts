import { useState, useEffect, useCallback, useRef } from 'react';
import type { CardTrelloOnboarding } from './useOnboardingTrello';
import { nivelDaTarefa } from '../utils/trelloNivel';

/**
 * Notificação do sistema (Web Notification API — "nível 1": funciona com a
 * aba aberta, mesmo minimizada ou em outra aba; fechar a aba para tudo, já
 * que não há Service Worker/push por trás) pra cards atrasados no board de
 * onboarding. Repete a cada 1 minuto até o card deixar de estar atrasado.
 *
 * "Atrasado" usa a mesma classificação da UI (nivelDaTarefa === 'overdue'),
 * pra bater com o badge vermelho "Atrasados: N" que já existe — e ignora
 * cards arquivados ou já marcados como concluídos.
 */

const STORAGE_KEY = 'onboarding_notificacao_atrasados_v1';
const INTERVALO_MS = 60_000;
const TAG_NOTIFICACAO = 'onboarding-atrasados';

function isAtrasado(card: CardTrelloOnboarding): boolean {
    if (card.closed || card.dueComplete || !card.due) return false;
    return nivelDaTarefa(card.due).nivel === 'overdue';
}

/** Bipe duplo, mais "alarme" que o arpejo de conquista usado no alerta de onboarding 100%. */
function tocarAlerta() {
    try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
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
        setTimeout(() => ctx.close(), 700);
    } catch { /* navegador bloqueou áudio sem interação prévia — a notificação nativa já traz som próprio */ }
}

function suportado(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function useNotificacaoAtrasados(cards: CardTrelloOnboarding[], refresh: () => void) {
    const [ativado, setAtivado] = useState<boolean>(() => {
        try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
    });
    const [permissao, setPermissao] = useState<NotificationPermission | 'unsupported'>(
        suportado() ? Notification.permission : 'unsupported',
    );

    // refresh muda de identidade a cada render do App — guardamos numa ref
    // pra o setInterval sempre chamar a versão atual sem precisar recriar o timer.
    const refreshRef = useRef(refresh);
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    const ativar = useCallback(async () => {
        if (!suportado()) return;
        let perm = Notification.permission;
        if (perm === 'default') {
            perm = await Notification.requestPermission();
            setPermissao(perm);
        }
        if (perm !== 'granted') return;
        setAtivado(true);
        try { localStorage.setItem(STORAGE_KEY, 'on'); } catch { /* ignore */ }
    }, []);

    const desativar = useCallback(() => {
        setAtivado(false);
        try { localStorage.setItem(STORAGE_KEY, 'off'); } catch { /* ignore */ }
    }, []);

    // Reconsulta a cada 1min enquanto ativo — sem isso o conjunto de
    // atrasados nunca atualiza pra quem não está na aba de onboarding.
    useEffect(() => {
        if (!ativado) return;
        refreshRef.current();
        const id = setInterval(() => refreshRef.current(), INTERVALO_MS);
        return () => clearInterval(id);
    }, [ativado]);

    // Dispara a notificação a cada recarga de dados (a cada 1min, pelo
    // efeito acima) enquanto existir card atrasado — tag+renotify fazem a
    // notificação SUBSTITUIR a anterior (não empilha no centro de
    // notificações do sistema) mas ainda tocar som de novo a cada vez.
    useEffect(() => {
        if (!ativado || permissao !== 'granted') return;
        const atrasados = cards.filter(isAtrasado);
        if (atrasados.length === 0) return;

        const titulo = atrasados.length === 1
            ? 'Card atrasado no onboarding'
            : `${atrasados.length} cards atrasados no onboarding`;
        const nomes = atrasados.slice(0, 4).map(c => c.nome).join(' · ');
        const corpo = atrasados.length > 4 ? `${nomes} · +${atrasados.length - 4} mais` : nomes;

        try {
            // `renotify` já é padrão (garante o som tocar de novo mesmo
            // reaproveitando a mesma `tag`) mas ainda não está no lib.dom.d.ts
            // desse TS — daí o tipo estendido inline em vez de `any`.
            const opcoes: NotificationOptions & { renotify?: boolean } = {
                body: corpo,
                icon: '/favicon.png',
                tag: TAG_NOTIFICACAO,
                renotify: true,
                silent: false,
            };
            const notif = new Notification(titulo, opcoes);
            notif.onclick = () => window.focus();
        } catch { /* ignore */ }
        tocarAlerta();
    }, [cards, ativado, permissao]);

    return { ativado, permissao, ativar, desativar };
}
