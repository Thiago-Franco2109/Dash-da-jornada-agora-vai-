import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Análise do cardápio de UM parceiro, direto do banco (read-only).
 *
 * Responde três perguntas que o CS consegue acionar por telefone:
 *   1. Quais itens estão SEM FOTO (item sem foto vende menos e o parceiro não percebe).
 *   2. Quais itens não vendem nada (candidatos a sair do cardápio).
 *   3. Qual promoção está NO AR vendendo mal — o caso crítico.
 *
 * ⚠️ O banco das functions tem ~1 dia de atraso. A janela é D-1 pra trás de propósito
 * (`p.data < CURDATE()`): o dia corrente viria pela metade e faria o item parecer fraco.
 *
 * ⚠️ As vendas vêm de uma subconsulta que parte do `pedido` (filtrado por estabelecimento e
 * data) e só então toca `item_pedido`. A forma ingênua — `item_catalogo LEFT JOIN item_pedido
 * LEFT JOIN pedido` — custa caro E conta errado:
 *   · erra, porque `item_pedido` casa com o histórico inteiro e o filtro de data só existe no
 *     `pedido`, então `SUM(ip.quantidade)` soma tudo (num teste: 3.826 em vez de 3);
 *   · demora, porque varre todo o histórico do item em `item_pedido` (7,7M linhas) pra depois
 *     descartar (29s num parceiro de 2.264 pedidos — acima do timeout da Netlify).
 * Partindo do `pedido` usa o índice `estabelecimento_id` e toca só a janela pedida.
 *
 * ⚠️ `p.id >= idMin` não é redundante com o filtro de data — é o que torna isso viável.
 * `pedido` só tem índice em `estabelecimento_id` e em `data` SEPARADOS, então filtrar por
 * loja varre o histórico INTEIRO dela (131k pedidos numa loja antiga) pra depois jogar fora
 * por data. Com o corte por id o otimizador faz range no PRIMARY e para cedo: medido em
 * 6796ms → 562ms. O `MIN(id)` da janela custa ~200ms e sai do índice `data`.
 * Testado também com FORCE INDEX (estabelecimento_id): PIOR (5859ms) — não reintroduzir.
 * O filtro de data continua no WHERE, então a correção não depende de id crescer com o tempo.
 *
 * ⚠️ MySQL 5.5 — sem window function e sem CTE. Mediana é calculada em JS, sobre as linhas
 * de um parceiro só (dezenas a centenas). Não tentar percentil no SQL.
 *
 * Promoção EXPIRADA (`data_fim` no passado) fica FORA: decisão de produto — não atuamos
 * nelas por enquanto. O item expirado é tratado como item comum do cardápio.
 *
 * ⚠️ NEM TODA LINHA DE `item_catalogo` É UM ITEM DE CARDÁPIO. A tabela guarda três coisas,
 * separadas por `categoria_catalogo`:
 *   · `cc.variacao = 1` → OPÇÃO de variação/complemento ("Sem Cebola", "Com Cebola", "Bacon").
 *     Não é produto: cobrar foto de "Sem Cebola" é absurdo, e no Bulky's as 49 linhas
 *     "sem foto" eram TODAS variações — o cardápio real está 100% fotografado.
 *   · `cc.campanha = 1` → CÓPIA do prato dentro de uma campanha. O mesmo "Filé de Frango"
 *     aparece uma vez por campanha (Promo do Dia, Semana do Bacon, …), inflando a contagem
 *     e multiplicando o mesmo "sem foto".
 *   · as demais → o cardápio de verdade.
 * Fotos, itens parados e a mediana olham só o cardápio de verdade. As promoções olham
 * `especial = 1` (que vive sobretudo nas categorias de campanha), sempre fora de variação.
 *
 * `item_catalogo.status` é o workflow de APROVAÇÃO (0=rascunho 1=pendente 2=aprovado
 * 3=cancelado), não disponibilidade. Promoção só está "no ar" com status=2 e dentro da janela.
 *
 * Query params:
 *   ?estabId=23404   → obrigatório
 *   ?dias=60         → janela de vendas (padrão 60, máx 180)
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** Quantas vezes o item mediano precisa vender mais que a promoção pra ela contar como furada. */
const FATOR_FURADA = 1.5;
/** Teto das listas devolvidas — a tela mostra as primeiras e diz quantas sobraram. */
const LIMITE_LISTA = 30;

