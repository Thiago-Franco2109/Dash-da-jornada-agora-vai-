import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Cardápio completo de um estabelecimento (todo item ativo, não só os em
 * promoção) — alimenta o seletor "Escolher do cardápio" do gerador de artes,
 * pro CS pegar nome/foto de qualquer item quando o parceiro ainda não tem
 * item criado na campanha (réplica diária do banco, ver promo-item-arte.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface CatalogoItemRow extends RowDataPacket {
    id: number;
    nome: string;
    imagem: string | null;
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

        const [rows] = await connection.query<CatalogoItemRow[]>(
            `SELECT ic.id, ic.nome, ic.imagem
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             WHERE c.estabelecimento_id = ? AND ic.ativo = 1 AND ic.arquivado = 0
             ORDER BY ic.nome`,
            [estabelecimentoId],
        );

        const itens = rows.map(r => ({
            id: r.id,
            nome: r.nome,
            imagem: r.imagem || null,
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
