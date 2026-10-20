import type { Connection, RowDataPacket } from 'mysql2/promise';

/**
 * Um `id` seguramente ANTERIOR à data alvo, para cortar varredura em tabela
 * grande sem índice. Custa DUAS consultas, sempre.
 *
 * ── O problema ───────────────────────────────────────────────────────────
 * Algumas tabelas deste banco não têm índice além da PRIMARY: `log` (2,4M
 * linhas) só tem `PRIMARY(id)` e `admin_id`; `cupom_desconto` (1,4M) não tem
 * índice por `estabelecimento_id`. Qualquer `WHERE data >= ?` nelas varre a
 * tabela inteira — medido: 4.301ms no `log` para devolver 6 linhas.
 *
 * `id` é auto-incremento, então `WHERE id >= X` é range na PRIMARY e resolve.
 * Falta descobrir o X.
 *
 * ── Por que NÃO é busca binária ──────────────────────────────────────────
 * A primeira versão disto fazia busca binária: ~21 passos, cada um lendo uma
 * linha pela PK. Em disco seria instantâneo. Mas o banco é REMOTO e cada ida
 * custa ~133ms de rede — medido, e é latência, não trabalho. Os 21 passos
 * viraram 2,8s e a function ficou mais lenta do que com a varredura.
 *
 * A regra aqui é contar VIAGENS, não linhas. Então: lê as duas pontas da
 * tabela (duas consultas, ambas instantâneas porque saem da PK ordenada),
 * interpola a posição da data alvo supondo crescimento parecido ao longo do
 * tempo, e desconta uma margem folgada.
 *
 * ── Por que a margem não bastava ─────────────────────────────────────────
 * A interpolação erra quando o volume muda de ritmo, e a base INTEIRA mudou
 * de ritmo: ela cresceu. Chutar pela média dos sete anos coloca o alvo antigo
 * à frente de onde ele está de verdade, porque os anos recentes têm muito mais
 * linhas por dia que os antigos.
 *
 * Errar para MENOS é inofensivo: lê algumas dezenas de milhares de linhas a
 * mais e o `WHERE data >= ?` filtra. Errar para MAIS esconde registro do
 * usuário, em silêncio. A margem de 5% cobria janela de um ano e MEDIDA, não
 * cobria janela longa: para `log` em 2023-11-01 a interpolação devolvia
 * id 1.298.827 contra os 975.692 reais — 323 mil linhas que sumiriam da tela
 * sem nenhum aviso. Em `cupom_desconto` o mesmo acontecia a partir de 2022.
 *
 * Por isso a estimativa agora é CONFERIDA: lê a data no id estimado e, se ela
 * já passou do alvo, volta em passos que dobram (5%, 10%, 20%…) até ficar
 * atrás. Cada passo é uma leitura pela PK — barata — e o caso comum (janela
 * curta, estimativa certa) paga uma só. Esgotados os passos, devolve 0: a
 * consulta fica lenta, nunca errada.
 *
 * ⚠️ Vale só para coluna de CRIAÇÃO, que cresce junto com o id. Não use sobre
 * `data_fim` de cupom ou qualquer data que o sistema edite depois.
 *
 * ⚠️ `tabela` e `coluna` entram direto no SQL — identificador não aceita
 * placeholder em MySQL. Só chame com literal escrito no código, nunca com
 * nada que venha da query string.
 */

/** Fração do intervalo de ids descontada como folga da interpolação. */
const MARGEM = 0.05;

/**
 * Quantas vezes o passo pode dobrar antes de desistir. Começando em 5% e
 * dobrando, seis tentativas cobrem 5+10+20+40+80+160% — mais que a tabela
 * inteira, então na prática o laço sempre termina pela conferência.
 */
const MAX_PASSOS = 6;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * As duas pontas de cada tabela, lembradas entre chamadas.
 *
 * São duas idas ao banco (~300ms de latência pura) para descobrir números que
 * não mudam de verdade: a primeira linha é imutável e a última anda alguns
 * milhares de ids por minuto. Uma function que chama `idDesde` para três
 * tabelas paga 0,9s só nisso, e paga de novo a cada troca de janela na tela.
 *
 * Ficar com valor velho não cria risco: quem garante a correção é a
 * conferência lá embaixo, não a estimativa. O TTL curto é só para a
 * interpolação não ficar enviesada numa instância de vida longa.
 */
