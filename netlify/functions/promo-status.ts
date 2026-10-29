import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Status dos ITENS promocionais por parceiro e por campanha (read-only).
 *
 * Fonte real: item_catalogo (promocional=1, campanha_promocao_id) → catalogo →
 * estabelecimento. status: 0=rascunho 1=pendente 2=aprovado 3=cancelado.
 *
 * ITEM VIVO vs ITEM MORTO — a distinção que faltava aqui e que a função
 * `acoes-promocionais` já fazia: só `ativo = 1 AND arquivado = 0` aparece no
 * app do cliente. Sem esse filtro a coluna Promoções contava item arquivado
 * como se estivesse no ar (medido no banco de teste em 28/10/2026: metade dos
 * "aprovados" e 91% dos "rascunhos" eram item morto). Agora:
 *   - rascunho/pendente/aprovado contam SÓ item vivo;
 *   - `morto` conta o resto, pra a tela poder dizer "esse já esteve no ar e
 *     caiu" em vez de inventar um verde que o cliente não vê.
 *
 * Retorna:
 *  - porParceiro[estabId][campanha] = { rascunho, pendente, aprovado, morto,
 *      pendenteDias, pendenteDesde }
 *    `pendenteDias` = há quantos dias o item pendente MAIS ANTIGO daquela campanha
 *    está esperando. Item nasce pendente quando o CS cria; sai de pendente quando
 *    alguém aprova (o próprio CS pode aprovar pelo parceiro, depois do ok dele).
 *    Ou seja: é há quantos dias a oferta está pronta esperando a conversa acontecer.
 *    DATEDIFF é calculado NO BANCO de propósito — mysql2 devolve DATETIME como Date
 *    e o JSON.stringify serializa em UTC, então subtrair no front erra ±1 dia no Brasil.
 *  - campanhasPorLocalidade[localidade_id] = [nomes de campanha na cidade]
 *    Vem do `campanha_promocao.config`, que é um JSON chaveado por
 *    localidade_id — é a MESMA lista que o CS vê no CMS ao abrir a campanha.
 *    Antes era inferida dos itens já existentes, o que escondia campanha onde
 *    ninguém da cidade tinha item ainda: 25 das 63 cidades ativas perdiam pelo
 *    menos uma campanha do "sem item" (Leopoldina perdia as duas que tem).
 *  - campanhas = [{ id, nome, imagem }] de TODA campanha vigente. O `id` é o
 *    `campanha_promocao.id`, que é o que monta o link
 *    /campanha/promocao/cadastro/<id>.
 *
 * STOPGAP: protegido por checagem de origem.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const STATUS_NOME: Record<number, 'rascunho' | 'pendente' | 'aprovado'> = { 0: 'rascunho', 1: 'pendente', 2: 'aprovado' };

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
    }
    const origin = checkOrigin(event);
    if (!origin.ok) {
        return { statusCode: origin.status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: origin.error }) };
    }

    const VIGENTE = `ativo = 1
        AND (data_inicio IS NULL OR data_inicio <= NOW())
        AND (data_fim IS NULL OR data_fim >= NOW())`;

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [campanhasVigentes] = await connection.query<RowDataPacket[]>(
            `SELECT id, nome, imagem, config FROM campanha_promocao WHERE ${VIGENTE} ORDER BY nome`,
        );
        const campanhas = campanhasVigentes.map(c => ({
            id: Number(c.id),
            nome: String(c.nome ?? ''),
            // Só o nome do arquivo (ex: "96fce3ed-….png"); o front monta a URL
            // do CDN (ver resolveCapaCampanha). Campanha pode não ter capa.
            imagem: c.imagem ? String(c.imagem) : null,
        }));

        // Campanhas da cidade direto do CMS: as chaves numéricas do `config`
        // são localidade_id (conferido contra `localidade` — 100% das chaves
        // de todas as campanhas vigentes batem). Tudo que estiver aqui e não
        // tiver item do parceiro é "sem item" de verdade, inclusive campanha
        // que ninguém da cidade começou ainda.
        const campanhasPorLoc: Record<string, Set<string>> = {};
        for (const c of campanhasVigentes) {
            const nome = String(c.nome ?? '');
            let cfg: Record<string, unknown> = {};
            try { cfg = JSON.parse(String(c.config ?? '{}')); } catch { /* campanha sem config = sem cidade */ }
            for (const loc of Object.keys(cfg)) {
                if (!/^\d+$/.test(loc)) continue;
                (campanhasPorLoc[loc] ??= new Set()).add(nome);
            }
        }

        // Agrupado no banco: a resposta fica menor que a de antes (uma linha por
        // (estab, campanha, status, vivo) em vez de uma por item).
        //
        // `vivo` separa o que o cliente vê do que já saiu do ar. A data do
        // pendente só olha item vivo: item pendente arquivado não espera
        // ninguém, e ele é quem puxava o "parado há N dias" pra trás.
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT e.localidade_id AS loc, cp.nome AS campanha,
                    c.estabelecimento_id AS estab, ic.status AS st,
                    e.delivery AS del,
                    (ic.ativo = 1 AND ic.arquivado = 0) AS vivo,
                    COUNT(*) AS n,
                    MIN(ic.data_modificacao_status) AS desde,
                    DATEDIFF(NOW(), MIN(ic.data_modificacao_status)) AS dias,
                    SUM(ic.data_modificacao_status IS NULL) AS n_sem_data
             FROM item_catalogo ic
             JOIN catalogo c ON c.id = ic.catalogo_id
             JOIN estabelecimento e ON e.id = c.estabelecimento_id
             JOIN campanha_promocao cp ON cp.id = ic.campanha_promocao_id
             WHERE ic.promocional = 1 AND ic.status IN (0,1,2)
               AND ( e.delivery = 1
                  OR ( e.delivery = 0
                       AND EXISTS (SELECT 1 FROM venda_estabelecimento ve
                                   JOIN venda v ON v.id = ve.venda_id
                                   WHERE ve.estabelecimento_id = e.id
                                     AND v.data_adesao >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) ) )
               AND cp.ativo = 1
               AND (cp.data_inicio IS NULL OR cp.data_inicio <= NOW())
               AND (cp.data_fim IS NULL OR cp.data_fim >= NOW())
             GROUP BY loc, campanha, estab, st, del, vivo`,
        );

        interface Contagem {
            rascunho: number;
            pendente: number;
            aprovado: number;
            /** Itens que existem mas não aparecem no app (arquivado=1 ou ativo=0). */
            morto: number;
            pendenteDias?: number | null;
            pendenteDesde?: string | null;
        }
        const porParceiro: Record<string, Record<string, Contagem>> = {};

        // Diagnóstico: quanto o filtro de item vivo mudou em relação ao que a
        // tela mostrava antes. `itensMortos` é literalmente o que sumiu.
        const faixas: Record<string, number> = { '0-2': 0, '3-6': 0, '7-13': 0, '14-29': 0, '30+': 0 };
        let itensPendentes = 0, pendentesSemData = 0, itensMortos = 0;

        // Separado por delivery pra provar que incluir onboarding é ADITIVO:
        // os números de `delivery = 1` têm que continuar idênticos aos de antes.
        const lancados = new Set<string>(), emOnboarding = new Set<string>();
        let itensPendentesLancados = 0, itensPendentesOnboarding = 0, aprovadosLancados = 0, aprovadosOnboarding = 0;

        for (const r of rows) {
            const estab = String(r.estab);
            const campanha = r.campanha as string;
            const nome = STATUS_NOME[r.st as number];
            if (!nome) continue;
            const ehLancado = Number(r.del) === 1;
            const vivo = Number(r.vivo) === 1;
            const n = Number(r.n);
            (ehLancado ? lancados : emOnboarding).add(estab);

            const p = (porParceiro[estab] ??= {});
            const cc = (p[campanha] ??= { rascunho: 0, pendente: 0, aprovado: 0, morto: 0 });

            if (!vivo) {
                cc.morto += n;
                itensMortos += n;
                continue;
            }
            cc[nome] += n;

            if (nome === 'pendente') {
                if (ehLancado) itensPendentesLancados += n; else itensPendentesOnboarding += n;
                const dias = r.dias == null ? null : Number(r.dias);
                cc.pendenteDias = dias;
                cc.pendenteDesde = r.desde ? new Date(r.desde as string).toISOString() : null;

                itensPendentes += n;
                pendentesSemData += Number(r.n_sem_data ?? 0);
                if (dias != null) {
                    const faixa = dias <= 2 ? '0-2' : dias <= 6 ? '3-6' : dias <= 13 ? '7-13' : dias <= 29 ? '14-29' : '30+';
                    faixas[faixa] += n;
                }
            }
            if (nome === 'aprovado') {
                if (ehLancado) aprovadosLancados += n; else aprovadosOnboarding += n;
            }
        }

        const campanhasPorLocalidade: Record<string, string[]> = {};
        for (const [loc, set] of Object.entries(campanhasPorLoc)) {
            campanhasPorLocalidade[loc] = [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        }

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                campanhas,
                porParceiro,
                campanhasPorLocalidade,
                diagnostico: {
                    itensPendentes,
                    pendentesSemData,
                    itensMortos,
                    pendentesPorFaixaDias: faixas,
                    cidadesComCampanha: Object.keys(campanhasPorLocalidade).length,
                    // Critério de não-regressão: os `*Lancados` têm que bater com
                    // o que era medido antes de incluir onboarding.
                    parceirosLancados: lancados.size,
                    parceirosOnboarding: emOnboarding.size,
                    itensPendentesLancados,
                    itensPendentesOnboarding,
                    aprovadosLancados,
                    aprovadosOnboarding,
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
