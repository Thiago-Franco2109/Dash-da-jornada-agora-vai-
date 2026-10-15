import { useState } from 'react';
import CampaignIcons from './CampaignIcons';
import { ACCENT_STYLES, TONE_STYLES, type CampaignAccent, type CardTone } from './promo/promoTokens';
import { agruparPorZona, ROTULO_ZONA, type Prioridade, type ZonaCampanha } from '../utils/campanhaPrioridade';

/**
 * Galeria horizontal de campanhas do parceiro.
 *
 * A posição é a hierarquia: quanto mais à esquerda, mais a campanha depende de
 * uma ação do CS. E o peso visual acompanha — card largo com capa inteira e
 * botão na esquerda, card estreito sem ação nenhuma na direita. Quem não pede
 * nada (no ar, fora da cidade) sai do caminho sem precisar ser escondido.
 */

export interface CampanhaCard {
    key: string;
    title: string;
    description: string;
    icons: readonly string[];
    accent: CampaignAccent;
    /** URL já resolvida da capa (ver resolveCapaCampanha). null = cai no ícone. */
    capaUrl: string | null;
    tone: CardTone;
    toneLabel: string;
    prioridade: Prioridade;
    flag?: string;
    /** Linha curta explicando por que a campanha está nesta zona. */
    motivo?: string;
    itemCount?: number;
    itemCountLabel?: string;
    footnote?: string;
    manual?: { value: string; options: { value: string; label: string }[]; onChange: (val: string) => void };
    href: string;
    cmsLabel?: string;
    acaoLabel?: string;
    onGerarArte?: () => void;
    onOpenCrm?: () => void;
}

interface Props {
    campanhas: CampanhaCard[];
    cidade?: string;
}

/** Larguras por zona: o card encolhe conforme deixa de pedir ação. */
const LARGURA: Record<ZonaCampanha, string> = {
    agir: 'w-[240px]',
    aguardando: 'w-[204px]',
    no_ar: 'w-[178px]',
    parado: 'w-[148px]',
};

const COR_ZONA: Record<ZonaCampanha, string> = {
    agir: 'text-amber-600 dark:text-amber-400',
    aguardando: 'text-slate-500 dark:text-slate-400',
    no_ar: 'text-emerald-600 dark:text-emerald-400',
    parado: 'text-slate-400 dark:text-slate-500',
};

/** Capa 1200x400 = 3:1; a caixa trava a proporção pra não pular no carregamento. */
function Capa({ card, altura }: { card: CampanhaCard; altura: number }) {
    const [quebrou, setQuebrou] = useState(false);
    const mostraImagem = card.capaUrl && !quebrou;

    if (!mostraImagem) {
        return (
            <div
                className={`flex items-center justify-center ${ACCENT_STYLES[card.accent]}`}
                style={{ height: altura }}
            >
                <CampaignIcons icons={card.icons} iconClassName="text-[22px]" />
            </div>
        );
    }
    return (
        <img
            src={card.capaUrl!}
            alt=""
            loading="lazy"
            onError={() => setQuebrou(true)}
            className="w-full object-cover bg-slate-100 dark:bg-slate-800"
            style={{ height: altura }}
        />
    );
}

