import type { Handler } from '@netlify/functions';
import type { RowDataPacket } from 'mysql2';
import { getConnection } from './_shared/db';
import { checkOrigin } from './_shared/auth';

/**
 * Como o LOJISTA acessa o painel: computador ou celular, e quando foi a última vez.
 *
 * Caminho real (verificado no banco):
 *   usuario_estabelecimento (estabelecimento_id → usuario_id)
 *     → session (usuario_id, client_id, dispositivo, data)
 *       → client (nomeia o app)
 *
 * ⚠️ `session.data` é a hora do LOGIN, não do uso. A sessão do painel fica viva por meses e
 * é renovada em `session.data_atualizacao` a cada atividade — então o último acesso sai de
 * `data_atualizacao`, nunca de `data`. Usando `data` o Hadassa Salgados (28543) aparecia
 * "sem acessar há 26 dias" enquanto vendia todo dia (atividade real: 1 dia). O erro afetava
 * todo mundo: D'Gusta marcava 752 dias de sumiço e estava usando o painel no mesmo dia.
 *
 * Por consequência, a contagem de sessões conta LOGINS, não visitas: 3 logins num ano é o
 * normal de quem nunca desloga. Serve pra medir dispositivo (cada login traz um user-agent),
 * não pra medir engajamento — a UI precisa dizer "logins", não "acessos".
 *
 * `session.dispositivo` guarda o user-agent JÁ PARSEADO pelo backend, no formato
 * "<Browser> <versão> / <SO> <versão>" — ex: "Chrome Mobile 149.0.0 / Android 0.0.0",
 * "Mobile Safari UI/WKWebView 0.0.0 / iOS 18.6.2". Cobertura de 100% nos apps de gestão
 * (zero nulos); quem tem nulo é sessão antiga do app do cliente final.
 *
 * ⚠️ Só contam os apps de GESTÃO (CLIENTS_GESTAO). O mesmo usuário aparece em
 * `app delivery` e `site` quando o dono da loja pede comida pelo app — isso é consumo,
 * não gestão, e contaminaria a resposta.
 *
 * ⚠️ `admin` é a equipe interna da Bigou (tem `token_trello`, `localidades`), NÃO o lojista.
 * Sessão de admin usa `admin_id`; a do lojista usa `usuario_id`.
 *
 * ⚠️ Um usuário pode responder por VÁRIAS lojas (rede/grupo), então juntar direto com
 * usuario_estabelecimento multiplicaria as sessões. Os donos saem numa query à parte e entram
 * como lista literal: além de não multiplicar, evita o `IN (subquery)`, que no MySQL 5.5 vira
 * DEPENDENT SUBQUERY e roda uma vez por linha de `session` (3021ms → ~200ms no mesmo parceiro).
 *
 * ⚠️ O dispositivo é apurado sobre o HISTÓRICO INTEIRO, não sobre uma janela: "esse lojista
 * usa computador ou celular" é característica estável, e janela curta joga fora quase todo
 * mundo. Cobertura medida nas 1.419 lojas delivery ativas, já sem o Suporte Bigou:
 * 90 dias → 42% · 180 → 64% · 365 → 79% · histórico → 95%. `dias` recorta só a contagem
 * de sessões RECENTES, que serve de contexto ("ainda usa?"), não a classificação.
 *
 * Query params:
 *   ?estabId=16611   → obrigatório
 *   ?dias=90         → janela só da contagem de sessões recentes (padrão 90, máx 365)
 *
 * STOPGAP: protegido por checagem de origem (ver _shared/auth.ts).
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** client.id dos apps em que o lojista ADMINISTRA a loja. 4/6 são consumo, 2 é equipe Bigou. */
const CLIENTS_GESTAO = [3, 5, 8];
/** Sem abrir o painel por mais que isso, o parceiro vira alerta. */
const DIAS_SUMIDO = 30;
/**
 * Acima disso o "dono" não é lojista, é conta de sistema — e precisa sair da conta.
 *
 * O usuário 5630 ("Suporte Bigou", suporte@bigou.com.br) está vinculado a 7.468 lojas,
 * então ele aparece como dono de QUALQUER parceiro. Sem este filtro as sessões do suporte
 * dominavam o resultado e dois parceiros diferentes devolviam números idênticos —
 * a tela estaria medindo a equipe da Bigou, não o lojista.
 *
 * O corte é por limiar e não pelo id 5630 porque uma conta de suporte nova cairia no mesmo
 * problema. 100 é folgado: no dado real o segundo colocado tem 60 lojas e é pessoa física
 * (dono de rede), que deve continuar contando.
 */
const MAX_LOJAS_POR_DONO = 100;

