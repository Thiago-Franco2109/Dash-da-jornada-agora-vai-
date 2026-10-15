/**
 * Tela de opções. Não fala com a rede direto: manda mensagem pro service
 * worker, que é quem tem o caminho pras functions (mesma razão do painel —
 * ver background.js).
 *
 * A URL do site é editável, mas trocar pra um host que não esteja em
 * `host_permissions` no manifest.json faz o Chrome bloquear o fetch. Por isso
 * o aviso quando o host salvo não é um dos previstos.
 */

const HOSTS_PREVISTOS = ['central-cs-bigou.netlify.app', 'localhost'];

const $ = (id) => document.getElementById(id);

const pedir = (tipo, dados = {}) => new Promise((resolve) => {
    chrome.runtime.sendMessage({ tipo, ...dados }, (resposta) => {
        resolve(chrome.runtime.lastError
            ? { ok: false, error: chrome.runtime.lastError.message }
            : resposta ?? { ok: false, error: 'Sem resposta da extensão.' });
    });
});

function avisar(tipo, texto) {
    $('aviso').innerHTML = texto ? `<p class="aviso ${tipo}">${texto}</p>` : '';
}

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function preencher(select, itens, selecionado, vazio) {
    select.innerHTML = itens.length
        ? itens.map((i) => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('')
        : `<option value="">${esc(vazio)}</option>`;
    if (selecionado && itens.some((i) => i.id === selecionado)) select.value = selecionado;
}

async function carregarQuadros(boardIdSalvo) {
    const resposta = await pedir('boards');
    if (!resposta.ok) {
        $('board').innerHTML = '<option value="">—</option>';
        avisar('erro', resposta.error);
        return;
    }
    preencher($('board'), resposta.boards, boardIdSalvo, 'Nenhum quadro aberto');
    await carregarListas($('board').value);
}

async function carregarListas(boardId, listaSalva) {
    const select = $('lista');
    if (!boardId) {
        select.innerHTML = '<option value="">Escolhe o quadro primeiro</option>';
        return;
    }
    select.innerHTML = '<option value="">Carregando…</option>';
    const resposta = await pedir('board', { boardId });
    if (!resposta.ok) {
        select.innerHTML = '<option value="">—</option>';
        return;
    }
    preencher(
        select,
        [{ id: '', nome: '— sem padrão —' }, ...resposta.listas],
        listaSalva,
        'Quadro sem listas abertas',
    );
}

async function iniciar() {
    const { config, extensaoId } = await pedir('config');
    $('extensao-id').textContent = extensaoId;
    $('base-url').value = config.baseUrl;

    await carregarQuadros(config.boardId);
    await carregarListas($('board').value, config.listaPadraoId);

    $('board').addEventListener('change', () => carregarListas($('board').value));
    $('btn-recarregar').addEventListener('click', () => carregarQuadros($('board').value));

    $('btn-copiar').addEventListener('click', async () => {
        await navigator.clipboard.writeText(extensaoId);
        $('btn-copiar').textContent = 'Copiado';
        setTimeout(() => { $('btn-copiar').textContent = 'Copiar'; }, 1500);
    });

    $('btn-salvar').addEventListener('click', async () => {
        const baseUrl = $('base-url').value.trim().replace(/\/+$/, '');
        let host;
        try {
            host = new URL(baseUrl).host.split(':')[0];
        } catch {
            avisar('erro', 'URL do site inválida.');
            return;
        }

        await chrome.storage.sync.set({
            baseUrl,
            boardId: $('board').value,
            listaPadraoId: $('lista').value,
        });

        const previsto = HOSTS_PREVISTOS.some((h) => host === h || host.endsWith(`.${h}`));
        avisar('ok', previsto
            ? 'Salvo.'
            : `Salvo — mas <code>${esc(host)}</code> não está em <code>host_permissions</code> no manifest.json, então o Chrome vai bloquear as chamadas. Adiciona o host lá e recarrega a extensão.`);
    });
}

iniciar();
