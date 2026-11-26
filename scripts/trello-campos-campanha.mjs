/**
 * Sincroniza os CAMPOS PERSONALIZADOS do quadro "[SC] Onboarding e Jornada"
 * com as campanhas vigentes no CMS.
 *
 * POR QUE ISTO É UM SCRIPT E NÃO UM PASSO MANUAL
 * Campanha nasce e morre no CMS; campo personalizado é configuração manual do
 * quadro. Em um mês (out→nov/2026) "MÊS DO BIGOU: 12 ANOS" venceu e entrou
 * "Black Friday" — ou seja, a manutenção recorre. Rodar isto de vez em quando
 * é mais barato (e menos esquecível) que lembrar de criar campo à mão.
 *
 * O QUE ELE FAZ
 *  - cria um campo `list` por campanha vigente que ainda não tem campo, com as
 *    três opções padrão (ver OPCOES_PADRAO);
 *  - acrescenta opção faltando em campo que já existe (ex.: "Tudo por 9,99"
 *    tinha só "Ativou");
 *  - NUNCA apaga campo nem opção. Campanha que venceu deixa de ser vigente,
 *    mas o campo guarda o histórico do card — apagar perderia dado.
 *
 * O nome do campo é o nome EXATO da campanha no CMS, pra `campaignIdFromNome`
 * casar os dois lados sem tabela de tradução. Os campos legados ("Super
 * promos", "Tudo por 9,99", "Cupom") são reconhecidos por apelido — ver
 * ALIAS_CAMPO em src/config/trelloCampos.ts.
 *
 * Uso:
 *   node scripts/trello-campos-campanha.mjs            # mostra o que faria
 *   node scripts/trello-campos-campanha.mjs --aplicar  # escreve no quadro
 */
import 'dotenv/config';

const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD = process.env.TRELLO_BOARD_JORNADA || '6ae0afc51c9174f764309711';
const APLICAR = process.argv.includes('--aplicar');

if (!KEY || !TOKEN) {
    console.error('❌ Faltam TRELLO_API_KEY/TRELLO_TOKEN no .env');
    process.exit(1);
}

/**
 * Opções que todo campo de campanha tem que oferecer.
 *
 * As três são estados DIFERENTES e a diferença importa pro painel:
 *  - "Ativou"              → no ar, trabalho feito;
 *  - "Não ofertado"        → ainda não mandei a promo no WhatsApp do parceiro
 *                            pra mostrar como funciona. É TRABALHO PENDENTE,
 *                            continua na conta;
 *  - "Não roda na cidade"  → a campanha não vai ser ofertada nesta praça. É a
 *                            única que SAI da conta, e é o que deixa quem já
 *                            fez tudo que dava fechar em "3/3 no ar".
 *
 * Confundir as duas últimas esconde trabalho: foi o que aconteceu quando o
 * painel leu "Não ofertado" como "não vai acontecer".
 */
const OPCOES_PADRAO = [
    { texto: 'Ativou', cor: 'green' },
    { texto: 'Não ofertado', cor: 'orange' },
    { texto: 'Não roda na cidade', cor: 'black' },
];

/**
 * Campo que já existe no quadro com nome diferente do nome da campanha no CMS.
 * Tem que bater com ALIAS_CAMPO em src/config/trelloCampos.ts.
 */
const ALIAS = {
    'Super promos': 'Super Promos!',
    'Tudo por 9,99': 'Tudo por R$9,99',
};

/** Campo do quadro que não é campanha — não entra na sincronização. */
const NAO_E_CAMPANHA = new Set(['Cupom', 'Experiência do parceiro', 'Aumento %', 'Responsável pela loja', 'Faturamento Mínimo']);

function normalizar(nome) {
    return nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[!?.]+$/g, '').replace(/[^a-z0-9]+/g, '').trim();
}

async function trello(path, { method = 'GET', body } = {}) {
    const url = new URL(`https://api.trello.com/1${path}`);
    url.searchParams.set('key', KEY);
    url.searchParams.set('token', TOKEN);
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Trello ${res.status} em ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
}

// ── 1. campanhas vigentes no CMS (via a Function, que já aplica a regra) ────
const fnUrl = process.env.PROMO_STATUS_URL || 'http://localhost:5210/.netlify/functions/promo-status';
let vigentes;
try {
    const res = await fetch(fnUrl, { headers: { Origin: 'http://localhost' } });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'resposta sem ok');
    vigentes = json.campanhas.map(c => c.nome);
} catch (err) {
    console.error(`❌ Não consegui ler as campanhas vigentes em ${fnUrl}`);
    console.error('   Suba o dev server (npm run dev) ou aponte PROMO_STATUS_URL pro site publicado.');
    console.error('  ', err.message);
    process.exit(1);
}
console.log(`📋 Campanhas vigentes no CMS (${vigentes.length}): ${vigentes.join(', ')}\n`);

// ── 2. campos que o quadro já tem ───────────────────────────────────────────
const campos = await trello(`/boards/${BOARD}/customFields`);
const porCampanha = new Map();   // nome da campanha (CMS) → campo do quadro
for (const c of campos) {
    if (NAO_E_CAMPANHA.has(c.name)) continue;
    porCampanha.set(normalizar(ALIAS[c.name] ?? c.name), c);
}

// ── 3. o que falta ──────────────────────────────────────────────────────────
const criar = [];
const completar = [];
for (const nome of vigentes) {
    const campo = porCampanha.get(normalizar(nome));
    if (!campo) { criar.push(nome); continue; }
    const tem = new Set((campo.options ?? []).map(o => normalizar(o.value.text)));
    const faltando = OPCOES_PADRAO.filter(o => !tem.has(normalizar(o.texto)));
    if (faltando.length) completar.push({ campo, faltando });
}

if (!criar.length && !completar.length) {
    console.log('✅ Nada a fazer: todo campo de campanha vigente existe e tem as três opções.');
    process.exit(0);
}

for (const nome of criar) console.log(`  + criar campo "${nome}" com ${OPCOES_PADRAO.map(o => `"${o.texto}"`).join(' e ')}`);
for (const { campo, faltando } of completar) console.log(`  + opção ${faltando.map(o => `"${o.texto}"`).join(', ')} em "${campo.name}"`);

if (!APLICAR) {
    console.log('\n(simulação — rode com --aplicar pra escrever no quadro)');
    process.exit(0);
}

// ── 4. aplica ───────────────────────────────────────────────────────────────
console.log('');
for (const nome of criar) {
    await trello('/customFields', {
        method: 'POST',
        body: {
            idModel: BOARD,
            modelType: 'board',
            name: nome,
            type: 'list',
            pos: 'bottom',
            display_cardFront: true,
            options: OPCOES_PADRAO.map((o, i) => ({ value: { text: o.texto }, color: o.cor, pos: i + 1 })),
        },
    });
    console.log(`  ✅ campo "${nome}" criado`);
}
for (const { campo, faltando } of completar) {
    for (const o of faltando) {
        await trello(`/customFields/${campo.id}/options`, {
            method: 'POST',
            body: { value: { text: o.texto }, color: o.cor, pos: 'bottom' },
        });
        console.log(`  ✅ opção "${o.texto}" adicionada em "${campo.name}"`);
    }
}
console.log('\n✅ Quadro sincronizado.');