/** O user-agent parseado marca mobile no browser ("Mobile Safari") ou no SO ("Android", "iOS"). */
function ehCelular(dispositivo: string): boolean {
    return /mobile|android|iphone|ipad|ios/i.test(dispositivo);
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
    const dias = Math.min(Math.max(Number(q.dias) || 90, 7), 365);

    let connection;
    const started = Date.now();
    try {
        connection = await getConnection();

        const [donoRows] = await connection.query<RowDataPacket[]>(
            `SELECT DISTINCT ue.usuario_id
             FROM usuario_estabelecimento ue
             WHERE ue.estabelecimento_id = ?
               AND (SELECT COUNT(DISTINCT x.estabelecimento_id)
                    FROM usuario_estabelecimento x
                    WHERE x.usuario_id = ue.usuario_id) <= ?`,
            [estabId, MAX_LOJAS_POR_DONO],
        );
        const donos = donoRows.map(r => Number(r.usuario_id)).filter(Number.isFinite);

        // Sem nenhum usuário vinculado não há o que consultar — e um `IN ()` vazio é erro de
        // sintaxe no MySQL, então sair aqui também protege a query abaixo.
        if (donos.length === 0) {
            return {
                statusCode: 200,
                headers: jsonHeaders,
                body: JSON.stringify({
                    ok: true, estabId, janelaDias: dias, totalSessoes: 0, celular: 0, computador: 0,
                    pctCelular: 0, predominante: null, porApp: {}, ultimoAcesso: null,
                    diasSemAcesso: null, sumido: false, nuncaAcessou: true,
                    tookMs: Date.now() - started,
                }),
            };
        }

        // Uma query só: agrupa por dispositivo (poucas strings distintas por parceiro) e já
        // devolve, por grupo, a última data e quantas sessões caem na janela recente.
        // A classificação mobile/desktop fica em JS — legível e testável, em vez de um CASE
        // gigante no SQL. DATEDIFF sai do banco de propósito: mysql2 devolve DATETIME como
        // Date e o JSON.stringify serializa em UTC, então subtrair no front erra ±1 dia aqui.
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT c.nome AS app,
                    IFNULL(s.dispositivo, '') AS dispositivo,
                    COUNT(*)                  AS sessoes,
                    SUM(s.data_atualizacao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) AS sessoesRecentes,
                    MAX(s.data_atualizacao)                   AS ultima,
                    DATEDIFF(NOW(), MAX(s.data_atualizacao))  AS diasAtras
             FROM session s
             JOIN client c ON c.id = s.client_id
             WHERE s.client_id IN (?)
               AND s.usuario_id IN (?)
             GROUP BY c.nome, s.dispositivo`,
            [dias, CLIENTS_GESTAO, donos],
        );

        let celular = 0;
        let computador = 0;
        let recentes = 0;
        let diasSemAcesso: number | null = null;
        let ultimoAcesso: string | null = null;
        const porApp: Record<string, { celular: number; computador: number }> = {};

        for (const r of rows) {
            const n = Number(r.sessoes ?? 0);
            const app = String(r.app ?? '—');
            const movel = ehCelular(String(r.dispositivo ?? ''));
            porApp[app] ??= { celular: 0, computador: 0 };
            if (movel) { celular += n; porApp[app].celular += n; }
            else { computador += n; porApp[app].computador += n; }
            recentes += Number(r.sessoesRecentes ?? 0);

            // O acesso mais recente é o MENOR "dias atrás" entre os grupos (data_atualizacao).
            const d = r.diasAtras == null ? null : Number(r.diasAtras);
            if (d != null && (diasSemAcesso == null || d < diasSemAcesso)) {
                diasSemAcesso = d;
                ultimoAcesso = r.ultima ?? null;
            }
        }

        const totalSessoes = celular + computador;

        return {
            statusCode: 200,
            headers: jsonHeaders,
            body: JSON.stringify({
                ok: true,
                estabId,
                janelaDias: dias,
                totalSessoes,
                sessoesRecentes: recentes,
                /** Deixa explícito pra UI: o número acima são logins, não visitas ao painel. */
                sessoesSaoLogins: true,
                celular,
                computador,
                pctCelular: totalSessoes > 0 ? Math.round((100 * celular) / totalSessoes) : 0,
                predominante: totalSessoes === 0 ? null : (celular > computador ? 'celular' : 'computador'),
                porApp,
                ultimoAcesso,
                diasSemAcesso,
                sumido: diasSemAcesso != null && diasSemAcesso > DIAS_SUMIDO,
                nuncaAcessou: totalSessoes === 0,
                tookMs: Date.now() - started,
            }),
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parceiro-acesso] erro:', msg);
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: msg }) };
    } finally {
        if (connection) await connection.end().catch(() => { /* conexão já caiu */ });
    }
};
