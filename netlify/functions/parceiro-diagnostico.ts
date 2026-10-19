import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { idDesde } from './_shared/idPorData';

/**
 * "Por que este parceiro caiu?" — uma linha do tempo só, para UM parceiro.
 *
 * O CS já tinha a resposta espalhada em meia dúzia de telas (cardápio,
 * funcionamento, promoções, pedidos) e em outras que não existiam em lugar
 * nenhum (método de pagamento, bairro de entrega, taxa). Pior: quase todas
 * essas telas mostram FOTO DO ESTADO ATUAL, e a pergunta é sobre MUDANÇA —
 * "desativou?" não se responde com "está desativado".
 *
 * ── A tabela que destrava isto: `log` ────────────────────────────────────
 * 2,4 milhões de linhas de auditoria que nenhuma function do projeto lia.
 * Uma linha por alteração, com `registro` (o que mudou), `alteracao` (o diff
 * em texto: "dinheiro: true => false"), `data`, e a autoria separada entre
 * `admin_id` (Bigou) e `admin_estabelecimento_id` (o próprio parceiro) — a
 * mesma divisão de `log_ativacao`. Saber QUEM mexeu muda a conversa: taxa de
 * entrega que subiu pela mão do parceiro é negociação; pela nossa, é desculpa.
 *
 * ⚠️ O `log` começa em 2026. Mudança anterior a isso é invisível aqui, e
 * `forma_pagamento_estabelecimento` / `bairro_estabelecimento` não têm
 * nenhuma coluna de data — para esses dois o log é a ÚNICA fonte de "quando".
 *
 * ── O que NÃO vem do log ─────────────────────────────────────────────────
 *  - recesso: `recesso_estabelecimento` já é datado, e guarda quem cadastrou.
 *    Recesso renovado dia após dia é loja que sumiu do app sem cancelar nada.
 *  - cardápio: `item_catalogo.data_modificacao_ativo` / `_arquivado` dão a
 *    data exata por item, melhor que o log porque permitem cruzar com venda.
 *  - cancelamento: `pedido.status = 3`, a única série temporal que o projeto
 *    já tinha.
 *
 * ── O item que vendia e sumiu ────────────────────────────────────────────
 * É a pergunta mais cara da lista e a que ninguém responde no olho: o item
 * desativado é cruzado com o que ele VENDEU nos 60 dias anteriores à própria
 * desativação. Desativar um item que não vendia é faxina; desativar o
 * carro-chefe é a causa da queda.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quanto do passado o item desativado olha para trás para medir o que vendia. */
const DIAS_VENDA_ANTES = 60;

/**
 * Os tipos de alteração do `log` que mexem em venda. O resto do log é ruído
 * para esta pergunta (avaliação, catálogo interno, variação de item).
 */
const REGISTROS: Record<string, { tipo: string; titulo: string }> = {
    FORMA_PAGAMENTO: { tipo: 'pagamento', titulo: 'Métodos de pagamento' },
    FORMA_PAGAMENTO_ONLINE: { tipo: 'pagamento', titulo: 'Pagamento online' },
    HORARIO_FUNCIONAMENTO: { tipo: 'horario', titulo: 'Horário de funcionamento' },
    TAXA_ENTREGA: { tipo: 'entrega', titulo: 'Taxa de entrega por bairro' },
    AREA_ENTREGA: { tipo: 'entrega', titulo: 'Área de entrega' },
    DELIVERY: { tipo: 'entrega', titulo: 'Configuração de delivery' },
};

