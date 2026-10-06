import { useEffect, useState } from 'react';

interface NotificationBellProps {
    count: number;
    onClick: () => void;
    /** Inscreve o sino em cada disparo do alarme — ver useTarefasPendentes. */
    inscreverAlerta?: (ouvinte: () => void) => () => void;
}

/** Clique leva direto pra "Tarefas do dia" — ver TarefasDoDiaView e useTarefasPendentes. */
export default function NotificationBell({ count, onClick, inscreverAlerta }: NotificationBellProps) {
    const [pulso, setPulso] = useState(0);

    // Aviso visual que não depende de permissão do SO nem da aba em foco —
    // a notificação nativa falha em várias combinações de SO/navegador, o
    // sino tremendo aqui dentro não.
    //
    // O contador vira `key` do ícone: remontar o nó é o jeito de reiniciar a
    // animação a cada disparo. Tentar tirar e repor a classe exigiria
    // requestAnimationFrame, que o navegador simplesmente não executa com a
    // aba em segundo plano — e aí a animação não reiniciava.
    useEffect(() => {
        if (!inscreverAlerta) return;
        return inscreverAlerta(() => setPulso(n => n + 1));
    }, [inscreverAlerta]);

    return (
        <button
            type="button"
            onClick={onClick}
            className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Tarefas do dia"
        >
            <span key={pulso} className={`material-symbols-outlined ${pulso > 0 ? 'animate-sino-tremendo' : ''}`}>
                notifications
            </span>
            {count > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </button>
    );
}
