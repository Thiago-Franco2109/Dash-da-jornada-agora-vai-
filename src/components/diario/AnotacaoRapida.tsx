import { useEffect, useState } from 'react';
import type { EnrichedPerformanceRow } from '../../utils/calculations';
import type { NovaAnotacao } from '../../types/diario';
import { useDiarioEscrita } from '../../hooks/useDiario';
import AnotacaoForm from './AnotacaoForm';

/**
 * Anotação rápida do diário, aberta por Ctrl/Cmd+J de qualquer tela.
 *
 * Existe porque "acabei de fazer, vou lá e anoto" só acontece se o "lá" for
 * onde a pessoa já está. Se tiver que atravessar o menu até a aba Diário, o
 * hábito morre em duas semanas — e sem o hábito o relatório pro chefe volta a
 * ser escrito do zero toda vez.
 *
 * Sempre grava no instante atual: é anotação do que acabou de acontecer. Pra
 * registrar algo de ontem, a aba Diário navega até o dia e mostra campo de hora.
 */

interface AnotacaoRapidaProps {
    onFechar: () => void;
    perfil: string;
    partners: EnrichedPerformanceRow[];
}

/** Só é montada quando está aberta (ver App.tsx) — por isso não tem prop `aberta`. */
export default function AnotacaoRapida({ onFechar, perfil, partners }: AnotacaoRapidaProps) {
    const { criar, salvando, erro } = useDiarioEscrita(perfil);
    const [confirmado, setConfirmado] = useState(false);

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onFechar();
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [onFechar]);

    async function salvar(dados: NovaAnotacao) {
        const ok = await criar({ ...dados, ocorridoEm: new Date().toISOString() });
        if (!ok) return;
        // Confirmação curta antes de sumir: sem ela a janela fecha e não dá pra
        // saber se gravou mesmo.
        setConfirmado(true);
        window.setTimeout(onFechar, 700);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onFechar}
        >
            <div
                className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-[1.75rem] shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                        <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">Anotar no diário</h2>
                        <p className="text-[11px] font-semibold text-slate-400">
                            Entra no relatório de hoje · {perfil || 'sem perfil'}
                        </p>
                    </div>
                    <button
                        onClick={onFechar}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                        title="Fechar (Esc)"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                <div className="p-5">
                    {confirmado ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-emerald-600 dark:text-emerald-400">
                            <span className="material-symbols-outlined text-[22px]">check_circle</span>
                            <span className="text-sm font-black">Anotado</span>
                        </div>
                    ) : !perfil ? (
                        <p className="py-6 text-center text-sm font-semibold text-slate-500">
                            Escolha quem está usando o painel antes de anotar.
                        </p>
                    ) : (
                        <>
                            <AnotacaoForm
                                partners={partners}
                                autoFocus
                                salvando={salvando}
                                onSalvar={salvar}
                                onCancelar={onFechar}
                            />
                            {erro && (
                                <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-400">
                                    Não salvou: {erro}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
