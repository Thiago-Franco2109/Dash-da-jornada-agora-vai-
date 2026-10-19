import { useMemo, useState } from 'react';

/**
 * "Quanto vou receber nessa promoção?" — a pergunta que mais chega do parceiro.
 *
 * Conta travada com o Thiago:
 *     repasse = (preço pago pelo cliente + subsídio Bigou) − comissão
 * e a comissão incide sobre o total faturado no pedido, ou seja sobre
 * preço pago + subsídio — não só sobre o que o cliente pagou.
 *
 * A comissão vem solta (padrão 12%) porque é a taxa efetiva do contrato
 * (`comissao_delivery`), que varia por parceiro e não está no row da carteira.
 */

const COMISSAO_PADRAO = 12;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Aceita "19,90", "19.90" e "R$ 19,90" — o CS digita como vier do cardápio. */
function parseValor(texto: string): number {
    const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number(limpo);
    return Number.isFinite(n) ? n : 0;
}

interface Props {
    /** Nome do parceiro, só pra compor o texto que o CS manda no WhatsApp. */
    partnerName?: string;
}

export default function PromoRepasseCalculator({ partnerName }: Props) {
    const [precoCheio, setPrecoCheio] = useState('');
    const [precoPago, setPrecoPago] = useState('');
    const [subsidio, setSubsidio] = useState('');
    const [comissaoPct, setComissaoPct] = useState(String(COMISSAO_PADRAO));
    const [copiado, setCopiado] = useState(false);

    const conta = useMemo(() => {
        const pago = parseValor(precoPago);
        const sub = parseValor(subsidio);
        const cheio = parseValor(precoCheio);
        const pct = parseValor(comissaoPct);
        const base = pago + sub;
        const comissao = (base * pct) / 100;
        const repasse = base - comissao;
        // Sem promo o cliente pagaria o preço cheio, sem subsídio nenhum.
        const repasseSemPromo = cheio > 0 ? cheio - (cheio * pct) / 100 : null;
        return {
            pago, sub, cheio, pct, base, comissao, repasse, repasseSemPromo,
            diferenca: repasseSemPromo != null ? repasse - repasseSemPromo : null,
            preenchido: base > 0,
        };
    }, [precoCheio, precoPago, subsidio, comissaoPct]);

    const textoWhats = useMemo(() => {
        const linhas = [
            partnerName ? `*${partnerName}* — quanto entra por pedido na promoção:` : 'Quanto entra por pedido na promoção:',
            `• Cliente paga: ${brl.format(conta.pago)}`,
            `• Subsídio Bigou: ${brl.format(conta.sub)}`,
            `• Base do pedido: ${brl.format(conta.base)}`,
            `• Comissão (${conta.pct}%): -${brl.format(conta.comissao)}`,
            `*Você recebe: ${brl.format(conta.repasse)}*`,
        ];
        if (conta.repasseSemPromo != null) {
            linhas.push(`(fora da promoção, no preço cheio de ${brl.format(conta.cheio)}, entrariam ${brl.format(conta.repasseSemPromo)})`);
        }
        return linhas.join('\n');
    }, [conta, partnerName]);

    async function copiar() {
        try {
            await navigator.clipboard.writeText(textoWhats);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch {
            setCopiado(false);
        }
    }

    function limpar() {
        setPrecoCheio('');
        setPrecoPago('');
        setSubsidio('');
        setComissaoPct(String(COMISSAO_PADRAO));
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-emerald-500">calculate</span>
                        Quanto o parceiro recebe
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Preço pago pelo cliente + subsídio Bigou − comissão sobre o total.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={limpar}
                    className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                    Limpar
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Campo label="Cliente paga" hint="preço promocional" value={precoPago} onChange={setPrecoPago} autoFocus />
                <Campo label="Subsídio Bigou" hint="quanto a Bigou cobre" value={subsidio} onChange={setSubsidio} />
                <Campo label="Comissão %" hint="taxa do contrato" value={comissaoPct} onChange={setComissaoPct} sufixo="%" />
                <Campo label="Preço cheio" hint="opcional, pra comparar" value={precoCheio} onChange={setPrecoCheio} />
            </div>

            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-900/15 p-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Recebe por pedido
                        </p>
                        <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {brl.format(conta.repasse)}
                        </p>
                    </div>
                    <dl className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5 tabular-nums">
                        <Linha termo="Base do pedido" valor={brl.format(conta.base)} />
                        <Linha termo={`Comissão (${conta.pct || 0}%)`} valor={`− ${brl.format(conta.comissao)}`} />
                        {conta.repasseSemPromo != null && (
                            <Linha
                                termo="Sem promoção entraria"
                                valor={brl.format(conta.repasseSemPromo)}
                            />
                        )}
                    </dl>
                </div>

                {conta.diferenca != null && conta.preenchido && (
                    <p className={`mt-3 text-xs font-semibold ${conta.diferenca >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {conta.diferenca >= 0
                            ? `Com o subsídio, o parceiro recebe ${brl.format(conta.diferenca)} a mais por pedido do que no preço cheio.`
                            : `O parceiro abre mão de ${brl.format(Math.abs(conta.diferenca))} por pedido em troca do volume da campanha.`}
                    </p>
                )}
            </div>

            <button
                type="button"
                onClick={copiar}
                disabled={!conta.preenchido}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40 transition-colors"
            >
                <span className="material-symbols-outlined text-[18px]">{copiado ? 'check' : 'content_copy'}</span>
                {copiado ? 'Copiado' : 'Copiar explicação pro WhatsApp'}
            </button>
        </div>
    );
}

function Campo({
    label, hint, value, onChange, sufixo, autoFocus,
}: {
    label: string;
    hint: string;
    value: string;
    onChange: (v: string) => void;
    sufixo?: string;
    autoFocus?: boolean;
}) {
    return (
        <label className="space-y-1.5 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">{label}</span>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    {sufixo ? '' : 'R$'}
                </span>
                <input
                    type="text"
                    inputMode="decimal"
                    autoFocus={autoFocus}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="0,00"
                    className={`w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${sufixo ? 'pl-3.5 pr-8' : 'pl-9 pr-3'} text-sm font-semibold tabular-nums focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors dark:text-white`}
                />
                {sufixo && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{sufixo}</span>
                )}
            </div>
            <span className="text-[10px] text-slate-400 block">{hint}</span>
        </label>
    );
}

function Linha({ termo, valor }: { termo: string; valor: string }) {
    return (
        <div className="flex items-center justify-between gap-6">
            <dt className="text-slate-500 dark:text-slate-400">{termo}</dt>
            <dd className="font-semibold">{valor}</dd>
        </div>
    );
}
