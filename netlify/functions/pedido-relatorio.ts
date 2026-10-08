import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Relatório de pedidos de UM parceiro, direto do banco (read-only).
 *
 * Responde o que o CS precisa saber antes de ligar pro parceiro:
 *   1. Quantos pedidos, quanto de GMV, ticket médio — e a curva por dia.
 *   2. Quanto está vazando: cancelado, expirado (loja não aceitou) e por quê.
 *   3. Quando a loja vende (hora do dia e dia da semana) — a hora do pico.
 *   4. O que a loja vende (itens mais pedidos).
 *
 * ⚠️ A janela vem da tela como DUAS DATAS (`de` e `ate`, inclusive nas duas pontas),
 * pra espelhar os atalhos do CMS oficial (Últimos 12 meses … Mês atual, Ontem, Hoje) e
 * o intervalo manual. `dias=N` continua aceito como atalho de "últimos N dias
 * terminando ontem" — é o que o resto do app usa.
 *
 * ⚠️ O banco das functions NÃO é tempo real. Medido em 08/10/2026 21:20 UTC:
 * `MAX(data)` = 08/10 04:21, com 11 pedidos no dia corrente contra 1.709 no dia
 * anterior — ou seja, dia fechado até ONTEM e o dia de hoje pela metade. A function
 * não corta a janela por isso (quem escolhe é a tela), mas devolve
 * `janela.ultimoPedidoNoBanco` pra tela avisar quando o período pedido passa dali.
 *
 * ⚠️ Custo por tamanho de janela (medido, com FORCE INDEX (PRIMARY), por query):
 *     60d  → ~250ms     92d  → ~300-600ms
 *     182d → ~0,9-1,3s  365d → ~2,0-2,5s
 * Ponta a ponta (conexão + as 3 queries), medido pelo navegador no parceiro de maior
 * volume: 28d ~1,0s · 183d ~3,1s · 365d ~6,2s. Os 12 meses cabem no limite de 10s da
 * Netlify, mas é o teto — por isso a janela máxima é 366 dias e a tela avisa que
 * período longo demora. O conserto estrutural seria um índice composto
 * (estabelecimento_id, data) em `pedido`, que não é nosso pra criar.
 *
 * ⚠️ `FORCE INDEX (PRIMARY)` não é enfeite. `pedido` só tem índice em
 * `estabelecimento_id` e em `data` SEPARADOS (sem composto), e em alguns parceiros o
 * otimizador do MySQL 5.5 escolhe `estabelecimento_id` e varre o histórico INTEIRO da
 * loja. Medido no estab 25166 (36k pedidos de histórico), janela de 60 dias:
 *     planner livre        → por-dia 2779/2292/1295ms · itens 1202/1039/1089ms
 *     FORCE INDEX (PRIMARY)→ por-dia  382/233/232ms   · itens  254/248/257ms
 * Em quem já estava rápido (23404) não piora. O corte `id >= idMin` é o que torna o
 * range no PRIMARY possível; o filtro de data continua no WHERE, então a conta não
 * depende do id crescer com o tempo.
 *
 * ⚠️ Parece intuitivo que em janela longa valha a pena inverter e usar
 * `estabelecimento_id` (o histórico da loja, 54k, é menor que a janela global de 12
 * meses, 655k). FOI TESTADO E É PIOR, em toda janela — o índice secundário entrega os
 * registros fora de ordem e vira I/O aleatório no PRIMARY:
 *     365d estab 785: PRIMARY 2154ms+2096ms · estabelecimento_id 8663ms+8700ms
 *     365d estab 23404: PRIMARY 2153ms+2466ms · estabelecimento_id 5872ms+2773ms
 * Mesmo resultado do aviso que já existe em `cardapio-analise`. Não reintroduzir.
 *
 * ⚠️ Os itens mais pedidos NÃO saem de `cardapio-analise`. Aquela function filtra o
 * cardápio de verdade (`cc.campanha = 0`, item ativo/disponível), e o campeão de venda
 * costuma estar fora desse filtro: no estab 18171 o item #1 da loja (X-Tudo, 1.131
 * unidades) é cópia de campanha e sumiria da lista; 785 e 16462 perdiam 3 dos 15. Aqui
 * a lista é histórica: entra item inativado e cópia de campanha, marcados na resposta
 * (`campanha`, `foraDoCardapio`) pra tela poder explicar a linha.
 *
 * ⚠️ A mesma comida pode aparecer em `item_catalogo_id` diferentes (uma cópia por
 * campanha) e o nome vem com prefixo da categoria ("Cachorrão: 40. Salsicha" vs.
 * "Cachorrão: Salsicha"), então agrupar por nome não junta de verdade. Agrupamos por id
 * e marcamos a linha — juntar "no olho" misturaria itens diferentes.
 *
 * STATUS DE `pedido` (mesma leitura de `pedido-mensal`):
 *   1,2 = aceito · 3 = cancelado · -1 = expirado (ninguém aceitou) · 0 = resíduo (1 linha
 *   na base inteira). `recebidos` soma os três primeiros.
 *
 * `cardapio_digital` NÃO é filtrado: CD e marketplace são bases disjuntas e esconder um
 * dos dois mudaria o total que o parceiro vê. A resposta devolve a fatia de CD
 * (`totais.cardapioDigital`) pra tela poder separar quando precisar.
 *
 * Query params:
 *   ?estabId=23404              → obrigatório
 *   ?de=2026-09-01&ate=2026-09-30 → janela explícita, inclusive nas duas pontas
 *   ?dias=60                    → atalho: últimos 60 dias terminando ontem
 * Sem nenhum dos dois, cai no padrão de 60 dias. Máximo de 366 dias por chamada.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

