import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Base do CRM direto do banco — substitui as abas INDICADOR_FORMATADO e
 * PROMO-ESPECIAL. As duas partes lentas ficaram em functions próprias para
 * não estourar o limite de execução: `crm-gmv` (agregação de pedidos) e
 * `crm-cupons` (varredura de cupom_desconto). O front junta as três.
 *
 * A lista de promoção sai no formato da aba (headers + rows) de propósito: o
 * parser do front continua o mesmo, só muda a origem das linhas.
 *
 * Regras assumidas (o job que montava as abas não está no repositório, então
 * não deu para conferir número a número contra a planilha):
 *  - parceiro vivo = estabelecimento.delivery IN (1,4) — ativo ou suspenso
 *  - item promocional conta quando não está arquivado, tem status 0/1/2 e a
 *    campanha está ativa e vigente (mesma regra da function `promo-status`)
 *  - cupom do parceiro = cupom_desconto ativo e em destaque, que é o que a
 *    campanha "Cupons de destaque" usa
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const STATUS_CONTRATO: Record<number, string> = {
    1: 'ativo',
    2: 'cancelado',
    4: 'suspenso',
    5: 'cancelado',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab, e.nome AS nome, IFNULL(l.nome, '') AS cidade, e.delivery AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery IN (1, 4)
             ORDER BY l.nome, e.nome`,
        );

        const cidadePorEstab = new Map<string, string>();
        const nomePorEstab = new Map<string, string>();
        for (const p of parceiros) {
            cidadePorEstab.set(String(p.estab), String(p.cidade ?? ''));
            nomePorEstab.set(String(p.estab), String(p.nome ?? ''));
        }

        const [itens] = await connection.query<RowDataPacket[]>(
            `SELECT c.estabelecimento_id AS estab,
                    cp.nome              AS campanha,
                    ic.status            AS status,
                    ic.ativo             AS ativo
             FROM item_catalogo ic
             JOIN catalogo c            ON c.id = ic.catalogo_id
             JOIN estabelecimento e     ON e.id = c.estabelecimento_id
             JOIN campanha_promocao cp  ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1
               AND ic.status IN (0, 1, 2)
               AND ic.arquivado = 0
               AND e.delivery IN (1, 4)
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())`,
        );

        const promoHeaders = ['CIDADE', 'ESTAB_ID', 'ESTABELECIMENTO', 'CAMPANHA', 'STATUS', 'ATIVO'];
        const promoRows = itens.map(r => ({
            'CIDADE': cidadePorEstab.get(String(r.estab)) ?? '',
            'ESTAB_ID': String(r.estab),
            'ESTABELECIMENTO': nomePorEstab.get(String(r.estab)) ?? '',
            'CAMPANHA': String(r.campanha ?? ''),
            'STATUS': Number(r.status) === 2 ? 'aprovado' : Number(r.status) === 1 ? 'aguardando' : 'rascunho',
            'ATIVO': Number(r.ativo) === 1 ? 'ativo' : 'inativo',
        }));

        // Contagem que a planilha já trazia pronta na coluna SUPER PROMOS do
        // INDICADOR. A de CUPOM PARC. sai da `crm-cupons`, no front.
        const superPromos = new Map<string, { aprov: number; aguar: number }>();
        for (const r of itens) {
            if (!String(r.campanha ?? '').toLowerCase().includes('super promo')) continue;
            const estab = String(r.estab);
            const cur = superPromos.get(estab) ?? { aprov: 0, aguar: 0 };
            if (Number(r.status) === 2) cur.aprov++;
            else if (Number(r.status) === 1) cur.aguar++;
            superPromos.set(estab, cur);
        }

        const lista = parceiros.map(p => {
            const estab = String(p.estab);
            const promo = superPromos.get(estab);
            return {
                estabId: estab,
                estabelecimento: String(p.nome ?? ''),
                cidade: String(p.cidade ?? ''),
                contrato: STATUS_CONTRATO[Number(p.delivery)] ?? 'pendente',
                superPromosAprov: promo?.aprov ?? 0,
                superPromosAguar: promo?.aguar ?? 0,
            };
        });

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                parceiros: lista,
                promoEspecial: { headers: promoHeaders, orderedHeaders: promoHeaders, rows: promoRows },
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