function hojeBrasilia(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Conta quantos campos o diff mexeu e resume os primeiros.
 *
 * O `alteracao` vem como "campo: antes => depois; campo2: a => b;". Mudança de
 * taxa costuma trazer 80 bairros de uma vez — listar tudo vira parede. O que
 * importa na linha do tempo é "mexeu em 80 bairros", com três de exemplo.
 */
function resumirDiff(alteracao: string, limite = 3): { resumo: string; campos: number } {
    const partes = alteracao
        .split(';')
        .map(p => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    if (partes.length === 0) return { resumo: alteracao.slice(0, 120), campos: 0 };
    const amostra = partes.slice(0, limite).join(' · ');
    return {
        resumo: partes.length > limite ? `${amostra} · +${partes.length - limite}` : amostra,
        campos: partes.length,
    };
}

/** Desligou algo? "true => false", "1 => 0" e "=> 0" são o padrão do log. */
function pareceDesligamento(alteracao: string): boolean {
    return /(true|1)\s*=>\s*(false|0)\b/i.test(alteracao);
}

interface Evento {
    data: string;
    tipo: string;
    titulo: string;
    detalhe: string;
    /** 'loja' = o parceiro mexeu · 'admin' = alguém da Bigou · 'sistema'. */
    quem: 'loja' | 'admin' | 'sistema';
    /** Desligou algo — é o que costuma explicar queda. */
    desligou: boolean;
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
    const estabIdRaw = (q.estabId ?? '').trim();
    if (!/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: erroHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabId (numérico) é obrigatório' }) };
    }
    const estabId = Number(estabIdRaw);
    const dias = Math.min(Math.max(Number(q.dias) || 90, 14), 365);

    const hoje = hojeBrasilia();
    const de = somarDias(hoje, -dias);
    const ateExclusivo = somarDias(hoje, 1);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [estabs] = await connection.query<RowDataPacket[]>(
            `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
             FROM estabelecimento e
             LEFT JOIN localidade l ON l.id = e.localidade_id
             WHERE e.id = ?`,
            [estabId],
        );
        if (estabs.length === 0) {
            return { statusCode: 404, headers: erroHeaders, body: JSON.stringify({ ok: false, error: `Estabelecimento ${estabId} não encontrado` }) };
        }
        const estab = estabs[0];

        const eventos: Evento[] = [];

        /**
         * O menor `pedido.id` da janela — o que torna as consultas de pedido
         * viáveis para UMA loja.
         *
         * `pedido` só tem índice em `estabelecimento_id` e em `data`, nunca
         * juntos. `FORCE INDEX (data)` (padrão das outras functions, que
         * varrem a base toda) aqui é o pior dos mundos: percorre os pedidos do
         * SISTEMA inteiro na janela para filtrar uma loja — medido em 1.743ms.
         * Sem hint o otimizador vai pelo índice da loja e varre o histórico
         * dela inteiro: rápido numa loja nova (139ms), lento numa antiga
         * (1.035ms). Com o corte por id ele faz range na PRIMARY e para cedo:
         * 136ms nas duas. Mesma lógica documentada em `cardapio-analise.ts`.
         */
        const [minPedido] = await connection.query<RowDataPacket[]>(
            `SELECT MIN(id) AS id FROM pedido FORCE INDEX (data) WHERE data >= ?`,
            [somarDias(de, -DIAS_VENDA_ANTES)],
        );
        const idPedidoMin = Number(minPedido[0]?.id ?? 0);

        // ── 1. mudanças de configuração (log) ────────────────────────────
        // `log` não tem índice por estabelecimento NEM por data: só PRIMARY e
        // admin_id. Sem o corte por id isto varre 2,4M linhas para devolver
        // meia dúzia — medido em 4.301ms. Ver _shared/idPorData.ts.
        const idLogMin = await idDesde(connection, 'log', 'data', de);
        const [logs] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    registro, alteracao, observacao,
                    admin_id, admin_estabelecimento_id
             FROM log
             WHERE id >= ? AND estabelecimento_id = ? AND data >= ? AND data < ?
               AND registro IN (?)
             ORDER BY data DESC`,
            [idLogMin, estabId, de, ateExclusivo, Object.keys(REGISTROS)],
        );
        for (const l of logs) {
            const def = REGISTROS[String(l.registro)];
            if (!def) continue;
            const alteracao = String(l.alteracao ?? '');
            const { resumo, campos } = resumirDiff(alteracao);
            eventos.push({
                data: String(l.dia),
                tipo: def.tipo,
                titulo: campos > 1 ? `${def.titulo} — ${campos} campos` : def.titulo,
                detalhe: resumo,
                quem: l.admin_id ? 'admin' : l.admin_estabelecimento_id ? 'loja' : 'sistema',
                desligou: pareceDesligamento(alteracao),
            });
        }

        // ── 2. recessos ──────────────────────────────────────────────────
        // Recesso renovado dia após dia é loja que some do app meses antes de
        // zerar o pedido — por isso a contagem importa tanto quanto as datas.
        const [recessos] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data_inicio, '%Y-%m-%d') AS inicio,
                    DATE_FORMAT(data_fim, '%Y-%m-%d')    AS fim,
                    DATE_FORMAT(data, '%Y-%m-%d')        AS cadastradoEm,
                    DATEDIFF(data_fim, data_inicio) + 1  AS duracao,
                    descricao, admin_id, admin_estabelecimento_id
             FROM recesso_estabelecimento
             WHERE estabelecimento_id = ? AND ativo = 1 AND data_fim >= ?
             ORDER BY data_inicio DESC`,
            [estabId, de],
        );
        for (const r of recessos) {
            eventos.push({
                data: String(r.cadastradoEm ?? r.inicio),
                tipo: 'recesso',
                titulo: `Recesso de ${Number(r.duracao ?? 1)} dia${Number(r.duracao ?? 1) > 1 ? 's' : ''}`,
                detalhe: `${String(r.inicio).slice(8, 10)}/${String(r.inicio).slice(5, 7)} a ${String(r.fim).slice(8, 10)}/${String(r.fim).slice(5, 7)}${r.descricao ? ` · ${String(r.descricao).slice(0, 60)}` : ''}`,
                quem: r.admin_id ? 'admin' : r.admin_estabelecimento_id ? 'loja' : 'sistema',
                desligou: true,
            });
        }

        // ── 3. cardápio: itens desativados e o que eles vendiam ──────────
        const [catalogos] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM catalogo WHERE estabelecimento_id = ?`,
            [estabId],
        );
        const catalogoIds = catalogos.map(c => Number(c.id));

        const [itensFora] = catalogoIds.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT ic.id, ic.nome, ic.ativo, ic.arquivado,
                        DATE_FORMAT(GREATEST(
                            IFNULL(ic.data_modificacao_ativo, '1000-01-01'),
                            IFNULL(ic.data_modificacao_arquivado, '1000-01-01')
                        ), '%Y-%m-%d') AS saiuEm
                 FROM item_catalogo ic
                 WHERE ic.catalogo_id IN (?)
                   AND (ic.ativo = 0 OR ic.arquivado = 1)
                   AND GREATEST(
                           IFNULL(ic.data_modificacao_ativo, '1000-01-01'),
                           IFNULL(ic.data_modificacao_arquivado, '1000-01-01')
                       ) >= ?
                 ORDER BY saiuEm DESC
                 LIMIT 60`,
                [catalogoIds, de],
            )
            : [[] as RowDataPacket[]];

        // Quanto cada item desativado vendia ANTES de sair. Partir do `pedido`
        // (e não de item_pedido) é o que torna isso viável — ver o comentário
        // longo em cardapio-analise.ts.
        const idsFora = itensFora.map(i => Number(i.id));
        const vendasAntes = new Map<number, number>();
        if (idsFora.length > 0) {
            const desdeVenda = somarDias(de, -DIAS_VENDA_ANTES);
            const [vendas] = await connection.query<RowDataPacket[]>(
                `SELECT ip.item_catalogo_id AS item, SUM(ip.quantidade) AS qtd
                 FROM pedido p
                 JOIN item_pedido ip ON ip.pedido_id = p.id
                 WHERE p.id >= ? AND p.estabelecimento_id = ? AND p.status IN (1, 2)
                   AND p.data >= ? AND p.data < ?
                   AND ip.item_catalogo_id IN (?)
                 GROUP BY ip.item_catalogo_id`,
                [idPedidoMin, estabId, desdeVenda, ateExclusivo, idsFora],
            );
            for (const v of vendas) vendasAntes.set(Number(v.item), Number(v.qtd ?? 0));
        }
        for (const i of itensFora) {
            const vendia = vendasAntes.get(Number(i.id)) ?? 0;
            eventos.push({
                data: String(i.saiuEm),
                tipo: 'cardapio',
                titulo: Number(i.arquivado) === 1 ? 'Item arquivado' : 'Item desativado',
                detalhe: `${String(i.nome).slice(0, 60)}${vendia > 0 ? ` · vendia ${vendia} un. antes de sair` : ' · não vendia'}`,
                quem: 'sistema',
                desligou: true,
            });
        }

        // Item novo mandando pedir por fora é tiro no pé: o cliente sai do app
        // e o pedido não existe para ninguém. Aqui é foto do estado atual.
        const [itensFuga] = catalogoIds.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT ic.nome, ic.descricao
                 FROM item_catalogo ic
                 WHERE ic.catalogo_id IN (?) AND ic.ativo = 1 AND ic.arquivado = 0
                   AND (ic.nome LIKE '%whats%' OR ic.descricao LIKE '%whats%'
                        OR ic.nome LIKE '%zap%' OR ic.descricao LIKE '%zap%')
                 LIMIT 10`,
                [catalogoIds],
            )
            : [[] as RowDataPacket[]];

        // ── 4. cupons que saíram do ar ───────────────────────────────────
        // Mesmo problema do log: 1,4M linhas sem índice por estabelecimento
        // (a própria `crm-cupons.ts` documenta a varredura de ~4s). O corte
        // por id parte da CRIAÇÃO do cupom, não do `data_fim` — o fim pode ser
        // remarcado para frente e não acompanha o id. Um ano de folga cobre a
        // distância entre criar e vencer sem deixar cupom de fora.
        const idCupomMin = await idDesde(connection, 'cupom_desconto', 'data', somarDias(de, -365));
        const [cupons] = await connection.query<RowDataPacket[]>(
            `SELECT codigo, ativo,
                    DATE_FORMAT(data_inicio, '%Y-%m-%d') AS inicio,
                    DATE_FORMAT(data_fim, '%Y-%m-%d')    AS fim
             FROM cupom_desconto
             WHERE id >= ? AND estabelecimento_id = ? AND data_fim >= ? AND data_fim < ?
             ORDER BY data_fim DESC
             LIMIT 20`,
            [idCupomMin, estabId, de, ateExclusivo],
        );
        for (const c of cupons) {
            eventos.push({
                data: String(c.fim),
                tipo: 'cupom',
                titulo: Number(c.ativo) === 0 ? 'Cupom desativado' : 'Cupom venceu',
                detalhe: `${String(c.codigo ?? '(sem código)').slice(0, 30)} · valia de ${String(c.inicio).slice(8, 10)}/${String(c.inicio).slice(5, 7)}`,
                quem: 'sistema',
                desligou: true,
            });
        }

        // ── 5. a curva de pedidos, para situar os eventos no tempo ───────
        const [curva] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m') AS mes,
                    SUM(status IN (1, 2)) AS aceitos,
                    SUM(status = 3)       AS cancelados
             FROM pedido
             WHERE id >= ? AND estabelecimento_id = ? AND data >= ? AND data < ?
             GROUP BY mes
             ORDER BY mes`,
            [idPedidoMin, estabId, somarDias(de, -DIAS_VENDA_ANTES), ateExclusivo],
        );

        eventos.sort((a, b) => b.data.localeCompare(a.data));

        const porTipo = (tipo: string) => eventos.filter(e => e.tipo === tipo);
        const recessoPelaLoja = porTipo('recesso').filter(e => e.quem === 'loja').length;
        const itensQueVendiam = eventos.filter(e => e.tipo === 'cardapio' && /vendia \d+ un/.test(e.detalhe)).length;
        const meses = curva.map(m => ({
            mes: String(m.mes),
            aceitos: Number(m.aceitos ?? 0),
            cancelados: Number(m.cancelados ?? 0),
        }));
        const ultimoMes = meses[meses.length - 1];
        const taxaCancelamento = ultimoMes && ultimoMes.aceitos + ultimoMes.cancelados > 0
            ? Math.round((ultimoMes.cancelados / (ultimoMes.aceitos + ultimoMes.cancelados)) * 1000) / 10
            : null;

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estab: { id: Number(estab.id), nome: String(estab.nome), cidade: String(estab.cidade), delivery: Number(estab.delivery) },
                janela: { de, ate: hoje, dias },
                curva: meses,
                eventos,
                // Um número por pergunta da lista — a tela acende só o que tem
                // algo a dizer, para a seção não virar oito blocos vazios.
                resumo: {
                    pagamento: porTipo('pagamento').length,
                    pagamentoDesligou: porTipo('pagamento').filter(e => e.desligou).length,
                    horario: porTipo('horario').length,
                    entrega: porTipo('entrega').length,
                    recesso: porTipo('recesso').length,
                    recessoPelaLoja,
                    cupom: porTipo('cupom').length,
                    cardapio: porTipo('cardapio').length,
                    cardapioQueVendia: itensQueVendiam,
                    itensFuga: itensFuga.map(i => String(i.nome).slice(0, 60)),
                    taxaCancelamento,
                },
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
