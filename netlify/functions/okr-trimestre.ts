import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Os KRs de Sucesso do Cliente do trimestre, calculados no banco.
 *
 * BIGOU APP — marketplace, só nas cidades da OKR
 *   KR 1 Novos parceiros  80% dos ativados chegam a 5 pedidos nos primeiros
 *                         14 dias, SEM contar quem relançou com troca de dono
 *   KR 2 Lojas engajadas  38% dos parceiros ativos com 14+ pedidos nos
 *                         últimos 28 dias
 *
 * CARDÁPIO DIGITAL — base inteira, SEM recorte de cidade
 *   KR 3 Faturamento      50% das lojas com contrato vivo faturando mais de
 *                         R$ 1.000 no mês
 *
 * Os dois blocos medem bases DISJUNTAS: as cidades da OKR são marketplace
 * (`cardapio_digital = 0/NULL`) e o KR 3 é a base de Cardápio Digital inteira,
 * do país todo — o enunciado dele não fala em cidade, e recortar por cidade
 * mediria outra coisa. Ver `jornada.ts` para a disjunção.
 *
 * A resposta traz as LISTAS nominais, não as porcentagens: a aba existe para
 * trabalhar a OKR, não só para exibir o placar, e a soma precisa descontar as
 * lojas que o CS tirou da conta (Supabase `okr_excluido`). Quem soma é
 * `src/utils/okrFiguras.ts` — somar aqui também criaria uma segunda verdade,
 * calculada sobre a base cheia e pronta para divergir da tela.
 *
 * ── Quais cidades ────────────────────────────────────────────────────────
 * A lista NÃO mora aqui: vem em `?cidades=` com os prefixos normalizados de
 * `src/config/cidadesOkr.ts`, que é a mesma fonte do chip "Cidades OKR" do
 * painel. Duplicar a lista no backend garantiria que um dia as duas
 * divergissem — e o número da OKR passaria a medir um recorte diferente do
 * que a tela diz estar medindo. O casamento é por PREFIXO sobre as partes do
 * nome, porque "Bom Jesus" precisa pegar "Bom Jesus do Itabapoana - RJ / Bom
 * Jesus do Norte - ES" (ver o comentário longo em cidadesOkr.ts).
 *
 * ── Decisões de régua ────────────────────────────────────────────────────
 *  - pedido ACEITO = status IN (1, 2). Status 3 é cancelado e -1 é Pix não
 *    pago (conferido: todo status -1 é pix-* com status_pagamento 3); os dois
 *    ficam de fora, aqui e no faturamento.
 *  - FATURAMENTO da loja = SUM(pedido.total) dos aceitos, mesma régua de
 *    `crm-gmv.ts`. É também, literalmente, o `gmv_liquido` da Comissao_View —
 *    cuidado com o nome: o que o app chama de `gmvBruto` é o `gmv_liquido` de
 *    lá, e o `gmv_bruto` da view é outra conta (subtotal + taxa de entrega).
 *  - LANÇAMENTO = MIN(venda.data_lancamento) entre os contratos VIVOS, caindo
 *    para o MIN de todo o histórico quando não sobrou nenhum — mesma regra da
 *    Jornada, que existe para o parceiro que cancelou e voltou não ficar
 *    ancorado no contrato antigo. (A mesma expressão vive em `jornada.ts`;
 *    mexer numa e esquecer a outra faz as duas telas divergirem em silêncio.)
 *  - TROCA DE DONO = o contrato anterior e o atual apontam para documentos
 *    diferentes em `dados_faturamento`. A comparação é só de dígitos e cruza
 *    `cpf_proprietario` nos dois sentidos, senão quem virou MEI (mesmo dono,
 *    CPF que vira CNPJ) seria contado como loja nova de outro dono e sairia
 *    da coorte sem motivo.
 *  - CONTRATO VIVO (denominador do KR 3) = `venda.status NOT IN (2, 3, 5)`,
 *    a régua canônica do app. NÃO usar `Parceiros_View` com STATUS='ativo':
 *    ela devolve 126 lojas de CD, das quais 42 estão com `delivery` 2 ou 5
 *    (cancelada / desistência).
 *  - "janela fechada" do KR 1 é medida contra `dadosAte` (MAX(pedido.data)),
 *    e não contra hoje: a réplica que estas functions enxergam fica ~1 dia
 *    atrás do banco real, e contar como fechada uma janela cujo último dia
 *    ainda não chegou aqui reprovaria o parceiro por atraso de dado.
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto do passado o `pedido` precisa trazer. Tem de cobrir as DUAS janelas de
 * 28 dias do KR 2 (a atual e a anterior, que é o "antes" do antes→depois) com
 * folga para o "parado há N dias".
 */