const PONTAS_TTL_MS = 5 * 60 * 1000;
const pontasMemo = new Map<string, { em: number; valor: [Ponta | null, Ponta | null] }>();

interface Ponta { id: number; data: string }

export async function idDesde(
    connection: Connection,
    tabela: string,
    coluna: string,
    alvo: string,
): Promise<number> {
    const ponta = async (ordem: 'ASC' | 'DESC'): Promise<Ponta | null> => {
        // O filtro de data não é enfeite: `cupom_desconto` tem '0000-00-00'
        // (a data zero do MySQL) na primeira linha, e ela vira NaN em JS. Com
        // `ORDER BY id` o otimizador caminha pela PK e para na primeira linha
        // válida, então isto continua custando uma leitura.
        const [linhas] = await connection.query<RowDataPacket[]>(
            `SELECT id, DATE_FORMAT(\`${coluna}\`, '%Y-%m-%d') AS d
             FROM \`${tabela}\`
             WHERE \`${coluna}\` > '1971-01-01'
             ORDER BY id ${ordem} LIMIT 1`,
        );
        const r = linhas[0];
        return r && FORMATO_DATA.test(String(r.d)) ? { id: Number(r.id), data: String(r.d) } : null;
    };

    const memoKey = `${tabela}.${coluna}`;
    const guardado = pontasMemo.get(memoKey);
    let pontas: [Ponta | null, Ponta | null];
    if (guardado && Date.now() - guardado.em < PONTAS_TTL_MS) {
        pontas = guardado.valor;
    } else {
        pontas = await Promise.all([ponta('ASC'), ponta('DESC')]);
        pontasMemo.set(memoKey, { em: Date.now(), valor: pontas });
    }
    const [primeiro, ultimo] = pontas;
    if (!primeiro || !ultimo || ultimo.id <= primeiro.id) return 0;

    // Alvo fora do intervalo: antes do começo lê tudo; depois do fim, o filtro
    // de data devolveria vazio de qualquer jeito — mas devolver o último id
    // evita varrer a tabela para concluir isso.
    if (alvo <= primeiro.data) return primeiro.id;
    if (alvo >= ultimo.data) return ultimo.id;

    const dia = (d: string) => Date.parse(`${d}T00:00:00Z`);
    const extensao = dia(ultimo.data) - dia(primeiro.data);
    if (extensao <= 0) return primeiro.id;

    const fracao = (dia(alvo) - dia(primeiro.data)) / extensao;
    const faixa = ultimo.id - primeiro.id;
    const estimado = primeiro.id + Math.floor(faixa * fracao) - Math.ceil(faixa * MARGEM);
    // Qualquer NaN que escape vira "sem corte": a consulta fica lenta, nunca
    // errada. Um id NaN iria direto para o SQL e derrubaria a function.
    if (!Number.isFinite(estimado)) return 0;

    /** Data da primeira linha a partir de um id — leitura pela PK, instantânea. */
    const dataNoId = async (id: number): Promise<string | null> => {
        const [linhas] = await connection.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(\`${coluna}\`, '%Y-%m-%d') AS d
             FROM \`${tabela}\`
             WHERE id >= ? AND \`${coluna}\` > '1971-01-01'
             ORDER BY id ASC LIMIT 1`,
            [id],
        );
        const d = linhas[0]?.d;
        return d && FORMATO_DATA.test(String(d)) ? String(d) : null;
    };

    // Conferência: o corte só serve se a linha que ele encontra ainda estiver
    // ATRÁS do alvo. Se já passou, a interpolação cortou dentro da janela e
    // estaria escondendo linhas — volta em passos que dobram até ficar atrás.
    let candidato = Math.max(estimado, primeiro.id);
    let passo = Math.max(Math.ceil(faixa * MARGEM), 1);
    for (let i = 0; i < MAX_PASSOS; i++) {
        if (candidato <= primeiro.id) return primeiro.id;
        const d = await dataNoId(candidato);
        if (d === null || d <= alvo) return candidato;
        candidato -= passo;
        passo *= 2;
    }
    // Estourou os passos (crescimento muito torto): sem corte. Lento, correto.
    return 0;
}
