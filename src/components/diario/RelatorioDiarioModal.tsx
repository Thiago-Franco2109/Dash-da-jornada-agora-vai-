import { useEffect, useMemo, useState } from 'react';
import type { AnotacaoDiario } from '../../types/diario';
import type { AtividadeTrelloHoje } from '../../hooks/useTrelloAtividadeHoje';
import { getCategoriaDiario } from '../../config/diarioCategorias';
import { formatarHora, formatarDiaExtenso } from '../../utils/diarioDatas';
import { montarRelatorioDiario, nomeArquivoRelatorio } from '../../utils/relatorioDiario';
import { fatiarParaDiscord, formatarContagem, LIMITE_DISCORD } from '../../utils/discordTexto';

/**
 * Relatório do dia pronto pra colar no Discord do chefe.
 *
 * Duas decisões moldam esta tela:
 *
 * 1. É RASCUNHO, não número fechado. O gerador monta tudo e a pessoa desmarca o
 *    que não vale antes de copiar — ao reproduzir o relatório semanal de
 *    02/10/2026 a régua automática deu 48/13/8/5 onde o enviado tinha 47/10/7/5,
 *    ou seja, houve curadoria. Cuspir número pronto só criaria confiança falsa.
 *
 * 2. O Discord corta mensagem em 2000 caracteres, então o texto sai fatiado,
 *    com um botão de copiar por parte. Sem isso o relatório longo (o semanal
 *    tem ~3.200 caracteres) teria que ser recortado na mão toda vez.
 */

/**
 * Copia texto, com dois caminhos.
 *
 * `navigator.clipboard` é o certo, mas some em contexto não seguro e é barrado
 * por política de permissão em iframe (o preview do próprio painel cai nisso).
 * Como copiar É a função da tela, vale cair no `execCommand('copy')` — obsoleto,
 * mas aceito em todo navegador que a equipe usa — antes de desistir e pedir
 * seleção manual.
 */
async function copiarTexto(texto: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch { /* tenta o caminho antigo abaixo */ }

    try {
        const campo = document.createElement('textarea');
        campo.value = texto;
        // Fora da tela, mas focável: `display:none` não é selecionável e o
        // execCommand não copia nada.
        campo.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
        campo.setAttribute('readonly', '');
        document.body.appendChild(campo);
        campo.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(campo);
        return ok;
    } catch {
        return false;
    }
}

interface RelatorioDiarioModalProps {
    dia: string;
    perfil: string;
    /** Todas as anotações do dia, inclusive as privadas (filtradas aqui). */
    anotacoes: AnotacaoDiario[];
    atividade: AtividadeTrelloHoje | null;
    /** estab_id -> cidade. */
    cidadePorParceiro: Map<string, string>;
    onFechar: () => void;
}

