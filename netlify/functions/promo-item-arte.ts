import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Item promocional vigente (ou pendente) de um estabelecimento — alimenta o
 * gerador de artes (Geração Avulsa automática) com nome/preços/imagem/dias.
 *
 * Regra de "promoção vigente" de `acoes-promocionais.ts` (item promocional=1,
 * ativo=1, arquivado=0, campanha ativa e dentro do período de vigência), mas
 * aceitando status 1 (pendente — já criado no CMS, aguardando o parceiro
 * aprovar no painel dele) além de 2 (aprovado). Sem isso, CS não conseguia
 * gerar a arte de uma promoção recém-criada até o parceiro aprovar — e ainda
 * ficava sujeito à réplica diária do banco (ver netlify/functions/_shared/db.ts).
 * status: 0=rascunho 1=pendente 2=aprovado 3=cancelado (mesmo enum de
 * `promo-status.ts`) — 0 e 3 ficam de fora de propósito.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface PromoItemRow extends RowDataPacket {
    id: number;
    nome: string;
    preco: number;
    preco_promocional: number | null;
    imagem: string | null;
    disponibilidade_diaria: string | null;
    campanha: string | null;
    status: number;
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
    const estabelecimentoId = q.estabelecimentoId?.trim();
    if (!estabelecimentoId || !/^\d+$/.test(estabelecimentoId)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'estabelecimentoId inválido' }) };
    }

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [rows] = await connection.query<PromoItemRow[]>(
            `SELECT ic.id, ic.nome, ic.preco, ic.preco_promocional, ic.imagem, ic.disponibilidade_diaria, cp.nome AS campanha, ic.status
             FROM item_catalogo ic
             JOIN catalogo c           ON c.id = ic.catalogo_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status IN (1, 2) AND ic.ativo = 1 AND ic.arquivado = 0
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
               AND c.estabelecimento_id = ?`,
            [estabelecimentoId],
        );

        const itens = rows.map(r => ({
            id: r.id,
            nome: r.nome,
            precoOriginal: Number(r.preco) || 0,
            precoPromocional: r.preco_promocional != null ? Number(r.preco_promocional) : null,
            imagem: r.imagem || null,
            disponibilidadeDiaria: r.disponibilidade_diaria || null,
            campanha: r.campanha || null,
            status: Number(r.status),
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, itens, elapsedMs: Date.now() - started }),
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
