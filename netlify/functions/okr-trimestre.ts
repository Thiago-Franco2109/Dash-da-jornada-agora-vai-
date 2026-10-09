import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Os três KRs da OKR do trimestre, calculados no banco, só para as cidades da
 * OKR:
 *
 *   KR1 Novos    90% dos parceiros lançados no trimestre com 5+ pedidos nos
 *                primeiros 14 dias
 *   KR2 Adoção   70% dos parceiros ativos recebendo pedido nos últimos 7 dias
 *   KR3 Churn    95% dos contratos vivos no início do trimestre ainda vivos
 *
 * A resposta traz as LISTAS nominais, não as porcentagens: a aba existe para
 * trabalhar a OKR, não só para exibir o placar, e a soma precisa descontar as
 * lojas que o CS tirou da conta (Supabase `okr_excluido`). Quem soma é
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
 *  - só marketplace (cardapio_digital = 0/NULL): CD é base disjunta, ver
 *    `jornada.ts`.
 *  - LANÇAMENTO = MIN(venda.data_lancamento) entre os contratos VIVOS, caindo
 *    para o MIN de todo o histórico quando não sobrou nenhum — mesma regra da
 *    Jornada, que existe para o parceiro que cancelou e voltou não ficar
 *    ancorado no contrato antigo.
 *  - pedido ACEITO = status IN (1, 2), mesma régua do resto do app.
 *  - SAÍDA do contrato = data_cancelamento; quando ela é nula (status 3/5
 *    costumam vir sem data) cai para a data do último `status_venda` de
 *    cancelamento. Sem isso, desistência e não-renovação sumiriam do churn.
 *  - "janela fechada" do KR1 é medida contra `dadosAte` (MAX(pedido.data)), e
 *    não contra hoje: a réplica que estas functions enxergam fica ~1 dia atrás
 *    do banco real, e contar como fechada uma janela cujo último dia ainda não
 *    chegou aqui reprovaria o parceiro por atraso de dado.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quanto do passado o `pedido` precisa trazer para o "sem pedido há N dias". */
const DIAS_HISTORICO_MINIMO = 60;

