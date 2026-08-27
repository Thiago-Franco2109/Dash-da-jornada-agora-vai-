import { cityBelongsToManager, type Manager, type ProductModeKey } from '../config/managerMapping';
import type { AtivacaoDiariaRow } from '../hooks/useAtivacoesDiarias';

/** WEEKDAY() do MySQL: 0=segunda .. 4=sexta (5 e 6 = sábado/domingo, já excluídos). */
export const DIAS_UTEIS = [
    { dow: 0, label: 'Seg' },
    { dow: 1, label: 'Ter' },
    { dow: 2, label: 'Qua' },
    { dow: 3, label: 'Qui' },
    { dow: 4, label: 'Sex' },
] as const;

export interface MeuRitmoAtivacoes {
    /** Total (promo + cupom) por dia da semana, seg–sex, somado em todo o histórico disponível. */
    porDiaSemana: { dow: number; label: string; total: number }[];
    /** Melhor dia já registrado (excluindo hoje, pra comparar "hoje vs. recorde"). null = sem dado. */
    recorde: { dia: string; total: number } | null;
    /** Atividade de hoje (pode estar parcial — o dia ainda não acabou). */
    hoje: { dia: string; total: number };
    /** Nº de dias distintos com pelo menos 1 ativação (contexto pro tamanho da amostra). */
    diasComDado: number;
}

/** Filtra as linhas do banco pras cidades do gestor informado. */
function minhasLinhas(rows: AtivacaoDiariaRow[], manager: Manager, mode: ProductModeKey): AtivacaoDiariaRow[] {
    return rows.filter(r => cityBelongsToManager(r.cidade, manager, mode));
}

export function computeMeuRitmo(
    rows: AtivacaoDiariaRow[],
    manager: Manager,
    mode: ProductModeKey,
    hojeStr: string,
): MeuRitmoAtivacoes {
    const minhas = minhasLinhas(rows, manager, mode);

    const totalPorDia = new Map<string, number>();
    const totalPorDow = new Map<number, number>();
    for (const r of minhas) {
        const total = r.promo + r.cupom;
        totalPorDia.set(r.dia, (totalPorDia.get(r.dia) ?? 0) + total);
        if (r.dow <= 4) totalPorDow.set(r.dow, (totalPorDow.get(r.dow) ?? 0) + total);
    }

    const porDiaSemana = DIAS_UTEIS.map(({ dow, label }) => ({ dow, label, total: totalPorDow.get(dow) ?? 0 }));

    let recorde: { dia: string; total: number } | null = null;
    for (const [dia, total] of totalPorDia) {
        if (dia === hojeStr) continue; // hoje ainda está "rolando" — não compete com o próprio recorde
        if (!recorde || total > recorde.total) recorde = { dia, total };
    }

    return {
        porDiaSemana,
        recorde,
        hoje: { dia: hojeStr, total: totalPorDia.get(hojeStr) ?? 0 },
        diasComDado: totalPorDia.size,
    };
}
