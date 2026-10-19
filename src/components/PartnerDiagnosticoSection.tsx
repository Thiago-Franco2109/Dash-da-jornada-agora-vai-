import { useMemo, useState } from 'react';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import {
    useParceiroDiagnostico,
    type EventoDiagnostico,
    type ResumoDiagnostico,
    type TipoEvento,
} from '../hooks/useParceiroDiagnostico';

/**
 * "Por que este parceiro caiu?" numa tela só.
 *
 * A resposta já existia no banco, mas espalhada: para saber se a loja
 * desligou um método de pagamento, mexeu nos bairros, encheu de recesso ou
 * tirou do ar o item que mais vendia, o CS precisava abrir meia dúzia de
 * abas — e metade dessas abas mostra o estado de HOJE, que não responde
 * "desativou?".
 *
 * A tela é duas coisas lado a lado:
 *   · o VEREDITO por pergunta, para bater o olho e saber onde olhar;
 *   · a LINHA DO TEMPO, para cruzar o que mudou com quando a venda caiu.
 *
 * A curva de pedidos fica em cima das duas de propósito: evento sem a curva
 * ao lado é trivia. O que importa é "mexeu no dia 12, caiu a partir do 13".
 */

interface Props {
    partner: EnrichedPerformanceRow;
}

const JANELAS = [
    { dias: 60, label: '60 dias' },
    { dias: 90, label: '90 dias' },
    { dias: 180, label: '6 meses' },
];

const META_TIPO: Record<TipoEvento, { icone: string; label: string }> = {
    pagamento: { icone: 'payments', label: 'Pagamento' },
    horario: { icone: 'schedule', label: 'Horário' },
    entrega: { icone: 'local_shipping', label: 'Entrega' },
    recesso: { icone: 'event_busy', label: 'Recesso' },
    cardapio: { icone: 'restaurant_menu', label: 'Cardápio' },
    cupom: { icone: 'confirmation_number', label: 'Cupom' },
};

