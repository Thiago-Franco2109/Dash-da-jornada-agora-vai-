import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Status dos ITENS promocionais por parceiro e por campanha (read-only).
 *
 * Fonte real: item_catalogo (promocional=1, campanha_promocao_id) → catalogo →
 * estabelecimento. status: 0=rascunho 1=pendente 2=aprovado 3=cancelado.
 *
 * Retorna:
 *  - porParceiro[estabId][campanha] = { rascunho, pendente, aprovado }
 *  - campanhasPorLocalidade[localidade_id] = [nomes de campanha na cidade]
 *    (para mostrar "sem item" quando a campanha existe na cidade mas o parceiro
 *     não tem item nela — ex: Promo do Dia)
 *
 * STOPGAP: protegido por checagem de origem.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const STATUS_NOME: Record<number, 'rascunho' | 'pendente' | 'aprovado'> = { 0: 'rascunho', 1: 'pendente', 2: 'aprovado' };

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
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT e.localidade_id AS loc, cp.nome AS campanha,
                    c.estabelecimento_id AS estab, ic.status AS st
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             JOIN estabelecimento e ON e.id = c.estabelecimento_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status IN (0,1,2) AND e.delivery = 1
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())`,
        );

        const porParceiro: Record<string, Record<string, { rascunho: number; pendente: number; aprovado: number }>> = {};
        const campanhasPorLoc: Record<string, Set<string>> = {};

        for (const r of rows) {
            const estab = String(r.estab);
            const campanha = r.campanha as string;
            const loc = String(r.loc ?? '');
            const nome = STATUS_NOME[r.st as number];
            if (!nome) continue;

            const p = (porParceiro[estab] ??= {});
            const cc = (p[campanha] ??= { rascunho: 0, pendente: 0, aprovado: 0 });
            cc[nome]++;

            if (loc) (campanhasPorLoc[loc] ??= new Set()).add(campanha);
        }

        const campanhasPorLocalidade: Record<string, string[]> = {};
        for (const [loc, set] of Object.entries(campanhasPorLoc)) {
            campanhasPorLocalidade[loc] = [...set];
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                porParceiro,
                campanhasPorLocalidade,
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }) };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