export default function RelatorioDiarioModal({
    dia, perfil, anotacoes, atividade, cidadePorParceiro, onFechar,
}: RelatorioDiarioModalProps) {
    const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
    const [incluirTrello, setIncluirTrello] = useState(true);
    const [copiada, setCopiada] = useState<number | null>(null);
    const [erroCopia, setErroCopia] = useState<string | null>(null);

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [onFechar]);

    // O cadeado é definitivo: anotação privada nem aparece como opção aqui,
    // pra não depender de a pessoa lembrar de desmarcar na hora de mandar.
    const candidatas = useMemo(
        () => anotacoes.filter(a => !a.privado).sort((x, y) => x.ocorridoEm.localeCompare(y.ocorridoEm)),
        [anotacoes],
    );
    const privadas = anotacoes.length - candidatas.length;

    const escolhidas = useMemo(
        () => candidatas.filter(a => !excluidas.has(a.id)),
        [candidatas, excluidas],
    );

    const texto = useMemo(() => montarRelatorioDiario({
        perfil, dia,
        anotacoes: escolhidas,
        atividade: incluirTrello ? atividade : null,
        cidadePorParceiro,
    }), [perfil, dia, escolhidas, atividade, incluirTrello, cidadePorParceiro]);

    const partes = useMemo(() => fatiarParaDiscord(texto), [texto]);

    function alternar(id: string) {
        setExcluidas(antes => {
            const depois = new Set(antes);
            if (depois.has(id)) depois.delete(id); else depois.add(id);
            return depois;
        });
    }

    async function copiar(indice: number) {
        setErroCopia(null);
        if (await copiarTexto(partes[indice])) {
            setCopiada(indice);
            window.setTimeout(() => setCopiada(null), 1800);
            return;
        }
        // Os dois caminhos falharam — o texto segue visível no preview, que é
        // `select-text` justamente pra dar pra copiar na mão.
        setErroCopia('O navegador bloqueou a cópia. Selecione o texto acima e copie na mão.');
    }

    function baixar() {
        const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoRelatorio(dia, perfil);
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 pb-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
            onClick={onFechar}
        >
            <div
                className="w-full max-w-5xl bg-white dark:bg-slate-800 rounded-[1.75rem] shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 slide-in-from-top-2 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* CABEÇALHO */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px]">
                            description
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">Relatório do dia</h2>
                        <p className="text-[11px] font-semibold text-slate-400 first-letter:uppercase truncate">
                            {formatarDiaExtenso(dia)}
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

                <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-700">

                    {/* ESQUERDA — o que entra */}
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                O que entra
                            </h3>
                            {candidatas.length > 0 && (
                                <button
                                    onClick={() => setExcluidas(antes =>
                                        antes.size > 0 ? new Set() : new Set(candidatas.map(a => a.id)))}
                                    className="text-[11px] font-bold text-primary hover:underline"
                                >
                                    {excluidas.size > 0 ? 'Marcar todas' : 'Desmarcar todas'}
                                </button>
                            )}
                        </div>

                        {candidatas.length === 0 ? (
                            <p className="text-xs font-semibold text-slate-400">
                                Nenhuma anotação deste dia entra no relatório.
                            </p>
                        ) : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                {candidatas.map(a => {
                                    const cat = getCategoriaDiario(a.categoria);
                                    const dentro = !excluidas.has(a.id);
                                    return (
                                        <label
                                            key={a.id}
                                            className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors ${
                                                dentro
                                                    ? 'bg-slate-50 dark:bg-slate-900/60'
                                                    : 'bg-transparent opacity-45'
                                            } hover:bg-slate-100 dark:hover:bg-slate-700/40`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={dentro}
                                                onChange={() => alternar(a.id)}
                                                className="mt-0.5 size-4 rounded border-slate-300 text-primary focus:ring-primary/30 shrink-0"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-[10px] font-black text-slate-400 tabular-nums">
                                                        {formatarHora(a.ocorridoEm)}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${cat.chipClasses}`}>
                                                        {cat.label}
                                                    </span>
                                                    {a.partnerNome && (
                                                        <span className="text-[10px] font-bold text-slate-500 truncate">
                                                            {a.partnerNome}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="block text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-2">
                                                    {a.texto}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        {privadas > 0 && (
                            <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                {privadas} {privadas === 1 ? 'anotação com cadeado ficou' : 'anotações com cadeado ficaram'} de fora
                            </p>
                        )}

                        <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                            incluirTrello
                                ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60'
                                : 'border-dashed border-slate-200 dark:border-slate-700 opacity-50'
                        }`}>
                            <input
                                type="checkbox"
                                checked={incluirTrello}
                                onChange={() => setIncluirTrello(v => !v)}
                                disabled={!atividade}
                                className="mt-0.5 size-4 rounded border-slate-300 text-primary focus:ring-primary/30 shrink-0"
                            />
                            <span className="min-w-0">
                                <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                                    Movimentação no Trello
                                </span>
                                <span className="block text-[11px] font-semibold text-slate-400">
                                    {atividade
                                        ? `${atividade.cardsMovidos} cards · ${atividade.comentarios} comentários · ${atividade.anexos} anexos`
                                        : 'Sem dado do Trello para este dia'}
                                </span>
                            </span>
                        </label>
                    </div>

                    {/* DIREITA — texto final */}
                    <div className="p-6 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                Texto pro Discord
                            </h3>
                            <span className={`text-[11px] font-bold ${
                                partes.length > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                            }`}>
                                {formatarContagem(texto.length)} caracteres
                                {partes.length > 1 && ` · ${partes.length} mensagens`}
                            </span>
                        </div>

                        <pre className="max-h-80 overflow-auto p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-mono select-text">
                            {texto}
                        </pre>

                        {partes.length > 1 && (
                            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2">
                                O Discord corta em {formatarContagem(LIMITE_DISCORD)} caracteres, então o relatório
                                vai em {partes.length} mensagens. Copie e cole uma de cada vez, na ordem.
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {partes.map((parte, i) => (
                                <button
                                    key={i}
                                    onClick={() => copiar(i)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        copiada === i
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-primary text-white shadow-md shadow-primary/20 hover:brightness-110'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]">
                                        {copiada === i ? 'check' : 'content_copy'}
                                    </span>
                                    {copiada === i
                                        ? 'Copiado'
                                        : partes.length === 1
                                            ? 'Copiar'
                                            : `Copiar ${i + 1} de ${partes.length}`}
                                    <span className="text-[10px] font-semibold opacity-70">
                                        {formatarContagem(parte.length)}
                                    </span>
                                </button>
                            ))}

                            <button
                                onClick={baixar}
                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[15px]">download</span>
                                Baixar .txt
                            </button>
                        </div>

                        {erroCopia && (
                            <p className="text-[11px] font-bold text-red-600 dark:text-red-400">{erroCopia}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
