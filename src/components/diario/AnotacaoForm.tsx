import { useState, useRef, useEffect, useMemo } from 'react';
import type { EnrichedPerformanceRow } from '../../utils/calculations';
import type { AnotacaoDiario, NovaAnotacao } from '../../types/diario';
import { CATEGORIAS_DIARIO, type CategoriaDiarioId } from '../../config/diarioCategorias';
import { paraInputDateTimeSP, deInputDateTimeSP } from '../../utils/diarioDatas';

/**
 * Formulário de anotação do diário — o mesmo no atalho global (Ctrl+J) e na
 * edição dentro da aba, pra não existirem duas regras de "o que é uma anotação
 * válida".
 *
 * Só o texto é obrigatório. Categoria, parceiro e cadeado são opcionais e ficam
 * a um clique: se preencher custar mais que isso, a pessoa para de anotar — que
 * é o jeito normal de um diário morrer.
 */

interface AnotacaoFormProps {
    partners: EnrichedPerformanceRow[];
    /** Preenche o form pra edição. Ausente = anotação nova. */
    inicial?: AnotacaoDiario;
    /** Instante default da anotação nova (dia escolhido na tela). */
    ocorridoEmPadrao?: string;
    /**
     * Mostra o campo de data/hora. Ligado quando a anotação não é de hoje — aí
     * a hora foi chutada (meio-dia) e a pessoa precisa poder corrigir.
     */
    permitirHora?: boolean;
    autoFocus?: boolean;
    salvando?: boolean;
    rotuloSalvar?: string;
    onSalvar: (dados: NovaAnotacao) => void | Promise<void>;
    onCancelar?: () => void;
}

const MAX_SUGESTOES = 6;

