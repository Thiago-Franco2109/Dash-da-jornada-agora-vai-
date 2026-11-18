import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * "Qual problema atacar neste parceiro?" — um raio-x só, comparado contra os
 * CONCORRENTES DELE, não contra uma meta abstrata.
 *
 * A ficha do parceiro hoje responde "ele está mal" (índice 0.00, 8 pedidos
 * esperados). Quem atende precisa de outra coisa: ONDE ele está mal em relação
 * a quem disputa o mesmo cliente na mesma cidade. Preço de açaí em Muriaé não
 * se julga por tabela nacional, se julga contra os outros 32 açaís de Muriaé.
 *
 * ── A régua: segmento × cidade ───────────────────────────────────────────
 * O par de comparação sai de `categoria_estabelecimento`, mas a tabela
 * `categoria` mistura DUAS coisas com o mesmo nome:
 *   · segmento de verdade  → "Açaí", "Burger", "Pizza"   (52 no total)
 *   · etiqueta de campanha → "Black Bigou", "Tudo por R$9,99", "Arraiá"
 * O que separa é `listada = 1 AND icone IS NOT NULL`: só o segmento aparece na
 * barra de categorias do app e por isso tem ícone. Sem esse filtro o "Açaí du
 * Filipi" seria comparado com todo mundo que entrou no Black Bigou — 41 lojas
 * de qualquer ramo. Medido em Muriaé: 108 lojas em "Super Ofertas" contra 33
 * em "Açaí". `ativo` NÃO entra no filtro: "Lanches" está com ativo=0 e ainda é
 * o maior segmento da base (2.612 lojas) — desativado para cadastro novo, não
 * deixou de ser segmento.
 *
 * Entre os segmentos do parceiro vale o marcado como `principal` no cadastro
 * (`categoria_estabelecimento.principal`): 1.405 das 1.406 lojas delivery têm
 * um. Escolher "o mais específico" sem olhar para ele erra — a Paulu's
 * Hamburgueria está em Burger, Churrasco e Lanches, e o menos povoado em
 * Muriaé é Churrasco (16 lojas contra 55 de Burger). Havendo mais de um
 * principal (acontece), desempata o mais específico. Abaixo de MIN_PARES o
 * segmento não tem mediana que signifique nada: devolve `poucosPares` para a
 * tela não fingir precisão.
 *
 * ── O que este raio-x NÃO tem ────────────────────────────────────────────
 * ⚠️ VISITA. O passo "quantas pessoas abriram a loja" não está aqui: ele vem
 * do GA, pela planilha de acessos (`useDailyAccessSync`), e a tela cruza os
 * dois lados por `estab_id`. Esta function devolve `pares[]` justamente para
 * esse cruzamento — sem ela a tela não teria contra quem comparar a visita.
 *
 * ⚠️ CARRINHO. O GA tem `add_to_cart` com `estabelecimento_id` e o número até
 * parece plausível, mas o vínculo loja↔carrinho está furado e depende de
 * conserto dos devs. Enquanto não consertarem, o funil tem DOIS passos
 * (visita → pedido) e nenhum lugar deste código lê carrinho.
 *
 * ⚠️ CONCORRÊNCIA FORA DA BIGOU. iFood não entra: não temos o dado. Toda
 * comparação aqui é intra-Bigou e a tela precisa dizer isso.
 *
 * ── Preço: duas réguas, porque uma só mente ──────────────────────────────
 *  1. Nível geral do cardápio (preço médio e preço de entrada). Vale para
 *     qualquer segmento, inclusive os que não têm tamanho no nome.
 *  2. Mesmo tamanho contra mesmo tamanho ("Açaí 550ml" × os 500ml da cidade).
 *     É a única que convence o lojista no telefone, mas só existe onde o nome
 *     do item declara volume/peso.
 * Combo fica FORA das duas: "3 Copos de Açaí 500ml por R$61,99" entraria como
 * copo caríssimo e inverteria a conclusão.
 *
 * ⚠️ O banco das functions tem ~1 dia de atraso: a janela vai até ONTEM
 * (`p.data < CURDATE()`), nunca até hoje.
 *
 * Query params:
 *   ?estabId=28664   → obrigatório
 *   ?dias=30         → janela de pedidos (padrão 30, de 7 a 90)
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' };

const DIAS_PADRAO = 30;

/** Abaixo disso a "mediana do segmento" é opinião de três lojas, não régua. */
const MIN_PARES = 4;

