import type { Connection, RowDataPacket } from 'mysql2/promise';

/**
 * Ativação de campanhas por DIA (não por mês) — base pro widget "meu ritmo de
 * ativações" do perfil do gestor. Mesmas tabelas/joins de `ativacoesMensal.ts`,
 * só que agrupado por dia + dia da semana em vez de mês, e sem o corte CS vs
 * parceiro (aqui não importa quem ativou, só quando e em qual cidade).
 *
 * QUANDO: promoção → `item_catalogo.data_modificacao_status` (só a ÚLTIMA
 * mudança de status — dias antigos "encolhem" se o item for mexido de novo,
 * ver ativacoesMensal.ts); cupom → `cupom_desconto.data` (criação).
 *
 * Sem filtro de manager/gestor aqui: essa função não sabe de gestor, só de
 * cidade — quem chama filtra por cidade (ver `cityBelongsToManager` no front).
 */

export interface AtivacaoDiaria {
    /** 'YYYY-MM-DD' */
    dia: string;
    /** WEEKDAY() do MySQL: 0=segunda .. 6=domingo */
    dow: number;
    cidade: string;
    promo: number;
    cupom: number;
}

/**
 * @param desde 'YYYY-MM-DD' — limite inferior (inclusive). Sem isso, a query
 * varre item_catalogo/cupom_desconto inteiros a cada chamada, e o custo só
 * cresce com o tempo (mesmo motivo que fez os endpoints irmãos limitarem
 * janela: ver `windowDays` em ativacoes-campanhas.ts e `desde` em
 * ativacoesMensal.ts).
 */
export async function agregarDiario(connection: Connection, desde: string): Promise<AtivacaoDiaria[]> {
    const [promoRows] = await connection.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(ic.data_modificacao_status, '%Y-%m-%d') AS dia,
                WEEKDAY(ic.data_modificacao_status) AS dow,
                l.nome AS cidade,
                COUNT(*) AS n
         FROM item_catalogo ic
         JOIN catalogo c ON c.id = ic.catalogo_id
         JOIN estabelecimento e ON e.id = c.estabelecimento_id
         JOIN localidade l ON l.id = e.localidade_id
         WHERE ic.promocional = 1 AND ic.status = 2 AND e.delivery = 1
           AND ic.campanha_promocao_id IS NOT NULL
           AND ic.data_modificacao_status >= ?
         GROUP BY dia, dow, cidade`,
        [desde],
    );

    const [cupomRows] = await connection.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(cd.data, '%Y-%m-%d') AS dia,
                WEEKDAY(cd.data) AS dow,
                l.nome AS cidade,
                COUNT(*) AS n
         FROM cupom_desconto cd
         JOIN estabelecimento e ON e.id = cd.estabelecimento_id
         JOIN localidade l ON l.id = e.localidade_id
         WHERE cd.destaque = 1 AND cd.ativo = 1
           AND cd.data >= ?
         GROUP BY dia, dow, cidade`,
        [desde],
    );

    const porChave = new Map<string, AtivacaoDiaria>();
    const linha = (dia: string, dow: number, cidade: string): AtivacaoDiaria => {
        const chave = `${dia}|${cidade}`;
        let v = porChave.get(chave);
        if (!v) {
            v = { dia, dow, cidade, promo: 0, cupom: 0 };
            porChave.set(chave, v);
        }
        return v;
    };

    for (const r of promoRows) linha(String(r.dia), Number(r.dow), String(r.cidade)).promo += Number(r.n);
    for (const r of cupomRows) linha(String(r.dia), Number(r.dow), String(r.cidade)).cupom += Number(r.n);

    return [...porChave.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
