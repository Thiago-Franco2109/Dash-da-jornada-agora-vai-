/**
 * Service worker da extensão: dono do print e das chamadas de rede.
 *
 * Duas coisas moram aqui e não no content script, por motivos diferentes:
 *
 * 1. `captureVisibleTab` só existe na API de extensão — content script não
 *    alcança.
 * 2. O fetch pras Netlify Functions PRECISA sair daqui. Content script roda
 *    no contexto de origem da página, então a chamada viraria cross-origin e
 *    o navegador exigiria CORS das functions (que não mandam
 *    Access-Control-Allow-Origin). Do service worker, com o host declarado em
 *    `host_permissions`, o Chrome dispensa CORS e nem faz preflight.
 */

const CONFIG_PADRAO = {
    baseUrl: 'https://central-cs-bigou.netlify.app',
    boardId: '',
    listaPadraoId: '',
};

/**
 * Teto do anexo. A function trello-card-anexar corta em 4 MB, mas o corpo
 * chega nela em base64 (+33%) — então o limite real do arquivo é mais baixo.
 * 3,5 MB deixa a folga do base64 dentro dos 6 MB que a Lambda aceita.
 */
const LIMITE_ANEXO_BYTES = Math.round(3.5 * 1024 * 1024);

/**
 * São 1426 parceiros (~85 KB enxutos) e a lista quase não muda — o MySQL que
 * as functions leem já vem com cerca de um dia de atraso do banco real, então
 * segurar por 6h não deixa nada mais velho do que já é. Sem o cache, o painel
 * esperaria ~0,8s toda vez que abrisse.
 */
const CACHE_PARCEIROS_MS = 6 * 60 * 60 * 1000;

/** Páginas onde o Chrome proíbe injetar script — nada a fazer além de avisar. */
function paginaBloqueada(url) {
    if (!url) return true;
    return /^(chrome|edge|brave|about|devtools|view-source|chrome-extension):/i.test(url)
        || /^https:\/\/chromewebstore\.google\.com/i.test(url)
        || /^https:\/\/chrome\.google\.com\/webstore/i.test(url);
}

async function lerConfig() {
    const salvo = await chrome.storage.sync.get(CONFIG_PADRAO);
    return { ...CONFIG_PADRAO, ...salvo, baseUrl: String(salvo.baseUrl || CONFIG_PADRAO.baseUrl).replace(/\/+$/, '') };
}

// ─── Print ──────────────────────────────────────────────────────────────

/**
 * `btoa` direto não aceita o Uint8Array, e `FileReader` (o caminho usual pra
 * base64) não existe em service worker. Daí a conversão manual, em blocos:
 * `String.fromCharCode(...buf)` de uma vez estoura o limite de argumentos da
 * call stack em imagens grandes.
 */
async function blobParaBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const BLOCO = 0x8000;
    let binario = '';
    for (let i = 0; i < bytes.length; i += BLOCO) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOCO));
    }
    return btoa(binario);
}

/**
 * PNG é o formato certo pra captura de tela (texto nítido, sem artefato),
 * mas um recorte grande em tela Retina passa fácil dos 3,5 MB. Quando passa,
 * cai pra JPEG; se ainda passar, vai reduzindo a escala. Só degrada quando
 * precisa — o caso comum sai PNG na resolução original.
 */
async function comprimirSePreciso(canvas) {
    let blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.size <= LIMITE_ANEXO_BYTES) return { blob, tipo: 'image/png', extensao: 'png' };

    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    if (blob.size <= LIMITE_ANEXO_BYTES) return { blob, tipo: 'image/jpeg', extensao: 'jpg' };

    let escala = 0.8;
    for (let tentativa = 0; tentativa < 4 && blob.size > LIMITE_ANEXO_BYTES; tentativa++) {
        const menor = new OffscreenCanvas(
            Math.max(1, Math.round(canvas.width * escala)),
            Math.max(1, Math.round(canvas.height * escala)),
        );
        menor.getContext('2d').drawImage(canvas, 0, 0, menor.width, menor.height);
        blob = await menor.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
        escala *= 0.8;
    }
    return { blob, tipo: 'image/jpeg', extensao: 'jpg' };
}

