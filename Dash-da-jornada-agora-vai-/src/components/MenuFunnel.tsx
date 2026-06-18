import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type FunnelStep = {
    label: string;
    description: string;
    icon: string;
    value: number;              // raw count for your store
    pctOfFirst: number;         // % relative to Visitas (your store)
};

export interface MenuFunnelSourceLink {
    href: string;
    label: string;
    description: string;
    icon: string;
}

interface MenuFunnelProps {
    steps: FunnelStep[];
    sourceLinks?: MenuFunnelSourceLink[];
}

function MenuFunnelHelp({ sourceLinks }: { sourceLinks: MenuFunnelSourceLink[] }) {
    const [open, setOpen] = useState(false);
    const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || !buttonRef.current) return;

        const updatePosition = () => {
            const rect = buttonRef.current!.getBoundingClientRect();
            setPopoverPos({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (sourceLinks.length === 0) return null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="inline-flex items-center justify-center size-7 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors shrink-0"
                title="Fontes de dados e atalhos"
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <span className="material-symbols-outlined text-[18px]">help</span>
            </button>

            {open &&
                createPortal(
                    <div
                        ref={popoverRef}
                        role="dialog"
                        aria-label="Fontes do funil do cardápio"
                        className="fixed z-30 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-4"
                        style={{ top: popoverPos.top, right: popoverPos.right }}
                    >
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                        O funil cruza <strong>acessos únicos</strong> (planilha de acessos) com <strong>pedidos confirmados</strong> (planilha de onboarding). Use os atalhos abaixo para conferir a origem dos números ou corrigir divergências.
                    </p>
                    <div className="flex flex-col gap-2">
                        {sourceLinks.map(link => (
                            <a
                                key={link.href + link.label}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpen(false)}
                                className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                            >
                                <span className="material-symbols-outlined text-primary text-[20px] mt-0.5 shrink-0 group-hover:scale-105 transition-transform">
                                    {link.icon}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {link.label}
                                    </span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {link.description}
                                    </span>
                                </span>
                                <span className="material-symbols-outlined text-slate-400 text-[16px] ml-auto shrink-0 mt-0.5">
                                    open_in_new
                                </span>
                            </a>
                        ))}
                    </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

export default function MenuFunnel({ steps, sourceLinks = [] }: MenuFunnelProps) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            {/* ───── Header ───── */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span className="material-symbols-outlined text-primary text-2xl">analytics</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Análise do Cardápio</h2>
                    <div className="flex-1 min-w-0" aria-hidden />
                    <MenuFunnelHelp sourceLinks={sourceLinks} />
                </div>

                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/30 text-sm">
                    <span className="material-symbols-outlined text-blue-500 text-[20px] mt-0.5">info</span>
                    <span className="text-blue-800 dark:text-blue-300">
                        <strong>Apenas dados integrados:</strong> acessos únicos vêm da planilha conectada ao gateway; compras são os pedidos confirmados do onboarding desta loja. Não há etapas intermediárias nem estimativas.
                    </span>
                </div>
            </div>

            {/* ───── Funnel cards ───── */}
            <div className="p-6">
                <div
                    className={
                        steps.length <= 2
                            ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto'
                            : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'
                    }
                >
                    {steps.map((step, i) => {
                        // Altura da barra baseada no % real (com um mínimo para visibilidade)
                        const barH = i === 0 ? 100 : Math.max(10, step.pctOfFirst);
                        
                        return (
                            <div
                                key={step.label}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col h-full hover:border-primary/40 transition-colors"
                            >
                                {/* Card header */}
                                <div className="p-4 flex-grow">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[15px]">{step.icon}</span>
                                        {step.label}
                                    </h3>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                                        {step.value.toLocaleString('pt-BR')}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{step.description}</p>

                                    <div className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                        <span className="material-symbols-outlined text-[11px]">analytics</span>
                                        Dado Real
                                    </div>
                                </div>

                                {/* Bar container */}
                                <div className="relative h-28 w-full bg-slate-50 dark:bg-slate-900/50">
                                    <div
                                        className="absolute bottom-0 left-0 right-0 bg-primary flex flex-col items-center justify-end pb-3 transition-all duration-500"
                                        style={{ height: `${barH}%` }}
                                    >
                                        <span className="font-bold text-sm text-white">{step.pctOfFirst.toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                    * Funil limitado aos dados disponíveis nas planilhas integradas (sem comparativo com concorrentes ou etapas estimadas).
                </p>
            </div>
        </div>
    );
}
