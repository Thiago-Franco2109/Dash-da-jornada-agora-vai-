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

    let hospedeiro = null;
    let raiz = null;
    let print = null;
    let dadosBoard = null;
    let cardEscolhido = null;

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
    button.icone {
        width: 24px; height: 24px;
        border: 0; border-radius: 6px;
        background: transparent; color: #94a3b8;
        font: inherit; font-size: 14px; line-height: 1; cursor: pointer;
    }
    button.icone:hover { background: #1e293b; color: #f1f5f9; }

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
        print = null;
        cardEscolhido = null;
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
        print = null;
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
    }

    async function capturar(rect) {
        // O overlay está por cima da página: se não sumir antes do
        // captureVisibleTab, o print sai com o escurecido e a moldura dentro.
        // Dois rAF seguidos garantem que o navegador já pintou sem ele.
        hospedeiro.style.visibility = 'hidden';
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const resposta = await pedir('capturar', { rect, dpr: window.devicePixelRatio || 1 });
        hospedeiro.style.visibility = '';

        if (!resposta.ok) {
            desenharPainel();
            avisar('erro', resposta.error);
            return;
        }
        print = resposta.print;
        desenharPainel();
        carregarBoard();
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
                        <button class="icone" id="btn-refazer" title="Refazer o recorte">⟳</button>
                        <button class="icone" id="btn-fechar" title="Fechar (Esc)">✕</button>
                    </header>
                    <div class="corpo">
                        ${print ? `
                            <img class="previa" id="previa" alt="Prévia do recorte">
                            <p class="meta">${print.largura} × ${print.altura} · ${formatarTamanho(print.bytes)}</p>
                        ` : ''}

                        <div class="abas">
                            <button class="aba ativa" data-aba="novo">Card novo</button>
                            <button class="aba" data-aba="existente">Card existente</button>
                        </div>

                        <div data-painel="novo" style="display:grid;gap:10px">
                            <label>Nome do card
                                <input id="nome" value="${esc(nomeSugerido())}" placeholder="Ex.: Promo de outubro — Açaí do Zé">
                            </label>
                            <label>Lista
                                <select id="lista"><option value="">Carregando…</option></select>
                            </label>
                            <label>Descrição (opcional)
                                <textarea id="descricao" placeholder="Detalhes da promoção">${esc(location.href)}</textarea>
                            </label>
                            <button class="acao" id="btn-criar" disabled>Criar card com o print</button>
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
                                <label>Comentário (opcional)
                                    <textarea id="comentario" placeholder="Some um recado junto do print"></textarea>
                                </label>
                                <button class="acao" id="btn-anexar">Anexar o print</button>
                            </div>
                        </div>

                        <div id="status"></div>
                    </div>
                </div>
            </div>
        `);

        // src por propriedade, não no HTML: o data: URL do print é grande e
        // não precisa passar por serialização de atributo.
        if (print) $('#previa').src = print.dataUrl;

        $('#btn-fechar').addEventListener('click', destruir);
        $('#btn-refazer').addEventListener('click', iniciarSelecao);

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

        $('#btn-criar').addEventListener('click', criarCard);
        $('#btn-anexar').addEventListener('click', anexarEmCard);
    }

    function avisar(tipo, texto, html = '') {
        const status = $('#status');
        if (!status) return;
        status.innerHTML = texto || html
            ? `<p class="aviso ${tipo}">${texto ? esc(texto) : ''}${html}</p>`
            : '';
    }

    async function carregarBoard() {
        const resposta = await pedir('board');
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
        const { config } = await pedir('config');
        if (!raiz) return;

        const select = $('#lista');
        select.innerHTML = dadosBoard.listas
            .map((l) => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`)
            .join('') || '<option value="">Quadro sem listas abertas</option>';
        if (config?.listaPadraoId && dadosBoard.listas.some((l) => l.id === config.listaPadraoId)) {
            select.value = config.listaPadraoId;
        }

        $('#btn-criar').disabled = !dadosBoard.listas.length || !print;
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
        if (!print) { avisar('erro', 'Sem print — refaz o recorte no ⟳.'); return; }

        await comBotaoOcupado($('#btn-criar'), 'Criando…', async () => {
            const resposta = await pedir('criarCard', {
                listaId, nome, descricao: $('#descricao').value.trim(), print,
            });
            if (!resposta.ok) {
                avisar('erro', resposta.error, resposta.card
                    ? ` <a href="${esc(resposta.card.shortUrl)}" target="_blank" rel="noopener">abrir card ↗</a>` : '');
                return;
            }
            sucesso(resposta.card, 'Card criado com o print.');
        });
    }

    async function anexarEmCard() {
        if (!cardEscolhido) { avisar('erro', 'Escolhe um card primeiro.'); return; }
        if (!print) { avisar('erro', 'Sem print — refaz o recorte no ⟳.'); return; }

        await comBotaoOcupado($('#btn-anexar'), 'Anexando…', async () => {
            const resposta = await pedir('anexarEmCard', {
                cardId: cardEscolhido.id,
                cardNome: cardEscolhido.nome,
                shortUrl: cardEscolhido.shortUrl,
                comentario: $('#comentario').value,
                print,
            });
            if (!resposta.ok) { avisar('erro', resposta.error); return; }
            sucesso(resposta.card, 'Print anexado.');
        });
    }

    // ─── Entrada ────────────────────────────────────────────────────────

    window.__bigouPromoReiniciar = iniciarSelecao;
    window.__bigouPromoDestruir = destruir;
    iniciarSelecao();
})();