/**
 * O retângulo chega em pixels de CSS (é o que o content script enxerga), mas
 * `captureVisibleTab` devolve a imagem em pixels físicos. Sem multiplicar
 * pelo devicePixelRatio, o recorte sai no canto errado e pela metade em
 * qualquer tela Retina.
 */
async function capturarRecorte(windowId, rect, dpr) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());

    const x = Math.max(0, Math.round(rect.x * dpr));
    const y = Math.max(0, Math.round(rect.y * dpr));
    const largura = Math.max(1, Math.min(Math.round(rect.largura * dpr), bitmap.width - x));
    const altura = Math.max(1, Math.min(Math.round(rect.altura * dpr), bitmap.height - y));

    const canvas = new OffscreenCanvas(largura, altura);
    canvas.getContext('2d').drawImage(bitmap, x, y, largura, altura, 0, 0, largura, altura);
    bitmap.close();

    const { blob, tipo, extensao } = await comprimirSePreciso(canvas);
    const base64 = await blobParaBase64(blob);
    return {
        base64,
        // O painel mostra a prévia a partir daqui mesmo: o content script não
        // pode receber Blob por mensagem (só JSON), e reencodar lá seria o
        // mesmo trabalho de novo.
        dataUrl: `data:${tipo};base64,${base64}`,
        mimeType: tipo,
        extensao,
        largura,
        altura,
        bytes: blob.size,
    };
}

// ─── Chamadas às functions ──────────────────────────────────────────────

async function chamarFuncao(caminho, { metodo = 'GET', corpo = null, query = null } = {}) {
    const { baseUrl } = await lerConfig();
    const url = new URL(`${baseUrl}/.netlify/functions/${caminho}`);
    if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

    let resposta;
    try {
        resposta = await fetch(url.toString(), {
            method: metodo,
            headers: {
                // Como a extensão se identifica. Daqui do service worker o
                // Chrome não manda `Origin` (não é requisição CORS pra host
                // com host_permissions) e `Origin` é header proibido no
                // fetch, então não dá pra simular — o lado de lá confere este
                // id contra ALLOWED_EXTENSION_IDS (ver _shared/auth.ts).
                'X-Extensao-Id': chrome.runtime.id,
                ...(corpo ? { 'Content-Type': 'application/json' } : {}),
            },
            body: corpo ? JSON.stringify(corpo) : undefined,
        });
    } catch {
        throw new Error(`Não consegui falar com ${url.host}. Confira a URL nas opções da extensão.`);
    }

    const dados = await resposta.json().catch(() => null);

    // Function não publicada volta 200 com o HTML do site, não 404: o
    // netlify.toml tem um redirect catch-all `/*` pro index.html, e caminho de
    // function inexistente cai nele. Sem esse teste o erro apareceria como
    // "200 OK", que não diz nada.
    if (dados === null && resposta.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`A function "${caminho}" não está publicada no site ainda — falta fazer o deploy.`);
    }

    if (!resposta.ok || !dados?.ok) {
        const detalhe = dados?.error || `${resposta.status} ${resposta.statusText}`;
        if (resposta.status === 403) {
            throw new Error(`${detalhe} — falta pôr o ID desta extensão em ALLOWED_EXTENSION_IDS no Netlify (veja as opções).`);
        }
        throw new Error(detalhe);
    }
    return dados;
}

function anexar(cardId, print, nomeArquivo) {
    return chamarFuncao('trello-card-anexar', {
        metodo: 'POST',
        corpo: {
            cardId,
            nome: `${nomeArquivo}.${print.extensao}`,
            mimeType: print.mimeType,
            dataBase64: print.base64,
        },
    });
}

/** Nome do arquivo com a data na frente: no card, os anexos ficam em ordem legível. */
function nomeDoArquivo(prefixo) {
    const agora = new Date();
    const carimbo = [
        agora.getFullYear(),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0'),
    ].join('-') + '_' + [
        String(agora.getHours()).padStart(2, '0'),
        String(agora.getMinutes()).padStart(2, '0'),
    ].join('h');
    const limpo = (prefixo || 'print').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().slice(0, 40) || 'print';
    return `${carimbo}_${limpo}`;
}

// ─── Roteamento das mensagens do painel ─────────────────────────────────

