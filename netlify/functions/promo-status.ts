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
 *  - porParceiro[estabId][campanha] = { rascunho, pendente, aprovado,
 *      pendenteDias, pendenteDesde }
 *    `pendenteDias` = há quantos dias o item pendente MAIS ANTIGO daquela campanha
 *    está esperando. Item nasce pendente quando o CS cria; sai de pendente quando
 *    alguém aprova (o próprio CS pode aprovar pelo parceiro, depois do ok dele).
 *    Ou seja: é há quantos dias a oferta está pronta esperando a conversa acontecer.
 *    DATEDIFF é calculado NO BANCO de propósito — mysql2 devolve DATETIME como Date
 *    e o JSON.stringify serializa em UTC, então subtrair no front erra ±1 dia no Brasil.
 *  - campanhasPorLocalidade[localidade_id] = [nomes de campanha na cidade]
 *    (para mostrar "sem item" quando a campanha existe na cidade mas o parceiro
 *     não tem item nela — ex: Promo do Dia)
 *  - campanhas = [{ id, nome }] de TODA campanha vigente, tenha ela item ou não.
 *    As duas listas acima só enxergam campanha que já tem item em algum lugar;
 *    a tela de Promoções precisa da lista completa (é a mesma que o CS vê no
 *    CMS) pra conseguir mostrar "não ofertada na cidade". O `id` é o
 *    `campanha_promocao.id`, que é o que monta o link /campanha/promocao/cadastro/<id>.
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

    const VIGENTE = `ativo = 1
        AND (data_inicio IS NULL OR data_inicio <= NOW())
        AND (data_fim IS NULL OR data_fim >= NOW())`;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [campanhasVigentes] = await connection.query<RowDataPacket[]>(
            `SELECT id, nome FROM campanha_promocao WHERE ${VIGENTE} ORDER BY nome`,
        );
        const campanhas = campanhasVigentes.map(c => ({ id: Number(c.id), nome: String(c.nome ?? '') }));

        // Agrupado no banco: a resposta fica menor que a de antes (uma linha por
        // (estab, campanha, status) em vez de uma por item) e o WHERE é idêntico,
        // então as contagens não mudam.
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT e.localidade_id AS loc, cp.nome AS campanha,
                    c.estabelecimento_id AS estab, ic.status AS st,
                    COUNT(*) AS n,
                    MIN(ic.data_modificacao_status) AS desde,
                    DATEDIFF(NOW(), MIN(ic.data_modificacao_status)) AS dias,
                    SUM(ic.ativo = 1 AND ic.arquivado = 0) AS n_vivo,
                    SUM(ic.data_modificacao_status IS NULL) AS n_sem_data
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             JOIN estabelecimento e ON e.id = c.estabelecimento_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status IN (0,1,2) AND e.delivery = 1
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
             GROUP BY loc, campanha, estab, st`,
        );

        interface Contagem {
            rascunho: number;
            pendente: number;
            aprovado: number;
            pendenteDias?: number | null;
            pendenteDesde?: string | null;
        }
        const porParceiro: Record<string, Record<string, Contagem>> = {};
        const campanhasPorLoc: Record<string, Set<string>> = {};

        // Diagnóstico: `promo-status` não filtra item arquivado/inativo (a function
        // acoes-promocionais filtra). Antes de mudar o WHERE — o que mexeria em
        // contagem que a tela já mostra — medimos o tamanho do problema.
        const faixas: Record<string, number> = { '0-2': 0, '3-6': 0, '7-13': 0, '14-29': 0, '30+': 0 };
        let itensPendentes = 0, pendentesSemData = 0, pendentesArquivadosOuInativos = 0;

        for (const r of rows) {
            const estab = String(r.estab);
            const campanha = r.campanha as string;
            const loc = String(r.loc ?? '');
            const nome = STATUS_NOME[r.st as number];
            if (!nome) continue;

            const p = (porParceiro[estab] ??= {});
            const cc = (p[campanha] ??= { rascunho: 0, pendente: 0, aprovado: 0 });
            const n = Number(r.n);
            cc[nome] += n;

            if (nome === 'pendente') {
                const dias = r.dias == null ? null : Number(r.dias);
                cc.pendenteDias = dias;
                cc.pendenteDesde = r.desde ? new Date(r.desde as string).toISOString() : null;

                itensPendentes += n;
                pendentesSemData += Number(r.n_sem_data ?? 0);
                pendentesArquivadosOuInativos += n - Number(r.n_vivo ?? 0);
                if (dias != null) {
                    const faixa = dias <= 2 ? '0-2' : dias <= 6 ? '3-6' : dias <= 13 ? '7-13' : dias <= 29 ? '14-29' : '30+';
                    faixas[faixa] += n;
                }
            }

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
                campanhas,
                porParceiro,
                campanhasPorLocalidade,
                diagnostico: {
                    itensPendentes,
                    pendentesSemData,
                    pendentesArquivadosOuInativos,
                    pendentesPorFaixaDias: faixas,
                },
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
