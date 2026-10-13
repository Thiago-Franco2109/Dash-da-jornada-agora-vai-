import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Os KRs de Sucesso do Cliente do trimestre, calculados no banco.
 *
 * OBJETIVO 2 — Oferta e retenção nas 5 cidades (marketplace)
 *   KR 2.2 Safra 14d       levar 20 parceiros ativados a 5 pedidos nos
 *                          primeiros 14 dias
 *   KR 2.3 Lojas em risco  reverter 30 lojas: 4 semanas seguidas com pedido e
 *                          cancelamento abaixo de 10%
 *
 * OBJETIVO 4 — Base do Cardápio Digital (base inteira, SEM recorte de cidade)
 *   KR 4.1 Pedidos         15.400 pedidos no trimestre (desafio 16.000)
 *   KR 4.2 Lojas ativas    40 lojas com 30+ pedidos nos últimos 30 dias
 *
 * Os dois objetivos medem bases DISJUNTAS: as 5 cidades são marketplace
 * (`cardapio_digital = 0/NULL`) e o objetivo 4 é a base de Cardápio Digital
 * inteira, do país todo — o enunciado do objetivo 4 não fala em cidade, e
 * recortar por cidade mediria outra coisa. Ver `jornada.ts` para a disjunção.
 *
 * A resposta traz as LISTAS nominais, não as porcentagens: a aba existe para
 * trabalhar a OKR, não só para exibir o placar, e a soma precisa descontar as
 * lojas que o CS tirou da conta (Supabase `okr_excluido`) e considerar as que
 * ele marcou como críticas (`okr_critica`). Quem soma é
 * `src/utils/okrFiguras.ts` — somar aqui também criaria uma segunda verdade,
 * calculada sobre a base cheia e pronta para divergir da tela.
 *
 * ── Quais cidades ────────────────────────────────────────────────────────
 * A lista NÃO mora aqui: vem em `?cidades=` com os prefixos normalizados de
 * `src/config/cidadesOkr.ts`, que é a mesma fonte do chip "Cidades OKR" do
 * painel. Duplicar a lista no backend garantiria que um dia as duas
 * divergissem — e o número da OKR passaria a medir um recorte diferente do
 * que a tela diz estar medindo. O casamento é por PREFIXO sobre as partes do
 * nome, porque "Bom Jesus" precisa pegar "Bom Jesus do Itabapoana - RJ / Bom
 * Jesus do Norte - ES" (ver o comentário longo em cidadesOkr.ts).
 *
 * ── Decisões de régua ────────────────────────────────────────────────────
 *  - pedido ACEITO = status IN (1, 2) — "confirmado ou recebido" do enunciado
 *    do KR 4.1, e a mesma régua que o resto do app já usa. Status 3 é
 *    cancelado e -1 é Pix não pago (conferido: todo status -1 é pix-* com
 *    status_pagamento 3); os dois ficam de fora.
 *  - LANÇAMENTO = MIN(venda.data_lancamento) entre os contratos VIVOS, caindo
 *    para o MIN de todo o histórico quando não sobrou nenhum — mesma regra da
 *    Jornada, que existe para o parceiro que cancelou e voltou não ficar
 *    ancorado no contrato antigo.
 *  - ENTROU EM RISCO (KR 2.3) olha o trimestre inteiro, não o dia de hoje: se
 *    o universo fosse "parada AGORA há 7+ dias", ele e o critério de reversão
 *    ("4 semanas seguidas com pedido") nunca se cruzariam — a loja sairia do
 *    universo no instante em que melhorasse, e o KR ficaria travado em zero.
 *    Por isso a marca é ter ficado 7+ dias corridos sem pedido em ALGUM
 *    momento do trimestre (contado a partir do lançamento, para parceiro novo
 *    não entrar em risco pelo tempo em que ainda nem existia).
 *  - TAXA DE CANCELAMENTO = cancelados / (aceitos + cancelados) nas 4 semanas.
 *    Pix não pago fica fora do denominador: o cliente desistir antes de pagar
 *    não é cancelamento da loja, e inflaria o denominador de quem vende por Pix.
 *  - "janela fechada" do KR 2.2 é medida contra `dadosAte` (MAX(pedido.data)),
 *    e não contra hoje: a réplica que estas functions enxergam fica ~1 dia
 *    atrás do banco real, e contar como fechada uma janela cujo último dia
 *    ainda não chegou aqui reprovaria o parceiro por atraso de dado.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quanto do passado o `pedido` precisa trazer para o "sem pedido há N dias". */
