import { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useOnboardingCompleto } from '../hooks/useOnboardingCompleto';

const DURACAO_TOAST_MS = 15_000;

/** Arpejo curto de 3 notas — som de "conquista", sem precisar de arquivo de áudio. */
function tocarSino() {
    try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notas = [880, 1108.73, 1318.51]; // A5, C#6, E6
        notas.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const inicio = ctx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(0, inicio);
            gain.gain.linearRampToValueAtTime(0.35, inicio + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(inicio);
            osc.stop(inicio + 0.5);
        });
        setTimeout(() => ctx.close(), 900);
    } catch {
        // navegador bloqueou áudio sem interação prévia — o banner visual já é o alerta principal
    }
}

/**
 * Alerta global (som + banner) quando um parceiro completa as 5 etapas do
 * onboarding. Montado no topo do App, fora das views, pra disparar
 * independente de qual aba o usuário está olhando.
 */
export default function OnboardingCompletoAlert() {
    const { novos, limparNovo } = useOnboardingCompleto();
    const tocadosRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        const inéditos = novos.filter(p => !tocadosRef.current.has(p.id));
        if (inéditos.length === 0) return;
        inéditos.forEach(p => tocadosRef.current.add(p.id));
        tocarSino();
    }, [novos]);

    useEffect(() => {
        if (novos.length === 0) return;
        const timers = novos.map(p => setTimeout(() => limparNovo(p.id), DURACAO_TOAST_MS));
        return () => timers.forEach(clearTimeout);
    }, [novos, limparNovo]);

    if (novos.length === 0) return null;

    return (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0">
            {novos.map(p => (
                <div
                    key={p.id}
                    className="animate-slide-in-right flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/70 shadow-lg px-4 py-3"
                >
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">celebration</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Onboarding 100% concluído</p>
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 truncate">{p.estabelecimento}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {p.cidade && `${p.cidade} · `}
                            concluído {formatDistanceToNow(new Date(p.concluidoEm), { locale: ptBR, addSuffix: true })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => limparNovo(p.id)}
                        className="shrink-0 p-1 rounded text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                        title="Dispensar"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
            ))}
        </div>
    );
}
