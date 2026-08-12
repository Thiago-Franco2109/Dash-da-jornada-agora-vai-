import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Relatório de ATIVAÇÃO de campanhas (read-only) — cupons de destaque e
 * promoções — a partir do que o banco `bigou` registra hoje.
 *
 * As duas colunas JSON de `campanha_promocao` são dimensões DIFERENTES —
 * é por isso que a interseção entre elas é zero (não é desalinhamento):
 *   - `config`   é chaveado por localidade_id  → regra de subsídio por CIDADE
 *   - `metadata` é chaveado por estabelecimento_id → { sucessoDoCliente: true },
 *     que é o checkbox "Sucesso do Cliente" do painel: marcado = quem ativou
 *     aquela campanha para aquele parceiro foi o CS.
 *
 * Participação NÃO sai do `config` (isso contava cidades como se fossem
 * parceiros). A fonte real é `item_catalogo` — mesma base do promo-status.
 *
 * ⚠️ Limitações do dado:
 *   - Cupom: `usuario_id` vem nulo, então cupom não tem QUEM (só QUANDO).
 *   - Promoção: `metadata` é estado atual, sem data e sem histórico —
 *     `campanha_promocao` não está entre as tabelas versionadas em `historico`.
 *     Se o CS desmarcar, o passado muda. Congelar via snapshot mensal.
 *   - A marcação é por (campanha, parceiro), não por item/evento: um parceiro
 *     marcado conta como CS em toda a campanha, mesmo que tenha ativado
 *     sozinho algum item.
 *
 * Cupons: fluxo de ativações na janela (`data` = criação do cupom) — tem QUANDO.
 * Promoções: estado atual das campanhas ativas, com o corte CS vs parceiro.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const CS_CAMPAIGN_LABEL: Record<string, string> = {
    'Super Promos!': 'Super Promos',
    'Ofertas da Casa': 'Ofertas da Casa',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const windowDays = Math.min(Math.max(parseInt(q.window ?? '28', 10) || 28, 1), 180);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        // ── CUPONS DE DESTAQUE: fluxo de ativações na janela (data = criação) ──
        // O total sai da soma de porDia (mesmo predicado) — cada query custa
        // ~800ms de ida e volta neste banco, então não vale uma só pro COUNT.
        const [cupPorDia] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS dia, COUNT(*) AS n
             FROM cupom_desconto
             WHERE destaque = 1 AND ativo = 1 AND data >= NOW() - INTERVAL ${windowDays} DAY
             GROUP BY dia ORDER BY dia`,
        );
        const [cupPorCidade] = await connection.query<RowDataPacket[]>(
            `SELECT l.nome AS cidade, COUNT(*) AS n
             FROM cupom_desconto cd
             JOIN estabelecimento e ON e.id = cd.estabelecimento_id
             JOIN localidade l ON l.id = e.localidade_id
             WHERE cd.destaque = 1 AND cd.ativo = 1 AND cd.data >= NOW() - INTERVAL ${windowDays} DAY
             GROUP BY l.nome ORDER BY n DESC`,
        );

        // ── PROMOÇÕES: estado atual das campanhas ativas/vigentes ──
        const VIGENTE = `(data_inicio IS NULL OR data_inicio <= NOW()) AND (data_fim IS NULL OR data_fim >= NOW())`;
        const [camps] = await connection.query<RowDataPacket[]>(
            `SELECT id, nome, data, config, metadata FROM campanha_promocao WHERE ativo = 1 AND ${VIGENTE}`,
        );

        // metadata → parceiros marcados como "Sucesso do Cliente" nesta campanha.
        // config → só o nº de cidades configuradas (NÃO é participação).
        const csPorCampanha = new Map<number, Set<string>>();
        const meta = new Map<number, { nome: string; data: string | null; cidadesConfiguradas: number }>();
        for (const cp of camps) {
            const id = Number(cp.id);
            const marcados = new Set<string>();
            try {
                const m = JSON.parse(String(cp.metadata ?? '{}')) as Record<string, { sucessoDoCliente?: boolean }>;
                for (const [estabId, v] of Object.entries(m)) {
                    if (v?.sucessoDoCliente) marcados.add(estabId);
                }
            } catch { /* metadata inválido: campanha fica sem marcação */ }
            csPorCampanha.set(id, marcados);

            let cidades = 0;
            try { cidades = Object.keys(JSON.parse(String(cp.config ?? '{}'))).filter(k => /^\d+$/.test(k)).length; } catch { /* ignore */ }
            meta.set(id, {
                nome: CS_CAMPAIGN_LABEL[String(cp.nome)] ?? String(cp.nome),
                data: cp.data ? new Date(cp.data as string).toISOString() : null,
                cidadesConfiguradas: cidades,
            });
        }

        // Participação real: parceiro com item promocional APROVADO na campanha.
        // Uma linha por (campanha, parceiro) — mesma régua do promo-status.
        const [parts] = await connection.query<RowDataPacket[]>(
            `SELECT ic.campanha_promocao_id AS camp, c.estabelecimento_id AS estab, l.nome AS cidade
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             JOIN estabelecimento e ON e.id = c.estabelecimento_id
             JOIN localidade l ON l.id = e.localidade_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status = 2 AND e.delivery = 1
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
             GROUP BY camp, estab, cidade`,
        );

        type Split = { participantes: number; cs: number; parceiro: number };
        const novoSplit = (): Split => ({ participantes: 0, cs: 0, parceiro: 0 });
        const porCampanhaId = new Map<number, Split>();
        const porCidadeMap = new Map<string, Split>();
        const allEstabIds = new Set<number>();
        const totalSplit = novoSplit();

        for (const r of parts) {
            const camp = Number(r.camp);
            const estab = String(r.estab);
            const cidade = String(r.cidade ?? '—');
            const ehCs = csPorCampanha.get(camp)?.has(estab) ?? false;

            allEstabIds.add(Number(r.estab));
            for (const alvo of [
                porCampanhaId.get(camp) ?? porCampanhaId.set(camp, novoSplit()).get(camp)!,
                porCidadeMap.get(cidade) ?? porCidadeMap.set(cidade, novoSplit()).get(cidade)!,
                totalSplit,
            ]) {
                alvo.participantes++;
                if (ehCs) alvo.cs++; else alvo.parceiro++;
            }
        }

        const campanhas = [...porCampanhaId.entries()]
            .map(([id, s]) => ({
                nome: meta.get(id)?.nome ?? `#${id}`,
                data: meta.get(id)?.data ?? null,
                cidadesConfiguradas: meta.get(id)?.cidadesConfiguradas ?? 0,
                participantes: s.participantes,
                cs: s.cs,
                parceiro: s.parceiro,
            }))
            .sort((a, b) => b.participantes - a.participantes);

        const promoPorCidade = [...porCidadeMap.entries()]
            .map(([cidade, s]) => ({ cidade, n: s.participantes, cs: s.cs, parceiro: s.parceiro }))
            .sort((a, b) => b.n - a.n);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                windowDays,
                cupons: {
                    total: cupPorDia.reduce((s, r) => s + Number(r.n), 0),
                    porDia: cupPorDia.map(r => ({ dia: String(r.dia), n: Number(r.n) })),
                    porCidade: cupPorCidade.map(r => ({ cidade: String(r.cidade), n: Number(r.n) })),
                },
                promos: {
                    campanhas,
                    totalParticipacoes: totalSplit.participantes,
                    parceirosDistintos: allEstabIds.size,
                    cs: totalSplit.cs,
                    parceiro: totalSplit.parceiro,
                    porCidade: promoPorCidade,
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
