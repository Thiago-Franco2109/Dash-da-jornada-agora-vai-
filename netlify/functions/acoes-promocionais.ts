import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Ações Promocionais por Cidade — substitui a aba equivalente do CMS oficial.
 *
 * Regras (confirmadas com o Thiago, ver plano "Ações Promocionais por Cidade"):
 *  - Lojas Ativas = estabelecimento.delivery = 1.
 *  - Com Promoção = mesma regra da `carteira`/`promo-status` (item_catalogo
 *    promocional=1, status=2, ativo=1, arquivado=0, campanha vigente).
 *  - Promo c/ Subsídio vs s/ Subsídio: NÃO é coluna — é por campanha. Ofertas
 *    da Casa nunca é subsidiada (mas ainda é campanha especial); qualquer
 *    outra campanha (Super Promos etc.) é subsidiada. Um estabelecimento com
 *    campanhas dos dois tipos na mesma cidade conta como "c/ subsídio" (ter
 *    ao menos uma campanha subsidiada pesa mais que ter Ofertas da Casa).
 *  - Com Cupom = cupom_desconto ativo=1, SEM filtrar destaque (ao contrário
 *    de toda função existente, que só olha destaque=1). Cupom Destaque =
 *    destaque=1. Cupom Regular = destaque=0 (cupom manual do parceiro, nunca
 *    subsidiado — confirmado pelo Thiago).
 *  - Sem Ação = Lojas Ativas − (união de quem tem promo ou cupom).
 *
 *  - 1º Pedido = cupom_desconto.primeiro_pedido_estabelecimento = 1 (cupom só
 *    vale no 1º pedido do cliente NAQUELE estabelecimento — confirmado via
 *    SHOW COLUMNS, mesmo campo do form "Cadastrar Cupom" do CMS).
 *  - Taxa Entrega = cupom_desconto.taxa_entrega = 1 (desconto aplicado na
 *    taxa de entrega em vez de nos itens do pedido).
 *
 * `cupom_desconto` tem ~1,3 mi de linhas sem índice em
 * (estabelecimento_id, ativo, destaque) — mesmo aviso de `crm-cupons.ts`.
 * Essa é a primeira função a também ler destaque=0, então o scan completo é
 * inevitável sem um índice novo (vale pedir a quem tem acesso de escrita).
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** Campanhas cujo nome normalizado indica "Ofertas da Casa" — nunca subsidiada. */
function isOfertasDaCasa(nomeCampanha: string): boolean {
    const norm = nomeCampanha
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[!?.]+$/g, '')
        .trim();
    return norm.includes('ofertas da casa');
}

function pct(parte: number, base: number): number {
    if (base <= 0) return 0;
    return Math.round((parte / base) * 1000) / 10;
}

interface CidadeAcc {
    cidade: string;
    lojasAtivas: number;
    comPromocao: number;
    promoSubsidio: number;
    promoSemSubsidio: number;
    comCupom: number;
    cupomDestaque: number;
    primeiroPedido: number;
    taxaEntrega: number;
    cupomRegular: number;
}

function novaCidadeAcc(cidade: string): CidadeAcc {
    return {
        cidade, lojasAtivas: 0, comPromocao: 0, promoSubsidio: 0, promoSemSubsidio: 0,
        comCupom: 0, cupomDestaque: 0, primeiroPedido: 0, taxaEntrega: 0, cupomRegular: 0,
    };
}

