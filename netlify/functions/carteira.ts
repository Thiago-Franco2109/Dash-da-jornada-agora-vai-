import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Carteira por cidade — substitui a aba CIDADES_FORMATADO.
 *
 * DIVISÃO e GRUPO não existem no banco (procurei em localidade, franquia e
 * categoria_localidade): são classificação comercial e vêm do Supabase, pela
 * tela de cadastro. Aqui saem vazios e o front preenche.
 *
 * Regras assumidas (o job que montava a aba não está no repositório):
 *  - a carteira conta parceiro vivo: ativo (delivery 1), suspenso (4) e
 *    pendente (contrato lançado sem delivery resolvido). Cancelado e
 *    desistência ficam de fora, como na aba.
 *  - TOTAL = ativos + suspensos + pendentes
 *  - "com promo" = parceiro com ao menos 1 item promocional aprovado e ativo
 *    em campanha vigente (mesma regra da `promo-status`)
 *  - "com cupom" = parceiro com ao menos 1 cupom ativo em destaque
 *  - os percentuais são sobre os ATIVOS, não sobre o total
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface Contadores {
    cidade: string;
    total: number;
    ativos: number;
    suspenso: number;
    pendente: number;
    promoAprovada: number;
    cupomAprovado: number;
}

function pct(parte: number, base: number): number {
    if (base <= 0) return 0;
    return Math.round((parte / base) * 1000) / 10;
}

/**
 * Modo drill-down: lista de estabelecimentos de uma cidade+métrica (mesma
 * base populacional e regras de promo/cupom do modo agregado acima). Mesmo
 * padrão de `acoes-promocionais.ts`'s `listarEstabelecimentos`.
 */
async function listarEstabelecimentos(
    connection: Awaited<ReturnType<typeof getConnection>>,
    cidade: string,
    metrica: string,
) {
    const [parceiros] = await connection.query<RowDataPacket[]>(
        `SELECT e.id AS estab, e.nome AS nome, e.delivery AS delivery
         FROM estabelecimento e
         LEFT JOIN localidade l ON l.id = e.localidade_id
         WHERE IFNULL(l.nome, '') = ?
           AND (e.delivery IN (1, 4)
                OR (e.delivery = 0
                    AND e.id IN (SELECT estabelecimento_id FROM venda_estabelecimento)))`,
        [cidade],
    );
    const nomePorEstab = new Map(parceiros.map(p => [String(p.estab), String(p.nome)]));
    const idsTodos = new Set(parceiros.map(p => String(p.estab)));
    const idsAtivos = new Set(parceiros.filter(p => Number(p.delivery) === 1).map(p => String(p.estab)));

    let idsAlvo = new Set<string>();

    if (metrica === 'total') {
        idsAlvo = idsTodos;
    } else if (metrica === 'ativos') {
        idsAlvo = idsAtivos;
    } else if (metrica === 'suspenso') {
        idsAlvo = new Set(parceiros.filter(p => Number(p.delivery) === 4).map(p => String(p.estab)));
    } else if (metrica === 'pendente') {
        idsAlvo = new Set(parceiros.filter(p => Number(p.delivery) === 0).map(p => String(p.estab)));
    } else if (metrica === 'promoAprovada' || metrica === 'semPromo') {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT c.estabelecimento_id AS estab
             FROM item_catalogo ic
             JOIN catalogo c           ON c.id = ic.catalogo_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1
               AND ic.status = 2
               AND ic.ativo = 1
               AND ic.arquivado = 0
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
               AND c.estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const promoSet = new Set(rows.map(r => String(r.estab)));
        idsAlvo = metrica === 'promoAprovada'
            ? promoSet
            : new Set([...idsAtivos].filter(id => !promoSet.has(id)));
    } else if (metrica === 'cupomAprovado' || metrica === 'semCupom') {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT estabelecimento_id AS estab
             FROM cupom_desconto
             WHERE ativo = 1 AND destaque = 1
               AND estabelecimento_id IN (${[...idsAtivos].map(() => '?').join(',') || 'NULL'})`,
            [...idsAtivos],
        );
        const cupomSet = new Set(rows.map(r => String(r.estab)));
        idsAlvo = metrica === 'cupomAprovado'
            ? cupomSet
            : new Set([...idsAtivos].filter(id => !cupomSet.has(id)));
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

        // Pendente = delivery 0 com contrato: acabou de fechar e ainda não
        // entrou no ar (tem caso lançado hoje). Note que delivery = -1 NÃO
        // entra: são 1.269 cadastros antigos que nunca viraram delivery, com
        // último lançamento em 2021 — contá-los dobrava a carteira.
        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT IFNULL(l.nome, '') AS cidade,
                    e.id               AS estab,
                    e.delivery         AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery IN (1, 4)
                OR (e.delivery = 0
                    AND e.id IN (SELECT estabelecimento_id FROM venda_estabelecimento))`,
        );

        const [comPromo] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT c.estabelecimento_id AS estab
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

        const [comCupom] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT estabelecimento_id AS estab
             FROM cupom_desconto
             WHERE ativo = 1 AND destaque = 1 AND estabelecimento_id IS NOT NULL`,
        );

        const promoSet = new Set(comPromo.map(r => String(r.estab)));
        const cupomSet = new Set(comCupom.map(r => String(r.estab)));

        const porCidade = new Map<string, Contadores>();
        for (const p of parceiros) {
            const cidade = String(p.cidade ?? '') || 'Sem cidade';
            const estab = String(p.estab);
            const delivery = Number(p.delivery);

            const c = porCidade.get(cidade) ?? {
                cidade, total: 0, ativos: 0, suspenso: 0, pendente: 0,
                promoAprovada: 0, cupomAprovado: 0,
            };

            c.total++;
            if (delivery === 1) c.ativos++;
            else if (delivery === 4) c.suspenso++;
            else c.pendente++;

            // Promo e cupom só contam para quem está no ar.
            if (delivery === 1) {
                if (promoSet.has(estab)) c.promoAprovada++;
                if (cupomSet.has(estab)) c.cupomAprovado++;
            }

            porCidade.set(cidade, c);
        }

        const linhas = [...porCidade.values()]
            .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR'))
            .map(c => ({
                divisao: '',
                cidade: c.cidade,
                grupo: '',
                total: c.total,
                ativos: c.ativos,
                suspenso: c.suspenso,
                pendente: c.pendente,
                pctComPromo: pct(c.promoAprovada, c.ativos),
                promoAprovada: c.promoAprovada,
                semPromo: Math.max(0, c.ativos - c.promoAprovada),
                pctComCupom: pct(c.cupomAprovado, c.ativos),
                cupomAprovado: c.cupomAprovado,
                semCupom: Math.max(0, c.ativos - c.cupomAprovado),
            }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: linhas.length,
                linhas,
                elapsedMs: Date.now() - started,
            }),
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
