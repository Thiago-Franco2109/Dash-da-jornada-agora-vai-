import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Link público da loja do parceiro (bigou.com.br) — pro CTA que costuma ir
 * junto com a arte promocional. Formato confirmado (via SHOW COLUMNS real):
 *   https://bigou.com.br/<cidade-slug>-<uf>/estabelecimento/<id>/<nome-slug>
 *
 * `estabelecimento.localidade_id` é a ZONA DE ENTREGA (ex.: "Cordeiro /
 * Cantagalo"), diferente do município real usado na URL — precisa do join
 * localidade → cidade → estado pra pegar o nome puro da cidade + a UF.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface LojaLinkRow extends RowDataPacket {
    estab_nome: string;
    cidade_nome: string;
    uf: string;
}

function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
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

        const [rows] = await connection.query<LojaLinkRow[]>(
            `SELECT e.nome AS estab_nome, c.nome AS cidade_nome, es.sigla AS uf
             FROM estabelecimento e
             JOIN localidade l ON l.id = e.localidade_id
             JOIN cidade c     ON c.id = l.cidade_id
             JOIN estado es    ON es.id = c.estado_id
             WHERE e.id = ?`,
            [estabelecimentoId],
        );

        if (rows.length === 0) {
            return { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Estabelecimento não encontrado' }) };
        }

        const row = rows[0];
        const cidadeSlug = `${slugify(row.cidade_nome)}-${row.uf.toLowerCase()}`;
        const url = `https://bigou.com.br/${cidadeSlug}/estabelecimento/${estabelecimentoId}/${slugify(row.estab_nome)}`;

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({ ok: true, url, elapsedMs: Date.now() - started }),
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
