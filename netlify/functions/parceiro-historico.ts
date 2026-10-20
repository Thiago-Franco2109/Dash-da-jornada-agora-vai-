import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';
import { idDesde } from './_shared/idPorData';

/**
 * Histórico de UM parceiro: a curva de pedidos com os eventos em cima dela.
 *
 * A aba Pedidos responde "quanto vendeu". Esta responde "o que aconteceu no
 * meio do caminho" — e as duas coisas no MESMO eixo de tempo, porque evento
 * solto é trivia: o que explica queda é "tirou 14 itens do ar no dia 12, e a
 * venda caiu a partir do 13".
 *
 * ── Diferença para `parceiro-diagnostico` ────────────────────────────────
 * `parceiro-diagnostico` ("Por que caiu?") é um VEREDITO: janela curta, seis
 * perguntas fechadas, uma resposta por pergunta. Esta aqui é o EXTRATO: janela
 * de até 36 meses, todo evento datado que o banco guarda, para o CS vasculhar.
 * As duas leem as mesmas tabelas; o recorte e o tamanho da janela é que mudam.
 *
 * ── De onde vem cada evento ──────────────────────────────────────────────
 *  · `log` — 2,4M linhas de auditoria do CMS, uma por alteração, com o diff em
 *    texto ("ativo: 1 => 0;") e a autoria separada entre `admin_id` (Bigou) e
 *    `admin_estabelecimento_id` (o próprio parceiro).
 *  · `recesso_estabelecimento` — já datado, e guarda quem cadastrou.
 *  · `cupom_desconto` — criação, validade e desativação.
 *  · `item_catalogo` — só para dar NOME aos itens que saíram (ver abaixo).
 *  · `pedido` — a curva, e os dias de cancelamento fora da curva.
 *
 * ── O log não diz QUAL item ──────────────────────────────────────────────
 * As linhas de diff do `log` não carregam id nem nome: "ativo: 1 => 0;" e
 * ponto. Só as linhas de criação ("adicionado item: id:=>X; nome=>Y") têm
 * identidade. Então a CONTAGEM de desativações vem do log (é ação, e é o que
 * se quer datar), e os NOMES vêm de `item_catalogo.data_modificacao_ativo` /
 * `_arquivado`, casados pelo DIA. Os dois números podem não bater: o log conta
 * ações, `item_catalogo` guarda só a última mudança de cada item (item que
 * saiu e voltou some dali). Por isso o nome aparece como EXEMPLO, nunca como
 * "a lista do que saiu".
 *
 * ── Fronteira de dia ─────────────────────────────────────────────────────
 * `pedido.data` e `log.data` estão em horário de BRASÍLIA, mas o MySQL roda em
 * UTC — `NOW()`/`CURDATE()` chegariam 3h adiantados e jogariam o fim da noite
 * para o dia seguinte. O "hoje" daqui sai de `Intl` com America/Sao_Paulo,
 * como em `trello-atividade-hoje`.
 *
 * ── Custo (medido contra o banco de teste, do navegador) ─────────────────
 * `log` não tem índice por estabelecimento NEM por data: só `PRIMARY(id)` e
 * `admin_id`. Sem o corte por id, varrer para devolver 100 linhas custa ~4,3s.
 * Com `idDesde` (ver _shared/idPorData.ts) a varredura cai para o trecho da
 * janela: ~0,6s em 12 meses, ~1,9s em 36.
 *
 * O banco é REMOTO e cada ida custa ~140ms de latência pura, então o que pesa
 * aqui é o NÚMERO de consultas tanto quanto o tamanho delas. Medido em 12
 * meses: MIN(id) do pedido 593ms · curva 186ms · `idDesde` do log 2×157ms ·
 * log 615ms · recessos 159ms · `idDesde` do cupom 2×160ms · cupons 588ms ·
 * catálogo + itens 290ms ≈ 3s ponta a ponta — da mesma ordem da aba Pedidos
 * em 12 meses.
 *
 * ⚠️ `log` começa em 2019, mas cada tipo de registro começa quando o CMS
 * passou a gravá-lo (ITEM_CATALOGO só a partir de 2023). Janela mais antiga
 * que isso aparece vazia de eventos — e vazio aqui significa "não registrado",
 * não "não aconteceu". A resposta devolve `fontes.logDesde` para a tela avisar.
 *
 * Query params:
 *   ?estabId=26807   → obrigatório
 *   ?meses=12        → janela em meses de calendário (1..36, padrão 12)
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

// Dado de dias fechados: 5 min de cache evita refazer as ~10 idas ao banco a cada
// troca de filtro na tela (os filtros são todos client-side).
const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' };
const erroHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DIA_MS = 86_400_000;
const MAX_MESES = 36;

/** Teto de linhas do log por chamada. A loja mais agitada da base fez 4.369 em 12 meses. */
const LIMITE_LOG = 15_000;