interface ItemRow extends RowDataPacket {
    id: number;
    nome: string;
    temFoto: number;
    promocional: number;
    especial: number;
    status: number;
    expirado: number;
    futuro: number;
    vendas: string | number;
    ehVariacao: number;
    ehCampanha: number;
}

interface Item {
    id: number;
    nome: string;
    temFoto: boolean;
    promocional: boolean;
    especial: boolean;
    noAr: boolean;
    vendas: number;
    /** Opção de variação/complemento — nunca entra na análise de cardápio. */
    ehVariacao: boolean;
    /** Cópia do prato dentro de uma campanha — duplicaria o item no cardápio. */
    ehCampanha: boolean;
}

/** Mediana simples. Lista vazia → 0. */
function mediana(valores: number[]): number {
    if (valores.length === 0) return 0;
    const s = [...valores].sort((a, b) => a - b);
    const meio = s.length >> 1;
    return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const estabIdRaw = (q.estabId ?? '').trim();
    if (!/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabId (numérico) é obrigatório' }) };
    }
    const estabId = Number(estabIdRaw);
    const dias = Math.min(Math.max(Number(q.dias) || 60, 7), 180);
    // +1 porque a janela termina ONTEM (p.data < CURDATE()), não hoje.
    const diasSql = dias + 1;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // Limite inferior de id para a janela — ver nota de performance no topo.
        const [idRows] = await connection.query<RowDataPacket[]>(
            `SELECT MIN(id) AS idMin FROM pedido WHERE data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
            [diasSql],
        );
        // Janela sem nenhum pedido no sistema inteiro: 0 deixa o resto da query coerente
        // (nenhuma venda encontrada) em vez de comparar contra NULL.
        const idMin = Number(idRows[0]?.idMin ?? 0);

        const [itemRows] = await connection.query<ItemRow[]>(
            `SELECT ic.id,
                    ic.nome,
                    (ic.imagem IS NOT NULL)                                 AS temFoto,
                    ic.promocional,
                    ic.especial,
                    ic.status,
                    (ic.data_fim    IS NOT NULL AND ic.data_fim    < NOW()) AS expirado,
                    (ic.data_inicio IS NOT NULL AND ic.data_inicio > NOW()) AS futuro,
                    IFNULL(v.vendas, 0)                                     AS vendas,
                    cc.variacao                                             AS ehVariacao,
                    cc.campanha                                             AS ehCampanha
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             JOIN categoria_catalogo cc ON cc.id = ic.categoria_id
             LEFT JOIN (
                   SELECT ip.item_catalogo_id AS item_id, SUM(ip.quantidade) AS vendas
                   FROM pedido p
                   JOIN item_pedido ip ON ip.pedido_id = p.id
                   WHERE p.estabelecimento_id = ?
                     AND p.id >= ?
                     AND p.status IN (1, 2)
                     AND p.data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                     AND p.data <  CURDATE()
                   GROUP BY ip.item_catalogo_id
                 ) v ON v.item_id = ic.id
             WHERE c.estabelecimento_id = ?
               AND ic.ativo = 1 AND ic.arquivado = 0 AND ic.disponivel = 1`,
            [estabId, idMin, diasSql, estabId],
        );

        const [pedidoRows] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS pedidos
             FROM pedido
             WHERE estabelecimento_id = ?
               AND id >= ?
               AND status IN (1, 2)
               AND data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND data <  CURDATE()`,
            [estabId, idMin, diasSql],
        );
        const pedidos = Number(pedidoRows[0]?.pedidos ?? 0);

        const itens: Item[] = itemRows.map(r => ({
            id: Number(r.id),
            nome: String(r.nome ?? ''),
            temFoto: Number(r.temFoto) === 1,
            promocional: Number(r.promocional) === 1,
            especial: Number(r.especial) === 1,
            // "No ar" = aprovada E dentro da janela de datas.
            noAr: Number(r.status) === 2 && Number(r.expirado) === 0 && Number(r.futuro) === 0,
            vendas: Number(r.vendas ?? 0),
            ehVariacao: Number(r.ehVariacao) === 1,
            ehCampanha: Number(r.ehCampanha) === 1,
        }));

        // O cardápio de verdade: sem variação e sem as cópias de campanha.
        const cardapio = itens.filter(i => !i.ehVariacao && !i.ehCampanha);

        const total = cardapio.length;
        const semFoto = cardapio.filter(i => !i.temFoto);
        const maisVendido = cardapio.reduce<Item | null>((a, b) => (b.vendas > (a?.vendas ?? -1) ? b : a), null);

        // Denominador da régua: mediana dos NÃO-promocionais QUE VENDERAM.
        // Mediana de todos os itens é sempre 0 (60-80% do cardápio não vende nada na janela),
        // e comparar contra o campeão é duro demais (loja com campeão de 740 reprovaria tudo).
        const baseVendas = cardapio.filter(i => !i.promocional && i.vendas > 0).map(i => i.vendas);
        const medianaBase = mediana(baseVendas);

        // Promoções que o parceiro realmente tem no ar hoje. Expiradas ficam de fora.
        const promosNoAr = itens
            .filter(i => i.especial && i.noAr && !i.ehVariacao)
            .map(i => ({
                id: i.id,
                nome: i.nome,
                vendas: i.vendas,
                temFoto: i.temFoto,
                furada: medianaBase >= FATOR_FURADA * Math.max(i.vendas, 1),
            }))
            .sort((a, b) => a.vendas - b.vendas);

        const furadas = promosNoAr.filter(p => p.furada);

        // Item que VENDE e não tem foto é o conserto mais valioso: já provou demanda.
        const semFotoOrdenado = [...semFoto].sort((a, b) => b.vendas - a.vendas);
        // Item com foto que não vende: o problema não é a foto — revisar preço ou tirar do ar.
        const zerados = cardapio.filter(i => i.vendas === 0 && i.temFoto);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estabId,
                janela: { dias, ateOntem: true },
                pedidos,
                resumo: {
                    totalItens: total,
                    comFoto: total - semFoto.length,
                    semFoto: semFoto.length,
                    pctSemFoto: total > 0 ? Math.round((100 * semFoto.length) / total) : 0,
                    itensSemVenda: cardapio.filter(i => i.vendas === 0).length,
                    variacoesIgnoradas: itens.filter(i => i.ehVariacao).length,
                    copiasDeCampanhaIgnoradas: itens.filter(i => i.ehCampanha).length,
                    medianaBase,
                    promosNoAr: promosNoAr.length,
                    promosFuradas: furadas.length,
                },
                maisVendido: maisVendido && maisVendido.vendas > 0
                    ? { id: maisVendido.id, nome: maisVendido.nome, vendas: maisVendido.vendas }
                    : null,
                semFotoLista: semFotoOrdenado.slice(0, LIMITE_LISTA)
                    .map(i => ({ id: i.id, nome: i.nome, vendas: i.vendas })),
                zeradosLista: zerados.slice(0, LIMITE_LISTA)
                    .map(i => ({ id: i.id, nome: i.nome })),
                promosNoArLista: promosNoAr.slice(0, LIMITE_LISTA),
                tookMs: Date.now() - started,
            }),
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[cardapio-analise] erro:', msg);
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: msg }) };
    } finally {
        if (connection) await connection.end().catch(() => { /* conexão já caiu */ });
    }
};
