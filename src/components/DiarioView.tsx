import { useState, useMemo } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import type { AnotacaoDiario, NovaAnotacao } from '../types/diario';
import { useDiario, useDiarioEscrita } from '../hooks/useDiario';
import { useTrelloAtividadeHoje } from '../hooks/useTrelloAtividadeHoje';
import { getCategoriaDiario } from '../config/diarioCategorias';
import {
    hojeSP, deslocarDia, formatarHora, formatarDiaExtenso, rotuloDia, instanteParaDia,
} from '../utils/diarioDatas';
import AnotacaoForm from './diario/AnotacaoForm';
import ResumoTrelloDia from './diario/ResumoTrelloDia';
import RelatorioDiarioModal from './diario/RelatorioDiarioModal';

/**
 * Diário do CS — o registro do que a pessoa fez, dia a dia.
 *
 * A tela é "o meu dia", não um bloco de notas: abre com o que o Trello já
 * registrou (automático) e embaixo o que só a pessoa sabe. No fim do dia isso
 * já é o rascunho do relatório que vai pro chefe.
 *
 * Anotação é POR PESSOA: a tela só mostra o perfil da sessão e não oferece
 * seletor pra ver o diário do outro. Isso é regra de tela — o perfil é escolhido
 * sem senha e a RLS da tabela é aberta, igual ao resto do app.
 */

interface DiarioViewProps {
    perfil: string;
    partners: EnrichedPerformanceRow[];
}