const acoes = {
    async config() {
        const config = await lerConfig();
        return { config, extensaoId: chrome.runtime.id };
    },

    /**
     * `boardId` explícito existe pra tela de opções, que precisa das listas de
     * um quadro ANTES de ele virar o quadro salvo. O painel não manda nada e
     * cai no que está na config.
     */
    async board({ boardId }) {
        const config = await lerConfig();
        const alvo = boardId || config.boardId;
        if (!alvo) throw new Error('Nenhum quadro escolhido ainda. Abra as opções da extensão e escolha um.');
        return chamarFuncao('trello-board-conteudo', { query: { boardId: alvo } });
    },

    async boards() {
        return chamarFuncao('trello-boards');
    },

    // `chrome.runtime.openOptionsPage` não existe em content script — por isso
    // o painel pede por mensagem em vez de chamar direto.
    async abrirOpcoes() {
        await chrome.runtime.openOptionsPage();
        return {};
    },

    async capturar({ rect, dpr }, remetente) {
        return { print: await capturarRecorte(remetente.tab.windowId, rect, dpr) };
    },

    /**
     * Índice id→nome→cidade dos parceiros ativos, servido do cache quando
     * ainda está fresco. `forcar: true` ignora o cache (botão de recarregar).
     */
    async parceiros({ forcar }) {
        const { cacheParceiros } = await chrome.storage.local.get('cacheParceiros');
        if (!forcar && cacheParceiros && Date.now() - cacheParceiros.quando < CACHE_PARCEIROS_MS) {
            return { parceiros: cacheParceiros.dados, doCache: true };
        }

        const { data } = await chamarFuncao('parceiros-ativos');
        // Só os três campos que o painel usa: o resto da linha (uid,
        // localidadeId, cardapioDigital) dobraria o tamanho guardado à toa.
        const dados = data.map(p => ({ id: p.id, nome: p.nome, cidade: p.cidade }));
        await chrome.storage.local.set({ cacheParceiros: { quando: Date.now(), dados } });
        return { parceiros: dados, doCache: false };
    },

    async criarLabel({ nome, boardId }) {
        const alvo = boardId || (await lerConfig()).boardId;
        if (!alvo) throw new Error('Nenhum quadro escolhido ainda.');
        return chamarFuncao('trello-label-criar', { metodo: 'POST', corpo: { boardId: alvo, nome } });
    },

    async criarCard({ listaId, nome, descricao, modeloId, labelIds, print }) {
        const { card } = await chamarFuncao('trello-card-criar', {
            metodo: 'POST',
            corpo: { listaId, nome, descricao, modeloId, labelIds },
        });
        // Card já existe neste ponto: se o anexo falhar, o erro sobe mas o
        // link do card vai junto, pra ele não ficar sem saber o que foi criado.
        try {
            await anexar(card.id, print, nomeDoArquivo(nome));
        } catch (err) {
            throw Object.assign(new Error(`Card criado, mas o print não subiu: ${err.message}`), { card });
        }
        return { card };
    },

    async anexarEmCard({ cardId, cardNome, shortUrl, comentario, print }) {
        await anexar(cardId, print, nomeDoArquivo(cardNome));
        if (comentario?.trim()) {
            await chamarFuncao('trello-card-comentar', {
                metodo: 'POST',
                corpo: { cardId, texto: comentario.trim(), acao: 'criar' },
            });
        }
        return { card: { id: cardId, nome: cardNome, shortUrl } };
    },
};

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    const acao = acoes[mensagem?.tipo];
    if (!acao) return false;

    acao(mensagem, remetente)
        .then(dados => responder({ ok: true, ...dados }))
        .catch(err => responder({ ok: false, error: err.message, card: err.card ?? null }));

    return true; // mantém o canal aberto pro responder assíncrono
});

// ─── Clique no ícone ────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
    if (paginaBloqueada(tab.url)) {
        chrome.action.setBadgeText({ text: '✕', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#b91c1c', tabId: tab.id });
        setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2500);
        return;
    }

    // Injetar de novo por cima de uma sessão aberta criaria dois overlays. O
    // content script expõe `__bigouPromoReiniciar` quando já está rodando;
    // se a chamada passar, ele mesmo se reinicia e não injetamos nada.
    const [{ result: jaRodando } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (typeof window.__bigouPromoReiniciar === 'function') {
                window.__bigouPromoReiniciar();
                return true;
            }
            return false;
        },
    });
    if (jaRodando) return;

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selecao.js'] });
});
