interface NotificationBellProps {
    count: number;
    onClick: () => void;
}

/** Clique leva direto pra "Tarefas do dia" — ver TarefasDoDiaView e useTarefasPendentes. */
export default function NotificationBell({ count, onClick }: NotificationBellProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Tarefas do dia"
        >
            <span className="material-symbols-outlined">notifications</span>
            {count > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </button>
    );
}
