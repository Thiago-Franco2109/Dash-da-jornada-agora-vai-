import type { PromoStatus } from '../hooks/useStatusOverride';

/**
 * Rótulos/ícones/cores dos status de trabalho do CS por campanha.
 *
 * O que existia aqui antes era um filtro de valor único no formato
 * "campo:status" — produto cartesiano de 4 campos × 5 status = 20 opções num
 * `<select>` só, uma condição por vez. Foi substituído pelo construtor de
 * filtros compostos (config/camposFiltraveis.ts + utils/avaliarFiltro.ts), que
 * separa as leituras que aquele rótulo único misturava. Sobrou só o
 * vocabulário, que o construtor reaproveita nas opções de campanha.
 */
export const CAMPAIGN_STATUS_OPTIONS: { value: PromoStatus; label: string; icon: string; color: string }[] = [
    { value: 'ativo', label: 'Ativo', icon: 'check_circle', color: 'text-emerald-600' },
    { value: 'aguardando', label: 'Não ofertado', icon: 'priority_high', color: 'text-red-500' },
    { value: 'ofertei', label: 'Aguardando retorno', icon: 'hourglass_top', color: 'text-orange-500' },
    { value: 'negado', label: 'Negado', icon: 'block', color: 'text-slate-500' },
    { value: 'inativo', label: 'Inativo ou sem status', icon: 'remove', color: 'text-slate-400' },
];