// Dado agregado de dias fechados: não muda durante a sessão. O cache de 5 min evita
// refazer as 3 queries a cada ida e volta na aba. Erro nenhum é cacheado.
const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/**
 * Teto da lista de itens devolvida. A query NÃO leva LIMIT: o GROUP BY já agrupou o
 * cardápio todo e cortar no SQL custava o mesmo, mas impedia dizer quantos itens
 * venderam de verdade na janela (`itensComVenda`).
 */
const LIMITE_ITENS = 20;

/**
 * `tipo_cancelamento` (documentação do banco, pág. "Tabela Pedido"). Só os códigos
 * documentados entram nomeados; 2 e 7 aparecem na base sem descrição e caem em "outro".
 *
 * ⚠️ O código 1 (tempo esgotado) NÃO é o mesmo que `status = -1` (expirado): o 1 é um
 * pedido cancelado automaticamente, contado em `cancelados`; o -1 nunca chegou a ser
 * aceito nem cancelado. Os dois aparecem na tela e precisam de nomes diferentes, senão
 * o CS lê "expirou" duas vezes com números diferentes.
 */
const MOTIVO_CANCELAMENTO: Record<number, string> = {
    0: 'Mensagem personalizada da loja',
    1: 'Tempo esgotado (cancelamento automático)',
    3: 'Pedido de teste',
    4: 'Pedido não entregue',
    5: 'Loja não estava funcionando',
    6: 'Sem entregador',
    8: 'Cliente recusou o pedido',
};

const arredonda = (v: number): number => Math.round(v * 100) / 100;
const num = (v: unknown): number => Number(v ?? 0);
const pct = (parte: number, total: number): number => (total > 0 ? Math.round((100 * parte) / total) : 0);

interface DiaHoraRow extends RowDataPacket {
    dia: string;
    hora: number;
    aceitos: number;
    cancelados: number;
    expirados: number;
    gmvBruto: string | number;
    gmvLiq: string | number;
    comissao: string | number;
    novosNaLoja: number;
    online: number;
    cupomBigou: number;
    cupomLoja: number;
    cd: number;
}

interface ItemRow extends RowDataPacket {
    id: number;
    nome: string | null;
    qtd: string | number;
    pedidos: number;
    receita: string | number;
    temFoto: number | null;
    campanha: number | null;
    ativo: number | null;
    arquivado: number | null;
    disponivel: number | null;
}

const DIA_MS = 86_400_000;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
/** Teto por chamada: 12 meses já custam ~5s das duas queries pesadas. */
const MAX_DIAS = 366;

/** 'YYYY-MM-DD' → epoch UTC; NaN se a data não existir (ex.: 2026-02-31). */
function parseDia(iso: string): number {
    if (!FORMATO_DATA.test(iso)) return NaN;
    const t = Date.parse(`${iso}T00:00:00Z`);
    // Date.parse aceita 2026-02-31 e empurra pra março; o round-trip pega isso.
    return new Date(t).toISOString().slice(0, 10) === iso ? t : NaN;
}