/**
 * Dois tamanhos contam como o mesmo copo dentro desta folga. 550ml × 500ml é
 * a comparação que o CS faz no telefone ("o seu de 550 custa mais que o de
 * 500 de todo mundo"); 300ml × 500ml não é.
 */
const TOL_VOLUME = 0.15;

/**
 * Quantas lojas precisam vender o mesmo tamanho para a comparação valer.
 * Com uma ou duas, "a mediana da cidade" é o preço de um vizinho qualquer.
 */
const MIN_COMPARADOS = 3;

/** Teto de itens lidos dos concorrentes na comparação por tamanho. */
const LIMITE_ITENS_PARES = 4000;

/**
 * Quantos concorrentes vão por extenso na resposta.
 *
 * Não é só enfeite: é desta lista que a tela tira os ids para buscar o acesso
 * do GA de cada concorrente. Cortar curto enviesaria a mediana de visita para
 * cima, porque a lista vem ordenada por pedido. O maior segmento de uma
 * cidade hoje tem 55 lojas (Burger em Muriaé), então 120 é folga de mais do
 * dobro.
 */
const LIMITE_PARES = 120;

interface EstabRow extends RowDataPacket {
    id: number;
    nome: string;
    localidade_id: number | null;
    cidade: string | null;
    delivery: number;
    cardapio_digital: number;
    tipo_entrega: number;
}

interface SegmentoRow extends RowDataPacket {
    id: number;
    nome: string;
    principal: number;
    lojasNaCidade: number;
}

interface ParRow extends RowDataPacket {
    id: number;
    nome: string;
}

interface PedidoRow extends RowDataPacket {
    id: number;
    pedidos: number;
    diasComPedido: number;
}

interface CardapioRow extends RowDataPacket {
    estabelecimento_id: number;
    itens: number;
    entrada: string | number;
    precoMedio: string | number;
}

interface EntregaRow extends RowDataPacket {
    estabelecimento_id: number;
    bairros: number;
    taxaMedia: string | number;
    taxaMinima: string | number;
}

interface ItemRow extends RowDataPacket {
    estabelecimento_id: number;
    nome: string;
    secao: string;
    preco: string | number;
}

/** Tamanho declarado no nome do item. `ml` e `g` são réguas separadas. */
interface Volume {
    valor: number;
    unidade: 'ml' | 'g';
}

export interface Achado {
    id: string;
    /** 1 = ataque isto primeiro. */
    severidade: 1 | 2 | 3;
    titulo: string;
    detalhe: string;
}

/**
 * Volume/peso declarado no nome do item.
 *
 * Normaliza litro para ml e quilo para g para que "1L" e "1000ml" caiam no
 * mesmo balde.
 *
 * ⚠️ Nome com DOIS tamanhos não tem tamanho: "X-Tudo + Coca 350ml + 200g de
 * Fritas" é um prato montado, e qualquer um dos dois números que se escolha
 * compara batata frita com refrigerante. Sem esta regra o item aparecia como
 * "200g por R$ 36,90, 95% acima da cidade" — a comparação mais errada que
 * esta tela produziu.
 */
