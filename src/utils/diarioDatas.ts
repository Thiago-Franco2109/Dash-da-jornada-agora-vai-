/**
 * Datas do diário, sempre no fuso de Brasília.
 *
 * Duas armadilhas que estas funções existem pra evitar:
 *
 * 1. `new Date('2026-10-07')` é meia-noite UTC, que em São Paulo ainda é dia 6
 *    às 21h. Somar/subtrair dia em cima disso erra a data à noite. Por isso toda
 *    aritmética de dia aqui é feita em `Date.UTC` e só depois formatada.
 *
 * 2. O fuso do navegador não é necessariamente o do Brasil (notebook viajando,
 *    VM em UTC). "Hoje" do diário é hoje em Brasília, não hoje da máquina —
 *    mesma régua de netlify/functions/trello-atividade-hoje.ts.
 *
 * O Brasil não tem mais horário de verão, então o offset -03:00 é fixo e dá pra
 * montar as bordas do dia por string, sem biblioteca de fuso.
 */

const FUSO = 'America/Sao_Paulo';

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** Hoje em Brasília, YYYY-MM-DD. 'en-CA' é o truque que já dá esse formato. */
export function hojeSP(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
}

/** Dia de um instante qualquer, em Brasília, YYYY-MM-DD. */
export function diaSPde(iso: string | Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso));
}

/** Soma (ou subtrai) dias de YYYY-MM-DD sem passar perto de fuso. */
export function deslocarDia(dataISO: string, dias: number): string {
    const [y, m, d] = dataISO.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d) + dias * 86_400_000);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Bordas do dia em Brasília, prontas pro filtro do Supabase (timestamptz). */
export function inicioDoDiaSP(dataISO: string): string {
    return `${dataISO}T00:00:00.000-03:00`;
}

export function fimDoDiaSP(dataISO: string): string {
    return `${dataISO}T23:59:59.999-03:00`;
}

/** "14:32" */
export function formatarHora(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }).format(new Date(iso));
}

/** "terça-feira, 7 de outubro de 2026" */
export function formatarDiaExtenso(dataISO: string): string {
    const [y, m, d] = dataISO.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Hoje" / "Ontem" / "seg, 5 de out" — rótulo curto do seletor de data. */
export function rotuloDia(dataISO: string): string {
    const hoje = hojeSP();
    if (dataISO === hoje) return 'Hoje';
    if (dataISO === deslocarDia(hoje, -1)) return 'Ontem';
    if (dataISO === deslocarDia(hoje, 1)) return 'Amanhã';
    const [y, m, d] = dataISO.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
}

// ── Semana ───────────────────────────────────────────────────────────────

/** Segunda-feira da semana que contém `dataISO`. Semana começa na segunda. */
export function inicioDaSemana(dataISO: string): string {
    const [y, m, d] = dataISO.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    // getUTCDay(): 0 = domingo. (dia + 6) % 7 dá quantos dias voltar até a segunda.
    return deslocarDia(dataISO, -((dt.getUTCDay() + 6) % 7));
}

/** Domingo da semana que contém `dataISO`. */
export function fimDaSemana(dataISO: string): string {
    return deslocarDia(inicioDaSemana(dataISO), 6);
}

export interface Janela {
    de: string;
    ate: string;
}

/**
 * Janela da semana de `dataISO`, cortada em `hoje`.
 *
 * O relatório é mandado na sexta, com a semana ainda correndo — então a janela
 * termina hoje, não no domingo que ainda não aconteceu. Isso importa pro
 * comparativo: comparar segunda-a-sexta contra uma semana inteira faria o
 * presente parecer sempre pior que o passado.
 */
export function janelaDaSemana(dataISO: string, hoje = hojeSP()): Janela {
    const de = inicioDaSemana(dataISO);
    const domingo = fimDaSemana(dataISO);
    return { de, ate: domingo > hoje ? hoje : domingo };
}

/**
 * A mesma janela sete dias antes — e com o MESMO número de dias, porque é
 * deslocamento puro. Sexta contra sexta, não sexta contra domingo.
 */
export function semanaAnterior({ de, ate }: Janela): Janela {
    return { de: deslocarDia(de, -7), ate: deslocarDia(ate, -7) };
}

/** Quantos dias a janela cobre, pontas incluídas. */
export function diasNaJanela({ de, ate }: Janela): number {
    const [ay, am, ad] = de.split('-').map(Number);
    const [by, bm, bd] = ate.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000) + 1;
}

/** "29 de setembro a 3 de outubro de 2026" — mês repetido só quando muda. */
export function rotuloPeriodo({ de, ate }: Janela): string {
    const parte = (iso: string, comAno: boolean) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Intl.DateTimeFormat('pt-BR', {
            day: 'numeric', month: 'long', ...(comAno ? { year: 'numeric' } : {}), timeZone: 'UTC',
        }).format(new Date(Date.UTC(y, m - 1, d)));
    };
    if (de === ate) return parte(de, true);
    const mesmoMes = de.slice(0, 7) === ate.slice(0, 7);
    const inicio = mesmoMes
        ? String(Number(de.slice(8, 10)))
        : parte(de, de.slice(0, 4) !== ate.slice(0, 4));
    return `${inicio} a ${parte(ate, true)}`;
}

/**
 * Instante em que a anotação "aconteceu", dado o dia escolhido na tela.
 *
 * No dia de hoje é agora — a pessoa acabou de fazer a coisa. Em dia passado não
 * dá pra adivinhar a hora, então assume meio-dia (e o campo fica editável na
 * tela), em vez de inventar 00:00, que empilharia tudo na madrugada.
 */
export function instanteParaDia(dataISO: string): string {
    if (dataISO === hojeSP()) return new Date().toISOString();
    return `${dataISO}T12:00:00.000-03:00`;
}

/** ISO -> valor de `<input type="datetime-local">` no horário de Brasília. */
export function paraInputDateTimeSP(iso: string): string {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const get = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '00';
    // hour12:false ainda devolve "24" à meia-noite em alguns runtimes.
    const hora = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hora}:${get('minute')}`;
}

/** Valor de `<input type="datetime-local">` (que é horário de Brasília) -> ISO. */
export function deInputDateTimeSP(valor: string): string {
    if (!valor) return new Date().toISOString();
    return new Date(`${valor}:00.000-03:00`).toISOString();
}