/** Lista de dias 'YYYY-MM-DD' de `de` até `ate`, inclusive. Aritmética em UTC. */
function diasEntre(de: string, ate: string): string[] {
    const fim = parseDia(ate);
    const dias: string[] = [];
    for (let t = parseDia(de); t <= fim; t += DIA_MS) {
        dias.push(new Date(t).toISOString().slice(0, 10));
    }
    return dias;
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
    const estabIdRaw = (q.estabId ?? '').trim();
    if (!/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabId (numérico) é obrigatório' }) };
    }
    const estabId = Number(estabIdRaw);

    // Janela: `de`/`ate` quando a tela manda o intervalo (atalhos do CMS e o manual),
    // senão `dias` como atalho de "últimos N dias terminando ontem". O cálculo de
    // "ontem" aqui usa a data do servidor da function; é só o PADRÃO — quando a tela
    // manda as datas, nada aqui depende de fuso.
    const hojeUtc = Date.now() - (Date.now() % DIA_MS);
    const ontem = new Date(hojeUtc - DIA_MS).toISOString().slice(0, 10);

    let de: string;
    let ate: string;
    if (q.de || q.ate) {
        de = (q.de ?? '').trim();
        ate = (q.ate ?? '').trim();
        if (Number.isNaN(parseDia(de)) || Number.isNaN(parseDia(ate))) {
            return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetros de e ate devem ser datas no formato AAAA-MM-DD' }) };
        }
        if (parseDia(ate) < parseDia(de)) {
            return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'A data final não pode ser anterior à inicial' }) };
        }
    } else {
        const n = Math.min(Math.max(Number(q.dias) || 60, 1), MAX_DIAS);
        de = new Date(hojeUtc - n * DIA_MS).toISOString().slice(0, 10);
        ate = ontem;
    }

    const dias = Math.round((parseDia(ate) - parseDia(de)) / DIA_MS) + 1;
    if (dias > MAX_DIAS) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Janela de ${dias} dias é maior que o máximo de ${MAX_DIAS} dias por consulta` }),
        };
    }

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // Limite inferior de id (o que destrava o range no PRIMARY) e, de brinde na
        // mesma varredura do índice `data`, o pedido mais recente do sistema — é o que
        // diz à tela até onde o banco está atualizado, sem outra query.
        const [janelaRows] = await connection.query<RowDataPacket[]>(
            `SELECT MIN(id)                                 AS idMin,
                    DATE_FORMAT(MAX(data), '%Y-%m-%d %H:%i') AS ultimoPedido
             FROM pedido
             WHERE data >= ?`,
            [de],
        );
        // Janela sem nenhum pedido no sistema inteiro: 0 mantém o resto coerente
        // (nada encontrado) em vez de comparar contra NULL.
        const idMin = num(janelaRows[0]?.idMin);
        const ultimoPedidoNoBanco = janelaRows[0]?.ultimoPedido ? String(janelaRows[0].ultimoPedido) : null;

        // Uma passada só: dela saem os totais, a curva por dia, o perfil por hora, o
        // perfil por dia da semana e os motivos de cancelamento.
        const [linhas] = await connection.query<DiaHoraRow[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m-%d')                   AS dia,
                    HOUR(data)                                      AS hora,
                    SUM(status IN (1,2))                            AS aceitos,
                    SUM(status = 3)                                 AS cancelados,
                    SUM(status = -1)                                AS expirados,
                    SUM(CASE WHEN status IN (1,2) THEN total ELSE 0 END)                AS gmvBruto,
                    SUM(CASE WHEN status IN (1,2) THEN total - desconto ELSE 0 END)     AS gmvLiq,
                    SUM(CASE WHEN status IN (1,2) THEN comissao ELSE 0 END)             AS comissao,
                    SUM(CASE WHEN status IN (1,2) AND primeiro_estabelecimento = 1 THEN 1 ELSE 0 END) AS novosNaLoja,
                    SUM(CASE WHEN status IN (1,2) AND tipo_pgt_online <> 'offline' THEN 1 ELSE 0 END) AS online,
                    SUM(CASE WHEN status IN (1,2) AND cupom_desconto_id IS NOT NULL THEN 1 ELSE 0 END) AS cupomBigou,
                    SUM(CASE WHEN status IN (1,2) AND estabelecimento_cupom > 0 THEN 1 ELSE 0 END)     AS cupomLoja,
                    SUM(CASE WHEN status IN (1,2) AND cardapio_digital = 1 THEN 1 ELSE 0 END)          AS cd,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 0 THEN 1 ELSE 0 END) AS canc0,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 1 THEN 1 ELSE 0 END) AS canc1,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 3 THEN 1 ELSE 0 END) AS canc3,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 4 THEN 1 ELSE 0 END) AS canc4,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 5 THEN 1 ELSE 0 END) AS canc5,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 6 THEN 1 ELSE 0 END) AS canc6,
                    SUM(CASE WHEN status = 3 AND tipo_cancelamento = 8 THEN 1 ELSE 0 END) AS canc8
             FROM pedido FORCE INDEX (PRIMARY)
             WHERE estabelecimento_id = ?
               AND id >= ?
               AND data >= ?
               AND data <  DATE_ADD(?, INTERVAL 1 DAY)
             GROUP BY dia, hora`,
            [estabId, idMin, de, ate],
        );

        const [itemRows] = await connection.query<ItemRow[]>(
            `SELECT ip.item_catalogo_id       AS id,
                    ic.nome                   AS nome,
                    SUM(ip.quantidade)        AS qtd,
                    COUNT(DISTINCT p.id)      AS pedidos,
                    SUM(ip.total)             AS receita,
                    (ic.imagem IS NOT NULL)   AS temFoto,
                    cc.campanha               AS campanha,
                    ic.ativo                  AS ativo,
                    ic.arquivado              AS arquivado,
                    ic.disponivel             AS disponivel
             FROM pedido p FORCE INDEX (PRIMARY)
             JOIN item_pedido ip ON ip.pedido_id = p.id
             LEFT JOIN item_catalogo ic ON ic.id = ip.item_catalogo_id
             LEFT JOIN categoria_catalogo cc ON cc.id = ic.categoria_id
             WHERE p.estabelecimento_id = ?
               AND p.id >= ?
               AND p.data >= ?
               AND p.data <  DATE_ADD(?, INTERVAL 1 DAY)
               AND p.status IN (1, 2)
             GROUP BY ip.item_catalogo_id
             ORDER BY qtd DESC`,
            [estabId, idMin, de, ate],
        );

        // ── Agregação em JS ──────────────────────────────────────────────────
        // O payload cru (dia × hora) daria 20–42 KB; agregado aqui fica em ~3 KB.
        const porDia = new Map<string, { aceitos: number; cancelados: number; expirados: number; gmvLiq: number }>();
        const porHora = Array.from({ length: 24 }, () => 0);
        /** domingo = 0, igual ao getUTCDay() usado pra classificar o dia. */
        const porDiaSemana = Array.from({ length: 7 }, () => ({ aceitos: 0, dias: new Set<string>() }));
        const matriz = new Map<string, number>(); // "dow|hora" → aceitos, só pro pico

        const t = {
            aceitos: 0, cancelados: 0, expirados: 0,
            gmvBruto: 0, gmvLiq: 0, comissao: 0,
            novosNaLoja: 0, online: 0, cupomBigou: 0, cupomLoja: 0, cd: 0,
        };
        const motivos = new Map<number, number>();
        let canceladosNomeados = 0;

        for (const r of linhas) {
            const dia = String(r.dia);
            const hora = num(r.hora);
            const aceitos = num(r.aceitos);

            t.aceitos += aceitos;
            t.cancelados += num(r.cancelados);
            t.expirados += num(r.expirados);
            t.gmvBruto += num(r.gmvBruto);
            t.gmvLiq += num(r.gmvLiq);
            t.comissao += num(r.comissao);
            t.novosNaLoja += num(r.novosNaLoja);
            t.online += num(r.online);
            t.cupomBigou += num(r.cupomBigou);
            t.cupomLoja += num(r.cupomLoja);
            t.cd += num(r.cd);

            for (const codigo of Object.keys(MOTIVO_CANCELAMENTO).map(Number)) {
                const n = num((r as unknown as Record<string, unknown>)[`canc${codigo}`]);
                if (n > 0) {
                    motivos.set(codigo, (motivos.get(codigo) ?? 0) + n);
                    canceladosNomeados += n;
                }
            }

            const acc = porDia.get(dia) ?? { aceitos: 0, cancelados: 0, expirados: 0, gmvLiq: 0 };
            acc.aceitos += aceitos;
            acc.cancelados += num(r.cancelados);
            acc.expirados += num(r.expirados);
            acc.gmvLiq += num(r.gmvLiq);
            porDia.set(dia, acc);

            porHora[hora] += aceitos;

            const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
            porDiaSemana[dow].aceitos += aceitos;
            porDiaSemana[dow].dias.add(dia);

            const chave = `${dow}|${hora}`;
            matriz.set(chave, (matriz.get(chave) ?? 0) + aceitos);
        }

        // Série com TODOS os dias da janela: dia sem pedido tem que aparecer como barra
        // vazia — é o buraco que o CS procura, não dado faltando.
        const serieDiaria = diasEntre(de, ate).map(dia => {
            const d = porDia.get(dia);
            return {
                dia,
                aceitos: d?.aceitos ?? 0,
                cancelados: d?.cancelados ?? 0,
                expirados: d?.expirados ?? 0,
                gmvLiq: arredonda(d?.gmvLiq ?? 0),
            };
        });

        let pico: { dow: number; hora: number; aceitos: number } | null = null;
        for (const [chave, aceitos] of matriz) {
            if (aceitos > (pico?.aceitos ?? 0)) {
                const [dow, hora] = chave.split('|').map(Number);
                pico = { dow, hora, aceitos };
            }
        }

        const recebidos = t.aceitos + t.cancelados + t.expirados;
        const diasComPedido = serieDiaria.filter(d => d.aceitos > 0).length;

        const cancelamentos = [...motivos.entries()]
            .map(([codigo, n]) => ({ codigo, motivo: MOTIVO_CANCELAMENTO[codigo], n }))
            .concat(t.cancelados > canceladosNomeados
                ? [{ codigo: -1, motivo: 'Outro motivo (código sem descrição no banco)', n: t.cancelados - canceladosNomeados }]
                : [])
            .sort((a, b) => b.n - a.n);

        const itens = itemRows.slice(0, LIMITE_ITENS).map(r => ({
            id: num(r.id),
            // Item apagado do catálogo continua no histórico de pedidos — sem nome pra mostrar.
            nome: r.nome ? String(r.nome) : `Item #${num(r.id)} (removido do cardápio)`,
            qtd: num(r.qtd),
            pedidos: num(r.pedidos),
            receita: arredonda(num(r.receita)),
            pctPedidos: pct(num(r.pedidos), t.aceitos),
            temFoto: r.temFoto == null ? null : num(r.temFoto) === 1,
            campanha: num(r.campanha) === 1,
            // Vendeu na janela mas hoje não está no cardápio: a tela precisa dizer isso,
            // senão o CS cobra do parceiro um item que ele já tirou do ar.
            foraDoCardapio: r.nome == null || num(r.ativo) !== 1 || num(r.arquivado) === 1 || num(r.disponivel) !== 1,
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estabId,
                janela: {
                    dias, de, ate,
                    // Até onde o banco das functions está atualizado. A tela compara com
                    // `ate` pra avisar que o fim do período pedido ainda não chegou aqui.
                    ultimoPedidoNoBanco,
                },
                totais: {
                    recebidos,
                    aceitos: t.aceitos,
                    cancelados: t.cancelados,
                    expirados: t.expirados,
                    gmvBruto: arredonda(t.gmvBruto),
                    gmvLiq: arredonda(t.gmvLiq),
                    comissao: arredonda(t.comissao),
                    ticketMedio: t.aceitos > 0 ? arredonda(t.gmvLiq / t.aceitos) : 0,
                    // Mesma régua de PORC_CANCEL em pedido-mensal: expirado fica fora
                    // do denominador porque não foi a loja que decidiu.
                    pctCancelamento: pct(t.cancelados, t.aceitos + t.cancelados),
                    pctExpirado: pct(t.expirados, recebidos),
                    pctOnline: pct(t.online, t.aceitos),
                    novosNaLoja: t.novosNaLoja,
                    pctNovosNaLoja: pct(t.novosNaLoja, t.aceitos),
                    cupomBigou: t.cupomBigou,
                    cupomLoja: t.cupomLoja,
                    cardapioDigital: t.cd,
                    pctCardapioDigital: pct(t.cd, t.aceitos),
                    diasComPedido,
                    diasNaJanela: serieDiaria.length,
                    mediaDiaAtivo: diasComPedido > 0 ? arredonda(t.aceitos / diasComPedido) : 0,
                },
                serieDiaria,
                porHora: porHora.map((aceitos, hora) => ({ hora, aceitos })),
                porDiaSemana: porDiaSemana.map((d, dow) => ({
                    dow,
                    aceitos: d.aceitos,
                    dias: d.dias.size,
                    // Média por dia em que a loja operou — comparar sábado com segunda
                    // pelo total engana quando a janela tem 9 sábados e 8 segundas.
                    media: d.dias.size > 0 ? arredonda(d.aceitos / d.dias.size) : 0,
                })),
                pico,
                cancelamentos,
                itens,
                itensComVenda: itemRows.length,
                tookMs: Date.now() - started,
            }),
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[pedido-relatorio] erro:', msg);
        return { statusCode: 500, headers: erroHeaders, body: JSON.stringify({ ok: false, error: msg }) };
    } finally {
        if (connection) await connection.end().catch(() => { /* conexão já caiu */ });
    }
};
