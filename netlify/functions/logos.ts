import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Logos dos parceiros — substitui a aba LOJAS_DELIVERY da planilha mestre.
 *
 * O arquivo da logomarca fica em `estabelecimento.plano3` (nome de coluna
 * legado: não tem relação com plano/assinatura). A URL pública é
 * `https://api-aws.bigou.com.br/uploads/logomarca/<arquivo>`, que redireciona
 * para o CDN. 1.401 dos 1.403 parceiros ativos têm esse arquivo preenchido.
 *
 * As linhas saem com os mesmos nomes de coluna da planilha (loja_id,
 * nome_loja, logotipo) para o `buildPartnerLogoMapFromRows` do front montar
 * as chaves de busca sem mudança.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const LOGO_BASE_URL = 'https://api-aws.bigou.com.br/uploads/logomarca';

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

        // Só parceiro vivo (1 = ativo, 4 = suspenso), como a aba LOJAS_DELIVERY.
        // Incluir os 5.4k cancelados levaria o payload de ~50 KB para ~250 KB
        // gzipado em toda visita, e nenhuma tela mostra a logo de quem cancelou.
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT id AS loja_id, nome AS nome_loja, plano3 AS arquivo
             FROM estabelecimento
             WHERE plano3 IS NOT NULL AND plano3 <> ''
               AND delivery IN (1, 4)`,
        );

        const lojas = rows.map(r => ({
            loja_id: String(r.loja_id),
            nome_loja: String(r.nome_loja ?? ''),
            logotipo: `${LOGO_BASE_URL}/${String(r.arquivo).trim()}`,
        }));

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                total: lojas.length,
                lojas,
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
