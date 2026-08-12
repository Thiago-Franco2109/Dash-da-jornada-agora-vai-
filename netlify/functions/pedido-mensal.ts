import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Pedido mensal por parceiro — substitui as abas PEDIDO_MENSAL e
 * PARCEIRO_MENSAL da planilha mestre. As duas saem da mesma agregação, então
 * uma passada só em `pedido` alimenta as duas.
 *
 * A resposta imita o formato das abas (headers + rows): os parsers
 * `parsePedidoMensalTable` e `parseParceiroMensalTable` continuam intactos.
 *
 * REGRAS (o job que montava as abas não está no repositório; as duas
 * primeiras vieram do Thiago, o resto é leitura das colunas do banco):
 *  - ACEITO = status IN (1,2) · CANCELADO = 3 · EXPIRADO = -1
 *  - INCENTIVOS = `reembolso_promocao` — o desconto da promoção que a Bigou
 *    devolve ao parceiro
 *  - COMISSAO_LIQ = comissão dos aceitos MENOS os incentivos reembolsados
 *  - NOVOS_USUARIOS = `primeiro = 1`, primeiro pedido do cliente no APP
 *    (não no estabelecimento — para isso existe `primeiro_estabelecimento`)
 *  - CUPOM_PARCEIRO = `estabelecimento_cupom`, o desconto bancado pela loja
 *  - PGT_ONLINE = `tipo_pgt_online <> 'offline'`
 *  - PORC_CANCEL = cancelados ÷ (aceitos + cancelados)
 *  - RECESSOS = quantidade de recessos que tocam o mês
 *  - a janela termina no mês passado: o corrente está pela metade
 *
 * TAXA_GATEWAY_APROX repete TAXA_PGT_ONLINE: o banco tem uma taxa só de
 * pagamento online (`taxa_pgt_online`), sem separar a parte do gateway.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function mesIso(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const arredonda = (v: number): number => Math.round(v * 100) / 100;
const num = (v: unknown): number => arredonda(Number(v ?? 0));

const STATUS_CONTRATO: Record<number, string> = { 1: 'ativo', 2: 'cancelado', 4: 'suspenso', 5: 'cancelado' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const meses = Math.min(Math.max(Number(q.meses) || 6, 1), 24);
    const incluirMesAtual = q.incluirMesAtual === '1' || q.incluirMesAtual === 'true';

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const hoje = new Date();
        const deslocamento = incluirMesAtual ? 0 : 1;
        const janela: string[] = [];
        for (let i = 0; i < meses; i++) {
            janela.push(mesIso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i - deslocamento, 1))));
        }
        const desde = `${janela[janela.length - 1]}-01`;
        const maisRecente = janela[0].split('-').map(Number);
        const ate = `${mesIso(new Date(Date.UTC(maisRecente[0], maisRecente[1], 1)))}-01`;

        const [agregado] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data, '%Y-%m') AS mes,
                    SUM(status IN (1,2))                                   AS aceitos,
                    SUM(status = 3)                                        AS cancelados,
                    SUM(status IN (1,2) AND tipo_pgt_online <> 'offline')  AS aceitosOnline,
                    SUM(status = 3    AND tipo_pgt_online <> 'offline')    AS canceladosOnline,
                    SUM(status IN (1,2) AND cupom_desconto_id IS NOT NULL) AS aceitosCupom,
                    SUM(status = 3    AND cupom_desconto_id IS NOT NULL)   AS canceladosCupom,
                    SUM(CASE WHEN status IN (1,2) AND primeiro = 1 THEN 1 ELSE 0 END)         AS novosUsuarios,
                    SUM(CASE WHEN status IN (1,2) THEN total ELSE 0 END)                      AS gmvBruto,
                    SUM(CASE WHEN status IN (1,2) THEN total - IFNULL(desconto,0) ELSE 0 END) AS gmvLiq,
                    SUM(CASE WHEN status IN (1,2) AND tipo_pgt_online <> 'offline' THEN total ELSE 0 END) AS gmvOnline,
                    SUM(CASE WHEN status IN (1,2) THEN comissao ELSE 0 END)                   AS comissao,
                    SUM(CASE WHEN status = 3  THEN comissao ELSE 0 END)                       AS comissaoCancelados,
                    SUM(CASE WHEN status = -1 THEN comissao ELSE 0 END)                       AS comissaoExpirados,
                    SUM(CASE WHEN status IN (1,2) THEN IFNULL(reembolso_promocao,0) ELSE 0 END)    AS incentivos,
                    SUM(CASE WHEN status IN (1,2) THEN IFNULL(estabelecimento_cupom,0) ELSE 0 END) AS cupomParceiro,
                    SUM(CASE WHEN status IN (1,2) THEN IFNULL(taxa_servico,0) ELSE 0 END)          AS txServico,
                    SUM(CASE WHEN status IN (1,2) THEN IFNULL(taxa_pgt_online,0) ELSE 0 END)       AS txPgtOnline
             FROM pedido
             WHERE data >= ? AND data < ?
             GROUP BY estabelecimento_id, mes`,
            [desde, ate],
        );

        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab, e.nome AS nome, IFNULL(l.nome, '') AS cidade, e.delivery AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.delivery IN (1, 2, 4, 5)`,
        );

        const infoEstab = new Map(parceiros.map(p => [String(p.estab), {
            nome: String(p.nome ?? ''),
            cidade: String(p.cidade ?? ''),
            contrato: STATUS_CONTRATO[Number(p.delivery)] ?? 'pendente',
        }]));

        // Recessos que tocam cada mês da janela.
        const [recessos] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id AS estab,
                    DATE_FORMAT(data_inicio, '%Y-%m-%d') AS inicio,
                    DATE_FORMAT(data_fim,    '%Y-%m-%d') AS fim
             FROM recesso_estabelecimento
             WHERE ativo = 1 AND data_fim >= ? AND data_inicio < ?`,
            [desde, ate],
        );

        const recessosPorChave = new Map<string, number>();
        for (const r of recessos) {
            const inicio = String(r.inicio ?? '').slice(0, 7);
            const fim = String(r.fim ?? '').slice(0, 7);
            for (const mes of janela) {
                if (mes >= inicio && mes <= fim) {
                    const chave = `${mes}|${r.estab}`;
                    recessosPorChave.set(chave, (recessosPorChave.get(chave) ?? 0) + 1);
                }
            }
        }

        // Um registro por (parceiro, mês). As duas abas saem daqui, montadas no
        // front: mandar as duas prontas daqui repetia tudo e dobrava o payload
        // (6,5 MB contra 1,3 MB).
        const linhas = [];
        for (const r of agregado) {
            const estab = String(r.estab);
            if (!infoEstab.has(estab)) continue; // sem contrato: não é parceiro da carteira

            const mes = String(r.mes);
            const incentivos = num(r.incentivos);
            const comissao = num(r.comissao);

            linhas.push({
                estabId: estab,
                mes,
                monthMovel: janela.indexOf(mes) + 1,
                recessos: recessosPorChave.get(`${mes}|${estab}`) ?? 0,
                aceitos: num(r.aceitos),
                cancelados: num(r.cancelados),
                aceitosOnline: num(r.aceitosOnline),
                canceladosOnline: num(r.canceladosOnline),
                aceitosCupom: num(r.aceitosCupom),
                canceladosCupom: num(r.canceladosCupom),
                novosUsuarios: num(r.novosUsuarios),
                incentivos,
                cupomParceiro: num(r.cupomParceiro),
                comissao,
                comissaoLiq: arredonda(comissao - incentivos),
                comissaoCancelados: num(r.comissaoCancelados),
                comissaoExpirados: num(r.comissaoExpirados),
                txServico: num(r.txServico),
                txPgtOnline: num(r.txPgtOnline),
                gmvBruto: num(r.gmvBruto),
                gmvLiq: num(r.gmvLiq),
                gmvOnline: num(r.gmvOnline),
            });
        }

        // Só os parceiros que aparecem em alguma linha: mandar os 7 mil com
        // contrato incluiria 5 mil que não tiveram pedido nenhum na janela.
        const parceirosPayload: Record<string, { nome: string; cidade: string; contrato: string }> = {};
        for (const linha of linhas) {
            if (!parceirosPayload[linha.estabId]) {
                parceirosPayload[linha.estabId] = infoEstab.get(linha.estabId)!;
            }
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                meses: janela,
                parceiros: parceirosPayload,
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