/** Modo agregado (default): uma linha por cidade. */
async function agregarPorCidade(connection: Awaited<ReturnType<typeof getConnection>>) {
    const [parceiros] = await connection.query<RowDataPacket[]>(
        `SELECT e.id AS estab, IFNULL(l.nome, '') AS cidade
         FROM estabelecimento e
         LEFT JOIN localidade l ON l.id = e.localidade_id
         WHERE e.delivery = 1`,
    );

    const [promoRows] = await connection.query<RowDataPacket[]>(
        `SELECT DISTINCT c.estabelecimento_id AS estab, cp.nome AS campanha
         FROM item_catalogo ic
         JOIN catalogo c           ON c.id = ic.catalogo_id
         JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
         WHERE ic.promocional = 1
           AND ic.status = 2
           AND ic.ativo = 1
           AND ic.arquivado = 0
           AND cp.ativo = 1
           AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
           AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())`,
    );

    const [cupomRows] = await connection.query<RowDataPacket[]>(
        `SELECT estabelecimento_id AS estab, destaque, primeiro_pedido_estabelecimento, taxa_entrega
         FROM cupom_desconto
         WHERE ativo = 1 AND estabelecimento_id IS NOT NULL`,
    );

    // estab → tem ao menos 1 campanha subsidiada (qualquer uma que não seja Ofertas da Casa)
    const promoSubsidioPorEstab = new Map<string, boolean>();
    const promoEstabs = new Set<string>();
    for (const r of promoRows) {
        const estab = String(r.estab);
        promoEstabs.add(estab);
        const subsidiada = !isOfertasDaCasa(String(r.campanha ?? ''));
        if (subsidiada) promoSubsidioPorEstab.set(estab, true);
        else if (!promoSubsidioPorEstab.has(estab)) promoSubsidioPorEstab.set(estab, false);
    }

    const cupomDestaquePorEstab = new Map<string, boolean>();
    const cupomRegularPorEstab = new Map<string, boolean>();
    const primeiroPedidoPorEstab = new Map<string, boolean>();
    const taxaEntregaPorEstab = new Map<string, boolean>();
    const cupomEstabs = new Set<string>();
    for (const r of cupomRows) {
        const estab = String(r.estab);
        cupomEstabs.add(estab);
        if (Number(r.destaque) === 1) cupomDestaquePorEstab.set(estab, true);
        else cupomRegularPorEstab.set(estab, true);
        if (Number(r.primeiro_pedido_estabelecimento) === 1) primeiroPedidoPorEstab.set(estab, true);
        if (Number(r.taxa_entrega) === 1) taxaEntregaPorEstab.set(estab, true);
    }

    const porCidade = new Map<string, CidadeAcc>();
    for (const p of parceiros) {
        const cidade = String(p.cidade ?? '') || 'Sem cidade';
        const estab = String(p.estab);
        const acc = porCidade.get(cidade) ?? novaCidadeAcc(cidade);

        acc.lojasAtivas++;
        if (promoEstabs.has(estab)) {
            acc.comPromocao++;
            if (promoSubsidioPorEstab.get(estab)) acc.promoSubsidio++;
            else acc.promoSemSubsidio++;
        }
        if (cupomEstabs.has(estab)) {
            acc.comCupom++;
            if (cupomDestaquePorEstab.has(estab)) acc.cupomDestaque++;
            if (cupomRegularPorEstab.has(estab)) acc.cupomRegular++;
            if (primeiroPedidoPorEstab.has(estab)) acc.primeiroPedido++;
            if (taxaEntregaPorEstab.has(estab)) acc.taxaEntrega++;
        }

        porCidade.set(cidade, acc);
    }

    const cidades = [...porCidade.values()].sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR'));

    // "Sem ação" por cidade: percorre `parceiros` de novo (cada linha já sabe
    // sua cidade), já que os sets de promo/cupom são globais, não por cidade.
    const semAcaoPorCidade = new Map<string, number>();
    for (const p of parceiros) {
        const cidade = String(p.cidade ?? '') || 'Sem cidade';
        const estab = String(p.estab);
        const temAcao = promoEstabs.has(estab) || cupomEstabs.has(estab);
        if (!temAcao) semAcaoPorCidade.set(cidade, (semAcaoPorCidade.get(cidade) ?? 0) + 1);
    }

    const linhas = cidades.map(c => {
        const semAcao = semAcaoPorCidade.get(c.cidade) ?? 0;
        return {
            cidade: c.cidade,
            lojasAtivas: c.lojasAtivas,
            comPromocao: c.comPromocao,
            pctComPromocao: pct(c.comPromocao, c.lojasAtivas),
            promoSubsidio: c.promoSubsidio,
            pctPromoSubsidio: pct(c.promoSubsidio, c.lojasAtivas),
            promoSemSubsidio: c.promoSemSubsidio,
            pctPromoSemSubsidio: pct(c.promoSemSubsidio, c.lojasAtivas),
            comCupom: c.comCupom,
            pctComCupom: pct(c.comCupom, c.lojasAtivas),
            cupomDestaque: c.cupomDestaque,
            pctCupomDestaque: pct(c.cupomDestaque, c.lojasAtivas),
            primeiroPedido: c.primeiroPedido,
            pctPrimeiroPedido: pct(c.primeiroPedido, c.lojasAtivas),
            taxaEntrega: c.taxaEntrega,
            pctTaxaEntrega: pct(c.taxaEntrega, c.lojasAtivas),
            cupomRegular: c.cupomRegular,
            pctCupomRegular: pct(c.cupomRegular, c.lojasAtivas),
            semAcao,
            pctSemAcao: pct(semAcao, c.lojasAtivas),
        };
    });

    const totais = linhas.reduce(
        (acc, l) => ({
            cidadesComAcoes: acc.cidadesComAcoes + (l.semAcao < l.lojasAtivas ? 1 : 0),
            totalCidades: acc.totalCidades + 1,
            lojasAtivas: acc.lojasAtivas + l.lojasAtivas,
            comPromocao: acc.comPromocao + l.comPromocao,
            comCupom: acc.comCupom + l.comCupom,
            cupomDestaque: acc.cupomDestaque + l.cupomDestaque,
            cupomRegular: acc.cupomRegular + l.cupomRegular,
            semAcao: acc.semAcao + l.semAcao,
        }),
        { cidadesComAcoes: 0, totalCidades: 0, lojasAtivas: 0, comPromocao: 0, comCupom: 0, cupomDestaque: 0, cupomRegular: 0, semAcao: 0 },
    );

    return { linhas, totais };
}

