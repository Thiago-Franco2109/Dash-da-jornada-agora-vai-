/**
 * Content script: recorte do print e painel de destino.
 *
 * Tudo vive dentro de um shadow root. A extensão roda em qualquer site —
 * iFood, Instagram, painel do parceiro — e sem o shadow DOM o CSS da página
 * entraria no painel (ou o nosso vazaria pra ela). `all: initial` no :host
 * fecha o outro lado, que é a herança de font/color vinda do <html>.
 *
 * Nenhum fetch sai daqui: o content script roda na origem da página, então a
 * chamada pras functions seria cross-origin e esbarraria em CORS. Quem fala
 * com a rede é o service worker (ver background.js).
 */

(() => {
    'use strict';

    const ID_HOSPEDEIRO = 'bigou-promo-trello';
    const ARRASTO_MINIMO = 8; // abaixo disso foi clique sem querer, não recorte

    /**
     * Padrões que o CMS usa quando o card nasce pela página do parceiro —
     * copiados de cards reais do quadro, não inventados:
     *   nome: "28618 - Açaí do Eton"
     *   desc: "[LINK DO ESTABELECIMENTO](…/estabelecimento/cadastro/28618)"
     * Card criado por aqui tem que sair igual, senão quebra o padrão de quem
     * procura no quadro.
     */
    const nomeDeCard = (p) => `${p.id} - ${p.nome}`;
    const linkDoCms = (id) => `[LINK DO ESTABELECIMENTO](https://admin.bigou.com.br/estabelecimento/cadastro/${id})`;

    let hospedeiro = null;
    let raiz = null;
    let gaveta = [];
    let dadosBoard = null;
    let cardEscolhido = null;
    let parceiros = [];
    let parceiroEscolhido = null;
    let boards = [];
    let configSalva = null;

    // ─── Utilitários ────────────────────────────────────────────────────

    const pedir = (tipo, dados = {}) => new Promise((resolve) => {
        chrome.runtime.sendMessage({ tipo, ...dados }, (resposta) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }
            resolve(resposta ?? { ok: false, error: 'Sem resposta da extensão.' });
        });
    });

    /** Busca sem acento e sem caixa: "acai" tem que achar "Açaí". */
    const normalizar = (texto) => (texto || '')
        .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

    /**
     * Cidade do banco e label do quadro não batem no literal: a label às
     * vezes traz a UF ("Santos Dumont - MG") e a cidade não. Tira acento,
     * caixa e o sufixo de UF pra comparar.
     */
    const chaveCidade = (texto) => normalizar(texto)
        .replace(/\s*-\s*(mg|rj|sp|es)$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const formatarTamanho = (bytes) => bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(bytes / 1024)} KB`;

    // ─── Ciclo de vida ──────────────────────────────────────────────────

    const ESTILO = `
    :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: block;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .raiz {
        position: fixed;
        inset: 0;
        font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #e2e8f0;
        --azul: #137fec;
        --borda: #334155;
        --fundo: #0f172a;
    }

    /* ── recorte ── */
    .tela { position: fixed; inset: 0; cursor: crosshair; background: rgba(15, 23, 42, .5); }
    .tela.recortando { background: transparent; }
    .selecao {
        position: fixed;
        border: 1.5px solid var(--azul);
        background: transparent;
        box-shadow: 0 0 0 100vmax rgba(15, 23, 42, .5);
        pointer-events: none;
    }
    .medida {
        position: fixed;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--azul);
        color: #fff;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
        white-space: nowrap;
    }
    .dica {
        position: fixed;
        top: 20px; left: 50%;
        transform: translateX(-50%);
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px;
        border: 1px solid var(--borda);
        border-radius: 999px;
        background: var(--fundo);
        box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
    }
    .dica.oculta { display: none; }
    .sep { width: 1px; height: 14px; background: var(--borda); }
    kbd {
        padding: 1px 5px;
        border: 1px solid var(--borda);
        border-radius: 4px;
        background: #1e293b;
        font: inherit; font-size: 11px;
    }

    /* ── painel ── */
    .ancora { position: fixed; inset: 0; pointer-events: none; }
    .painel {
        position: absolute;
        right: 20px; bottom: 20px;
        width: 360px;
        max-height: calc(100vh - 40px);
        display: flex; flex-direction: column;
        border: 1px solid var(--borda);
        border-radius: 12px;
        background: var(--fundo);
        box-shadow: 0 16px 48px rgba(0, 0, 0, .45);
        pointer-events: auto;
        overflow: hidden;
    }
    header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--borda);
    }
    .titulo { flex: 1; font-weight: 600; font-size: 13px; }
    .corpo { overflow-y: auto; padding: 12px; display: grid; gap: 10px; }
    .previa {
        width: 100%; max-height: 150px;
        object-fit: contain; object-position: center;
        border: 1px solid var(--borda); border-radius: 8px;
        background: #1e293b;
        display: block;
    }
    .meta { color: #94a3b8; font-size: 11px; text-align: center; }

    .abas { display: flex; gap: 4px; padding: 3px; border-radius: 8px; background: #1e293b; }
    .aba {
        flex: 1; padding: 6px; border: 0; border-radius: 6px;
        background: transparent; color: #94a3b8;
        font: inherit; font-weight: 500; cursor: pointer;
    }
    .aba.ativa { background: var(--fundo); color: #f1f5f9; }

    label { display: grid; gap: 4px; font-size: 11px; color: #94a3b8; }
    label.inline {
        display: flex; align-items: center; gap: 7px;
        color: #e2e8f0; font-size: 12px; cursor: pointer;
    }
    label.inline input { width: auto; margin: 0; accent-color: var(--azul); }
    input, textarea, select {
        width: 100%; padding: 7px 9px;
        border: 1px solid var(--borda); border-radius: 7px;
        background: #1e293b; color: #f1f5f9;
        font: inherit;
    }
    input:focus, textarea:focus, select:focus { outline: 2px solid var(--azul); outline-offset: -1px; }
    textarea { resize: vertical; min-height: 54px; }

    button.acao {
        width: 100%; padding: 9px;
        border: 0; border-radius: 8px;
        background: var(--azul); color: #fff;
        font: inherit; font-weight: 600; cursor: pointer;
    }
    button.acao:disabled { opacity: .5; cursor: default; }
    button.acao.secundaria { background: #1e293b; color: #e2e8f0; border: 1px solid var(--borda); font-weight: 500; }
    button.icone {
        width: 24px; height: 24px;
        border: 0; border-radius: 6px;
        background: transparent; color: #94a3b8;
        font: inherit; font-size: 14px; line-height: 1; cursor: pointer;
    }
    button.icone:hover { background: #1e293b; color: #f1f5f9; }

    .gaveta { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); gap: 6px; }
    .item {
        position: relative; aspect-ratio: 1;
        border: 1px solid var(--borda); border-radius: 7px;
        background: #1e293b; overflow: hidden;
    }
    .item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .item .arquivo {
        display: flex; align-items: center; justify-content: center;
        height: 100%; padding: 4px;
        color: #94a3b8; font-size: 10px; text-align: center;
        overflow: hidden; word-break: break-all;
    }
    .item button {
        position: absolute; top: 2px; right: 2px;
        width: 18px; height: 18px;
        border: 0; border-radius: 5px;
        background: rgba(15, 23, 42, .85); color: #e2e8f0;
        font: inherit; font-size: 11px; line-height: 1; cursor: pointer;
    }
    .gaveta-barra { display: flex; align-items: center; gap: 10px; }
    .gaveta-barra .meta { flex: 1; text-align: left; }
    button.elo {
        padding: 0; border: 0; background: transparent; color: #94a3b8;
        font: inherit; font-size: 11px; text-decoration: underline; cursor: pointer;
    }
    button.elo:hover { color: #f1f5f9; }

    .resultados { max-height: 180px; overflow-y: auto; display: grid; gap: 2px; }
    .resultado {
        display: grid; gap: 1px;
        padding: 6px 8px; border: 0; border-radius: 6px;
        background: transparent; color: inherit;
        font: inherit; text-align: left; cursor: pointer;
    }
    .resultado:hover, .resultado.marcado { background: #1e293b; }
    .resultado b { font-weight: 500; }
    .resultado span { color: #94a3b8; font-size: 11px; }

    .escolhido {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 9px; border: 1px solid var(--azul); border-radius: 7px;
        background: rgba(19, 127, 236, .1);
    }
    .escolhido div { flex: 1; min-width: 0; }
    .escolhido b { display: block; font-weight: 500; }
    .escolhido b, .escolhido span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .escolhido span { color: #94a3b8; font-size: 11px; }

    .aviso { padding: 8px 10px; border-radius: 7px; font-size: 12px; }
    .aviso.erro { background: rgba(185, 28, 28, .18); color: #fca5a5; }
    .aviso.ok { background: rgba(22, 101, 52, .22); color: #86efac; }
    .aviso a { color: inherit; font-weight: 600; }
    .vazio { padding: 14px 0; color: #94a3b8; font-size: 12px; text-align: center; }
    [hidden] { display: none !important; }
    `;

    function destruir() {
        document.removeEventListener('keydown', aoTeclar, true);
        hospedeiro?.remove();
        hospedeiro = null;
        raiz = null;
        cardEscolhido = null;
        // A gaveta NÃO é zerada aqui: ela vive no storage justamente pra
        // sobreviver a fechar o painel e trocar de aba.
    }

    function montar() {
        document.getElementById(ID_HOSPEDEIRO)?.remove();
        hospedeiro = document.createElement('div');
        hospedeiro.id = ID_HOSPEDEIRO;
        raiz = hospedeiro.attachShadow({ mode: 'open' });
        // documentElement e não body: em página que ainda não fechou o <body>
        // (ou que o reescreve), o nó solto some junto.
        document.documentElement.appendChild(hospedeiro);
        document.addEventListener('keydown', aoTeclar, true);
    }

    function aoTeclar(evento) {
        if (evento.key !== 'Escape') return;
        evento.preventDefault();
        evento.stopPropagation();
        destruir();
    }

    function desenhar(html) {
        raiz.innerHTML = `<style>${ESTILO}</style><div class="raiz">${html}</div>`;
        return raiz.querySelector('.raiz');
    }

    const $ = (seletor) => raiz.querySelector(seletor);

    // ─── Etapa 1: recorte ───────────────────────────────────────────────

    function iniciarSelecao() {
        if (!hospedeiro) montar();
        cardEscolhido = null;

        desenhar(`
            <div class="tela" id="tela">
                <div class="selecao" id="selecao" hidden></div>
                <div class="medida" id="medida" hidden></div>
            </div>
            <div class="dica" id="dica">
                <span><b>Arraste</b> pra recortar</span>
                <span class="sep"></span>
                <button class="icone" id="btn-tela-toda" style="width:auto;padding:0 8px">Tela toda</button>
                <span class="sep"></span>
                <button class="icone" id="btn-gaveta" hidden style="width:auto;padding:0 8px"></button>
                <span><kbd>Esc</kbd> cancela</span>
            </div>
        `);

        const tela = $('#tela');
        const selecao = $('#selecao');
        const medida = $('#medida');
        let inicio = null;

        const retangulo = (a, b) => ({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            largura: Math.abs(a.x - b.x),
            altura: Math.abs(a.y - b.y),
        });

        const pintar = (r) => {
            Object.assign(selecao.style, {
                left: `${r.x}px`, top: `${r.y}px`,
                width: `${r.largura}px`, height: `${r.altura}px`,
            });
            medida.textContent = `${Math.round(r.largura)} × ${Math.round(r.altura)}`;
            // Acima do recorte por padrão; vai pra dentro quando não cabe em cima.
            const acima = r.y > 26;
            Object.assign(medida.style, {
                left: `${r.x}px`,
                top: `${acima ? r.y - 24 : r.y + 4}px`,
            });
        };

        tela.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            inicio = { x: e.clientX, y: e.clientY };
            tela.classList.add('recortando');
            selecao.hidden = false;
            medida.hidden = false;
            $('#dica').classList.add('oculta');
            pintar(retangulo(inicio, inicio));
        });

        tela.addEventListener('mousemove', (e) => {
            if (!inicio) return;
            pintar(retangulo(inicio, { x: e.clientX, y: e.clientY }));
        });

        tela.addEventListener('mouseup', (e) => {
            if (!inicio) return;
            const r = retangulo(inicio, { x: e.clientX, y: e.clientY });
            inicio = null;
            if (r.largura < ARRASTO_MINIMO || r.altura < ARRASTO_MINIMO) {
                // Clique sem arrasto: volta ao estado inicial em vez de
                // capturar uma tira de 2px.
                tela.classList.remove('recortando');
                selecao.hidden = true;
                medida.hidden = true;
                $('#dica').classList.remove('oculta');
                return;
            }
            capturar(r);
        });

        $('#btn-tela-toda').addEventListener('click', () => {
            capturar({ x: 0, y: 0, largura: window.innerWidth, altura: window.innerHeight });
        });

        // Com a gaveta cheia ele pode querer ir direto publicar (ou juntar o
        // áudio) sem capturar mais nada — sem isto, o único jeito de chegar no
        // painel seria tirando um print que ele não quer.
        pedir('gaveta').then((resposta) => {
            if (!raiz || !resposta.ok || !resposta.gaveta.length) return;
            const botao = $('#btn-gaveta');
            if (!botao) return;
            gaveta = resposta.gaveta;
            botao.textContent = `Gaveta (${gaveta.length})`;
            botao.hidden = false;
            botao.addEventListener('click', abrirPainel);
        });
    }

    async function capturar(rect) {
        // O overlay está por cima da página: se não sumir antes do
        // captureVisibleTab, o print sai com o escurecido e a moldura dentro.
        // Dois rAF seguidos garantem que o navegador já pintou sem ele.
        //
        // O timeout não é zelo: rAF NÃO dispara em aba de fundo. Trocar de aba
        // no instante em que solta o mouse deixaria a captura pendurada pra
        // sempre, com o painel nunca abrindo (reproduzido com document.hidden).
        hospedeiro.style.visibility = 'hidden';
        await new Promise((resolve) => {
            const relogio = setTimeout(resolve, 120);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                clearTimeout(relogio);
                resolve();
            }));
        });

        const resposta = await pedir('capturar', { rect, dpr: window.devicePixelRatio || 1 });
        hospedeiro.style.visibility = '';

        if (!resposta.ok) {
            abrirPainel();
            avisar('erro', resposta.error);
            return;
        }
        gaveta = resposta.gaveta;
        abrirPainel();
    }

    function abrirPainel() {
        desenharPainel();
        // Em paralelo: um não depende do outro, e juntos somem do caminho
        // antes de ele terminar de escolher o destino.
        carregarBoards();
        carregarParceiros();
    }

    // ─── Etapa 2: painel de destino ─────────────────────────────────────

    /** Título da aba vira sugestão de nome — quase sempre é o que ele digitaria. */
    function nomeSugerido() {
        return (document.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    function desenharPainel() {
        desenhar(`
            <div class="ancora">
                <div class="painel">
                    <header>
                        <span class="titulo">Print pro Trello</span>
                        <button class="icone" id="btn-mais" title="Capturar mais um print">＋</button>
                        <button class="icone" id="btn-fechar" title="Fechar (Esc)">✕</button>
                    </header>
                    <div class="corpo">
                        <div class="gaveta" id="gaveta"></div>
                        <div class="gaveta-barra">
                            <span class="meta" id="gaveta-resumo"></span>
                            <button class="elo" id="btn-arquivo">+ arquivo</button>
                            <button class="elo" id="btn-limpar">limpar</button>
                        </div>
                        <input type="file" id="seletor-arquivo" multiple hidden>

                        <label>Comentário (vai junto com os prints)
                            <textarea id="comentario" placeholder="Ex.: parceiro aceitou a promo de 20%"></textarea>
                        </label>

                        <label class="inline">
                            <input type="checkbox" id="concluir" checked>
                            <span>Concluir: data de hoje e marcar como feito</span>
                        </label>

                        <label>Quadro
                            <select id="board"><option value="">Carregando…</option></select>
                        </label>

                        <div class="abas">
                            <button class="aba ativa" data-aba="novo">Card novo</button>
                            <button class="aba" data-aba="existente">Card existente</button>
                        </div>

                        <div data-painel="novo" style="display:grid;gap:10px">
                            <label id="campo-modelo" hidden>Modelo
                                <select id="modelo"><option value="">Carregando…</option></select>
                            </label>
                            <div id="area-parceiro" style="display:grid;gap:6px">
                                <label>Parceiro
                                    <input id="busca-parceiro" placeholder="ID ou nome da loja" autocomplete="off">
                                </label>
                                <div class="resultados" id="resultados-parceiro"></div>
                            </div>

                            <div id="bloco-parceiro" hidden style="display:grid;gap:10px">
                                <div class="escolhido">
                                    <div>
                                        <b id="parceiro-nome"></b>
                                        <span id="parceiro-cidade"></span>
                                    </div>
                                    <button class="icone" id="btn-trocar-parceiro" title="Trocar de parceiro">✕</button>
                                </div>
                                <label>Label da cidade
                                    <select id="label"></select>
                                </label>
                                <button class="acao secundaria" id="btn-criar-label" hidden></button>
                            </div>

                            <label>Nome do card
                                <input id="nome" placeholder="Ex.: 28618 - Açaí do Eton">
                            </label>
                            <label>Lista
                                <select id="lista"><option value="">Carregando…</option></select>
                            </label>
                            <label>Descrição (opcional)
                                <textarea id="descricao" placeholder="Detalhes da promoção"></textarea>
                            </label>
                            <button class="acao" id="btn-criar" disabled>Criar card</button>
                        </div>

                        <div data-painel="existente" hidden style="display:grid;gap:10px">
                            <div id="area-busca" style="display:grid;gap:10px">
                                <label>Buscar card
                                    <input id="busca" placeholder="Nome da loja, campanha…" autocomplete="off">
                                </label>
                                <div class="resultados" id="resultados">
                                    <p class="vazio">Carregando cards…</p>
                                </div>
                            </div>
                            <div id="area-anexo" hidden style="display:grid;gap:10px">
                                <div class="escolhido">
                                    <div>
                                        <b id="escolhido-nome"></b>
                                        <span id="escolhido-lista"></span>
                                    </div>
                                    <button class="icone" id="btn-trocar" title="Escolher outro card">✕</button>
                                </div>
                                <button class="acao" id="btn-anexar">Comentar no card</button>
                            </div>
                        </div>

                        <div id="status"></div>
                    </div>
                </div>
            </div>
        `);

        $('#btn-fechar').addEventListener('click', destruir);
        $('#btn-mais').addEventListener('click', iniciarSelecao);
        $('#btn-arquivo').addEventListener('click', () => $('#seletor-arquivo').click());
        $('#seletor-arquivo').addEventListener('change', aoEscolherArquivos);
        $('#btn-limpar').addEventListener('click', async () => {
            const resposta = await pedir('limparGaveta');
            if (!raiz || !resposta.ok) return;
            gaveta = resposta.gaveta;
            renderizarGaveta();
        });
        renderizarGaveta();

        raiz.querySelectorAll('.aba').forEach((aba) => {
            aba.addEventListener('click', () => {
                raiz.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b === aba));
                raiz.querySelectorAll('[data-painel]').forEach((p) => {
                    p.hidden = p.dataset.painel !== aba.dataset.aba;
                });
            });
        });

        $('#busca').addEventListener('input', (e) => renderizarResultados(e.target.value));
        $('#btn-trocar').addEventListener('click', () => {
            cardEscolhido = null;
            $('#area-anexo').hidden = true;
            $('#area-busca').hidden = false;
            $('#busca').focus();
        });

        $('#board').addEventListener('change', trocarDeQuadro);
        $('#modelo').addEventListener('change', montarDescricao);
        $('#busca-parceiro').addEventListener('input', (e) => renderizarParceiros(e.target.value));
        $('#btn-trocar-parceiro').addEventListener('click', () => escolherParceiro(null));
        $('#btn-criar-label').addEventListener('click', criarLabelDaCidade);
        $('#btn-criar').addEventListener('click', criarCard);

        definirGerado($('#nome'), nomeSugerido());
        montarDescricao();
        $('#btn-anexar').addEventListener('click', anexarEmCard);
    }

    /**
     * Preenche um campo que a gente calcula (nome, descrição) sem pisar no
     * que ele digitou: só reescreve enquanto o valor continuar sendo o texto
     * que nós mesmos pusemos da última vez.
     */
    function definirGerado(campo, texto) {
        if (!campo) return;
        if (campo.value.trim() && campo.value !== campo.dataset.gerado) return;
        campo.value = texto;
        campo.dataset.gerado = texto;
    }

    /**
     * Descrição no formato que o CMS produz: link do estabelecimento na
     * primeira linha, descrição do modelo em seguida. Sem parceiro escolhido
     * não há link do CMS — aí vai o link da página, que pelo menos registra
     * de onde saiu o print.
     */
    function montarDescricao() {
        const modelo = (dadosBoard?.modelos ?? []).find(m => m.id === $('#modelo')?.value);
        const partes = [
            parceiroEscolhido ? linkDoCms(parceiroEscolhido.id) : null,
            modelo?.descricao?.trim() || null,
        ].filter(Boolean);
        if (!parceiroEscolhido) partes.push(location.href);
        definirGerado($('#descricao'), partes.join('\n'));
    }

    // ─── Gaveta ─────────────────────────────────────────────────────────

    function renderizarGaveta() {
        const caixa = $('#gaveta');
        if (!caixa) return;

        caixa.innerHTML = gaveta.length
            ? gaveta.map((i) => `
                <div class="item" title="${esc(i.nome)}">
                    ${i.thumb
                        ? `<img src="${i.thumb}" alt="">`
                        : `<div class="arquivo">${esc(i.nome)}</div>`}
                    <button data-id="${esc(i.id)}" title="Tirar da gaveta">✕</button>
                </div>`).join('')
            : '<p class="vazio">Gaveta vazia — use o ＋ pra capturar.</p>';

        caixa.querySelectorAll('.item button').forEach((botao) => {
            botao.addEventListener('click', async () => {
                const resposta = await pedir('removerItem', { id: botao.dataset.id });
                if (!raiz || !resposta.ok) return;
                gaveta = resposta.gaveta;
                renderizarGaveta();
            });
        });

        const total = gaveta.reduce((soma, i) => soma + i.bytes, 0);
        const plural = gaveta.length === 1 ? 'item' : 'itens';
        $('#gaveta-resumo').textContent = gaveta.length
            ? `${gaveta.length} ${plural} · ${formatarTamanho(total)}`
            : '';
        $('#btn-limpar').hidden = !gaveta.length;

        $('#btn-criar').textContent = gaveta.length ? `Criar card com ${gaveta.length} ${plural}` : 'Criar card';
        $('#btn-anexar').textContent = gaveta.length ? `Comentar no card (${gaveta.length})` : 'Comentar no card';
        $('#btn-criar').disabled = !gaveta.length || !dadosBoard?.listas?.length;
    }

    async function aoEscolherArquivos(evento) {
        const arquivos = [...evento.target.files];
        evento.target.value = ''; // permite reescolher o mesmo arquivo depois
        if (!arquivos.length) return;

        for (const arquivo of arquivos) {
            let base64;
            try {
                base64 = await new Promise((resolve, reject) => {
                    const leitor = new FileReader();
                    // readAsDataURL devolve "data:<tipo>;base64,<dados>" — só o
                    // que vem depois da vírgula interessa pro upload.
                    leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
                    leitor.onerror = () => reject(new Error(`Não consegui ler "${arquivo.name}".`));
                    leitor.readAsDataURL(arquivo);
                });
            } catch (err) {
                avisar('erro', err.message);
                continue;
            }

            const resposta = await pedir('adicionarArquivo', {
                nome: arquivo.name,
                mimeType: arquivo.type || 'application/octet-stream',
                bytes: arquivo.size,
                base64,
            });
            if (!raiz) return;
            if (!resposta.ok) { avisar('erro', resposta.error); continue; }
            gaveta = resposta.gaveta;
        }
        renderizarGaveta();
    }

    // ─── Parceiro ───────────────────────────────────────────────────────

    function renderizarParceiros(termo) {
        const caixa = $('#resultados-parceiro');
        if (!caixa) return;

        const busca = (termo || '').trim();
        if (!busca) { caixa.innerHTML = ''; return; }
        if (!parceiros.length) { caixa.innerHTML = '<p class="vazio">Carregando parceiros…</p>'; return; }

        const alvos = normalizar(busca).split(/\s+/).filter(Boolean);
        const porId = (p) => String(p.id).startsWith(busca);
        const achados = parceiros
            .filter((p) => porId(p) || alvos.every((a) => normalizar(`${p.nome} ${p.cidade ?? ''}`).includes(a)))
            // Quem casou pelo ID vem primeiro: digitar número é busca por ID,
            // não por nome que por acaso tem esse dígito.
            .sort((a, b) => (porId(b) - porId(a)) || a.nome.localeCompare(b.nome))
            .slice(0, 8);

        caixa.innerHTML = achados.length
            ? achados.map((p) => `
                <button class="resultado" data-id="${esc(p.id)}">
                    <b>${esc(p.id)} - ${esc(p.nome)}</b>
                    <span>${esc(p.cidade || 'sem cidade')}</span>
                </button>
            `).join('')
            : '<p class="vazio">Nenhum parceiro ativo com esse texto.</p>';

        caixa.querySelectorAll('.resultado').forEach((botao) => {
            botao.addEventListener('click', () => {
                escolherParceiro(parceiros.find((p) => String(p.id) === botao.dataset.id) || null);
            });
        });
    }

    function escolherParceiro(parceiro) {
        parceiroEscolhido = parceiro;
        $('#area-parceiro').hidden = Boolean(parceiro);
        $('#bloco-parceiro').hidden = !parceiro;

        if (parceiro) {
            $('#parceiro-nome').textContent = nomeDeCard(parceiro);
            $('#parceiro-cidade').textContent = parceiro.cidade || 'sem cidade';
            definirGerado($('#nome'), nomeDeCard(parceiro));
            montarLabels(parceiro.cidade);
        } else {
            $('#busca-parceiro').value = '';
            $('#resultados-parceiro').innerHTML = '';
            definirGerado($('#nome'), nomeSugerido());
            $('#busca-parceiro').focus();
        }
        montarDescricao();
    }

    /**
     * Resolve a cidade do parceiro numa label do quadro. Três casos, e os
     * três acontecem de verdade no quadro de captação:
     *  - uma label casa  → já vem escolhida;
     *  - várias casam    → a mais usada ganha (Muriaé tem 4 labels; a do CMS
     *                      aparece em 179 cards, as outras em 4, 3 e 1);
     *  - nenhuma casa    → 41 das 66 cidades estão nesse caso, e aí aparece o
     *                      botão de criar.
     * As demais labels do quadro continuam no select, pra ele poder pôr
     * qualquer outra (Onboarding, Aceitou…) se quiser.
     */
    function montarLabels(cidade) {
        const select = $('#label');
        const botao = $('#btn-criar-label');
        if (!select) return;

        const todas = dadosBoard?.labels ?? [];
        const chave = chaveCidade(cidade);
        const casam = todas.filter((l) => chave && chaveCidade(l.nome) === chave)
            .sort((a, b) => b.usos - a.usos);
        const outras = todas.filter((l) => !casam.includes(l))
            .sort((a, b) => b.usos - a.usos);

        const opcao = (l) => `<option value="${esc(l.id)}">${esc(l.nome)}${l.usos ? ` · ${l.usos} cards` : ''}</option>`;
        select.innerHTML = [
            ...casam.map(opcao),
            '<option value="">— sem label —</option>',
            ...outras.map(opcao),
        ].join('');
        select.value = casam.length ? casam[0].id : '';

        const faltando = Boolean(chave) && !casam.length;
        botao.hidden = !faltando;
        if (faltando) botao.textContent = `+ criar label «${cidade}»`;
    }

    async function criarLabelDaCidade() {
        const cidade = parceiroEscolhido?.cidade;
        if (!cidade) return;

        await comBotaoOcupado($('#btn-criar-label'), 'Criando…', async () => {
            const resposta = await pedir('criarLabel', { nome: cidade, boardId: $('#board').value });
            if (!raiz) return;
            if (!resposta.ok) { avisar('erro', resposta.error); return; }

            // Entra no quadro já carregado pra aparecer no select na hora, sem
            // precisar refazer o fetch do board inteiro.
            dadosBoard.labels.push({ ...resposta.label, usos: 0 });
            montarLabels(cidade);
            $('#label').value = resposta.label.id;
            avisar('ok', resposta.jaExistia
                ? `A label «${cidade}» já existia no quadro — selecionada.`
                : `Label «${cidade}» criada e selecionada.`);
        });
    }

    async function carregarParceiros() {
        const resposta = await pedir('parceiros');
        if (!raiz) return;
        if (!resposta.ok) {
            const caixa = $('#resultados-parceiro');
            if (caixa) caixa.innerHTML = '<p class="vazio">Não deu pra carregar os parceiros.</p>';
            return;
        }
        parceiros = resposta.parceiros;
        renderizarParceiros($('#busca-parceiro')?.value);
    }

    function avisar(tipo, texto, html = '') {
        const status = $('#status');
        if (!status) return;
        status.innerHTML = texto || html
            ? `<p class="aviso ${tipo}">${texto ? esc(texto) : ''}${html}</p>`
            : '';
    }

    /**
     * Lista de quadros no topo do painel. O quadro das opções é só o padrão,
     * não uma amarra: print de parceiro em queda ou de alta taxa de
     * cancelamento não vai pro mesmo quadro que promoção.
     */
    async function carregarBoards() {
        const [respBoards, respConfig] = await Promise.all([pedir('boards'), pedir('config')]);
        if (!raiz) return;

        configSalva = respConfig.ok ? respConfig.config : null;
        if (!respBoards.ok) {
            $('#board').innerHTML = '<option value="">—</option>';
            avisar('erro', respBoards.error, ' <a href="#" id="link-opcoes">Abrir opções</a>');
            $('#link-opcoes')?.addEventListener('click', (e) => { e.preventDefault(); pedir('abrirOpcoes'); });
            return;
        }

        boards = respBoards.boards;
        $('#board').innerHTML = boards.map((b) => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('')
            || '<option value="">Nenhum quadro aberto</option>';
        if (configSalva?.boardId && boards.some((b) => b.id === configSalva.boardId)) {
            $('#board').value = configSalva.boardId;
        }
        await carregarBoard();
    }

    /** Trocar de quadro invalida listas, modelos, labels E o card escolhido — tudo era do quadro anterior. */
    async function trocarDeQuadro() {
        dadosBoard = null;
        cardEscolhido = null;
        $('#area-busca').hidden = false;
        $('#area-anexo').hidden = true;
        $('#campo-modelo').hidden = true;
        $('#resultados').innerHTML = '<p class="vazio">Carregando cards…</p>';
        $('#lista').innerHTML = '<option value="">Carregando…</option>';
        avisar('', '');
        await carregarBoard();
    }

    async function carregarBoard() {
        const boardId = $('#board')?.value;
        if (!boardId) return;
        const resposta = await pedir('board', { boardId });
        // Ele pode ter fechado o painel (Esc) enquanto o quadro carregava —
        // aí `raiz` já é nulo e não há mais nada pra preencher.
        if (!raiz) return;

        if (!resposta.ok) {
            const select = $('#lista');
            if (select) select.innerHTML = '<option value="">—</option>';
            const lista = $('#resultados');
            if (lista) lista.innerHTML = '<p class="vazio">Não deu pra carregar os cards.</p>';
            avisar('erro', resposta.error, ' <a href="#" id="link-opcoes">Abrir opções</a>');
            $('#link-opcoes')?.addEventListener('click', (e) => {
                e.preventDefault();
                pedir('abrirOpcoes');
            });
            return;
        }

        dadosBoard = resposta;
        const select = $('#lista');
        select.innerHTML = dadosBoard.listas
            .map((l) => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`)
            .join('') || '<option value="">Quadro sem listas abertas</option>';
        // A lista padrão foi escolhida para o quadro padrão — aplicar num
        // quadro diferente escolheria uma lista qualquer sem ele pedir.
        const noQuadroPadrao = configSalva?.boardId === $('#board').value;
        if (noQuadroPadrao && configSalva.listaPadraoId
            && dadosBoard.listas.some((l) => l.id === configSalva.listaPadraoId)) {
            select.value = configSalva.listaPadraoId;
        }

        const modelos = dadosBoard.modelos ?? [];
        // Quadro sem template nenhum: o campo some em vez de ficar vazio.
        $('#campo-modelo').hidden = !modelos.length;
        if (modelos.length) {
            $('#modelo').innerHTML = [
                ...modelos.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`),
                '<option value="">— sem modelo —</option>',
            ].join('');
            // Quadro com um único template: é o modelo da casa, já entra
            // escolhido. Ele vê qual é no select e troca se não for.
            $('#modelo').value = modelos.length === 1 ? modelos[0].id : '';
            $('#campo-modelo').hidden = false;
            montarDescricao();
        }

        // Se ele escolheu o parceiro antes do quadro terminar de carregar, as
        // labels ainda não existiam — refaz o select agora que existem.
        if (parceiroEscolhido) montarLabels(parceiroEscolhido.cidade);

        renderizarGaveta();
        renderizarResultados($('#busca').value);
    }

    function renderizarResultados(termo) {
        const caixa = $('#resultados');
        if (!caixa || !dadosBoard) return;

        const alvos = normalizar(termo).split(/\s+/).filter(Boolean);
        const achados = dadosBoard.cards
            .filter((c) => {
                if (!alvos.length) return true;
                const texto = normalizar(`${c.nome} ${c.listaNome}`);
                return alvos.every((a) => texto.includes(a));
            })
            // Sem busca, o mais recente é o mais provável — é o card que ele
            // acabou de mexer.
            .sort((a, b) => (b.ultimaAtividade || '').localeCompare(a.ultimaAtividade || ''))
            .slice(0, 50);

        if (!achados.length) {
            caixa.innerHTML = `<p class="vazio">${alvos.length ? 'Nenhum card com esse texto.' : 'Quadro sem cards abertos.'}</p>`;
            return;
        }

        caixa.innerHTML = achados.map((c) => `
            <button class="resultado" data-id="${esc(c.id)}">
                <b>${esc(c.nome)}</b>
                <span>${esc(c.listaNome)}</span>
            </button>
        `).join('');

        caixa.querySelectorAll('.resultado').forEach((botao) => {
            botao.addEventListener('click', () => {
                cardEscolhido = dadosBoard.cards.find((c) => c.id === botao.dataset.id) || null;
                if (!cardEscolhido) return;
                $('#escolhido-nome').textContent = cardEscolhido.nome;
                $('#escolhido-lista').textContent = cardEscolhido.listaNome;
                $('#area-busca').hidden = true;
                $('#area-anexo').hidden = false;
                $('#comentario').focus();
            });
        });
    }

    // ─── Etapa 3: envio ─────────────────────────────────────────────────

    async function comBotaoOcupado(botao, rotulo, tarefa) {
        const original = botao.textContent;
        botao.disabled = true;
        botao.textContent = rotulo;
        avisar('', '');
        try {
            await tarefa();
        } finally {
            // Painel fechado no meio do envio: o botão saiu do documento e
            // não há estado pra restaurar (a chamada ao Trello segue e
            // termina normal do lado do service worker).
            if (raiz) {
                botao.disabled = false;
                botao.textContent = original;
            }
        }
    }

    function sucesso(card, mensagem) {
        avisar('ok', `${mensagem} `, `<a href="${esc(card.shortUrl)}" target="_blank" rel="noopener">abrir card ↗</a>`);
    }

    async function criarCard() {
        const nome = $('#nome').value.trim();
        const listaId = $('#lista').value;
        if (!nome) { avisar('erro', 'Dá um nome pro card.'); $('#nome').focus(); return; }
        if (!listaId) { avisar('erro', 'Escolhe a lista de destino.'); return; }
        if (!gaveta.length) { avisar('erro', 'Gaveta vazia — capture um print no ＋.'); return; }

        await comBotaoOcupado($('#btn-criar'), 'Criando…', async () => {
            const resposta = await pedir('criarCard', {
                listaId, nome,
                descricao: $('#descricao').value.trim(),
                modeloId: $('#modelo')?.value || '',
                labelIds: $('#label')?.value ? [$('#label').value] : [],
                comentario: $('#comentario').value,
                concluir: $('#concluir').checked,
            });
            if (!resposta.ok) {
                avisar('erro', resposta.error, resposta.card
                    ? ` <a href="${esc(resposta.card.shortUrl)}" target="_blank" rel="noopener">abrir card ↗</a>` : '');
                return;
            }
            gaveta = [];
            const n = resposta.quantidade;
            sucesso(resposta.card, `Card criado com ${n} ${n === 1 ? 'item' : 'itens'}.`);
        });
        // Fora do comBotaoOcupado de propósito: o `finally` dele devolve o
        // rótulo que o botão tinha ANTES ("Criar card com 5 itens"), que passa
        // a mentir assim que a gaveta esvazia. Recalcular depois corrige.
        if (raiz) renderizarGaveta();
    }

    async function anexarEmCard() {
        if (!cardEscolhido) { avisar('erro', 'Escolhe um card primeiro.'); return; }
        if (!gaveta.length) { avisar('erro', 'Gaveta vazia — capture um print no ＋.'); return; }

        await comBotaoOcupado($('#btn-anexar'), 'Publicando…', async () => {
            const resposta = await pedir('anexarEmCard', {
                cardId: cardEscolhido.id,
                cardNome: cardEscolhido.nome,
                shortUrl: cardEscolhido.shortUrl,
                comentario: $('#comentario').value,
                concluir: $('#concluir').checked,
            });
            if (!resposta.ok) { avisar('erro', resposta.error); return; }
            gaveta = [];
            const n = resposta.quantidade;
            sucesso(resposta.card, `Comentário com ${n} ${n === 1 ? 'item' : 'itens'} publicado.`);
        });
        if (raiz) renderizarGaveta();
    }

    // ─── Entrada ────────────────────────────────────────────────────────

    window.__bigouPromoReiniciar = iniciarSelecao;
    window.__bigouPromoDestruir = destruir;
    iniciarSelecao();
})();