/**
 * Quanto de `alteracao` a query traz. O diff inteiro de uma criação de item
 * passa de 1 KB e multiplicado por 15 mil linhas vira transferência à toa —
 * mas as regras abaixo só olham o começo do texto.
 *
 * ⚠️ Um diff gigante que mexa em `promocional` lá no fim pode cair fora do
 * corte e ser classificado como "outra alteração". Acontece em edição em
 * massa, e o evento não some: só perde o rótulo específico.
 */
const CORTE_ALTERACAO = 500;

export type TipoHistorico =
    | 'cardapio'
    | 'promocao'
    | 'cupom'
    | 'horario'
    | 'recesso'
    | 'entrega'
    | 'pagamento'
    | 'cancelamento';

/** 'negativo' = saiu do ar algo que fazia a loja vender. É o que explica queda. */
type Impacto = 'negativo' | 'positivo' | 'neutro';

type Quem = 'loja' | 'admin' | 'sistema';

interface Regra {
    casa: RegExp;
    tipo: TipoHistorico;
    titulo: string;
    impacto: Impacto;
    /**
     * Mostrar o diff cru do log na linha?
     *
     * Só onde ele É a informação: em horário, taxa e pagamento o valor
     * ("15:00 => 14:00") é a notícia. Em "Item desativado" o diff repete o
     * título com ruído de coluna técnica ("data_modificacao_ativo: null =>
     * ...") e empurra o nome do item para fora da linha.
     */
    diff?: boolean;
}

/**
 * Como ler o diff do `log`. A ordem IMPORTA: a primeira regra que casa vence,
 * então o específico vem antes do genérico ("promocional: 1 => 0" antes de
 * "preco:", que vem junto na mesma linha).
 *
 * O que não casa com nenhuma regra cai no genérico do registro (ver
 * REGISTRO_GENERICO) em vez de sumir: a tela mostra "mexeu", e o CS decide.
 */