const META_QUEM: Record<EventoDiagnostico['quem'], { label: string; classe: string }> = {
    loja: { label: 'a loja', classe: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    admin: { label: 'nós', classe: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
    sistema: { label: 'sistema', classe: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function diaMes(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Um achado do diagnóstico: o que responder a cada pergunta da lista. */
interface Achado {
    tipo: TipoEvento | 'cancelamento' | 'fuga';
    icone: string;
    pergunta: string;
    resposta: string;
    /** 'alerta' = provável causa · 'nota' = mexeu, mas não parece ser isso. */
    nivel: 'alerta' | 'nota' | 'ok';
}

/**
 * Transforma os contadores nas perguntas que o CS realmente faz.
 *
 * O que separa 'alerta' de 'nota' é a chance de aquilo explicar a queda:
 * desligar um método de pagamento ou tirar do ar o item que vendia é causa;
 * mexer no horário pode ser só ajuste de rotina.
 */
function montarAchados(r: ResumoDiagnostico): Achado[] {
    const achados: Achado[] = [];

    achados.push(r.pagamentoDesligou > 0
        ? { tipo: 'pagamento', icone: 'payments', pergunta: 'Desativou método de pagamento?', resposta: `Sim — ${r.pagamentoDesligou} ${r.pagamentoDesligou === 1 ? 'desativação' : 'desativações'} na janela`, nivel: 'alerta' }
        : r.pagamento > 0
            ? { tipo: 'pagamento', icone: 'payments', pergunta: 'Mexeu no pagamento?', resposta: `${r.pagamento} ${r.pagamento === 1 ? 'alteração' : 'alterações'}, nenhuma desativação`, nivel: 'nota' }
            : { tipo: 'pagamento', icone: 'payments', pergunta: 'Desativou método de pagamento?', resposta: 'Não mexeu', nivel: 'ok' });

    achados.push(r.horario > 0
        ? { tipo: 'horario', icone: 'schedule', pergunta: 'Mexeu no horário?', resposta: `${r.horario} ${r.horario === 1 ? 'alteração' : 'alterações'} de funcionamento`, nivel: 'nota' }
        : { tipo: 'horario', icone: 'schedule', pergunta: 'Mexeu no horário?', resposta: 'Não mexeu', nivel: 'ok' });

    achados.push(r.entrega > 0
        ? { tipo: 'entrega', icone: 'local_shipping', pergunta: 'Mexeu em bairro ou taxa?', resposta: `${r.entrega} ${r.entrega === 1 ? 'alteração' : 'alterações'} de entrega`, nivel: 'alerta' }
        : { tipo: 'entrega', icone: 'local_shipping', pergunta: 'Mexeu em bairro ou taxa?', resposta: 'Não mexeu', nivel: 'ok' });

    // Recesso renovado dia após dia é loja que some do app sem cancelar nada —
    // e some meses antes de o pedido zerar.
    achados.push(r.recesso >= 8
        ? { tipo: 'recesso', icone: 'event_busy', pergunta: 'Vem colocando recessos?', resposta: `${r.recesso} recessos${r.recessoPelaLoja > 0 ? `, ${r.recessoPelaLoja} pela própria loja` : ' — todos automáticos'}`, nivel: 'alerta' }
        : r.recesso > 0
            ? { tipo: 'recesso', icone: 'event_busy', pergunta: 'Colocou recesso?', resposta: `${r.recesso} na janela${r.recessoPelaLoja > 0 ? `, ${r.recessoPelaLoja} pela loja` : ''}`, nivel: 'nota' }
            : { tipo: 'recesso', icone: 'event_busy', pergunta: 'Colocou recesso?', resposta: 'Nenhum', nivel: 'ok' });

    achados.push(r.cardapioQueVendia > 0
        ? { tipo: 'cardapio', icone: 'restaurant_menu', pergunta: 'Tirou item que vendia?', resposta: `Sim — ${r.cardapioQueVendia} ${r.cardapioQueVendia === 1 ? 'item que vendia saiu' : 'itens que vendiam saíram'} do ar`, nivel: 'alerta' }
        : r.cardapio > 0
            ? { tipo: 'cardapio', icone: 'restaurant_menu', pergunta: 'Mexeu no cardápio?', resposta: `${r.cardapio} ${r.cardapio === 1 ? 'item saiu' : 'itens saíram'}, nenhum que vendia`, nivel: 'nota' }
            : { tipo: 'cardapio', icone: 'restaurant_menu', pergunta: 'Mexeu no cardápio?', resposta: 'Não mexeu', nivel: 'ok' });

    achados.push(r.cupom > 0
        ? { tipo: 'cupom', icone: 'confirmation_number', pergunta: 'Cupom saiu do ar?', resposta: `${r.cupom} ${r.cupom === 1 ? 'cupom venceu ou foi desativado' : 'cupons venceram ou foram desativados'}`, nivel: 'nota' }
        : { tipo: 'cupom', icone: 'confirmation_number', pergunta: 'Cupom saiu do ar?', resposta: 'Nenhum', nivel: 'ok' });

    if (r.taxaCancelamento !== null) {
        achados.push(r.taxaCancelamento >= 20
            ? { tipo: 'cancelamento', icone: 'cancel', pergunta: 'Está cancelando muito?', resposta: `Sim — ${r.taxaCancelamento}% dos pedidos do mês`, nivel: 'alerta' }
            : { tipo: 'cancelamento', icone: 'cancel', pergunta: 'Está cancelando muito?', resposta: `${r.taxaCancelamento}% no mês`, nivel: 'ok' });
    }

    // Item no ar mandando pedir por fora tira o pedido do app — e some da
    // nossa conta sem a loja perceber que está se sabotando.
    if (r.itensFuga.length > 0) {
        achados.push({
            tipo: 'fuga',
            icone: 'link_off',
            pergunta: 'Tem item mandando pedir por fora?',
            resposta: `${r.itensFuga.length} ${r.itensFuga.length === 1 ? 'item cita' : 'itens citam'} WhatsApp: ${r.itensFuga.slice(0, 2).join(' · ')}`,
            nivel: 'alerta',
        });
    }

    // Alertas primeiro: é a fila de leitura.
    const ordem = { alerta: 0, nota: 1, ok: 2 };
    return achados.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

const NIVEL_ESTILO = {
    alerta: 'border-red-200 dark:border-red-800/40 bg-red-50/60 dark:bg-red-900/10 text-red-700 dark:text-red-300',
    nota: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300',
    ok: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400',
} as const;

/** Curva mensal — o pano de fundo que dá sentido aos eventos. */
function Curva({ curva }: { curva: { mes: string; aceitos: number; cancelados: number }[] }) {
    const teto = Math.max(...curva.map(m => m.aceitos + m.cancelados), 1);
    return (
        <div className="flex gap-2">
            {curva.map(m => {
                const altura = (n: number) => `${Math.max((n / teto) * 100, n > 0 ? 4 : 0)}%`;
                return (
                    <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        {/* Altura fixa, não flex-1: porcentagem só resolve contra
                            pai com altura definida, e no flex o cálculo escorrega. */}
                        <div className="w-full h-20 flex flex-col justify-end gap-px">
                            {/* Cancelado em cima do aceito: a barra inteira é o
                                que entrou, a parte vermelha é o que se perdeu. */}
                            <div className="w-full bg-red-400 dark:bg-red-500 rounded-t" style={{ height: altura(m.cancelados) }} title={`${m.cancelados} cancelados`} />
                            <div className="w-full bg-emerald-500 rounded-b" style={{ height: altura(m.aceitos) }} title={`${m.aceitos} aceitos`} />
                        </div>
                        <span className="text-[10px] text-slate-400 tabular-nums">{MESES[Number(m.mes.slice(5, 7)) - 1]}</span>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">{m.aceitos}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function PartnerDiagnosticoSection({ partner }: Props) {
    const [dias, setDias] = useState(90);
    const [filtro, setFiltro] = useState<TipoEvento | ''>('');
    const { dados, carregando, erro, recarregar } = useParceiroDiagnostico(partner.estab_id, dias);

    const achados = useMemo(() => (dados ? montarAchados(dados.resumo) : []), [dados]);
    const eventos = useMemo(
        () => (dados ? dados.eventos.filter(e => !filtro || e.tipo === filtro) : []),
        [dados, filtro],
    );

    if (!partner.estab_id) {
        return (
            <div className="max-w-3xl mx-auto p-12 text-center text-slate-400 text-sm">
                Este parceiro não tem ID de estabelecimento, então não dá para montar o diagnóstico.
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Por que caiu?</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Tudo que mudou na operação da loja, no mesmo lugar que a curva de pedidos.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {JANELAS.map(j => (
                            <button
                                key={j.dias}
                                onClick={() => setDias(j.dias)}
                                className={`text-xs px-3 py-1.5 font-semibold transition-colors ${
                                    dias === j.dias
                                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                {j.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={recarregar}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-[16px]">refresh</span>
                    </button>
                </div>
            </div>

            {carregando && !dados ? (
                <p className="text-sm text-slate-400 py-8 text-center">Cruzando as mudanças da loja com a curva de pedidos…</p>
            ) : erro ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-amber-700 dark:text-amber-300 text-sm">
                    Não foi possível montar o diagnóstico: {erro}
                </div>
            ) : !dados ? null : (
                <>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                            Pedidos por mês — verde aceito, vermelho cancelado
                        </p>
                        <Curva curva={dados.curva} />
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                            O que mudou na janela de {dados.janela.dias} dias
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {achados.map(a => (
                                <div key={a.tipo} className={`rounded-xl border p-3 ${NIVEL_ESTILO[a.nivel]}`}>
                                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                                        <span className="material-symbols-outlined text-[16px]">{a.icone}</span>
                                        {a.pergunta}
                                    </p>
                                    <p className="text-sm font-bold mt-1">{a.resposta}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Linha do tempo <span className="text-slate-300 dark:text-slate-600 tabular-nums">{eventos.length}</span>
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                                <button
                                    onClick={() => setFiltro('')}
                                    className={`text-[11px] px-2 py-1 rounded-lg font-semibold transition-colors ${filtro === '' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                >
                                    tudo
                                </button>
                                {(Object.keys(META_TIPO) as TipoEvento[]).map(t => {
                                    const n = dados.eventos.filter(e => e.tipo === t).length;
                                    if (n === 0) return null;
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => setFiltro(filtro === t ? '' : t)}
                                            className={`text-[11px] px-2 py-1 rounded-lg font-semibold transition-colors ${filtro === t ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                        >
                                            {META_TIPO[t].label} {n}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
                            <div className="max-h-[46vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                                {eventos.length === 0 ? (
                                    <p className="px-4 py-8 text-sm text-slate-400 text-center">
                                        Nenhuma mudança de configuração nesta janela. Se a loja caiu, a causa está na
                                        curva de pedidos — ou é operacional, fora do que o sistema registra.
                                    </p>
                                ) : eventos.map((e, i) => (
                                    <div key={`${e.data}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                                        <span className="text-xs text-slate-400 tabular-nums shrink-0 w-12 pt-0.5">{diaMes(e.data)}</span>
                                        <span className={`material-symbols-outlined text-[18px] shrink-0 pt-0.5 ${e.desligou ? 'text-red-500' : 'text-slate-400'}`}>
                                            {META_TIPO[e.tipo].icone}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-slate-800 dark:text-slate-100">{e.titulo}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{e.detalhe}</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${META_QUEM[e.quem].classe}`}>
                                            {META_QUEM[e.quem].label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400">
                        Mudanças de configuração vêm do log de auditoria do CMS, que começa em 2026 — alteração
                        anterior a isso não aparece. Método de pagamento e bairro de entrega só têm data no log:
                        se a mudança for mais antiga, ela é invisível aqui. Banco de teste, réplica diária.
                        Montado em {dados.elapsedMs ?? '—'}ms.
                    </p>
                </>
            )}
        </div>
    );
}