function CardAgir({ card }: { card: CampanhaCard }) {
    const { rail } = TONE_STYLES[card.tone];
    return (
        <div className="w-[240px] shrink-0 flex flex-col rounded-xl overflow-hidden bg-white dark:bg-slate-800/60 border border-slate-300/80 dark:border-slate-600/70">
            <Capa card={card} altura={76} />
            <div className={`h-[3px] ${rail}`} aria-hidden="true" />
            <div className="flex flex-col flex-1 p-3">
                <div className="flex items-center gap-1.5">
                    <h4 className="flex-1 text-[14px] font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                        {card.title}
                    </h4>
                    {card.flag && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            {card.flag}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {card.motivo ?? card.description}
                </p>
                {card.manual && (
                    <select
                        value={card.manual.value}
                        onChange={e => card.manual!.onChange(e.target.value)}
                        className="w-full min-h-8 py-1 mt-2.5 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500 outline-none"
                    >
                        {card.manual.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                )}
                <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg px-3 py-2 text-[12px] font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
                >
                    {card.acaoLabel ?? card.cmsLabel ?? 'Abrir no CMS'}
                    <span className="material-symbols-outlined text-[14px]">arrow_outward</span>
                </a>
                {(card.onGerarArte || card.onOpenCrm) && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        {card.onGerarArte ? (
                            <button
                                type="button"
                                onClick={card.onGerarArte}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                            >
                                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                Gerar arte
                            </button>
                        ) : <span />}
                        {card.onOpenCrm && (
                            <button
                                type="button"
                                onClick={card.onOpenCrm}
                                className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                            >
                                Anotar
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function CardAguardando({ card }: { card: CampanhaCard }) {
    return (
        <div className="w-[204px] shrink-0 flex flex-col rounded-xl overflow-hidden bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <Capa card={card} altura={48} />
            <div className="flex flex-col flex-1 p-3">
                <h4 className="text-[13px] font-bold tracking-tight text-slate-800 dark:text-slate-100 truncate">
                    {card.title}
                </h4>
                <p className="mt-1 flex-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {card.motivo ?? card.toneLabel}
                </p>
                {card.manual && (
                    <select
                        value={card.manual.value}
                        onChange={e => card.manual!.onChange(e.target.value)}
                        className="w-full min-h-8 py-1 mt-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-[11px] font-semibold text-slate-600 dark:text-slate-300 outline-none"
                    >
                        {card.manual.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                )}
                <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                >
                    Abrir no CMS
                </a>
            </div>
        </div>
    );
}

/** Zona "parado": a capa vira fantasma e o card só diz o nome e o porquê. */
function CardParado({ card }: { card: CampanhaCard }) {
    return (
        <div className={`${LARGURA.parado} shrink-0 flex flex-col rounded-xl p-2.5 border border-dashed border-slate-200 dark:border-slate-700`}>
            <div className="h-10 w-full rounded-lg overflow-hidden opacity-40 grayscale">
                <Capa card={card} altura={40} />
            </div>
            <p className="mt-2 text-[12px] font-bold leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                {card.title}
            </p>
            <p className="mt-auto pt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                {card.motivo ?? 'Sem ação agora.'}
            </p>
        </div>
    );
}

/**
 * Zona "no ar": não repete o motivo — a zona e o carimbo já dizem a mesma
 * coisa, e ler "no ar" três vezes no mesmo card não informa nada.
 */
function CardNoAr({ card }: { card: CampanhaCard }) {
    const { dot, stamp } = TONE_STYLES[card.tone];
    return (
        <div className={`${LARGURA.no_ar} shrink-0 flex flex-col rounded-xl p-2.5 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700`}>
            <div className="flex items-start gap-2">
                <div className="size-9 shrink-0 rounded-lg overflow-hidden">
                    <Capa card={card} altura={36} />
                </div>
                <p className="min-w-0 flex-1 text-[12px] font-bold leading-snug text-slate-700 dark:text-slate-200 line-clamp-2">
                    {card.title}
                </p>
            </div>
            <p className={`mt-2 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider ${stamp}`}>
                <span className={`size-1 rounded-full ${dot}`} />
                {card.toneLabel}
            </p>
            {card.itemCount != null && card.itemCount > 0 && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {card.itemCount} {card.itemCount === 1 ? 'item' : 'itens'} {card.itemCountLabel}
                </p>
            )}
            <a
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto pt-2 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
                Ver no CMS
            </a>
        </div>
    );
}

export default function PartnerCampanhaGaleria({ campanhas, cidade }: Props) {
    const grupos = agruparPorZona(campanhas);
    const pedemAcao = campanhas.filter(c => c.prioridade.zona === 'agir').length;
    const noAr = campanhas.filter(c => c.prioridade.zona === 'no_ar').length;

    if (campanhas.length === 0) {
        return (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                Nenhuma campanha vigente para este parceiro.
            </p>
        );
    }

    return (
        <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3">
                <span className="text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {noAr > 0
                        ? `${noAr} campanha${noAr > 1 ? 's' : ''} no ar`
                        : 'Nenhuma campanha no ar'}
                </span>
                <span className="text-[13px] text-slate-500 dark:text-slate-400">
                    {pedemAcao > 0
                        ? `· ${pedemAcao} ${pedemAcao > 1 ? 'pedem' : 'pede'} ação sua`
                        : '· nada pendente com você'}
                </span>
            </div>

            {/* color-scheme local: o app não declara, e sem isso a barra de
                rolagem nativa sai clara em cima do fundo escuro. */}
            <div className="flex gap-3.5 overflow-x-auto pb-2.5 -mx-1 px-1 dark:[color-scheme:dark]">
                {grupos.map((grupo, i) => (
                    <div key={grupo.zona} className="flex gap-3.5">
                        {i > 0 && <div className="w-px bg-slate-200 dark:bg-slate-700 mt-6 shrink-0" aria-hidden="true" />}
                        <div>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.08em] mb-2 whitespace-nowrap ${COR_ZONA[grupo.zona]}`}>
                                {grupo.zona === 'parado' && cidade && grupo.itens.every(c => c.prioridade.score === 0)
                                    ? `fora de ${cidade}`
                                    : ROTULO_ZONA[grupo.zona]}
                                {` · ${grupo.itens.length}`}
                            </p>
                            <div className="flex gap-2.5 items-stretch">
                                {grupo.itens.map(card =>
                                    grupo.zona === 'agir' ? <CardAgir key={card.key} card={card} />
                                        : grupo.zona === 'aguardando' ? <CardAguardando key={card.key} card={card} />
                                            : grupo.zona === 'no_ar' ? <CardNoAr key={card.key} card={card} />
                                                : <CardParado key={card.key} card={card} />,
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