export default function DiarioView({ perfil, partners }: DiarioViewProps) {
    const [dia, setDia] = useState(hojeSP());
    const [editando, setEditando] = useState<string | null>(null);
    const [relatorioAberto, setRelatorioAberto] = useState(false);

    const { anotacoes, carregando, erro } = useDiario(perfil, dia, dia);
    const { criar, atualizar, remover, salvando, erro: erroEscrita } = useDiarioEscrita(perfil);

    // A busca do Trello mora aqui, e não dentro do resumo, porque o relatório do
    // dia consome o mesmo dado — duas instâncias do hook bateriam duas vezes na
    // API pro mesmo dia e ainda poderiam divergir.
    const {
        data: atividadeBruta, isLoading: carregandoTrello, error: erroTrello, refresh: atualizarTrello,
    } = useTrelloAtividadeHoje({ data: dia, anexos: true });
    // O hook segura o dado do dia anterior enquanto busca o novo; sem esta
    // checagem o resumo de ontem apareceria sob o título de hoje.
    const atividade = atividadeBruta?.data === dia ? atividadeBruta : null;

    const hoje = hojeSP();
    const ehHoje = dia === hoje;
    const noFuturo = dia > hoje;

    const emRelatorio = anotacoes.filter(a => !a.privado).length;

    // estab_id -> cidade, pro relatório escrever "Parceiro (Cidade)" como no
    // semanal. Casado por id: nome se repete entre cidades.
    const cidadePorParceiro = useMemo(() => {
        const mapa = new Map<string, string>();
        for (const p of partners) {
            const id = p.estab_id ? String(p.estab_id) : '';
            if (id && p.cidade) mapa.set(id, p.cidade);
        }
        return mapa;
    }, [partners]);

    return (
        <div className="flex-1 bg-slate-50 dark:bg-slate-900 min-h-screen overflow-y-auto">
            <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* HEADER */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary rounded-lg shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-white text-2xl">menu_book</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Diário</h1>
                        {perfil && (
                            <span className="text-xs font-bold px-3 py-1.5 bg-primary/10 text-primary rounded-xl ml-1">
                                {perfil}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">
                        O que você fez — pra virar relatório sem ter que lembrar de tudo no fim da semana.
                    </p>
                </div>

                {/* NAVEGAÇÃO DE DATA */}
                <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button
                        onClick={() => setDia(d => deslocarDia(d, -1))}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-500 transition-colors"
                        title="Dia anterior"
                    >
                        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>

                    <div className="px-2 min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                            {rotuloDia(dia)}
                        </div>
                        {/* first-letter, não `capitalize`: este maiusculiza toda
                            palavra e vira "Quarta-Feira, 7 De Outubro De 2026". */}
                        <div className="text-[11px] font-semibold text-slate-400 first-letter:uppercase truncate">
                            {formatarDiaExtenso(dia)}
                        </div>
                    </div>

                    <button
                        onClick={() => setDia(d => deslocarDia(d, 1))}
                        disabled={ehHoje}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Dia seguinte"
                    >
                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>

                    <input
                        type="date"
                        value={dia}
                        max={hoje}
                        onChange={e => { if (e.target.value) setDia(e.target.value); }}
                        className="px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 border-none rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-slate-700 dark:text-slate-200"
                    />

                    {!ehHoje && (
                        <button
                            onClick={() => setDia(hoje)}
                            className="px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl transition-colors"
                        >
                            Voltar pra hoje
                        </button>
                    )}

                    <div className="flex-1" />

                    <span className="px-3 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {anotacoes.length} {anotacoes.length === 1 ? 'anotação' : 'anotações'}
                        {anotacoes.length > 0 && ` · ${emRelatorio} no relatório`}
                    </span>

                    {perfil && (
                        <button
                            onClick={() => setRelatorioAberto(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 hover:brightness-110 transition-all"
                        >
                            <span className="material-symbols-outlined text-[16px]">description</span>
                            Relatório do dia
                        </button>
                    )}
                </div>

                {!perfil ? (
                    <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-700 p-10 text-center">
                        <p className="text-sm font-bold text-slate-500">
                            Escolha quem está usando o painel pra abrir o diário.
                        </p>
                    </div>
                ) : (
                    <>
                        <ResumoTrelloDia
                            atividade={atividade}
                            carregando={carregandoTrello}
                            erro={erroTrello}
                            onAtualizar={atualizarTrello}
                        />

                        {/* ANOTAR */}
                        <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
                                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                                    {ehHoje ? 'Anotar agora' : `Anotar em ${rotuloDia(dia).toLowerCase()}`}
                                </h2>
                                <span className="text-[10px] font-bold text-slate-400 ml-auto hidden sm:inline">
                                    de qualquer tela: <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">J</kbd>
                                </span>
                            </div>

                            {noFuturo ? (
                                <p className="text-xs font-semibold text-slate-400">
                                    Diário é registro do que já aconteceu — não dá pra anotar no futuro.
                                </p>
                            ) : (
                                <AnotacaoForm
                                    // Remonta ao trocar o dia: a hora padrão da
                                    // anotação é estado inicial do form.
                                    key={dia}
                                    partners={partners}
                                    ocorridoEmPadrao={instanteParaDia(dia)}
                                    // Em dia passado a hora foi chutada (meio-dia),
                                    // então precisa ficar editável.
                                    permitirHora={!ehHoje}
                                    salvando={salvando}
                                    onSalvar={async (dados: NovaAnotacao) => { await criar(dados); }}
                                />
                            )}

                            {erroEscrita && (
                                <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-400">
                                    Não salvou: {erroEscrita}
                                </p>
                            )}
                        </div>

                        {/* LISTA DO DIA */}
                        {erro ? (
                            <div className="bg-red-50 dark:bg-red-500/10 rounded-2xl p-5">
                                <p className="text-xs font-bold text-red-700 dark:text-red-400">
                                    Não deu pra carregar o diário: {erro}
                                </p>
                            </div>
                        ) : carregando ? (
                            <div className="space-y-2">
                                {[0, 1].map(i => (
                                    <div key={i} className="h-20 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 animate-pulse" />
                                ))}
                            </div>
                        ) : anotacoes.length === 0 ? (
                            <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] border border-dashed border-slate-300 dark:border-slate-600 p-10 text-center">
                                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-4xl">history_edu</span>
                                <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                                    Nada anotado {ehHoje ? 'hoje' : 'neste dia'} ainda.
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-400 max-w-sm mx-auto">
                                    Anote o que o Trello não registra: a ligação que não virou card, a análise
                                    que você fez no painel, a reunião, o problema que apareceu.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {anotacoes.map(a => (
                                    editando === a.id ? (
                                        <div key={a.id} className="bg-white dark:bg-slate-800 rounded-[1.75rem] border border-primary/30 ring-2 ring-primary/10 p-6">
                                            <AnotacaoForm
                                                partners={partners}
                                                inicial={a}
                                                permitirHora
                                                salvando={salvando}
                                                rotuloSalvar="Salvar"
                                                onSalvar={async dados => {
                                                    const ok = await atualizar(a.id, {
                                                        texto: dados.texto,
                                                        categoria: dados.categoria ?? null,
                                                        partnerId: dados.partnerId ?? null,
                                                        partnerNome: dados.partnerNome ?? null,
                                                        privado: dados.privado ?? false,
                                                        ocorridoEm: dados.ocorridoEm,
                                                    });
                                                    if (ok) setEditando(null);
                                                }}
                                                onCancelar={() => setEditando(null)}
                                            />
                                        </div>
                                    ) : (
                                        <ItemAnotacao
                                            key={a.id}
                                            anotacao={a}
                                            onEditar={() => setEditando(a.id)}
                                            onRemover={() => remover(a.id)}
                                        />
                                    )
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {relatorioAberto && (
                <RelatorioDiarioModal
                    dia={dia}
                    perfil={perfil}
                    anotacoes={anotacoes}
                    atividade={atividade}
                    cidadePorParceiro={cidadePorParceiro}
                    onFechar={() => setRelatorioAberto(false)}
                />
            )}
        </div>
    );
}

function ItemAnotacao({
    anotacao: a,
    onEditar,
    onRemover,
}: {
    anotacao: AnotacaoDiario;
    onEditar: () => void;
    onRemover: () => void;
}) {
    const [confirmando, setConfirmando] = useState(false);
    const cat = getCategoriaDiario(a.categoria);

    return (
        <div className="group bg-white dark:bg-slate-800 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow p-5">
            <div className="flex items-start gap-3">
                <span className="text-[11px] font-black text-slate-400 tabular-nums pt-1 w-10 shrink-0">
                    {formatarHora(a.ocorridoEm)}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${cat.chipClasses}`}>
                            <span className="material-symbols-outlined text-[13px]">{cat.icon}</span>
                            {cat.label}
                        </span>
                        {a.partnerNome && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold">
                                <span className="material-symbols-outlined text-[13px]">storefront</span>
                                {a.partnerNome}
                            </span>
                        )}
                        {a.privado && (
                            <span
                                className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded-lg text-[10px] font-black"
                                title="Não vai pro relatório"
                            >
                                <span className="material-symbols-outlined text-[13px]">lock</span>
                                Só pra mim
                            </span>
                        )}
                    </div>

                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                        {a.texto}
                    </p>
                </div>

                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        onClick={onEditar}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                        title="Editar"
                    >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    {confirmando ? (
                        <>
                            <button
                                onClick={onRemover}
                                className="px-2 py-1 bg-red-600 text-white rounded-lg text-[10px] font-black hover:brightness-110 transition-all"
                            >
                                Apagar
                            </button>
                            <button
                                onClick={() => setConfirmando(false)}
                                className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600"
                            >
                                Não
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setConfirmando(true)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            title="Apagar"
                        >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
