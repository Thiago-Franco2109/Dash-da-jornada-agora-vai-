import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { isCampanhaSubsidiada } from './_shared/campanhaSubsidio';

/**
 * Análise de UMA cidade do marketplace — o drill-in da tela Cidades.
 *
 * A tela Cidades responde "qual o número de cada cidade". Esta function
 * responde a pergunta seguinte: dentro da cidade, quem carrega o volume, quem
 * parou de vender e quem nunca recebeu ação de marketing.
 *
 * Regras (as mesmas das functions irmãs, pra número não divergir entre telas):
 *  - só marketplace: `cardapio_digital = 0/NULL`, no parceiro E no pedido. CD e
 *    marketplace são bases disjuntas (ver `jornada.ts`).
 *  - carteira = ativo (delivery 1), suspenso (4) e pendente (delivery 0 com
 *    contrato). Mesma base de `carteira.ts`.
 *  - pedido recebido = `status IN (1, 2)`, como em `pedido-relatorio` e
 *    `jornada`.
 *  - promo subsidiada: "Ofertas da Casa" nunca é subsidiada, qualquer outra
 *    campanha é — regra confirmada em `acoes-promocionais.ts`.
 *  - cupom: `ativo = 1` sem filtrar destaque (regra de `acoes-promocionais`,
 *    não a de `carteira`). Destaque = cupom da casa; sem destaque = cupom do
 *    próprio parceiro, nunca subsidiado.
 *
 * ── Janela ───────────────────────────────────────────────────────────────
 * Termina ONTEM, não hoje: dia em curso é parcial e puxaria o ritmo pra baixo
 * na comparação entre janelas. E 7/14/28 são múltiplos de semana de propósito
 * — 55% dos pedidos caem de sexta a domingo, então janela que não fecha a
 * semana inteira compara dias de peso diferente e inventa tendência.
 *
 * O corte do dia é calculado em São Paulo, não no banco: `pedido.data` está em
 * horário de Brasília e o servidor roda em UTC, então `CURDATE()` vira o dia
 * seguinte entre 21h e meia-noite e a janela andaria um dia. Mesmo cuidado de
 * `trello-atividade-hoje.ts`.
 *
 * ── Custo ────────────────────────────────────────────────────────────────
 * Medido em Muriaé (215 parceiros, a maior): parceiros 186ms · pedidos 568ms ·
 * promo 476ms · cupom 1.094ms. O cupom é o caro e não tem conserto aqui:
 * `cupom_desconto` tem ~1,4M linhas sem índice por `estabelecimento_id` (mesmo
 * aviso de `crm-cupons.ts` e `acoes-promocionais.ts`). Daí o cache curto na
 * resposta: ir e voltar entre cidades não paga o scan de novo.
 *
 * Query params:
 *   ?cidade=Muriaé   → obrigatório, nome exato de `localidade.nome`
 *   ?dias=7|14|28|90 → janela, padrão 28
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const JANELAS_VALIDAS = [7, 14, 28, 90];

/** Dia de hoje em São Paulo, como 'YYYY-MM-DD'. */
function hojeEmSaoPaulo(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Soma dias a 'YYYY-MM-DD' sem passar por fuso (aritmética em UTC puro). */
function somarDias(iso: string, dias: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

export type ClasseRelevancia = 'ancora' | 'peso' | 'cauda' | 'parada' | 'fora';

export interface ParceiroCidade {
    id: number;
    nome: string;
    /** 1 ativo · 4 suspenso · 0 pendente */
    delivery: number;
    pedidos: number;
    pedidos14: number;
    pedidos7: number;
    /** % dos pedidos da cidade na janela */
    share: number;
    /** % acumulado na curva, ordenado por volume */
    acumulado: number;
    classe: ClasseRelevancia;
    /**
     * Ritmo dos últimos 7 dias contra a média da janela: 1 = no mesmo passo,
     * 0.5 = vendendo metade. Null quando não há base pra comparar.
     */
    ritmo: number | null;
    promoAgora: boolean;
    promoSubsidiadaAgora: boolean;
    jaTevePromo: boolean;
    jaTevePromoSubsidiada: boolean;
    campanhas: string[];
    cupomAgora: boolean;
    cupomDestaqueAgora: boolean;
    jaTeveCupom: boolean;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }

    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: erroHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const q = event.queryStringParameters ?? {};
    const cidade = q.cidade?.trim();
    if (!cidade) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Informe ?cidade=' }) };
    }

    const diasPedido = Number(q.dias ?? 28);
    const dias = JANELAS_VALIDAS.includes(diasPedido) ? diasPedido : 28;

    // Janela fechada nas duas pontas, terminando ontem.
    const ate = somarDias(hojeEmSaoPaulo(), -1);
    const de = somarDias(ate, -(dias - 1));
    const de14 = somarDias(ate, -13);
    const de7 = somarDias(ate, -6);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [parceiros] = await connection.query<RowDataPacket[]>(
            `SELECT e.id AS estab, e.nome AS nome, e.delivery AS delivery
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE IFNULL(l.nome, '') = ?
               AND (e.cardapio_digital = 0 OR e.cardapio_digital IS NULL)
               AND (e.delivery IN (1, 4)
                    OR (e.delivery = 0
                        AND e.id IN (SELECT estabelecimento_id FROM venda_estabelecimento)))
             ORDER BY e.nome`,
            [cidade],
        );

        if (parceiros.length === 0) {
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({
                    ok: true, cidade, dias, de, ate,
                    carteira: { total: 0, ativos: 0, suspenso: 0, pendente: 0 },
                    atividade: { pedidos: 0, pedidos14: 0, pedidos7: 0, comPedido: 0, comPedido14: 0, comPedido7: 0, semPedido: 0 },
                    marketing: { promoAgora: 0, promoSubsidiadaAgora: 0, nuncaTevePromo: 0, cupomAgora: 0, nuncaTeveCupom: 0, semAcaoNenhuma: 0 },
                    parceiros: [],
                    elapsedMs: Date.now() - started,
                }),
            };
        }

        const ids = parceiros.map(p => Number(p.estab));

        // `FORCE INDEX (data)`: a janela corta por data e são dezenas/centenas
        // de lojas — o índice por estabelecimento_id varreria o histórico
        // inteiro de cada uma (ver `_shared/pedidoIndexHint.ts`).
        const [pedidoRows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id            AS estab,
                    DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    COUNT(*)                      AS n
             FROM pedido FORCE INDEX (data)
             WHERE status IN (1, 2)
               AND (cardapio_digital = 0 OR cardapio_digital IS NULL)
               AND data >= ?
               AND data <  DATE_ADD(?, INTERVAL 1 DAY)
               AND estabelecimento_id IN (?)
             GROUP BY estabelecimento_id, dia`,
            [de, ate, ids],
        );

        // Histórico de campanha por parceiro. Sem filtro de vigência: a
        // pergunta é "já participou", e `vigente` marca quem participa agora.
        const [promoRows] = await connection.query<RowDataPacket[]>(
            `SELECT c.estabelecimento_id AS estab,
                    cp.nome              AS campanha,
                    MAX(ic.ativo = 1 AND ic.arquivado = 0 AND ic.status = 2
                        AND cp.ativo = 1
                        AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
                        AND (cp.data_fim    IS NULL OR cp.data_fim    >= NOW())) AS vigente
             FROM item_catalogo ic
             JOIN catalogo c           ON c.id  = ic.catalogo_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1
               AND c.estabelecimento_id IN (?)
             GROUP BY c.estabelecimento_id, cp.nome`,
            [ids],
        );

        const [cupomRows] = await connection.query<RowDataPacket[]>(
            `SELECT estabelecimento_id        AS estab,
                    COUNT(*)                  AS total,
                    SUM(ativo = 1)            AS ativos,
                    SUM(ativo = 1 AND destaque = 1) AS destaque
             FROM cupom_desconto
             WHERE estabelecimento_id IN (?)
             GROUP BY estabelecimento_id`,
            [ids],
        );

        // ── montagem ────────────────────────────────────────────────────
        interface Acc { pedidos: number; pedidos14: number; pedidos7: number }
        const pedidosPorEstab = new Map<number, Acc>();
        for (const r of pedidoRows) {
            const estab = Number(r.estab);
            const dia = String(r.dia);
            const n = Number(r.n);
            const acc = pedidosPorEstab.get(estab) ?? { pedidos: 0, pedidos14: 0, pedidos7: 0 };
            acc.pedidos += n;
            if (dia >= de14) acc.pedidos14 += n;
            if (dia >= de7) acc.pedidos7 += n;
            pedidosPorEstab.set(estab, acc);
        }

        interface PromoAcc { campanhas: Set<string>; agora: boolean; subsidiadaAgora: boolean; jaSubsidiada: boolean }
        const promoPorEstab = new Map<number, PromoAcc>();
        for (const r of promoRows) {
            const estab = Number(r.estab);
            const campanha = String(r.campanha ?? '');
            const vigente = Number(r.vigente) === 1;
            const subsidiada = isCampanhaSubsidiada(campanha);
            const acc = promoPorEstab.get(estab)
                ?? { campanhas: new Set<string>(), agora: false, subsidiadaAgora: false, jaSubsidiada: false };
            acc.campanhas.add(campanha);
            if (vigente) acc.agora = true;
            if (vigente && subsidiada) acc.subsidiadaAgora = true;
            if (subsidiada) acc.jaSubsidiada = true;
            promoPorEstab.set(estab, acc);
        }

        const cupomPorEstab = new Map<number, { total: number; ativos: number; destaque: number }>();
        for (const r of cupomRows) {
            cupomPorEstab.set(Number(r.estab), {
                total: Number(r.total), ativos: Number(r.ativos), destaque: Number(r.destaque),
            });
        }

        const totalPedidos = [...pedidosPorEstab.values()].reduce((s, a) => s + a.pedidos, 0);
        const semanasNaJanela = dias / 7;

        const lista: ParceiroCidade[] = parceiros.map(p => {
            const id = Number(p.estab);
            const delivery = Number(p.delivery);
            const ped = pedidosPorEstab.get(id) ?? { pedidos: 0, pedidos14: 0, pedidos7: 0 };
            const promo = promoPorEstab.get(id);
            const cupom = cupomPorEstab.get(id);

            // Ritmo: a última semana contra a média semanal da janela. Só faz
            // sentido com janela maior que uma semana e com volume que
            // sustente a conta — abaixo de 4 pedidos vira ruído de 1 pedido.
            const mediaSemanal = ped.pedidos / semanasNaJanela;
            const ritmo = dias > 7 && ped.pedidos >= 4
                ? Math.round((ped.pedidos7 / mediaSemanal) * 100) / 100
                : null;

            return {
                id,
                nome: String(p.nome ?? ''),
                delivery,
                pedidos: ped.pedidos,
                pedidos14: ped.pedidos14,
                pedidos7: ped.pedidos7,
                share: totalPedidos > 0 ? Math.round((ped.pedidos / totalPedidos) * 1000) / 10 : 0,
                acumulado: 0, // preenchido abaixo, na ordem da curva
                classe: 'fora' as ClasseRelevancia,
                ritmo,
                promoAgora: promo?.agora ?? false,
                promoSubsidiadaAgora: promo?.subsidiadaAgora ?? false,
                jaTevePromo: !!promo,
                jaTevePromoSubsidiada: promo?.jaSubsidiada ?? false,
                campanhas: promo ? [...promo.campanhas].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [],
                cupomAgora: (cupom?.ativos ?? 0) > 0,
                cupomDestaqueAgora: (cupom?.destaque ?? 0) > 0,
                jaTeveCupom: (cupom?.total ?? 0) > 0,
            };
        });

        // Curva ABC sobre a janela. Só parceiro ATIVO entra na curva: suspenso
        // e pendente não são fila de trabalho comercial, são outro problema.
        const naCurva = lista.filter(p => p.delivery === 1).sort((a, b) => b.pedidos - a.pedidos);
        let acumulado = 0;
        for (const p of naCurva) {
            if (p.pedidos === 0) {
                p.classe = 'parada';
                p.acumulado = 100;
                continue;
            }
            const antes = acumulado;
            acumulado += p.pedidos;
            p.acumulado = totalPedidos > 0 ? Math.round((acumulado / totalPedidos) * 1000) / 10 : 0;
            // O corte olha onde a loja COMEÇA na curva: assim a loja que
            // sozinha atravessa os 50% ainda conta como âncora, em vez de cair
            // pra faixa seguinte por causa do próprio tamanho.
            const inicio = totalPedidos > 0 ? (antes / totalPedidos) * 100 : 0;
            p.classe = inicio < 50 ? 'ancora' : inicio < 80 ? 'peso' : 'cauda';
        }

        const ativos = lista.filter(p => p.delivery === 1);
        const carteira = {
            total: lista.length,
            ativos: ativos.length,
            suspenso: lista.filter(p => p.delivery === 4).length,
            pendente: lista.filter(p => p.delivery === 0).length,
        };

        const atividade = {
            pedidos: totalPedidos,
            pedidos14: lista.reduce((s, p) => s + p.pedidos14, 0),
            pedidos7: lista.reduce((s, p) => s + p.pedidos7, 0),
            comPedido: ativos.filter(p => p.pedidos > 0).length,
            comPedido14: ativos.filter(p => p.pedidos14 > 0).length,
            comPedido7: ativos.filter(p => p.pedidos7 > 0).length,
            semPedido: ativos.filter(p => p.pedidos === 0).length,
        };

        const marketing = {
            promoAgora: ativos.filter(p => p.promoAgora).length,
            promoSubsidiadaAgora: ativos.filter(p => p.promoSubsidiadaAgora).length,
            nuncaTevePromo: ativos.filter(p => !p.jaTevePromo).length,
            cupomAgora: ativos.filter(p => p.cupomAgora).length,
            nuncaTeveCupom: ativos.filter(p => !p.jaTeveCupom).length,
            semAcaoNenhuma: ativos.filter(p => !p.promoAgora && !p.cupomAgora).length,
        };

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                cidade, dias, de, ate,
                carteira, atividade, marketing,
                parceiros: lista,
                elapsedMs: Date.now() - started,
            }),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const code = (err as { code?: string })?.code;
        return {
            statusCode: 502,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, code: code ?? null, error: message, elapsedMs: Date.now() - started }),
        };
    } finally {
        if (connection) { try { await connection.end(); } catch { /* ignore */ } }
    }
};