const REGRAS: Record<string, Regra[]> = {
    ITEM_CATALOGO: [
        // Linha de criação: vem SEMPRE em par com "adicionado item", que é a
        // legível. Sem este descarte todo item novo apareceria duas vezes.
        { casa: /^catalogo_id:\s*undefined/, tipo: 'cardapio', titulo: '', impacto: 'neutro' },
        { casa: /\bpromocional:\s*1\s*=>\s*0\b/, tipo: 'promocao', titulo: 'Promoção tirada do item', impacto: 'negativo' },
        { casa: /\bpromocional:\s*0\s*=>\s*1\b/, tipo: 'promocao', titulo: 'Item virou promoção', impacto: 'positivo' },
        { casa: /\bpreco_promocional:[^;]*=>\s*(null|undefined)\s*;/, tipo: 'promocao', titulo: 'Preço promocional removido', impacto: 'negativo' },
        { casa: /\bpreco_promocional:/, tipo: 'promocao', titulo: 'Preço promocional alterado', impacto: 'neutro', diff: true },
        { casa: /\bativo:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Item desativado', impacto: 'negativo' },
        { casa: /\barquivado:\s*0\s*=>\s*1\b/, tipo: 'cardapio', titulo: 'Item arquivado', impacto: 'negativo' },
        { casa: /\bdisponivel:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Item marcado como indisponível', impacto: 'negativo' },
        { casa: /\bativo:\s*0\s*=>\s*1\b/, tipo: 'cardapio', titulo: 'Item reativado', impacto: 'positivo' },
        { casa: /\barquivado:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Item desarquivado', impacto: 'positivo' },
        { casa: /\bdisponivel:\s*0\s*=>\s*1\b/, tipo: 'cardapio', titulo: 'Item voltou a ficar disponível', impacto: 'positivo' },
        { casa: /^adicionado item/, tipo: 'cardapio', titulo: 'Item novo no cardápio', impacto: 'positivo' },
        { casa: /^clone item/, tipo: 'cardapio', titulo: 'Item copiado', impacto: 'neutro' },
        { casa: /^(preco:|modificado o preço)/, tipo: 'cardapio', titulo: 'Preço alterado', impacto: 'neutro', diff: true },
        { casa: /^imagem:/, tipo: 'cardapio', titulo: 'Foto do item alterada', impacto: 'neutro' },
        { casa: /\bdata_fim:/, tipo: 'promocao', titulo: 'Validade do item alterada', impacto: 'neutro' },
    ],
    CATEGORIA_CATALOGO: [
        { casa: /^id:\s*undefined/, tipo: 'cardapio', titulo: '', impacto: 'neutro' },
        { casa: /\b(ativo:\s*1\s*=>\s*0|arquivado:\s*0\s*=>\s*1)\b/, tipo: 'cardapio', titulo: 'Categoria saiu do ar', impacto: 'negativo' },
        { casa: /\b(ativo:\s*0\s*=>\s*1|arquivado:\s*1\s*=>\s*0)\b/, tipo: 'cardapio', titulo: 'Categoria voltou ao ar', impacto: 'positivo' },
        { casa: /^(adicionada categoria|categoria importada|clone categoria)/, tipo: 'cardapio', titulo: 'Categoria nova', impacto: 'positivo' },
        // Categoria com turno é categoria que só aparece em parte do dia —
        // some do app fora da janela sem ninguém desativar nada.
        { casa: /^turno\d/, tipo: 'horario', titulo: 'Turno da categoria alterado', impacto: 'neutro', diff: true },
    ],
    CATEGORIA_VARIACAO: [
        { casa: /^remoção da variação/, tipo: 'cardapio', titulo: 'Variação removida do item', impacto: 'negativo' },
        { casa: /\bativo:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Variação desativada', impacto: 'negativo' },
        { casa: /^(variação|clone categoria de variação|categoria de variação importada)/, tipo: 'cardapio', titulo: 'Variação adicionada', impacto: 'positivo' },
    ],
    ITEM_VARIACAO: [
        { casa: /^catalogo_id:\s*undefined/, tipo: 'cardapio', titulo: '', impacto: 'neutro' },
        { casa: /\bativo:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Opção de variação desativada', impacto: 'negativo' },
        { casa: /^adicionado item/, tipo: 'cardapio', titulo: 'Opção de variação adicionada', impacto: 'positivo' },
        { casa: /^preco:/, tipo: 'cardapio', titulo: 'Preço de variação alterado', impacto: 'neutro', diff: true },
    ],
    // O cardápio inteiro fora do ar: a loja continua listada e não vende nada.
    CATALOGO: [
        { casa: /\bativo:\s*1\s*=>\s*0\b/, tipo: 'cardapio', titulo: 'Cardápio inteiro desativado', impacto: 'negativo' },
        { casa: /\bativo:\s*0\s*=>\s*1\b/, tipo: 'cardapio', titulo: 'Cardápio reativado', impacto: 'positivo' },
    ],
    HORARIO_FUNCIONAMENTO: [
        // "=> null" / "=> ;" é dia que deixou de ter horário: a loja sumiu do
        // app naquele dia da semana, que é diferente de só mudar o horário.
        { casa: /=>\s*(null|undefined)?\s*;/, tipo: 'horario', titulo: 'Dia sem horário de funcionamento', impacto: 'negativo', diff: true },
        { casa: /./, tipo: 'horario', titulo: 'Horário de funcionamento alterado', impacto: 'neutro', diff: true },
    ],
    TAXA_ENTREGA: [{ casa: /./, tipo: 'entrega', titulo: 'Taxa de entrega alterada', impacto: 'neutro', diff: true }],
    AREA_ENTREGA: [{ casa: /./, tipo: 'entrega', titulo: 'Área de entrega alterada', impacto: 'neutro', diff: true }],
    DELIVERY: [
        { casa: /\bdias_entrega:\s*[^=]*=>\s*;/, tipo: 'entrega', titulo: 'Dias de entrega zerados', impacto: 'negativo', diff: true },
        { casa: /\bminimo_pedidos:/, tipo: 'entrega', titulo: 'Pedido mínimo alterado', impacto: 'neutro', diff: true },
        { casa: /./, tipo: 'entrega', titulo: 'Configuração de entrega alterada', impacto: 'neutro', diff: true },
    ],
    FORMA_PAGAMENTO: [
        { casa: /\b(true|1)\s*=>\s*(false|0)\b/, tipo: 'pagamento', titulo: 'Método de pagamento desligado', impacto: 'negativo', diff: true },
        { casa: /./, tipo: 'pagamento', titulo: 'Métodos de pagamento alterados', impacto: 'neutro', diff: true },
    ],
    // Não é diff: vem como foto do método ("id: 6; nome: NuPay; ... ativo: 1;").
    // O `ativo` é o estado DEPOIS da mexida, então dá para dizer o que ficou.
    FORMA_PAGAMENTO_ONLINE: [
        { casa: /\bativo:\s*0\b/, tipo: 'pagamento', titulo: 'Pagamento online desligado', impacto: 'negativo', diff: true },
        { casa: /./, tipo: 'pagamento', titulo: 'Pagamento online ligado', impacto: 'positivo', diff: true },
    ],
};

/** Quando nenhuma regra casa: o evento aparece como "mexeu", sem palpite. */
const REGISTRO_GENERICO: Record<string, { tipo: TipoHistorico; titulo: string }> = {
    ITEM_CATALOGO: { tipo: 'cardapio', titulo: 'Item do cardápio alterado' },
    CATEGORIA_CATALOGO: { tipo: 'cardapio', titulo: 'Categoria alterada' },
    CATEGORIA_VARIACAO: { tipo: 'cardapio', titulo: 'Variação alterada' },
    ITEM_VARIACAO: { tipo: 'cardapio', titulo: 'Variação alterada' },
    CATALOGO: { tipo: 'cardapio', titulo: 'Cardápio alterado' },
    HORARIO_FUNCIONAMENTO: { tipo: 'horario', titulo: 'Horário alterado' },
    TAXA_ENTREGA: { tipo: 'entrega', titulo: 'Entrega alterada' },
    AREA_ENTREGA: { tipo: 'entrega', titulo: 'Entrega alterada' },
    DELIVERY: { tipo: 'entrega', titulo: 'Entrega alterada' },
    FORMA_PAGAMENTO: { tipo: 'pagamento', titulo: 'Pagamento alterado' },
    FORMA_PAGAMENTO_ONLINE: { tipo: 'pagamento', titulo: 'Pagamento online alterado' },
};

const REGISTROS = Object.keys(REGISTRO_GENERICO);

/**
 * Dia de cancelamento que vira evento.
 *
 * Toda loja cancela um pedido de vez em quando; isso não é notícia. O que é
 * notícia é o dia em que a loja perdeu boa parte do que entrou — por recusa
 * ou por não aceitar a tempo. Os dois cortes juntos (volume E proporção)
 * evitam tanto o alarme de "1 de 2 cancelados" quanto o silêncio de "30 de
 * 300" numa loja grande.
 */
const CANC_MINIMO = 3;
const CANC_FRACAO = 0.3;

const num = (v: unknown): number => Number(v ?? 0);

/** Hoje em São Paulo — `pedido.data` e `log.data` estão nesse fuso, o MySQL não. */
function hojeBrasilia(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Primeiro dia do mês `n` meses antes do mês de `iso` — a janela fecha em mês cheio. */
function primeiroDiaDoMesAtras(iso: string, n: number): string {
    const ano = Number(iso.slice(0, 4));
    const mes = Number(iso.slice(5, 7)) - 1 - n;
    const d = new Date(Date.UTC(ano, mes, 1));
    return d.toISOString().slice(0, 10);
}

function quemMexeu(adminId: unknown, adminEstabId: unknown): Quem {
    if (adminId) return 'admin';
    if (adminEstabId) return 'loja';
    return 'sistema';
}

/**
 * Resume o diff para caber numa linha. "taxa por bairro" chega com 80 campos
 * de uma vez; o que importa é "mexeu em 80", com três de amostra.
 */
function resumirDiff(alteracao: string, limite = 3): string {
    const partes = alteracao
        .split(';')
        .map(p => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    if (partes.length === 0) return alteracao.replace(/\s+/g, ' ').slice(0, 120);
    const amostra = partes.slice(0, limite).join(' · ');
    return partes.length > limite ? `${amostra} · +${partes.length - limite}` : amostra;
}

/**
 * Nome legível escondido no texto do log.
 *
 * "adicionado item: id:=>2037048; nome=>Coca-Cola 2 Litros\nà categoria:
 * id=>168108; nome=>Bebidas" tem DOIS nomes: o do item e o da categoria onde
 * ele entrou. O primeiro é o que interessa.
 *
 * "remoção da variação : id=>160067; nome=>Sabor da Pizza\ndo item: id:=>...;
 * nome=>Combo Casal 1" inverte a ordem: ali o primeiro é a variação e o
 * segundo é o item. Quem lê a linha do tempo procura o ITEM, então nesse caso
 * a resposta é "Combo Casal 1 (Sabor da Pizza)".
 */
function nomeNaLinha(alteracao: string): string | null {
    const nomes = [...alteracao.matchAll(/nome=>\s*([^\n;]+)/g)].map(m => m[1].trim());
    if (nomes.length === 0) return null;
    if (/^remoção da variação/.test(alteracao) && nomes.length > 1) {
        return `${nomes[1]} (${nomes[0]})`.slice(0, 70);
    }
    return nomes[0].slice(0, 60);
}

/**
 * Recesso que o sistema criou sozinho, não uma decisão de alguém.
 *
 * Quando o parceiro deixa pedido expirar, a loja é fechada automaticamente —
 * e isso entra com o `admin_id` do operador de plantão (ou da conta "Bigou
 * Suporte"). Carimbar isso como "nós" faria o CS ler na ficha que a Bigou
 * tirou a loja do ar por decisão própria, que é o contrário do que aconteceu:
 * quem derrubou a loja foi o parceiro não aceitando pedido.
 */
function recessoAutomatico(descricao: string): boolean {
    return /autom[aá]tic|perdeu o pedido/i.test(descricao);
}

export interface EventoHistorico {
    dia: string;
    tipo: TipoHistorico;
    titulo: string;
    /** Quantas vezes o mesmo título aconteceu no dia. */
    quantidade: number;
    impacto: Impacto;
    /** 'misto' quando loja e Bigou mexeram no mesmo dia no mesmo assunto. */
    quem: Quem | 'misto';
    detalhe: string;
    /** Nomes quando o banco deixa saber quais. Nunca é a lista completa. */
    exemplos: string[];
    /** Quem assinou, pelo nome, quando a mexida veio de alguém da Bigou. */
    autores: string[];
}

/** Acumulador de um grupo (dia + tipo + título) antes de virar `EventoHistorico`. */
interface Grupo {
    dia: string;
    tipo: TipoHistorico;
    titulo: string;
    impacto: Impacto;
    quantidade: number;
    quens: Set<Quem>;
    detalhes: string[];
    exemplos: string[];
    autores: Set<string>;
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
    const meses = Math.min(Math.max(Number(q.meses) || 12, 1), MAX_MESES);

    const hoje = hojeBrasilia();
    const de = primeiroDiaDoMesAtras(hoje, meses - 1);
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

        const grupos = new Map<string, Grupo>();
        const registrar = (
            dia: string,
            tipo: TipoHistorico,
            titulo: string,
            impacto: Impacto,
            quem: Quem,
            detalhe: string,
            exemplo?: string | null,
            autor?: string | null,
        ) => {
            if (!dia || !titulo) return;
            const chave = `${dia}|${tipo}|${titulo}`;
            const g = grupos.get(chave) ?? {
                dia, tipo, titulo, impacto, quantidade: 0,
                quens: new Set<Quem>(), detalhes: [], exemplos: [], autores: new Set<string>(),
            };
            g.quantidade += 1;
            g.quens.add(quem);
            // Três detalhes bastam para a linha; o resto só engorda o payload.
            if (detalhe && g.detalhes.length < 3 && !g.detalhes.includes(detalhe)) g.detalhes.push(detalhe);
            if (exemplo && g.exemplos.length < 6 && !g.exemplos.includes(exemplo)) g.exemplos.push(exemplo);
            if (autor) g.autores.add(autor);
            grupos.set(chave, g);
        };

        // ── 1. a curva de pedidos, dia a dia ─────────────────────────────
        // `pedido` tem índice em `estabelecimento_id` e em `data`, nunca os
        // dois juntos. O corte por id vira range na PRIMARY e para cedo —
        // medido em 136ms contra 1.035ms sem ele. Mesma lógica de
        // `parceiro-diagnostico` e `cardapio-analise`.
        //
        // A diferença para aquelas duas é o TAMANHO da janela. Elas usam
        // `MIN(id) FORCE INDEX (data)`, que é exato mas varre o índice de data
        // da janela inteira: 458ms em 12 meses e 1.281ms em 36. `idDesde` custa
        // ~430ms sem crescer com a janela e devolve um corte mais folgado —
        // medido, as linhas a mais não custam nada na agregação (164ms contra
        // 199ms do corte exato, em 36 meses).
        const idPedidoMin = await idDesde(connection, 'pedido', 'data', de);

        const [serieRows] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS dia,
                    SUM(status IN (1, 2))                                           AS aceitos,
                    SUM(status = 3)                                                 AS cancelados,
                    SUM(status = -1)                                                AS expirados,
                    SUM(CASE WHEN status IN (1, 2) THEN total - desconto ELSE 0 END) AS gmvLiq
             FROM pedido
             WHERE id >= ? AND estabelecimento_id = ? AND data >= ? AND data < ?
             GROUP BY dia
             ORDER BY dia`,
            [idPedidoMin, estabId, de, ateExclusivo],
        );
        const serie = serieRows.map(r => ({
            dia: String(r.dia),
            aceitos: num(r.aceitos),
            cancelados: num(r.cancelados),
            expirados: num(r.expirados),
            gmvLiq: Math.round(num(r.gmvLiq) * 100) / 100,
        }));

        // Dia de vazamento vira evento na mesma linha do tempo das mudanças —
        // é a única série aqui que não é "alguém mexeu", mas é a que o CS
        // cruza com as outras ("tirou o pagamento online e começou a expirar").
        for (const d of serie) {
            const perdidos = d.cancelados + d.expirados;
            const recebidos = d.aceitos + perdidos;
            if (perdidos < CANC_MINIMO || recebidos === 0 || perdidos / recebidos < CANC_FRACAO) continue;
            const partes = [
                d.cancelados > 0 ? `${d.cancelados} cancelado(s)` : '',
                d.expirados > 0 ? `${d.expirados} expirado(s) sem a loja aceitar` : '',
            ].filter(Boolean);
            registrar(
                d.dia, 'cancelamento', 'Dia com muito pedido perdido', 'negativo', 'sistema',
                `${partes.join(' · ')} de ${recebidos} recebidos (${Math.round((perdidos / recebidos) * 100)}%)`,
            );
        }

        // ── 2. mudanças de configuração (log) ────────────────────────────
        const idLogMin = await idDesde(connection, 'log', 'data', de);
        // O JOIN em `admin` sai de graça (tabela de dezenas de linhas, lida pela
        // PK) e troca um "nós" genérico pelo nome de quem mexeu — que é o que
        // decide se a conversa com o parceiro é cobrança ou desculpa.
        const [logs] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(l.data, '%Y-%m-%d') AS dia,
                    l.registro,
                    LEFT(l.alteracao, ?) AS alteracao,
                    l.admin_id, l.admin_estabelecimento_id,
                    a.nome AS autor
             FROM log l
             LEFT JOIN admin a ON a.id = l.admin_id
             WHERE l.id >= ? AND l.estabelecimento_id = ? AND l.data >= ? AND l.data < ?
               AND l.registro IN (?)
             ORDER BY l.id DESC
             LIMIT ?`,
            [CORTE_ALTERACAO, idLogMin, estabId, de, ateExclusivo, REGISTROS, LIMITE_LOG],
        );
        const logTruncado = logs.length >= LIMITE_LOG;

        // Até onde o log tem alguma coisa para esta loja na janela. Sai das
        // linhas já lidas em vez de um `MIN(data)` à parte, que custaria outra
        // varredura inteira (medido: 373ms) para devolver um número só.
        let logDesde: string | null = null;
        for (const l of logs) {
            const dia = String(l.dia);
            if (!logDesde || dia < logDesde) logDesde = dia;
        }

        for (const l of logs) {
            const registro = String(l.registro);
            const alteracao = String(l.alteracao ?? '');
            const regra = (REGRAS[registro] ?? []).find(r => r.casa.test(alteracao));
            // Regra com título vazio é descarte explícito (linha duplicada).
            if (regra && !regra.titulo) continue;
            const generico = REGISTRO_GENERICO[registro];
            if (!regra && !generico) continue;
            registrar(
                String(l.dia),
                regra?.tipo ?? generico.tipo,
                regra?.titulo ?? generico.titulo,
                regra?.impacto ?? 'neutro',
                quemMexeu(l.admin_id, l.admin_estabelecimento_id),
                // Sem regra específica, o diff é a única pista do que mudou.
                !regra || regra.diff ? resumirDiff(alteracao) : '',
                nomeNaLinha(alteracao),
                l.autor ? String(l.autor) : null,
            );
        }

        // ── 3. recessos ──────────────────────────────────────────────────
        // Recesso renovado dia após dia é loja que some do app meses antes de
        // zerar o pedido: a contagem conta tanto quanto as datas.
        const [recessos] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(r.data_inicio, '%Y-%m-%d') AS inicio,
                    DATE_FORMAT(r.data_fim, '%Y-%m-%d')    AS fim,
                    DATEDIFF(r.data_fim, r.data_inicio) + 1 AS duracao,
                    r.descricao, r.admin_id, r.admin_estabelecimento_id,
                    a.nome AS autor
             FROM recesso_estabelecimento r
             LEFT JOIN admin a ON a.id = r.admin_id
             WHERE r.estabelecimento_id = ? AND r.ativo = 1
               AND r.data_fim >= ? AND r.data_inicio < ?
             ORDER BY r.data_inicio DESC`,
            [estabId, de, ateExclusivo],
        );
        for (const r of recessos) {
            const duracao = num(r.duracao) || 1;
            const descricao = String(r.descricao ?? '');
            const faixa = `${String(r.inicio).slice(8, 10)}/${String(r.inicio).slice(5, 7)} a ${String(r.fim).slice(8, 10)}/${String(r.fim).slice(5, 7)}`;
            const automatico = recessoAutomatico(descricao);
            registrar(
                // O dia do evento é quando o recesso COMEÇA a valer, não quando
                // foi cadastrado: é esse que casa com a queda na curva.
                String(r.inicio),
                'recesso',
                automatico
                    ? `Loja fechada por pedido perdido (${duracao} ${duracao > 1 ? 'dias' : 'dia'})`
                    : `Recesso de ${duracao} ${duracao > 1 ? 'dias' : 'dia'}`,
                'negativo',
                automatico ? 'sistema' : quemMexeu(r.admin_id, r.admin_estabelecimento_id),
                // No automático a descrição é boilerplate e repete o título; no
                // manual ela é a única pista do motivo ("Carnaval", "reforma").
                automatico ? faixa : `${faixa}${descricao ? ` · ${descricao.slice(0, 80)}` : ''}`,
                null,
                r.autor ? String(r.autor) : null,
            );
        }

        // ── 4. cupons ────────────────────────────────────────────────────
        // `cupom_desconto` tem 1,4M linhas sem índice por estabelecimento (a
        // própria `crm-cupons.ts` documenta a varredura de ~4s). O corte por id
        // parte da CRIAÇÃO — `data_fim` é remarcável e não acompanha o id, por
        // isso a folga de um ano antes da janela.
        const idCupomMin = await idDesde(connection, 'cupom_desconto', 'data', somarDias(de, -365));
        const [cupons] = await connection.query<RowDataPacket[]>(
            `SELECT codigo, ativo,
                    DATE_FORMAT(data,        '%Y-%m-%d') AS criadoEm,
                    DATE_FORMAT(data_inicio, '%Y-%m-%d') AS inicio,
                    DATE_FORMAT(data_fim,    '%Y-%m-%d') AS fim
             FROM cupom_desconto
             WHERE id >= ? AND estabelecimento_id = ?
               AND (   (data     >= ? AND data     < ?)
                    OR (data_fim >= ? AND data_fim < ?) )
             ORDER BY data DESC
             LIMIT 200`,
            [idCupomMin, estabId, de, ateExclusivo, de, ateExclusivo],
        );
        for (const c of cupons) {
            const codigo = String(c.codigo ?? '(sem código)').slice(0, 30);
            const criadoEm = String(c.criadoEm ?? '');
            const fim = String(c.fim ?? '');
            if (criadoEm >= de && criadoEm < ateExclusivo) {
                registrar(criadoEm, 'cupom', 'Cupom criado', 'positivo', 'sistema', `${codigo} · vale até ${fim.slice(8, 10)}/${fim.slice(5, 7)}`, codigo);
            }
            if (fim >= de && fim < ateExclusivo && fim <= hoje) {
                registrar(
                    fim, 'cupom',
                    num(c.ativo) === 0 ? 'Cupom desativado' : 'Cupom venceu',
                    'negativo', 'sistema',
                    `${codigo} · valia desde ${String(c.inicio).slice(8, 10)}/${String(c.inicio).slice(5, 7)}`,
                    codigo,
                );
            }
        }

        // ── 5. nome dos itens que saíram do ar ───────────────────────────
        // Só para dar EXEMPLO: ver o aviso no cabeçalho sobre por que a
        // contagem vem do log e o nome vem daqui.
        //
        // ⚠️ Os ids do catálogo saem numa consulta À PARTE de propósito. Com
        // `catalogo_id IN (SELECT id FROM catalogo WHERE estabelecimento_id=?)`
        // o otimizador abandona o índice `catalogo_id` e varre `item_catalogo`
        // inteira: 3.400ms medidos, contra 148ms passando a lista pronta. Era o
        // gargalo da function — sozinho custava mais que todo o resto junto.
        const [catalogos] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM catalogo WHERE estabelecimento_id = ?`,
            [estabId],
        );
        const catalogoIds = catalogos.map(c => num(c.id));

        const [itensFora] = catalogoIds.length > 0
            ? await connection.query<RowDataPacket[]>(
                `SELECT ic.nome, ic.arquivado,
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
                 LIMIT 300`,
                [catalogoIds, de],
            )
            : [[] as RowDataPacket[]];
        for (const i of itensFora) {
            const dia = String(i.saiuEm);
            const nome = String(i.nome ?? '').slice(0, 60);
            if (!nome) continue;
            // Casa pelo DIA com os títulos que o log gerou. Se o log não
            // registrou nada naquele dia (registro antigo demais), o item
            // entra sozinho — melhor aparecer sem contagem do que sumir.
            const alvos = ['Item arquivado', 'Item desativado', 'Item marcado como indisponível'];
            const achou = alvos.find(t => grupos.has(`${dia}|cardapio|${t}`));
            if (achou) {
                const g = grupos.get(`${dia}|cardapio|${achou}`)!;
                if (g.exemplos.length < 6 && !g.exemplos.includes(nome)) g.exemplos.push(nome);
            } else {
                registrar(dia, 'cardapio', num(i.arquivado) === 1 ? 'Item arquivado' : 'Item desativado', 'negativo', 'sistema', '', nome);
            }
        }

        // ── resposta ─────────────────────────────────────────────────────
        const eventos: EventoHistorico[] = [...grupos.values()]
            .map(g => ({
                dia: g.dia,
                tipo: g.tipo,
                titulo: g.titulo,
                quantidade: g.quantidade,
                impacto: g.impacto,
                quem: g.quens.size > 1 ? ('misto' as const) : ([...g.quens][0] ?? 'sistema'),
                detalhe: g.detalhes.join(' · '),
                exemplos: g.exemplos,
                autores: [...g.autores].slice(0, 3),
            }))
            .sort((a, b) => (a.dia === b.dia ? a.tipo.localeCompare(b.tipo) : b.dia.localeCompare(a.dia)));

        const porTipo: Record<string, number> = {};
        for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + e.quantidade;

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estab: { id: num(estab.id), nome: String(estab.nome), cidade: String(estab.cidade), delivery: num(estab.delivery) },
                janela: { de, ate: hoje, meses },
                serie,
                eventos,
                resumo: {
                    totalEventos: eventos.reduce((s, e) => s + e.quantidade, 0),
                    porTipo,
                    negativos: eventos.filter(e => e.impacto === 'negativo').reduce((s, e) => s + e.quantidade, 0),
                    pelaLoja: eventos.filter(e => e.quem === 'loja' || e.quem === 'misto').reduce((s, e) => s + e.quantidade, 0),
                },
                fontes: {
                    /** Primeira alteração registrada desta loja dentro da janela. */
                    logDesde,
                    /** Bateu no teto: há mais mudanças do que couberam. */
                    logTruncado,
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