function normalizar(texto: string): string {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export default function AnotacaoForm({
    partners,
    inicial,
    ocorridoEmPadrao,
    permitirHora = false,
    autoFocus = false,
    salvando = false,
    rotuloSalvar = 'Anotar',
    onSalvar,
    onCancelar,
}: AnotacaoFormProps) {
    const [texto, setTexto] = useState(inicial?.texto ?? '');
    const [categoria, setCategoria] = useState<CategoriaDiarioId | null>(inicial?.categoria ?? null);
    const [privado, setPrivado] = useState(inicial?.privado ?? false);
    const [parceiro, setParceiro] = useState<{ id: string | null; nome: string } | null>(
        inicial?.partnerNome ? { id: inicial.partnerId, nome: inicial.partnerNome } : null,
    );
    const [buscaParceiro, setBuscaParceiro] = useState('');
    const [buscaAberta, setBuscaAberta] = useState(false);
    // Estado inicial só: quem troca o dia na aba remonta o form com `key={dia}`,
    // então não existe efeito ressincronizando isto por baixo.
    const [quando, setQuando] = useState(
        paraInputDateTimeSP(inicial?.ocorridoEm ?? ocorridoEmPadrao ?? new Date().toISOString()),
    );

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (autoFocus) {
            const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
            return () => window.clearTimeout(t);
        }
    }, [autoFocus]);

    const sugestoes = useMemo(() => {
        const q = normalizar(buscaParceiro);
        if (!q) return [];
        return partners
            .filter(p =>
                normalizar(p.estabelecimento ?? '').includes(q) ||
                normalizar(String(p.estab_id ?? '')).includes(q),
            )
            .slice(0, MAX_SUGESTOES);
    }, [partners, buscaParceiro]);

    const podeSalvar = texto.trim().length > 0 && !salvando;

    function salvar() {
        if (!podeSalvar) return;
        void onSalvar({
            texto,
            categoria,
            partnerId: parceiro?.id ?? null,
            partnerNome: parceiro?.nome ?? null,
            privado,
            ocorridoEm: deInputDateTimeSP(quando),
        });
        if (!inicial) {
            setTexto('');
            setCategoria(null);
            setParceiro(null);
            setPrivado(false);
            setBuscaParceiro('');
        }
    }

    function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        // Enter salva, Shift+Enter quebra linha: a anotação típica é de uma
        // linha só, e exigir clique no botão mata a velocidade do atalho.
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            salvar();
            return;
        }
        if (e.key === 'Escape' && onCancelar) {
            e.preventDefault();
            onCancelar();
        }
    }

    return (
        <div className="space-y-3">
            <textarea
                ref={textareaRef}
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={aoTeclar}
                rows={3}
                placeholder="O que você acabou de fazer?"
                className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-y text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />

            {/* Categorias */}
            <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS_DIARIO.map(c => {
                    const ativa = categoria === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setCategoria(ativa ? null : c.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${ativa ? c.chipAtivoClasses : `${c.chipClasses} hover:brightness-95`}`}
                        >
                            <span className="material-symbols-outlined text-[15px]">{c.icon}</span>
                            {c.label}
                        </button>
                    );
                })}
            </div>

            {/* Parceiro + cadeado + hora */}
            <div className="flex flex-wrap items-center gap-2">
                {parceiro ? (
                    <span className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-bold">
                        <span className="material-symbols-outlined text-[15px]">storefront</span>
                        {parceiro.nome}
                        <button
                            type="button"
                            onClick={() => { setParceiro(null); setBuscaParceiro(''); }}
                            className="p-0.5 hover:bg-primary/20 rounded-lg"
                            title="Tirar parceiro"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </span>
                ) : (
                    <div className="relative">
                        <span className="material-symbols-outlined text-[15px] absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">storefront</span>
                        <input
                            value={buscaParceiro}
                            onChange={e => { setBuscaParceiro(e.target.value); setBuscaAberta(true); }}
                            onFocus={() => setBuscaAberta(true)}
                            onBlur={() => window.setTimeout(() => setBuscaAberta(false), 150)}
                            placeholder="Parceiro (opcional)"
                            className="w-56 pl-8 pr-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                        />
                        {buscaAberta && sugestoes.length > 0 && (
                            <div className="absolute z-30 mt-1 w-72 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-1">
                                {sugestoes.map(p => (
                                    <button
                                        key={String(p.estab_id ?? p.estabelecimento)}
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            // Guarda id e nome: id identifica a loja,
                                            // nome deixa o relatório antigo legível
                                            // se ela for renomeada depois.
                                            setParceiro({
                                                id: p.estab_id ? String(p.estab_id) : null,
                                                nome: p.estabelecimento ?? '',
                                            });
                                            setBuscaParceiro('');
                                            setBuscaAberta(false);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{p.estabelecimento}</div>
                                        <div className="text-[10px] font-semibold text-slate-400">
                                            {p.cidade}{p.estab_id ? ` · #${p.estab_id}` : ''}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setPrivado(p => !p)}
                    title={privado ? 'Só pra mim — não vai pro relatório' : 'Entra no relatório do chefe'}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        privado
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                >
                    <span className="material-symbols-outlined text-[15px]">{privado ? 'lock' : 'lock_open'}</span>
                    {privado ? 'Só pra mim' : 'Vai pro relatório'}
                </button>

                {permitirHora && (
                    <input
                        type="datetime-local"
                        value={quando}
                        onChange={e => setQuando(e.target.value)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-slate-700 dark:text-slate-200"
                    />
                )}

                <div className="flex-1" />

                {onCancelar && (
                    <button
                        type="button"
                        onClick={onCancelar}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    type="button"
                    onClick={salvar}
                    disabled={!podeSalvar}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md shadow-primary/20 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                    <span className="material-symbols-outlined text-[15px]">{salvando ? 'hourglass_top' : 'check'}</span>
                    {salvando ? 'Salvando…' : rotuloSalvar}
                </button>
            </div>

            <p className="text-[10px] font-semibold text-slate-400">
                <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Enter</kbd> salva ·{' '}
                <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Shift+Enter</kbd> quebra linha
            </p>
        </div>
    );
}