const PADRAO = {
    janelaNovos: 14,
    pedidosNovos: 5,
    diasAdocao: 7,
    metaKr1: 90,
    metaKr2: 70,
    metaKr3: 95,
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

function limitesTrimestre(id: string): { inicio: string; fim: string } | null {
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

/** Dias parado: desde o último pedido, ou desde o lançamento se nunca vendeu. */
function tempoParado(p: { diasSemPedido: number | null; lancamento: string }, corte: string): number {
    return p.diasSemPedido ?? (p.lancamento ? diasEntre(p.lancamento, corte) : 9999);
}

interface ParceiroOkr {
    id: number;
    nome: string;
    cidade: string;
    delivery: number;
    lancamento: string;
    contratoVivo: boolean;
    saida: string | null;
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

    const janelaNovos = Math.min(Math.max(Number(q.janela) || PADRAO.janelaNovos, 1), 90);
    const pedidosNovos = Math.min(Math.max(Number(q.meta) || PADRAO.pedidosNovos, 1), 100);
    const diasAdocao = Math.min(Math.max(Number(q.adocao) || PADRAO.diasAdocao, 1), 90);

    const { inicio, fim } = limites;
    /** Até onde o trimestre já andou — trimestre passado fecha no próprio fim. */
    const corte = hoje < fim ? hoje : fim;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // ── 1. cidades da OKR → localidade_id ────────────────────────────
        const [localidades] = await connection.query<RowDataPacket[]>(
            `SELECT id, nome FROM localidade`,
        );
        const daOkr = localidades.filter(l => casaPrefixo(String(l.nome ?? ''), prefixos));
        if (daOkr.length === 0) {
            return {
                statusCode: 404,
                headers: erroHeaders,
                body: JSON.stringify({ ok: false, error: `Nenhuma localidade casou com: ${prefixos.join(', ')}` }),
            };
        }
        const localidadeIds = daOkr.map(l => Number(l.id));

        // ── 2. contrato por parceiro: lançamento, se está vivo, quando saiu ─
        const [contratos] = await connection.query<RowDataPacket[]>(
            `SELECT ve.estabelecimento_id AS estab,
                    DATE_FORMAT(
                        COALESCE(
                            MIN(CASE WHEN v.status NOT IN (2, 3, 5) THEN v.data_lancamento END),
                            MIN(v.data_lancamento)
                        ), '%Y-%m-%d') AS lancamento,
                    SUM(v.status NOT IN (2, 3, 5)) AS vivos,
                    DATE_FORMAT(MAX(COALESCE(v.data_cancelamento, sv.ultima)), '%Y-%m-%d') AS saida
             FROM venda v
             JOIN venda_estabelecimento ve ON ve.venda_id = v.id
             JOIN estabelecimento e ON e.id = ve.estabelecimento_id
             LEFT JOIN (
                 SELECT venda_id, MAX(data) AS ultima
                 FROM status_venda WHERE status IN (2, 3, 5) GROUP BY venda_id
             ) sv ON sv.venda_id = v.id
             WHERE e.localidade_id IN (?)
               AND e.delivery IN (1, 2, 4, 5)
               AND (e.cardapio_digital = 0 OR e.cardapio_digital IS NULL)
             GROUP BY ve.estabelecimento_id`,
            [localidadeIds],
        );
        // Nenhum parceiro lançado nas cidades da OKR: devolve o MESMO formato,
        // zerado. Um formato especial para o caso vazio só obrigaria a tela a
        // tratar dois contratos diferentes para dizer a mesma coisa.
        if (contratos.length === 0) {
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({
                    ok: true,
                    trimestre: { id: trimestreId, inicio, fim, corte, hoje, dadosAte: corte },
                    cidades: [...new Set(daOkr.map(l => String(l.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
                    parametros: { janelaNovos, pedidosNovos, diasAdocao, metaKr1: PADRAO.metaKr1, metaKr2: PADRAO.metaKr2, metaKr3: PADRAO.metaKr3, desdeAdocao: somarDias(corte, -diasAdocao + 1) },
                    kr1: { meta: PADRAO.metaKr1, parceiros: [] },
                    kr2: { meta: PADRAO.metaKr2, parceiros: [] },
                    kr3: { meta: PADRAO.metaKr3, parceiros: [] },
                    elapsedMs: Date.now() - started,
                }),
            };
        }

        const ids = contratos.map(r => Number(r.estab));

        const [estabs] = await connection.query<RowDataPacket[]>(
            `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.id IN (?)`,
            [ids],
        );
        const infoPorId = new Map(estabs.map(e => [Number(e.id), e]));

        const parceiros: ParceiroOkr[] = contratos.map(r => {
            const id = Number(r.estab);
            const info = infoPorId.get(id);
            const vivo = Number(r.vivos ?? 0) > 0;
            return {
                id,
                nome: String(info?.nome ?? `#${id}`),
                cidade: String(info?.cidade ?? ''),
                delivery: Number(info?.delivery ?? 0),
                lancamento: String(r.lancamento ?? ''),
                contratoVivo: vivo,
                // Contrato vivo não tem saída, mesmo com cancelamento antigo no
                // histórico: é parceiro que voltou, não parceiro perdido.
                saida: vivo ? null : (r.saida ? String(r.saida) : null),
            };
        });

        // ── 3. pedidos aceitos ───────────────────────────────────────────
        // Começa no que vier primeiro entre o trimestre e os últimos 60 dias:
        // no começo de um trimestre a janela do trimestre é curta demais para
        // responder "sem pedido há quantos dias?".
        const desdePedidos = [inicio, somarDias(corte, -DIAS_HISTORICO_MINIMO)].sort()[0];
        const [pedidos] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    COUNT(*) AS n
             FROM pedido FORCE INDEX (data)
             WHERE status IN (1, 2) AND data >= ? AND estabelecimento_id IN (?)
             GROUP BY estabelecimento_id, dia`,
            [desdePedidos, ids],
        );

        const diasPorEstab = new Map<number, { dia: string; n: number }[]>();
        for (const p of pedidos) {
            const estab = Number(p.estab);
            const lista = diasPorEstab.get(estab) ?? [];
            lista.push({ dia: String(p.dia), n: Number(p.n ?? 0) });
            diasPorEstab.set(estab, lista);
        }

        const [ultimo] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(MAX(data), '%Y-%m-%d') AS ate FROM pedido`,
        );
        const dadosAte = String(ultimo[0]?.ate ?? corte);

        // ── KR1 ──────────────────────────────────────────────────────────
        const coorte = parceiros
            .filter(p => p.lancamento && p.lancamento >= inicio && p.lancamento <= corte)
            .map(p => {
                const fimJanela = somarDias(p.lancamento, janelaNovos); // exclusivo
                const dias = diasPorEstab.get(p.id) ?? [];
                const pedidosJanela = dias
                    .filter(d => d.dia >= p.lancamento && d.dia < fimJanela)
                    .reduce((a, d) => a + d.n, 0);
                // Janela fechada = o último dia dela já existe nos dados.
                const concluida = fimJanela <= dadosAte;
                return {
                    id: p.id,
                    nome: p.nome,
                    cidade: p.cidade,
                    lancamento: p.lancamento,
                    pedidos: pedidosJanela,
                    atingiu: pedidosJanela >= pedidosNovos,
                    concluida,
                    diasRestantes: concluida ? 0 : Math.max(diasEntre(dadosAte, fimJanela), 0),
                    cancelado: !p.contratoVivo,
                };
            })
            .sort((a, b) => b.lancamento.localeCompare(a.lancamento));

        // ── KR2 ──────────────────────────────────────────────────────────
        // Base = quem está ativo HOJE (delivery = 1) e já tinha lançado até o
        // corte. Suspensão (delivery = 4) não tem histórico no banco, então
        // trimestre passado é aproximação pela foto de hoje — está dito na tela.
        const desdeAdocao = somarDias(corte, -diasAdocao + 1);
        const adocao = parceiros
            .filter(p => p.delivery === 1 && p.lancamento && p.lancamento <= corte)
            .map(p => {
                const dias = (diasPorEstab.get(p.id) ?? []).filter(d => d.dia <= corte);
                const ultimoDia = dias.reduce((max, d) => (d.dia > max ? d.dia : max), '');
                const naJanela = dias
                    .filter(d => d.dia >= desdeAdocao)
                    .reduce((a, d) => a + d.n, 0);
                return {
                    id: p.id,
                    nome: p.nome,
                    cidade: p.cidade,
                    lancamento: p.lancamento,
                    pedidos: naJanela,
                    recebendo: naJanela > 0,
                    ultimoPedido: ultimoDia || null,
                    // null = nenhum pedido no histórico consultado, não "0 dias".
                    diasSemPedido: ultimoDia ? diasEntre(ultimoDia, corte) : null,
                };
            })
            // Ordena pelo tempo parado, e quem nunca vendeu conta desde o
            // lançamento: sem isso um parceiro de dois dias apareceria no topo
            // da fila, junto dos que estão largados há meses.
            .sort((a, b) => tempoParado(b, corte) - tempoParado(a, corte));

        // Quem não aparece na janela de histórico pode estar parado há mais
        // tempo que ela — ou nunca ter vendido. São coisas diferentes para o
        // CS, então o último pedido de verdade vale uma consulta à parte (só
        // para esses, que são poucos: varrer o histórico inteiro da base toda
        // custaria os 14s que o comentário do `jornada.ts` descreve).
        const semHistorico = adocao.filter(a => a.ultimoPedido === null).map(a => a.id);
        if (semHistorico.length > 0) {
            const [antigos] = await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id AS estab, DATE_FORMAT(MAX(data), '%Y-%m-%d') AS ultimo
                 FROM pedido
                 WHERE status IN (1, 2) AND data <= ? AND estabelecimento_id IN (?)
                 GROUP BY estabelecimento_id`,
                [corte, semHistorico],
            );
            const ultimoPorEstab = new Map(antigos.map(r => [Number(r.estab), String(r.ultimo)]));
            for (const a of adocao) {
                const ultimo = ultimoPorEstab.get(a.id);
                if (!ultimo) continue;
                a.ultimoPedido = ultimo;
                a.diasSemPedido = diasEntre(ultimo, corte);
            }
            adocao.sort((a, b) => tempoParado(b, corte) - tempoParado(a, corte));
        }

        // ── KR3 ──────────────────────────────────────────────────────────
        // Base = contrato vivo na virada do trimestre (lançou até lá e não
        // tinha saído). Quem lançou DENTRO do trimestre não entra: o KR mede
        // manter o que já existia, e contar os novos diluiria a conta.
        const churn = parceiros
            .filter(p => p.lancamento && p.lancamento <= inicio && (!p.saida || p.saida > inicio))
            .map(p => ({
                id: p.id,
                nome: p.nome,
                cidade: p.cidade,
                // null = continua na base; data = saiu DENTRO do trimestre.
                saida: p.saida && p.saida >= inicio && p.saida <= corte ? p.saida : null,
                motivo: null as string | null,
            }))
            .sort((a, b) => (b.saida ?? '').localeCompare(a.saida ?? ''));

        // Motivo do cancelamento mora em status_venda.observacao — só vale a
        // pena buscar para quem realmente saiu.
        const sairam = churn.filter(p => p.saida);
        if (sairam.length > 0) {
            const [motivos] = await connection.query<RowDataPacket[]>(
                `SELECT ve.estabelecimento_id AS estab, sv.observacao, sv.data
                 FROM status_venda sv
                 JOIN venda_estabelecimento ve ON ve.venda_id = sv.venda_id
                 WHERE sv.status IN (2, 3, 5) AND ve.estabelecimento_id IN (?)
                 ORDER BY sv.data`,
                [sairam.map(p => p.id)],
            );
            const motivoPorEstab = new Map<number, string>();
            for (const m of motivos) {
                const texto = String(m.observacao ?? '').trim();
                if (texto) motivoPorEstab.set(Number(m.estab), texto); // ORDER BY data: fica o último
            }
            for (const p of sairam) p.motivo = motivoPorEstab.get(p.id) ?? null;
        }

        // A resposta traz as LISTAS, não as porcentagens. Quem soma é
        // `src/utils/okrFiguras.ts`, porque a conta precisa descontar as lojas
        // que o CS tirou da conta (Supabase `okr_excluido`) — e uma soma aqui
        // seria uma segunda verdade, calculada sobre a base cheia, pronta para
        // divergir do que a tela mostra.
        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                trimestre: { id: trimestreId, inicio, fim, corte, hoje, dadosAte },
                // Dedup por nome: a mesma cidade pode ter mais de uma localidade
                // no cadastro (uma delas inativa, sem nenhum estabelecimento).
                cidades: [...new Set(daOkr.map(l => String(l.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
                parametros: { janelaNovos, pedidosNovos, diasAdocao, metaKr1: PADRAO.metaKr1, metaKr2: PADRAO.metaKr2, metaKr3: PADRAO.metaKr3, desdeAdocao },
                kr1: { meta: PADRAO.metaKr1, parceiros: coorte },
                kr2: { meta: PADRAO.metaKr2, parceiros: adocao },
                kr3: { meta: PADRAO.metaKr3, parceiros: churn },
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
