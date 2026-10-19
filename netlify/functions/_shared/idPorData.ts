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
 * ── Por que a margem não é frescura ──────────────────────────────────────
 * A interpolação erra quando o volume muda de ritmo (mês de pico, migração
 * que inseriu tudo de uma vez). Errar para MAIS é inofensivo: lê algumas
 * dezenas de milhares de linhas a mais e o `WHERE data >= ?` filtra. Errar
 * para MENOS esconderia registro do usuário, e ninguém perceberia. Por isso a
 * margem é generosa e o resultado nunca passa de `MIN(id)`.
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

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function idDesde(
    connection: Connection,
    tabela: string,
    coluna: string,
    alvo: string,
): Promise<number> {
    const ponta = async (ordem: 'ASC' | 'DESC') => {
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

    const [primeiro, ultimo] = await Promise.all([ponta('ASC'), ponta('DESC')]);
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
    return Number.isFinite(estimado) ? Math.max(estimado, primeiro.id) : 0;
}
