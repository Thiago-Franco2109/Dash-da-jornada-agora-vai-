import type { Connection, RowDataPacket } from 'mysql2/promise';

/**
 * Agregação mensal de ativação de ações na carteira, a partir do banco Bigou.
 *
 * Vive aqui porque DUAS functions dependem dela e não podem divergir:
 *   • `ativacoes-mensal`   — leitura ao vivo
 *   • `snapshot-ativacoes` — congela o mês fechado no Supabase
 * Se o cálculo fosse duplicado, o snapshot deixaria de bater com a tela e
 * ninguém saberia qual dos dois está certo.
 *
 * QUANDO: promoção → `item_catalogo.data_modificacao_status`;
 *         cupom    → `cupom_desconto.data` (criação).
 * QUEM (só promoção): `campanha_promocao.metadata.sucessoDoCliente` = o
 *         checkbox "Sucesso do Cliente" do painel. Marcado = CS ativou.
 */

export interface Split { total: number; cs: number; parceiro: number }

export interface MesAgregado {
    mes: string;
    promo: Split & { parceiros: number };
    cupons: { total: number; parceiros: number };
}

export interface AgregadoMensal {
    series: MesAgregado[];
    porCampanha: { mes: string; campanha: string; total: number; cs: number; parceiro: number }[];
    porCidade: { mes: string; cidade: string; total: number; cs: number; parceiro: number; cupons: number }[];
}

const novoSplit = (): Split => ({ total: 0, cs: 0, parceiro: 0 });

/**
 * @param desde  primeiro dia do mês inicial, 'YYYY-MM-01'
 */
export async function agregarMensal(connection: Connection, desde: string): Promise<AgregadoMensal> {
    // ── marcação "Sucesso do Cliente" por (campanha, parceiro) ──
    // Todas as campanhas, não só as vigentes: a série é histórica.
    const [camps] = await connection.query<RowDataPacket[]>(
        `SELECT id, nome, metadata FROM campanha_promocao`,
    );
    const csPorCampanha = new Map<number, Set<string>>();
    const nomeCampanha = new Map<number, string>();
    for (const cp of camps) {
        const id = Number(cp.id);
        nomeCampanha.set(id, String(cp.nome));
        const marcados = new Set<string>();
        try {
            const m = JSON.parse(String(cp.metadata ?? '{}')) as Record<string, { sucessoDoCliente?: boolean }>;
            for (const [estabId, v] of Object.entries(m)) {
                if (v?.sucessoDoCliente) marcados.add(estabId);
            }
        } catch { /* metadata inválido: campanha fica sem marcação */ }
        csPorCampanha.set(id, marcados);
    }

    // ── PROMOÇÕES: uma linha por (mês, campanha, parceiro) ──
    const [promoRows] = await connection.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(ic.data_modificacao_status, '%Y-%m') AS mes,
                ic.campanha_promocao_id AS camp,
                c.estabelecimento_id AS estab,
                l.nome AS cidade
         FROM item_catalogo ic
         JOIN catalogo c ON c.id = ic.catalogo_id
         JOIN estabelecimento e ON e.id = c.estabelecimento_id
         JOIN localidade l ON l.id = e.localidade_id
         WHERE ic.promocional = 1 AND ic.status = 2 AND e.delivery = 1
           AND ic.campanha_promocao_id IS NOT NULL
           AND ic.data_modificacao_status >= ?
         GROUP BY mes, camp, estab, cidade`,
        [desde],
    );

    // ── CUPONS DE DESTAQUE: uma linha por (mês, parceiro) ──
    const [cupomRows] = await connection.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(cd.data, '%Y-%m') AS mes,
                cd.estabelecimento_id AS estab,
                l.nome AS cidade,
                COUNT(*) AS n
         FROM cupom_desconto cd
         JOIN estabelecimento e ON e.id = cd.estabelecimento_id
         JOIN localidade l ON l.id = e.localidade_id
         WHERE cd.destaque = 1 AND cd.ativo = 1 AND cd.data >= ?
         GROUP BY mes, estab, cidade`,
        [desde],
    );

    type MesAcc = { promo: Split; promoParceiros: Set<string>; cupons: number; cuponsParceiros: Set<string> };
    const porMes = new Map<string, MesAcc>();
    const mesAcc = (mes: string) =>
        porMes.get(mes) ?? porMes.set(mes, { promo: novoSplit(), promoParceiros: new Set(), cupons: 0, cuponsParceiros: new Set() }).get(mes)!;

    const porCampanha = new Map<string, Split>();                     // `${mes}|${campanha}`
    const porCidade = new Map<string, Split & { cupons: number }>();  // `${mes}|${cidade}`
    const cidadeAcc = (k: string) => porCidade.get(k) ?? porCidade.set(k, { ...novoSplit(), cupons: 0 }).get(k)!;

    for (const r of promoRows) {
        const mes = String(r.mes);
        const camp = Number(r.camp);
        const estab = String(r.estab);
        const ehCs = csPorCampanha.get(camp)?.has(estab) ?? false;

        const m = mesAcc(mes);
        m.promo.total++;
        m.promoParceiros.add(estab);
        if (ehCs) m.promo.cs++; else m.promo.parceiro++;

        const kc = `${mes}|${nomeCampanha.get(camp) ?? `#${camp}`}`;
        const c = porCampanha.get(kc) ?? porCampanha.set(kc, novoSplit()).get(kc)!;
        c.total++;
        if (ehCs) c.cs++; else c.parceiro++;

        const cid = cidadeAcc(`${mes}|${String(r.cidade ?? '—')}`);
        cid.total++;
        if (ehCs) cid.cs++; else cid.parceiro++;
    }

    for (const r of cupomRows) {
        const mes = String(r.mes);
        const m = mesAcc(mes);
        m.cupons += Number(r.n);
        m.cuponsParceiros.add(String(r.estab));
        cidadeAcc(`${mes}|${String(r.cidade ?? '—')}`).cupons += Number(r.n);
    }

    // a chave é `${mes}|${nome}`; o nome pode conter '|', então corta no PRIMEIRO
    const partir = (k: string): [string, string] => {
        const i = k.indexOf('|');
        return [k.slice(0, i), k.slice(i + 1)];
    };

    return {
        series: [...porMes.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([mes, m]) => ({
                mes,
                promo: { ...m.promo, parceiros: m.promoParceiros.size },
                cupons: { total: m.cupons, parceiros: m.cuponsParceiros.size },
            })),
        porCampanha: [...porCampanha.entries()].map(([k, v]) => {
            const [mes, campanha] = partir(k);
            return { mes, campanha, total: v.total, cs: v.cs, parceiro: v.parceiro };
        }),
        porCidade: [...porCidade.entries()].map(([k, v]) => {
            const [mes, cidade] = partir(k);
            return { mes, cidade, total: v.total, cs: v.cs, parceiro: v.parceiro, cupons: v.cupons };
        }),
    };
}

/** Primeiro dia do mês, N meses atrás — 'YYYY-MM-01'. */
export function inicioDeNMesesAtras(n: number, hoje = new Date()): string {
    const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** 'YYYY-MM' do mês anterior ao de referência — o último mês FECHADO. */
export function mesFechadoAnterior(hoje = new Date()): string {
    const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