/** Modo drill-down: lista de estabelecimentos de uma cidade+métrica. */
async function listarEstabelecimentos(
    connection: Awaited<ReturnType<typeof getConnection>>,
    cidade: string,
    metrica: string,
) {
    const [parceiros] = await connection.query<RowDataPacket[]>(
        `SELECT e.id AS estab, e.nome AS nome
         FROM estabelecimento e
         LEFT JOIN localidade l ON l.id = e.localidade_id
         WHERE e.delivery = 1 AND IFNULL(l.nome, '') = ?`,
        [cidade],
    );
    const nomePorEstab = new Map(parceiros.map(p => [String(p.estab), String(p.nome)]));
    const idsAtivos = new Set(parceiros.map(p => String(p.estab)));

    let idsAlvo = new Set<string>();

    if (metrica === 'comPromocao' || metrica === 'promoSubsidio' || metrica === 'promoSemSubsidio') {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT c.estabelecimento_id AS estab, cp.nome AS campanha
             FROM item_catalogo ic
             JOIN catalogo c           ON c.id = ic.catalogo_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status = 2 AND ic.ativo = 1 AND ic.arquivado = 0
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
               AND c.estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const subsidioPorEstab = new Map<string, boolean>();
        const todos = new Set<string>();
        for (const r of rows) {
            const estab = String(r.estab);
            todos.add(estab);
            const subsidiada = !isOfertasDaCasa(String(r.campanha ?? ''));
            subsidioPorEstab.set(estab, subsidiada || (subsidioPorEstab.get(estab) ?? false));
        }
        if (metrica === 'comPromocao') idsAlvo = todos;
        else if (metrica === 'promoSubsidio') idsAlvo = new Set([...todos].filter(e => subsidioPorEstab.get(e)));
        else idsAlvo = new Set([...todos].filter(e => !subsidioPorEstab.get(e)));
    } else if (['comCupom', 'cupomDestaque', 'cupomRegular', 'primeiroPedido', 'taxaEntrega'].includes(metrica)) {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab, destaque, primeiro_pedido_estabelecimento, taxa_entrega
             FROM cupom_desconto
             WHERE ativo = 1
               AND estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const destaquePorEstab = new Map<string, boolean>();
        const regularPorEstab = new Map<string, boolean>();
        const primeiroPedidoPorEstab = new Map<string, boolean>();
        const taxaEntregaPorEstab = new Map<string, boolean>();
        const todos = new Set<string>();
        for (const r of rows) {
            const estab = String(r.estab);
            todos.add(estab);
            if (Number(r.destaque) === 1) destaquePorEstab.set(estab, true);
            else regularPorEstab.set(estab, true);
            if (Number(r.primeiro_pedido_estabelecimento) === 1) primeiroPedidoPorEstab.set(estab, true);
            if (Number(r.taxa_entrega) === 1) taxaEntregaPorEstab.set(estab, true);
        }
        if (metrica === 'comCupom') idsAlvo = todos;
        else if (metrica === 'cupomDestaque') idsAlvo = new Set([...destaquePorEstab.keys()]);
        else if (metrica === 'cupomRegular') idsAlvo = new Set([...regularPorEstab.keys()]);
        else if (metrica === 'primeiroPedido') idsAlvo = new Set([...primeiroPedidoPorEstab.keys()]);
        else idsAlvo = new Set([...taxaEntregaPorEstab.keys()]);
    } else if (metrica === 'semAcao') {
        const [promoRows] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT c.estabelecimento_id AS estab
             FROM item_catalogo ic
             JOIN catalogo c           ON c.id = ic.catalogo_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status = 2 AND ic.ativo = 1 AND ic.arquivado = 0
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
               AND c.estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const [cupomRows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab
             FROM cupom_desconto
             WHERE ativo = 1
               AND estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const comAcao = new Set([
            ...promoRows.map(r => String(r.estab)),
            ...cupomRows.map(r => String(r.estab)),
        ]);
        idsAlvo = new Set([...idsAtivos].filter(id => !comAcao.has(id)));
    }

    const estabelecimentos = [...idsAlvo]
        .map(id => ({ id: Number(id), nome: nomePorEstab.get(id) ?? '' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return { total: estabelecimentos.length, estabelecimentos };
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
    const cidade = q.cidade?.trim() || null;
    const metrica = q.metrica?.trim() || null;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        if (cidade && metrica) {
            const resultado = await listarEstabelecimentos(connection, cidade, metrica);
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({ ok: true, cidade, metrica, ...resultado, elapsedMs: Date.now() - started }),
            };
        }

        const { linhas, totais } = await agregarPorCidade(connection);
        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, cidades: linhas, totais, elapsedMs: Date.now() - started }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