const DIAS_HISTORICO_MINIMO = 60;

const PADRAO = {
    // KR 2.2 — safra 14d
    janelaNovos: 14,
    pedidosNovos: 5,
    metaKr22: 20,
    // KR 2.3 — lojas em risco
    diasParado: 7,
    semanasReversao: 4,
    tetoCancelamentoPct: 10,
    metaKr23: 30,
    // KR 4.1 — pedidos no Cardápio Digital
    metaKr41: 15400,
    desafioKr41: 16000,
    /** Acumulado esperado ao fim de cada mês do trimestre. */
    checkpointsKr41: [4350, 9350, 15400],
    // KR 4.2 — lojas ativas no Cardápio Digital
    janelaLojaAtiva: 30,
    pedidosLojaAtiva: 30,
    metaKr42: 40,
    /** Ponto de partida declarado na OKR. */
    baseKr42: 23,
    checkpointsKr42: [28, 34, 40],
};

/** "Hoje" em Brasília — a function roda em UTC e viraria o dia às 21h. */
function hojeBrasilia(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
    return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function trimestreDe(iso: string): string {
    return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

function limitesTrimestre(id: string): { inicio: string; fim: string; meses: string[] } | null {
    const m = /^(\d{4})-Q([1-4])$/.exec(id);
    if (!m) return null;
    const ano = Number(m[1]);
    const mesInicio = (Number(m[2]) - 1) * 3 + 1;
    const mesFim = mesInicio + 2;
    // Dia 0 do mês seguinte = último dia do mês (Date.UTC conta mês de 0).
    const ultimoDia = new Date(Date.UTC(ano, mesFim, 0)).getUTCDate();
    return {
        inicio: `${ano}-${String(mesInicio).padStart(2, '0')}-01`,
        fim: `${ano}-${String(mesFim).padStart(2, '0')}-${ultimoDia}`,
        meses: [0, 1, 2].map(i => `${ano}-${String(mesInicio + i).padStart(2, '0')}`),
    };
}

function normalizar(txt: string): string {
    return txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Tira o sufixo de UF: "carandai - mg" → "carandai". */
function semUf(parte: string): string {
    return parte.replace(/\s*-\s*[a-z]{2}$/, '').trim();
}

/** Espelha `partesComparaveis` de src/config/cidadesOkr.ts — ver cabeçalho. */
function partesComparaveis(cidade: string): string[] {
    const inteiro = normalizar(cidade);
    if (!inteiro) return [];
    const partes = new Set<string>([inteiro, semUf(inteiro)]);
    for (const parte of inteiro.split(/\s*\/\s*|\s+e\s+/)) {
        const limpa = parte.trim();
        if (!limpa) continue;
        partes.add(limpa);
        partes.add(semUf(limpa));
    }
    partes.delete('');
    return [...partes];
}

function casaPrefixo(cidade: string, prefixos: string[]): boolean {
    return partesComparaveis(cidade).some(parte =>
        prefixos.some(prefixo => parte === prefixo || parte.startsWith(`${prefixo} `)),
    );
}

interface DiaPedidos { dia: string; aceitos: number; cancelados: number }

/**
 * A maior sequência de dias corridos SEM pedido aceito dentro da janela.
 * Conta também as pontas: o silêncio antes do primeiro pedido e depois do
 * último valem tanto quanto um buraco no meio.
 */
function maiorLacuna(dias: DiaPedidos[], de: string, ate: string): number {
    if (diasEntre(de, ate) < 0) return 0;
    const comPedido = dias
        .filter(d => d.aceitos > 0 && d.dia >= de && d.dia <= ate)
        .map(d => d.dia)
        .sort();
    if (comPedido.length === 0) return diasEntre(de, ate) + 1;

    let maior = diasEntre(de, comPedido[0]);
    for (let i = 1; i < comPedido.length; i++) {
        maior = Math.max(maior, diasEntre(comPedido[i - 1], comPedido[i]) - 1);
    }
    return Math.max(maior, diasEntre(comPedido[comPedido.length - 1], ate));
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};

    const prefixos = (q.cidades ?? '')
        .split(',')
        .map(p => normalizar(p))
        .filter(Boolean);
    if (prefixos.length === 0) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: 'Informe ?cidades= com os prefixos das cidades da OKR (ver src/config/cidadesOkr.ts).' }),
        };
    }

    const hoje = hojeBrasilia();
    const trimestreId = (q.trimestre ?? '').trim() || trimestreDe(hoje);
    const limites = limitesTrimestre(trimestreId);
    if (!limites) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Trimestre inválido: "${trimestreId}". Use YYYY-Qn (ex.: 2026-Q4).` }),
        };
    }

    const { inicio, fim, meses } = limites;
    /** Até onde o trimestre já andou — trimestre passado fecha no próprio fim. */
    const corte = hoje < fim ? hoje : fim;
    /** Limite superior exclusivo, porque `pedido.data` é datetime. */
    const corteExclusivo = somarDias(corte, 1);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [ultimo] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(MAX(data), '%Y-%m-%d') AS ate FROM pedido`,
        );
        const dadosAte = String(ultimo[0]?.ate ?? corte);

        // ══ OBJETIVO 2 — as 5 cidades, marketplace ═══════════════════════

        const [localidades] = await connection.query<RowDataPacket[]>(`SELECT id, nome FROM localidade`);
        const daOkr = localidades.filter(l => casaPrefixo(String(l.nome ?? ''), prefixos));
        if (daOkr.length === 0) {
            return {
                statusCode: 404,
                headers: erroHeaders,
                body: JSON.stringify({ ok: false, error: `Nenhuma localidade casou com: ${prefixos.join(', ')}` }),
            };
        }
        const localidadeIds = daOkr.map(l => Number(l.id));

        const [contratos] = await connection.query<RowDataPacket[]>(
            `SELECT ve.estabelecimento_id AS estab,
                    DATE_FORMAT(
                        COALESCE(
                            MIN(CASE WHEN v.status NOT IN (2, 3, 5) THEN v.data_lancamento END),
                            MIN(v.data_lancamento)
                        ), '%Y-%m-%d') AS lancamento,
                    SUM(v.status NOT IN (2, 3, 5)) AS vivos
             FROM venda v
             JOIN venda_estabelecimento ve ON ve.venda_id = v.id
             JOIN estabelecimento e ON e.id = ve.estabelecimento_id
             WHERE e.localidade_id IN (?)
               AND e.delivery IN (1, 2, 4, 5)
               AND (e.cardapio_digital = 0 OR e.cardapio_digital IS NULL)
             GROUP BY ve.estabelecimento_id`,
            [localidadeIds],
        );

        const idsCidades = contratos.map(r => Number(r.estab));
        const [estabs] = idsCidades.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
                 FROM estabelecimento e
                 LEFT JOIN localidade l ON l.id = e.localidade_id
                 WHERE e.id IN (?)`,
                [idsCidades],
            )
            : [[] as RowDataPacket[]];
        const infoPorId = new Map(estabs.map(e => [Number(e.id), e]));

        // Aceitos e cancelados no mesmo passe: a taxa de cancelamento do KR 2.3
        // precisa dos dois, e o pedido é a tabela cara de varrer.
        const desdePedidos = [inicio, somarDias(corte, -DIAS_HISTORICO_MINIMO)].sort()[0];
        const [pedidosCidades] = idsCidades.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id AS estab,
                        DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                        SUM(status IN (1, 2)) AS aceitos,
                        SUM(status = 3) AS cancelados
                 FROM pedido FORCE INDEX (data)
                 WHERE status IN (1, 2, 3) AND data >= ? AND data < ? AND estabelecimento_id IN (?)
                 GROUP BY estabelecimento_id, dia`,
                [desdePedidos, corteExclusivo, idsCidades],
            )
            : [[] as RowDataPacket[]];

        const diasPorEstab = new Map<number, DiaPedidos[]>();
        for (const p of pedidosCidades) {
            const estab = Number(p.estab);
            const lista = diasPorEstab.get(estab) ?? [];
            lista.push({ dia: String(p.dia), aceitos: Number(p.aceitos ?? 0), cancelados: Number(p.cancelados ?? 0) });
            diasPorEstab.set(estab, lista);
        }

        const parceiros = contratos.map(r => {
            const id = Number(r.estab);
            const info = infoPorId.get(id);
            return {
                id,
                nome: String(info?.nome ?? `#${id}`),
                cidade: String(info?.cidade ?? ''),
                delivery: Number(info?.delivery ?? 0),
                lancamento: String(r.lancamento ?? ''),
                contratoVivo: Number(r.vivos ?? 0) > 0,
            };
        });

        // ── KR 2.2 — safra de 14 dias ────────────────────────────────────
        const coorte = parceiros
            .filter(p => p.lancamento && p.lancamento >= inicio && p.lancamento <= corte)
            .map(p => {
                const fimJanela = somarDias(p.lancamento, PADRAO.janelaNovos); // exclusivo
                const dias = diasPorEstab.get(p.id) ?? [];
                const pedidos = dias
                    .filter(d => d.dia >= p.lancamento && d.dia < fimJanela)
                    .reduce((a, d) => a + d.aceitos, 0);
                const concluida = fimJanela <= dadosAte;
                return {
                    id: p.id,
                    nome: p.nome,
                    cidade: p.cidade,
                    lancamento: p.lancamento,
                    pedidos,
                    // Bateu é bateu: não espera a janela fechar para contar.
                    atingiu: pedidos >= PADRAO.pedidosNovos,
                    concluida,
                    diasRestantes: concluida ? 0 : Math.max(diasEntre(dadosAte, fimJanela), 0),
                    cancelado: !p.contratoVivo,
                };
            })
            .sort((a, b) => b.lancamento.localeCompare(a.lancamento));

        // ── KR 2.3 — lojas em risco ──────────────────────────────────────
        // Uma linha por loja ATIVA das 5 cidades, com os sinais crus. Quem
        // decide o universo é a tela: entrou em risco no trimestre OU está
        // marcada como crítica (a marcação mora no Supabase, fora daqui).
        const semanas = Array.from({ length: PADRAO.semanasReversao }, (_, i) => ({
            de: somarDias(corte, -7 * (i + 1) + 1),
            ate: somarDias(corte, -7 * i),
        }));

        const risco = parceiros
            .filter(p => p.delivery === 1 && p.lancamento && p.lancamento <= corte)
            .map(p => {
                const dias = diasPorEstab.get(p.id) ?? [];
                const comAceito = dias.filter(d => d.aceitos > 0).map(d => d.dia).sort();
                const ultimoPedido = comAceito.length > 0 ? comAceito[comAceito.length - 1] : null;

                // Parceiro lançado no meio do trimestre não fica "em risco"
                // pelo silêncio de antes de existir.
                const inicioRisco = p.lancamento > inicio ? p.lancamento : inicio;
                const lacuna = maiorLacuna(dias, inicioRisco, corte);

                const janela = dias.filter(d => d.dia >= semanas[semanas.length - 1].de);
                const aceitos4sem = janela.reduce((a, d) => a + d.aceitos, 0);
                const cancelados4sem = janela.reduce((a, d) => a + d.cancelados, 0);
                const baseTaxa = aceitos4sem + cancelados4sem;

                return {
                    id: p.id,
                    nome: p.nome,
                    cidade: p.cidade,
                    lancamento: p.lancamento,
                    ultimoPedido,
                    diasSemPedido: ultimoPedido ? diasEntre(ultimoPedido, corte) : null,
                    /** Maior silêncio do trimestre — é o que põe a loja em risco. */
                    maiorLacunaDias: lacuna,
                    /** Da semana mais recente para a mais antiga. */
                    semanasComPedido: semanas.map(s =>
                        dias.some(d => d.dia >= s.de && d.dia <= s.ate && d.aceitos > 0),
                    ),
                    aceitos4sem,
                    cancelados4sem,
                    /** null = sem pedido nenhum na janela, não "0% de cancelamento". */
                    taxaCancelamentoPct: baseTaxa > 0 ? Math.round((cancelados4sem / baseTaxa) * 1000) / 10 : null,
                };
            })
            .sort((a, b) => (b.taxaCancelamentoPct ?? -1) - (a.taxaCancelamentoPct ?? -1));

        // ══ OBJETIVO 4 — Cardápio Digital, base inteira ══════════════════
        // Sem recorte de cidade e sem filtro de delivery: o KR conta PEDIDOS do
        // Cardápio Digital, e quem os gerou continua contando mesmo que a loja
        // tenha sido desligada depois.
        const [cdPorMes] = await connection.query<RowDataPacket[]>(
            `SELECT p.estabelecimento_id AS estab,
                    DATE_FORMAT(p.data, '%Y-%m') AS mes,
                    COUNT(*) AS n
             FROM pedido p FORCE INDEX (data)
             WHERE p.status IN (1, 2) AND p.cardapio_digital = 1
               AND p.data >= ? AND p.data < ?
             GROUP BY p.estabelecimento_id, mes`,
            [inicio, corteExclusivo],
        );

        const desde30d = somarDias(corte, -PADRAO.janelaLojaAtiva + 1);
        const [cd30d] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab, COUNT(*) AS n
             FROM pedido FORCE INDEX (data)
             WHERE status IN (1, 2) AND cardapio_digital = 1
               AND data >= ? AND data < ?
             GROUP BY estabelecimento_id`,
            [desde30d, corteExclusivo],
        );

        const idsCd = [...new Set([...cdPorMes.map(r => Number(r.estab)), ...cd30d.map(r => Number(r.estab))])];
        const [estabsCd] = idsCd.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
                 FROM estabelecimento e
                 LEFT JOIN localidade l ON l.id = e.localidade_id
                 WHERE e.id IN (?)`,
                [idsCd],
            )
            : [[] as RowDataPacket[]];
        const infoCd = new Map(estabsCd.map(e => [Number(e.id), e]));

        const porMesPorEstab = new Map<number, Record<string, number>>();
        for (const r of cdPorMes) {
            const estab = Number(r.estab);
            const atual = porMesPorEstab.get(estab) ?? {};
            atual[String(r.mes)] = Number(r.n ?? 0);
            porMesPorEstab.set(estab, atual);
        }
        const trintaDiasPorEstab = new Map(cd30d.map(r => [Number(r.estab), Number(r.n ?? 0)]));

        const lojasCd = idsCd
            .map(id => {
                const info = infoCd.get(id);
                const porMes = porMesPorEstab.get(id) ?? {};
                return {
                    id,
                    nome: String(info?.nome ?? `#${id}`),
                    cidade: String(info?.cidade ?? ''),
                    ativa: Number(info?.delivery ?? 0) === 1,
                    porMes,
                    pedidosTrimestre: meses.reduce((a, m) => a + (porMes[m] ?? 0), 0),
                    pedidos30d: trintaDiasPorEstab.get(id) ?? 0,
                };
            })
            .sort((a, b) => b.pedidos30d - a.pedidos30d || b.pedidosTrimestre - a.pedidosTrimestre);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                trimestre: { id: trimestreId, inicio, fim, corte, hoje, dadosAte, meses },
                // Dedup por nome: a mesma cidade pode ter mais de uma localidade
                // no cadastro (uma delas inativa, sem nenhum estabelecimento).
                cidades: [...new Set(daOkr.map(l => String(l.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
                parametros: {
                    ...PADRAO,
                    semanas,
                    desde30d,
                },
                kr22: { meta: PADRAO.metaKr22, parceiros: coorte },
                kr23: { meta: PADRAO.metaKr23, parceiros: risco },
                // Uma lista só para os dois KRs do objetivo 4: eles medem a
                // mesma base por ângulos diferentes (pedidos e lojas ativas).
                cardapioDigital: { lojas: lojasCd },
                kr41: { meta: PADRAO.metaKr41, desafio: PADRAO.desafioKr41, checkpoints: PADRAO.checkpointsKr41 },
                kr42: { meta: PADRAO.metaKr42, base: PADRAO.baseKr42, checkpoints: PADRAO.checkpointsKr42 },
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