function extrairVolume(nome: string): Volume | null {
    const re = /(\d+(?:[.,]\d+)?)\s*(ml|mls|lt|lts|litros?|l|kg|kgs|gramas?|gr|g)(?![a-zà-ú])/gi;
    const achados = [...nome.matchAll(re)];
    if (achados.length !== 1) return null;
    const ultimo = achados[0];

    const valor = Number(ultimo[1].replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return null;

    const un = ultimo[2].toLowerCase();
    if (/^(l|lt|lts|litro|litros)$/.test(un)) return { valor: valor * 1000, unidade: 'ml' };
    if (/^(kg|kgs)$/.test(un)) return { valor: valor * 1000, unidade: 'g' };
    if (/^(ml|mls)$/.test(un)) return { valor, unidade: 'ml' };
    return { valor, unidade: 'g' };
}

/**
 * Item que embala mais de uma unidade. Precisa sair da comparação de preço:
 * "3 Copos de Açaí 500ml — R$61,99" é o item mais caro de 500ml da cidade e
 * não é um copo de 500ml.
 */
function ehCombo(nome: string): boolean {
    // O "+" sozinho já denuncia prato montado ("X-Tudo + Coca + Fritas"),
    // mesmo quando a palavra combo não aparece em lugar nenhum.
    if (nome.includes('+')) return true;
    return /(\bcombo\b|\bkit\b|\bd[uú]pla\b|\btrio\b|\b\d+\s*(x|un|unid|unidades?|copos?|potes?|garrafas?|marmitas?|pe[çc]as?)\b)/i.test(nome);
}

/**
 * Palavras que NÃO identificam o produto. Entram aqui o recipiente ("copo",
 * "garrafa"), o rótulo de seção ("tamanho", "promoções", "ofertas") e a
 * ligação ("de", "com"). Sem essa lista, "Copo de Açaí 500ml" casaria com
 * "Copo de Milkshake 500ml" pelo copo.
 */
const PALAVRAS_VAZIAS = new Set([
    'com', 'sem', 'para', 'por', 'dia', 'casa', 'nossa', 'nosso', 'seu', 'sua', 'monte',
    'copo', 'copos', 'pote', 'potes', 'garrafa', 'garrafas', 'taca', 'tigela', 'caixa', 'embalagem',
    'tamanho', 'tamanhos', 'opcao', 'opcoes', 'escolha', 'medida',
    'promo', 'promos', 'promocao', 'promocoes', 'oferta', 'ofertas', 'super', 'mega', 'tudo',
    'black', 'friday', 'bigou', 'desconto', 'cupom', 'combo', 'kit', 'especial', 'especiais',
    'novo', 'nova', 'melhor', 'top', 'premium', 'gourmet', 'tradicional', 'simples',
    'grande', 'media', 'medio', 'pequeno', 'pequena', 'mini',
]);

/**
 * Palavras que identificam o PRODUTO, a partir do nome do item mais o da
 * seção do cardápio.
 *
 * A seção entra junto porque metade das lojas nomeia o item só pelo tamanho:
 * na "Fórmula do Açaí" o item se chama "500ml" e quem diz que é açaí é a
 * seção. Sem isso, esses cardápios ficariam de fora da comparação.
 */
function palavrasProduto(item: string, secao: string): Set<string> {
    const texto = `${secao} ${item}`
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const out = new Set<string>();
    for (const p of texto.split(/[^a-z]+/)) {
        if (p.length < 3) continue;
        if (PALAVRAS_VAZIAS.has(p)) continue;
        out.add(p);
    }
    return out;
}

/** Os dois nomes falam do mesmo produto? Basta uma palavra de produto em comum. */
function mesmoProduto(a: Set<string>, b: Set<string>): boolean {
    for (const p of a) if (b.has(p)) return true;
    return false;
}

function mediana(valores: number[]): number {
    if (valores.length === 0) return 0;
    const s = [...valores].sort((a, b) => a - b);
    const meio = s.length >> 1;
    return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Arredonda para centavo — evita 19.900000000000002 no JSON. */
const cent = (v: number): number => Math.round(v * 100) / 100;

/**
 * Dinheiro no texto do achado, já em português.
 *
 * O detalhe do achado é frase pronta e vai inteiro para a tela (e daí para o
 * WhatsApp do parceiro). `toFixed` escreveria "R$ 22.00", com o ponto do
 * inglês, no meio de uma frase em português.
 */
const brl = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',')}`;

/**
 * Posição do parceiro numa lista em que MAIOR é melhor (pedidos, visitas).
 * 1 = melhor da cidade. Empate recebe a mesma posição.
 */
function posicaoDesc(meu: number, todos: number[]): number {
    return todos.filter(v => v > meu).length + 1;
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
    const estabIdRaw = (q.estabId ?? '').trim();
    if (!/^\d+$/.test(estabIdRaw)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Parâmetro estabId (numérico) é obrigatório' }) };
    }
    const estabId = Number(estabIdRaw);
    const dias = Math.min(Math.max(Number(q.dias) || DIAS_PADRAO, 7), 90);

    let connection;
    const started = Date.now();
    // Tempo de cada consulta, devolvido junto da resposta. São oito idas ao
    // banco remoto e já houve uma que custou 19s sozinha (ver nota na consulta
    // de pedidos): sem isso, "a tela está lenta" vira adivinhação.
    const tempos: Record<string, number> = {};
    const marca = (nome: string, t0: number) => { tempos[nome] = Date.now() - t0; };
    try {
        connection = await getConnection();

        // ── 1. Quem é o parceiro ────────────────────────────────────────
        const t_estab = Date.now();
        const [estabRows] = await connection.query<EstabRow>(
            `SELECT e.id, e.nome, e.localidade_id, l.nome AS cidade,
                    e.delivery, e.cardapio_digital, e.tipo_entrega
               FROM estabelecimento e
               LEFT JOIN localidade l ON l.id = e.localidade_id
              WHERE e.id = ?`,
            [estabId],
        );
        marca('estab', t_estab);
        const estab = estabRows[0];
        if (!estab) {
            return { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: `Estabelecimento ${estabId} não encontrado` }) };
        }
        const localidadeId = Number(estab.localidade_id ?? 0);
        const cardapioDigital = Number(estab.cardapio_digital);

        if (!localidadeId) {
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({
                ok: true, estabId, semComparacao: 'sem_cidade',
                parceiro: { id: estabId, nome: estab.nome, cidade: null, localidadeId: null, cardapioDigital },
            }) };
        }

        // ── 2. Segmento de comparação ───────────────────────────────────
        // Conta as lojas de cada segmento do parceiro DENTRO da cidade dele.
        // CD e marketplace não se comparam: são vitrines diferentes, então o
        // `cardapio_digital` do parceiro entra nos dois lados do filtro.
        const t_segmento = Date.now();
        const [segRows] = await connection.query<SegmentoRow>(
            `SELECT c.id, c.nome, ce.principal, COUNT(DISTINCT e2.id) AS lojasNaCidade
               FROM categoria_estabelecimento ce
               JOIN categoria c
                 ON c.id = ce.categoria_id AND c.listada = 1 AND c.icone IS NOT NULL
               LEFT JOIN categoria_estabelecimento ce2
                 ON ce2.categoria_id = c.id AND ce2.ativo = 1
               LEFT JOIN estabelecimento e2
                 ON e2.id = ce2.estabelecimento_id
                AND e2.localidade_id = ? AND e2.delivery = 1 AND e2.cardapio_digital = ?
              WHERE ce.estabelecimento_id = ? AND ce.ativo = 1
              GROUP BY c.id
              ORDER BY lojasNaCidade ASC`,
            [localidadeId, cardapioDigital, estabId],
        );
        marca('segmento', t_segmento);

        const candidatos = segRows.map(r => ({
            id: Number(r.id),
            nome: String(r.nome),
            principal: Number(r.principal) === 1,
            lojasNaCidade: num(r.lojasNaCidade),
        }));

        // Quem decide é o segmento PRINCIPAL do cadastro: 1.405 das 1.406 lojas
        // delivery têm um, e é o que a loja declarou ser. Sem ele a escolha
        // "mais específico" erra feio — a Paulu's Hamburgueria tem Burger,
        // Churrasco e Lanches, e o menos povoado em Muriaé é Churrasco (16
        // lojas contra 55): ela seria comparada com churrascaria.
        // Empate entre dois principais (acontece: Lanches + Burger na mesma
        // loja) desempata pelo mais específico, que é o que descreve melhor o
        // concorrente real.
        const comPrincipal = candidatos.filter(c => c.principal);
        const ordem = comPrincipal.length > 0 ? comPrincipal : candidatos;
        const escolhido = ordem.find(c => c.lojasNaCidade >= MIN_PARES)
            ?? [...ordem].sort((a, b) => b.lojasNaCidade - a.lojasNaCidade)[0];

        if (!escolhido) {
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({
                ok: true, estabId, semComparacao: 'sem_segmento',
                parceiro: { id: estabId, nome: estab.nome, cidade: estab.cidade, localidadeId, cardapioDigital },
            }) };
        }
        const poucosPares = escolhido.lojasNaCidade < MIN_PARES;

        // ── 3. Quem são os concorrentes ─────────────────────────────────
        const t_pares = Date.now();
        const [parRows] = await connection.query<ParRow>(
            `SELECT e.id, e.nome
               FROM estabelecimento e
               JOIN categoria_estabelecimento ce
                 ON ce.estabelecimento_id = e.id AND ce.categoria_id = ? AND ce.ativo = 1
              WHERE e.localidade_id = ? AND e.delivery = 1 AND e.cardapio_digital = ?`,
            [escolhido.id, localidadeId, cardapioDigital],
        );
        marca('pares', t_pares);

        const idsPares = parRows.map(r => Number(r.id));
        // O próprio parceiro pode não estar na lista (ele veio do segmento, mas
        // delivery/CD podem divergir). Garante que ele entre nas consultas.
        if (!idsPares.includes(estabId)) idsPares.push(estabId);
        const placeholders = idsPares.map(() => '?').join(',');

        // ── 4. Pedidos da janela, por loja ──────────────────────────────
        // Esta consulta PARTE do `pedido`, não dos estabelecimentos, e é a
        // diferença entre 19s e meio segundo. `pedido` só tem índices
        // separados em `estabelecimento_id` e `data`: percorrendo as lojas, o
        // otimizador entra pelo índice de loja e varre o histórico INTEIRO de
        // cada uma (lojas de 2019 incluídas) para só depois jogar fora por
        // data. Partindo do id — auto-incremento, logo range na PRIMARY — lê
        // só os ~57 mil pedidos da janela do sistema todo e filtra pelo IN.
        // Medido neste parceiro: 19.646ms → 540ms.
        const t_idMin = Date.now();
        const [idRows] = await connection.query<RowDataPacket[]>(
            `SELECT MIN(id) AS idMin FROM pedido WHERE data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
            [dias],
        );
        marca('idMin', t_idMin);
        const idMin = num(idRows[0]?.idMin);

        const t_pedidos = Date.now();
        const [pedidoRows] = await connection.query<PedidoRow>(
            `SELECT p.estabelecimento_id        AS id,
                    COUNT(*)                    AS pedidos,
                    COUNT(DISTINCT DATE(p.data)) AS diasComPedido
               FROM pedido p
              WHERE p.id >= ?
                AND p.data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                AND p.data <  CURDATE()
                AND p.status IN (1, 2)
                AND p.estabelecimento_id IN (${placeholders})
              GROUP BY p.estabelecimento_id`,
            [idMin, dias, ...idsPares],
        );
        marca('pedidos', t_pedidos);
        const pedidosPorId = new Map<number, { pedidos: number; diasComPedido: number }>();
        for (const r of pedidoRows) {
            pedidosPorId.set(Number(r.id), { pedidos: num(r.pedidos), diasComPedido: num(r.diasComPedido) });
        }

        // ── 4. Cardápio: profundidade e nível de preço, por loja ────────
        // Agregado no SQL (1 linha por loja) de propósito: trazer item a item
        // de um segmento grande são milhares de linhas e a comparação de nível
        // não precisa delas. Média, não mediana, porque MySQL 5.5 não tem
        // função de janela — a tela precisa rotular como "preço médio".
        //
        // Só conta o que está NO APP: categoria viva, catálogo ativo, item
        // aprovado (status = 2). `campanha`/`variacao` ficam fora porque são
        // cópia do mesmo prato e opção de adicional — contá-los infla o
        // cardápio e distorce o preço médio.
        const t_cardapio = Date.now();
        const [cardRows] = await connection.query<CardapioRow>(
            `SELECT cat.estabelecimento_id,
                    COUNT(ic.id)        AS itens,
                    MIN(ic.preco)       AS entrada,
                    AVG(ic.preco)       AS precoMedio
               FROM catalogo cat
               JOIN item_catalogo ic
                 ON ic.catalogo_id = cat.id
                AND ic.ativo = 1 AND ic.arquivado = 0 AND ic.status = 2 AND ic.preco > 0
               JOIN categoria_catalogo cc
                 ON cc.id = ic.categoria_id
                AND cc.ativo = 1 AND cc.arquivado = 0 AND cc.campanha = 0 AND cc.variacao = 0
              WHERE cat.estabelecimento_id IN (${placeholders}) AND cat.ativo = 1
              GROUP BY cat.estabelecimento_id`,
            idsPares,
        );
        marca('cardapio', t_cardapio);

        // ── 5. Entrega: taxa e alcance, por loja ────────────────────────
        const t_entrega = Date.now();
        const [entregaRows] = await connection.query<EntregaRow>(
            `SELECT estabelecimento_id,
                    COUNT(*)     AS bairros,
                    AVG(valor)   AS taxaMedia,
                    MIN(valor)   AS taxaMinima
               FROM bairro_estabelecimento
              WHERE estabelecimento_id IN (${placeholders})
              GROUP BY estabelecimento_id`,
            idsPares,
        );
        marca('entrega', t_entrega);

        // ── 6. Itens do parceiro (todos) ────────────────────────────────
        const t_meusItens = Date.now();
        const [meusItens] = await connection.query<ItemRow>(
            `SELECT cat.estabelecimento_id, ic.nome, cc.nome AS secao, ic.preco
               FROM catalogo cat
               JOIN item_catalogo ic
                 ON ic.catalogo_id = cat.id
                AND ic.ativo = 1 AND ic.arquivado = 0 AND ic.status = 2 AND ic.preco > 0
               JOIN categoria_catalogo cc
                 ON cc.id = ic.categoria_id
                AND cc.ativo = 1 AND cc.arquivado = 0 AND cc.campanha = 0 AND cc.variacao = 0
              WHERE cat.estabelecimento_id = ? AND cat.ativo = 1`,
            [estabId],
        );
        marca('meusItens', t_meusItens);

        // ── 7. Itens dos concorrentes NOS TAMANHOS QUE ELE VENDE ────────
        // Em vez de puxar o cardápio inteiro do segmento (3.250 itens só em
        // Burger/Muriaé), puxa só o que pode casar: nome contendo um dos
        // números de tamanho dele, mais os degraus vizinhos da escada
        // comercial (550 compara com 500 e 600). Fora isso é peso morto.
        const meusVolumes: { item: string; preco: number; volume: Volume; palavras: Set<string> }[] = [];
        for (const r of meusItens) {
            const nome = String(r.nome);
            if (ehCombo(nome)) continue;
            const volume = extrairVolume(nome);
            if (!volume) continue;
            meusVolumes.push({
                item: nome,
                preco: num(r.preco),
                volume,
                palavras: palavrasProduto(nome, String(r.secao ?? '')),
            });
        }

        const ESCADA = [100, 150, 200, 250, 300, 330, 350, 400, 440, 450, 473, 500, 550, 600, 650, 700, 750, 800, 900, 1000, 1500, 2000];
        const alvos = new Set<number>();
        for (const m of meusVolumes) {
            alvos.add(Math.round(m.volume.valor));
            for (const degrau of ESCADA) {
                if (Math.abs(degrau - m.volume.valor) <= m.volume.valor * TOL_VOLUME) alvos.add(degrau);
            }
        }

        let itensPares: ItemRow[] = [];
        if (alvos.size > 0 && idsPares.length > 1) {
            const likes = [...alvos].map(() => 'ic.nome LIKE ?').join(' OR ');
            const params: (number | string)[] = [
                ...idsPares,
                ...[...alvos].map(v => `%${v}%`),
            ];
            const t_itensPares = Date.now();
            const [rows] = await connection.query<ItemRow>(
                `SELECT cat.estabelecimento_id, ic.nome, cc.nome AS secao, ic.preco
                   FROM catalogo cat
                   JOIN item_catalogo ic
                     ON ic.catalogo_id = cat.id
                    AND ic.ativo = 1 AND ic.arquivado = 0 AND ic.status = 2 AND ic.preco > 0
                   JOIN categoria_catalogo cc
                     ON cc.id = ic.categoria_id
                    AND cc.ativo = 1 AND cc.arquivado = 0 AND cc.campanha = 0 AND cc.variacao = 0
                  WHERE cat.estabelecimento_id IN (${placeholders}) AND cat.ativo = 1
                    AND (${likes})
                  LIMIT ${LIMITE_ITENS_PARES}`,
                params,
            );
            marca('itensPares', t_itensPares);
            itensPares = rows;
        }

        // ── Montagem ────────────────────────────────────────────────────
        const nomePorId = new Map<number, string>(parRows.map(r => [Number(r.id), String(r.nome)]));
        nomePorId.set(estabId, String(estab.nome));

        const cardPorId = new Map<number, { itens: number; entrada: number; precoMedio: number }>();
        for (const r of cardRows) {
            cardPorId.set(Number(r.estabelecimento_id), {
                itens: num(r.itens),
                entrada: cent(num(r.entrada)),
                precoMedio: cent(num(r.precoMedio)),
            });
        }

        const entregaPorId = new Map<number, { bairros: number; taxaMedia: number; taxaMinima: number }>();
        for (const r of entregaRows) {
            entregaPorId.set(Number(r.estabelecimento_id), {
                bairros: num(r.bairros),
                taxaMedia: cent(num(r.taxaMedia)),
                taxaMinima: cent(num(r.taxaMinima)),
            });
        }

        const pares = parRows
            .map(r => {
                const id = Number(r.id);
                const card = cardPorId.get(id);
                const ped = pedidosPorId.get(id);
                return {
                    id,
                    nome: String(r.nome),
                    ehOParceiro: id === estabId,
                    pedidos: ped?.pedidos ?? 0,
                    diasComPedido: ped?.diasComPedido ?? 0,
                    itens: card?.itens ?? 0,
                    precoMedio: card?.precoMedio ?? 0,
                    taxaMedia: entregaPorId.get(id)?.taxaMedia ?? 0,
                };
            })
            .sort((a, b) => b.pedidos - a.pedidos);

        const outros = pares.filter(p => !p.ehOParceiro);
        const meu = pares.find(p => p.ehOParceiro);

        const meuCard = cardPorId.get(estabId) ?? { itens: 0, entrada: 0, precoMedio: 0 };
        const meuPedidos = meu?.pedidos ?? 0;

        const pedidosSegmento = outros.map(p => p.pedidos);
        const itensSegmento = outros.map(p => p.itens).filter(v => v > 0);
        const precoSegmento = outros.map(p => p.precoMedio).filter(v => v > 0);
        const taxaSegmento = outros.map(p => p.taxaMedia).filter(v => v > 0);

        // ── Preço por tamanho ───────────────────────────────────────────
        // Agrupa por item DELE: cada linha é "o meu copo de 550ml contra os
        // copos equivalentes da cidade". Um concorrente entra uma vez por
        // tamanho, com o MENOR preço dele naquele tamanho — é o preço que o
        // cliente vê na vitrine, não a média do cardápio dele.
        const volumes = meusVolumes
            .map(m => {
                const porLoja = new Map<number, number>();
                for (const r of itensPares) {
                    const id = Number(r.estabelecimento_id);
                    if (id === estabId) continue;
                    const nome = String(r.nome);
                    if (ehCombo(nome)) continue;
                    const v = extrairVolume(nome);
                    if (!v || v.unidade !== m.volume.unidade) continue;
                    if (Math.abs(v.valor - m.volume.valor) > m.volume.valor * TOL_VOLUME) continue;
                    // Mesmo tamanho não basta: sem esta linha o copo de açaí de
                    // 500ml era comparado com a garrafa de água de 500ml e o
                    // "mais barato da cidade" virava R$ 3,00.
                    if (!mesmoProduto(m.palavras, palavrasProduto(nome, String(r.secao ?? '')))) continue;
                    const preco = num(r.preco);
                    const atual = porLoja.get(id);
                    if (atual === undefined || preco < atual) porLoja.set(id, preco);
                }

                const precos = [...porLoja.values()];
                if (precos.length < MIN_COMPARADOS) return null;

                const med = cent(mediana(precos));
                const menor = cent(Math.min(...precos));
                const idMaisBarato = [...porLoja.entries()].sort((a, b) => a[1] - b[1])[0][0];
                return {
                    item: m.item,
                    volume: Math.round(m.volume.valor),
                    unidade: m.volume.unidade,
                    meuPreco: cent(m.preco),
                    medianaSegmento: med,
                    menorSegmento: menor,
                    maiorSegmento: cent(Math.max(...precos)),
                    lojasComparadas: precos.length,
                    maisBarato: { id: idMaisBarato, nome: nomePorId.get(idMaisBarato) ?? '', preco: cent(porLoja.get(idMaisBarato) ?? 0) },
                    /** Quanto ele está acima (+) ou abaixo (−) da mediana, em %. */
                    deltaPct: med > 0 ? Math.round(((m.preco - med) / med) * 100) : 0,
                    posicao: precos.filter(p => p < m.preco).length + 1,
                    totalComparados: precos.length + 1,
                };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .sort((a, b) => b.deltaPct - a.deltaPct);

        // ── Achados ─────────────────────────────────────────────────────
        // Só o que SAI DO BANCO. O achado de visita é composto na tela, que é
        // quem tem o acesso do GA (ver nota no topo).
        const achados: Achado[] = [];
        const medItens = mediana(itensSegmento);
        const medPreco = mediana(precoSegmento);
        const medTaxa = mediana(taxaSegmento);
        const medPedidos = mediana(pedidosSegmento);

        if (meuCard.itens === 0) {
            achados.push({
                id: 'cardapio-vazio',
                severidade: 1,
                titulo: 'Sem cardápio no ar',
                detalhe: 'Nenhum item ativo em categoria viva. O cliente abre a loja e não tem o que pedir.',
            });
        } else if (medItens > 0 && meuCard.itens < medItens / 2) {
            achados.push({
                id: 'cardapio-raso',
                severidade: 1,
                titulo: `Cardápio raso: ${meuCard.itens} ${meuCard.itens === 1 ? 'item' : 'itens'}`,
                detalhe: `O ${escolhido.nome.toLowerCase()} mediano da cidade tem ${medItens} itens. Menos opção é menos motivo para abrir a loja.`,
            });
        }

        const caros = volumes.filter(v => v.deltaPct >= 15);
        if (caros.length > 0) {
            const pior = caros[0];
            achados.push({
                id: 'preco-acima',
                severidade: caros[0].deltaPct >= 30 ? 1 : 2,
                titulo: `Preço ${pior.deltaPct}% acima da cidade no ${pior.volume}${pior.unidade}`,
                detalhe: `"${pior.item}" a ${brl(pior.meuPreco)} contra mediana de ${brl(pior.medianaSegmento)} em ${pior.lojasComparadas} ${pior.lojasComparadas === 1 ? 'loja' : 'lojas'}. Mais barato: ${pior.maisBarato.nome} a ${brl(pior.maisBarato.preco)}.`,
            });
        } else if (volumes.length === 0 && medPreco > 0 && meuCard.precoMedio > medPreco * 1.3) {
            // Sem tamanho no nome não dá para comparar item a item; o nível
            // médio do cardápio é a única régua que sobra, e só vale quando a
            // diferença é grande o bastante para não ser composição de menu.
            achados.push({
                id: 'preco-medio-acima',
                severidade: 2,
                titulo: 'Cardápio mais caro que o do segmento',
                detalhe: `Preço médio de ${brl(meuCard.precoMedio)} contra ${brl(medPreco)} da cidade. Sem tamanho no nome dos itens não dá para comparar prato a prato.`,
            });
        }

        const minhaTaxa = meu?.taxaMedia ?? 0;
        if (medTaxa > 0 && minhaTaxa > medTaxa * 1.3) {
            achados.push({
                id: 'taxa-alta',
                severidade: 2,
                titulo: `Taxa de entrega ${brl(minhaTaxa)} contra ${brl(medTaxa)} da cidade`,
                detalhe: 'Taxa acima do segmento aparece no carrinho, depois de o cliente já ter escolhido — é desistência silenciosa.',
            });
        }

        const meusBairros = entregaPorId.get(estabId)?.bairros ?? 0;
        const bairrosSegmento = outros
            .map(p => entregaPorId.get(p.id)?.bairros ?? 0)
            .filter(v => v > 0);
        const medBairros = mediana(bairrosSegmento);
        if (meusBairros === 0) {
            achados.push({
                id: 'sem-area',
                severidade: 1,
                titulo: 'Sem bairro de entrega cadastrado',
                detalhe: 'Sem área de entrega a loja não entrega para ninguém, por mais que apareça na vitrine.',
            });
        } else if (medBairros > 0 && meusBairros < medBairros * 0.6) {
            achados.push({
                id: 'area-curta',
                severidade: 2,
                titulo: `Entrega em ${meusBairros} bairros, contra ${medBairros} da cidade`,
                detalhe: 'Parte da cidade não consegue pedir dele.',
            });
        }

        achados.sort((a, b) => a.severidade - b.severidade);

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estabId,
                parceiro: {
                    id: estabId,
                    nome: estab.nome,
                    cidade: estab.cidade,
                    localidadeId,
                    cardapioDigital,
                    /** Única loja do banco com entrega por raio — sem taxa por bairro. */
                    entregaPorRaio: Number(estab.tipo_entrega) === 1,
                },
                janela: { dias, ateOntem: true },
                segmento: {
                    id: escolhido.id,
                    nome: escolhido.nome,
                    lojasNaCidade: escolhido.lojasNaCidade,
                    poucosPares,
                    candidatos,
                },
                pedidos: {
                    loja: meuPedidos,
                    diasComPedido: meu?.diasComPedido ?? 0,
                    medianaSegmento: medPedidos,
                    melhorSegmento: outros.length ? Math.max(...pedidosSegmento) : 0,
                    posicao: posicaoDesc(meuPedidos, pedidosSegmento),
                    totalComparados: outros.length + 1,
                },
                cardapio: {
                    itens: meuCard.itens,
                    medianaItensSegmento: medItens,
                    precoMedio: meuCard.precoMedio,
                    medianaPrecoSegmento: cent(medPreco),
                    entrada: meuCard.entrada,
                },
                entrega: {
                    bairros: meusBairros,
                    medianaBairrosSegmento: medBairros,
                    taxaMedia: cent(minhaTaxa),
                    medianaTaxaSegmento: cent(medTaxa),
                    taxaMinima: entregaPorId.get(estabId)?.taxaMinima ?? 0,
                },
                volumes,
                pares: pares.slice(0, LIMITE_PARES),
                achados,
                tookMs: Date.now() - started,
                tempos,
            }),
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parceiro-raio-x] erro:', msg);
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: msg }) };
    } finally {
        if (connection) await connection.end().catch(() => { /* conexão já caiu */ });
    }
};
