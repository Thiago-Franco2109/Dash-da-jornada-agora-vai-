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