const DIAS_HISTORICO_MINIMO = 70;

const PADRAO = {
    // KR 1 — engajamento de novos parceiros
    janelaNovos: 14,
    pedidosNovos: 5,
    metaKr1: 80,
    // KR 2 — lojas engajadas
    janelaEngajada: 28,
    pedidosEngajada: 14,
    metaKr2: 38,
    // KR 3 — faturamento no Cardápio Digital
    faturamentoMinimo: 1000,
    metaKr3: 50,
};

/** "Hoje" em Brasília — a function roda em UTC e viraria o dia às 21h. */
function hojeBrasilia(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
    return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function trimestreDe(iso: string): string {
    return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

function limitesTrimestre(id: string): { inicio: string; fim: string; meses: string[] } | null {
    const m = /^(\d{4})-Q([1-4])$/.exec(id);
    if (!m) return null;
    const ano = Number(m[1]);
    const mesInicio = (Number(m[2]) - 1) * 3 + 1;
    const mesFim = mesInicio + 2;
    // Dia 0 do mês seguinte = último dia do mês (Date.UTC conta mês de 0).
    const ultimoDia = new Date(Date.UTC(ano, mesFim, 0)).getUTCDate();
    return {
        inicio: `${ano}-${String(mesInicio).padStart(2, '0')}-01`,
        fim: `${ano}-${String(mesFim).padStart(2, '0')}-${ultimoDia}`,
        meses: [0, 1, 2].map(i => `${ano}-${String(mesInicio + i).padStart(2, '0')}`),
    };
}

function normalizar(txt: string): string {
    return txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Tira o sufixo de UF: "carandai - mg" → "carandai". */
function semUf(parte: string): string {
    return parte.replace(/\s*-\s*[a-z]{2}$/, '').trim();
}

/** Espelha `partesComparaveis` de src/config/cidadesOkr.ts — ver cabeçalho. */
function partesComparaveis(cidade: string): string[] {
    const inteiro = normalizar(cidade);
    if (!inteiro) return [];
    const partes = new Set<string>([inteiro, semUf(inteiro)]);
    for (const parte of inteiro.split(/\s*\/\s*|\s+e\s+/)) {
        const limpa = parte.trim();
        if (!limpa) continue;
        partes.add(limpa);
        partes.add(semUf(limpa));
    }
    partes.delete('');
    return [...partes];
}

function casaPrefixo(cidade: string, prefixos: string[]): boolean {
    return partesComparaveis(cidade).some(parte =>
        prefixos.some(prefixo => parte === prefixo || parte.startsWith(`${prefixo} `)),
    );
}

/** Documento só com dígitos — "08.603.875/0001-12" e "08603875000112" são o mesmo. */
function digitos(doc: unknown): string {
    return String(doc ?? '').replace(/\D/g, '');
}

interface ContratoRow {
    lancamento: string;
    status: number;
    cpfCnpj: string;
    cpfProprietario: string;
}

/**
 * O contrato anterior e o atual são do mesmo dono?
 *
 * Documento igual resolve o caso comum. O cruzamento com `cpf_proprietario`
 * cobre o parceiro que virou MEI no meio do caminho: o contrato antigo está no
 * CPF dele e o novo no CNPJ da empresa, mas o CPF continua gravado como
 * proprietário. Sem isso, formalizar a empresa tiraria a loja da coorte do KR
 * como se tivesse mudado de dono.
 */
function mesmoDono(anterior: ContratoRow, atual: ContratoRow): boolean {
    const docAnt = digitos(anterior.cpfCnpj);
    const docAtual = digitos(atual.cpfCnpj);
    if (!docAnt || !docAtual) return true; // sem documento não dá para afirmar troca
    if (docAnt === docAtual) return true;
    const propAnt = digitos(anterior.cpfProprietario);
    const propAtual = digitos(atual.cpfProprietario);
    return (propAtual !== '' && docAnt === propAtual) || (propAnt !== '' && docAtual === propAnt);
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

    const prefixos = (q.cidades ?? '')
        .split(',')
        .map(p => normalizar(p))
        .filter(Boolean);
    if (prefixos.length === 0) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: 'Informe ?cidades= com os prefixos das cidades da OKR (ver src/config/cidadesOkr.ts).' }),
        };
    }

    const hoje = hojeBrasilia();
    const trimestreId = (q.trimestre ?? '').trim() || trimestreDe(hoje);
    const limites = limitesTrimestre(trimestreId);
    if (!limites) {
        return {
            statusCode: 400,
            headers: erroHeaders,
            body: JSON.stringify({ ok: false, error: `Trimestre inválido: "${trimestreId}". Use YYYY-Qn (ex.: 2026-Q4).` }),
        };
    }

    const { inicio, fim, meses } = limites;
    /** Até onde o trimestre já andou — trimestre passado fecha no próprio fim. */
    const corte = hoje < fim ? hoje : fim;
    /** Limite superior exclusivo, porque `pedido.data` é datetime. */
    const corteExclusivo = somarDias(corte, 1);
    const mesCorrente = corte.slice(0, 7);
    /**
     * O KR 3 é mensal, e no meio do mês o número sempre parece baixo — dia 19
     * de outubro ainda não é outubro. Puxar o mês anterior junto dá a régua de
     * comparação ("em setembro fecharam 33%"), que é como se lê um KR mensal
     * antes de o mês acabar.
     */
    const mesAnterior = `${inicio.slice(0, 4)}-${inicio.slice(5, 7)}`.replace(/^(\d{4})-(\d{2})$/, (_, a, m) => {
        const mes = Number(m) - 1;
        return mes === 0 ? `${Number(a) - 1}-12` : `${a}-${String(mes).padStart(2, '0')}`;
    });
    const inicioFaturamento = `${mesAnterior}-01`;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [ultimo] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(MAX(data), '%Y-%m-%d') AS ate FROM pedido`,
        );
        const dadosAte = String(ultimo[0]?.ate ?? corte);

        // ══ BIGOU APP — as cidades da OKR, marketplace ═══════════════════

        const [localidades] = await connection.query<RowDataPacket[]>(`SELECT id, nome FROM localidade`);
        const daOkr = localidades.filter(l => casaPrefixo(String(l.nome ?? ''), prefixos));
        if (daOkr.length === 0) {
            return {
                statusCode: 404,
                headers: erroHeaders,
                body: JSON.stringify({ ok: false, error: `Nenhuma localidade casou com: ${prefixos.join(', ')}` }),
            };
        }
        const localidadeIds = daOkr.map(l => Number(l.id));

        // Uma linha POR CONTRATO (não agregada): o KR 1 precisa comparar o
        // contrato anterior com o atual para saber se o dono mudou.
        const [contratos] = await connection.query<RowDataPacket[]>(
            `SELECT ve.estabelecimento_id AS estab,
                    DATE_FORMAT(v.data_lancamento, '%Y-%m-%d') AS lancamento,
                    v.status AS status,
                    df.cpf_cnpj AS cpf_cnpj,
                    df.cpf_proprietario AS cpf_proprietario
             FROM venda v
             JOIN venda_estabelecimento ve ON ve.venda_id = v.id
             JOIN estabelecimento e ON e.id = ve.estabelecimento_id
             LEFT JOIN dados_faturamento df ON df.id = v.dados_faturamento_id
             WHERE e.localidade_id IN (?)
               AND e.delivery IN (1, 2, 4, 5)
               AND (e.cardapio_digital = 0 OR e.cardapio_digital IS NULL)
               AND v.data_lancamento IS NOT NULL
             ORDER BY ve.estabelecimento_id, v.data_lancamento`,
            [localidadeIds],
        );

        const contratosPorEstab = new Map<number, ContratoRow[]>();
        for (const r of contratos) {
            const estab = Number(r.estab);
            const lista = contratosPorEstab.get(estab) ?? [];
            lista.push({
                lancamento: String(r.lancamento),
                status: Number(r.status ?? 0),
                cpfCnpj: String(r.cpf_cnpj ?? ''),
                cpfProprietario: String(r.cpf_proprietario ?? ''),
            });
            contratosPorEstab.set(estab, lista);
        }

        const idsCidades = [...contratosPorEstab.keys()];
        const [estabs] = idsCidades.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
                 FROM estabelecimento e
                 LEFT JOIN localidade l ON l.id = e.localidade_id
                 WHERE e.id IN (?)`,
                [idsCidades],
            )
            : [[] as RowDataPacket[]];
        const infoPorId = new Map(estabs.map(e => [Number(e.id), e]));

        /**
         * Lançamento, relançamento e troca de dono, por estabelecimento.
         *
         * O lançamento é o MIN entre os contratos VIVOS, caindo para o MIN de
         * todo o histórico quando não sobrou nenhum — mesma regra da Jornada.
         */
        const perfilPorEstab = new Map<number, {
            lancamento: string;
            relancamento: boolean;
            trocaDono: boolean;
            docAnterior: string;
            docAtual: string;
        }>();
        for (const [estab, lista] of contratosPorEstab) {
            const vivos = lista.filter(c => ![2, 3, 5].includes(c.status));
            const lancamento = (vivos.length > 0 ? vivos : lista)[0].lancamento;
            const anteriores = lista.filter(c => c.lancamento < lancamento);
            const atual = lista.find(c => c.lancamento === lancamento) ?? lista[0];
            const anterior = anteriores.length > 0 ? anteriores[anteriores.length - 1] : null;
            perfilPorEstab.set(estab, {
                lancamento,
                relancamento: anterior !== null,
                trocaDono: anterior !== null && !mesmoDono(anterior, atual),
                docAnterior: anterior?.cpfCnpj ?? '',
                docAtual: atual.cpfCnpj,
            });
        }

        // Pedidos aceitos. A janela precisa cobrir o trimestre inteiro (KR 1) e
        // os últimos 28 dias (KR 2); o histórico mínimo é para o "parado há N".
        const desdePedidos = [inicio, somarDias(corte, -DIAS_HISTORICO_MINIMO)].sort()[0];
        const [pedidosCidades] = idsCidades.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id AS estab,
                        DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                        COUNT(*) AS n
                 FROM pedido FORCE INDEX (data)
                 WHERE status IN (1, 2) AND data >= ? AND data < ? AND estabelecimento_id IN (?)
                 GROUP BY estabelecimento_id, dia`,
                [desdePedidos, corteExclusivo, idsCidades],
            )
            : [[] as RowDataPacket[]];

        const diasPorEstab = new Map<number, { dia: string; n: number }[]>();
        for (const p of pedidosCidades) {
            const estab = Number(p.estab);
            const lista = diasPorEstab.get(estab) ?? [];
            lista.push({ dia: String(p.dia), n: Number(p.n ?? 0) });
            diasPorEstab.set(estab, lista);
        }

        // ── KR 1 — novos parceiros ───────────────────────────────────────
        const coorte = [...perfilPorEstab.entries()]
            .filter(([, p]) => p.lancamento >= inicio && p.lancamento <= corte)
            .map(([estab, p]) => {
                const info = infoPorId.get(estab);
                const fimJanela = somarDias(p.lancamento, PADRAO.janelaNovos); // exclusivo
                const dias = diasPorEstab.get(estab) ?? [];
                const pedidos = dias
                    .filter(d => d.dia >= p.lancamento && d.dia < fimJanela)
                    .reduce((a, d) => a + d.n, 0);
                const concluida = fimJanela <= dadosAte;
                return {
                    id: estab,
                    nome: String(info?.nome ?? `#${estab}`),
                    cidade: String(info?.cidade ?? ''),
                    lancamento: p.lancamento,
                    pedidos,
                    // Bateu é bateu: não espera a janela fechar para contar.
                    atingiu: pedidos >= PADRAO.pedidosNovos,
                    concluida,
                    diasRestantes: concluida ? 0 : Math.max(diasEntre(dadosAte, fimJanela), 0),
                    relancamento: p.relancamento,
                    trocaDono: p.trocaDono,
                    docAnterior: p.docAnterior,
                    docAtual: p.docAtual,
                };
            })
            .sort((a, b) => b.lancamento.localeCompare(a.lancamento));

        // ── KR 2 — lojas engajadas ───────────────────────────────────────
        const desdeEngajada = somarDias(corte, -PADRAO.janelaEngajada + 1);
        // A janela imediatamente anterior, do mesmo tamanho. É o "antes" do
        // antes→depois: loja que cruzou de 9 para 18 pedidos é resultado; lista
        // de quem já estava engajado é participação, e não conta.
        const desdeAnterior = somarDias(desdeEngajada, -PADRAO.janelaEngajada);
        const ateAnterior = somarDias(desdeEngajada, -1);
        const engajamento = [...perfilPorEstab.entries()]
            .filter(([estab, p]) => Number(infoPorId.get(estab)?.delivery ?? 0) === 1 && p.lancamento <= corte)
            .map(([estab, p]) => {
                const info = infoPorId.get(estab);
                const dias = diasPorEstab.get(estab) ?? [];
                const pedidos28d = dias
                    .filter(d => d.dia >= desdeEngajada)
                    .reduce((a, d) => a + d.n, 0);
                const pedidos28dAnterior = dias
                    .filter(d => d.dia >= desdeAnterior && d.dia <= ateAnterior)
                    .reduce((a, d) => a + d.n, 0);
                const comPedido = dias.filter(d => d.n > 0).map(d => d.dia).sort();
                const ultimoPedido = comPedido.length > 0 ? comPedido[comPedido.length - 1] : null;
                return {
                    id: estab,
                    nome: String(info?.nome ?? `#${estab}`),
                    cidade: String(info?.cidade ?? ''),
                    lancamento: p.lancamento,
                    pedidos28d,
                    pedidos28dAnterior,
                    engajada: pedidos28d >= PADRAO.pedidosEngajada,
                    /** Cruzou a régua nesta janela — é o "virou o jogo". */
                    cruzou: pedidos28d >= PADRAO.pedidosEngajada && pedidos28dAnterior < PADRAO.pedidosEngajada,
                    /** Caiu da régua — o vazamento que ninguém via. */
                    caiu: pedidos28d < PADRAO.pedidosEngajada && pedidos28dAnterior >= PADRAO.pedidosEngajada,
                    ultimoPedido,
                    diasSemPedido: ultimoPedido ? diasEntre(ultimoPedido, corte) : null,
                };
            })
            .sort((a, b) => b.pedidos28d - a.pedidos28d);

        // Quem não vendeu dentro da janela de histórico pode estar parado há
        // mais tempo que ela — ou nunca ter vendido. São coisas MUITO
        // diferentes para o CS, e sem esta consulta as duas viram "nunca
        // vendeu". Só para esses, que são poucos: varrer o histórico inteiro
        // da base toda custaria os 14s que o comentário do `jornada.ts` cita.
        const semHistorico = engajamento.filter(l => l.ultimoPedido === null).map(l => l.id);
        if (semHistorico.length > 0) {
            const [antigos] = await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id AS estab, DATE_FORMAT(MAX(data), '%Y-%m-%d') AS ultimo
                 FROM pedido
                 WHERE status IN (1, 2) AND data < ? AND estabelecimento_id IN (?)
                 GROUP BY estabelecimento_id`,
                [corteExclusivo, semHistorico],
            );
            const ultimoPorEstab = new Map(antigos.map(r => [Number(r.estab), String(r.ultimo)]));
            for (const l of engajamento) {
                const u = ultimoPorEstab.get(l.id);
                if (!u) continue;
                l.ultimoPedido = u;
                l.diasSemPedido = diasEntre(u, corte);
            }
        }

        // ══ CARDÁPIO DIGITAL — base inteira ══════════════════════════════
        // Denominador do KR 3: contrato vivo, a régua canônica do app. A
        // Parceiros_View com STATUS='ativo' NÃO serve — ver o cabeçalho.
        const [cdVivas] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT ve.estabelecimento_id AS estab
             FROM venda v
             JOIN venda_estabelecimento ve ON ve.venda_id = v.id
             JOIN estabelecimento e ON e.id = ve.estabelecimento_id
             WHERE e.cardapio_digital = 1 AND v.status NOT IN (2, 3, 5)`,
        );
        const idsCd = cdVivas.map(r => Number(r.estab));

        const [faturamentoCd] = idsCd.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT estabelecimento_id AS estab,
                        DATE_FORMAT(data, '%Y-%m') AS mes,
                        SUM(total) AS gmv
                 FROM pedido FORCE INDEX (data)
                 WHERE status IN (1, 2) AND cardapio_digital = 1
                   AND data >= ? AND data < ? AND estabelecimento_id IN (?)
                 GROUP BY estabelecimento_id, mes`,
                [inicioFaturamento, corteExclusivo, idsCd],
            )
            : [[] as RowDataPacket[]];

        const [estabsCd] = idsCd.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.nome, e.delivery, IFNULL(l.nome, '') AS cidade
                 FROM estabelecimento e
                 LEFT JOIN localidade l ON l.id = e.localidade_id
                 WHERE e.id IN (?)`,
                [idsCd],
            )
            : [[] as RowDataPacket[]];
        const infoCd = new Map(estabsCd.map(e => [Number(e.id), e]));

        const porMesPorEstab = new Map<number, Record<string, number>>();
        for (const r of faturamentoCd) {
            const estab = Number(r.estab);
            const atual = porMesPorEstab.get(estab) ?? {};
            atual[String(r.mes)] = Number(r.gmv ?? 0);
            porMesPorEstab.set(estab, atual);
        }

        const lojasCd = idsCd
            .map(id => {
                const info = infoCd.get(id);
                const porMes = porMesPorEstab.get(id) ?? {};
                const faturamentoMes = porMes[mesCorrente] ?? 0;
                return {
                    id,
                    nome: String(info?.nome ?? `#${id}`),
                    cidade: String(info?.cidade ?? ''),
                    /** delivery = 1 hoje. Contrato vivo com loja desligada existe. */
                    ligada: Number(info?.delivery ?? 0) === 1,
                    porMes,
                    faturamentoMes,
                    acima: faturamentoMes > PADRAO.faturamentoMinimo,
                };
            })
            .sort((a, b) => b.faturamentoMes - a.faturamentoMes);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                trimestre: { id: trimestreId, inicio, fim, corte, hoje, dadosAte, meses, mesCorrente, mesAnterior },
                // Dedup por nome: a mesma cidade pode ter mais de uma localidade
                // no cadastro (uma delas inativa, sem nenhum estabelecimento).
                cidades: [...new Set(daOkr.map(l => String(l.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
                parametros: { ...PADRAO, desdeEngajada, desdeAnterior, ateAnterior },
                kr1: { meta: PADRAO.metaKr1, parceiros: coorte },
                kr2: { meta: PADRAO.metaKr2, parceiros: engajamento },
                kr3: { meta: PADRAO.metaKr3, lojas: lojasCd },
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
