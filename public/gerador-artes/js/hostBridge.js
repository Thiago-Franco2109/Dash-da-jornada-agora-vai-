// Ponte aditiva entre o dashboard (host) e este gerador, via postMessage.
// Não modifica nenhum fluxo existente (CSV em massa, editor, Geração Avulsa manual).
// Protocolo:
//   host -> iframe: {type:'bigou:list-templates'}
//   iframe -> host: {type:'bigou:templates', templates:[{id,name}]}
//   host -> iframe: {type:'bigou:generate', templateId, row}
//   iframe -> host: {type:'bigou:result', feedDataUrl, storyDataUrl} | {type:'bigou:error', message}
(function () {
    // Pré-carrega as fontes do template "Nova ID" (bundled via @font-face em index.html).
    // Sem isso, `document.fonts.ready` (aguardado em canvasRenderer.js) pode resolver
    // antes da fonte ser buscada, e o texto cai silenciosamente pra fonte padrão.
    ['Poppins-Bold', 'Poppins-Medium', 'Poppins-Regular'].forEach(name => {
        try { document.fonts.load(`16px "${name}"`); } catch (e) { /* ignore */ }
    });

    const BUNDLED_MANIFEST_URL = 'templates/manifest.json';
    let bundledTemplatesPromise = null;

    async function loadBundledTemplates() {
        if (!bundledTemplatesPromise) {
            bundledTemplatesPromise = fetch(BUNDLED_MANIFEST_URL)
                .then(res => res.json())
                .then(entries => Promise.all(entries.map(e => fetch(`templates/${e.file}`).then(r => r.json()))))
                .catch(err => {
                    console.warn('[hostBridge] Falha ao carregar templates padrão:', err);
                    return [];
                });
        }
        return bundledTemplatesPromise;
    }

    async function ensureStorageReady() {
        if (!window.StorageManager.templatesDB) {
            await window.StorageManager.init();
        }
    }

    /** Templates prontos (bundled, sempre disponíveis) + os salvos pelo usuário no editor. */
    async function getAllTemplates() {
        await ensureStorageReady();
        const [bundled, saved] = await Promise.all([
            loadBundledTemplates(),
            window.StorageManager.getTemplates(),
        ]);
        const savedIds = new Set(saved.map(t => t.id));
        return [...bundled.filter(t => !savedIds.has(t.id)), ...saved];
    }

    function buildRow(row) {
        // Mesmos aliases de bindKey que js/script.js:1371-1387 monta para a Geração Avulsa,
        // pra funcionar com qualquer template independente de qual campo o binding usa.
        return {
            partnerName: row.partnerName || '',
            itemName: row.itemName || '',
            priceOrig: row.priceOrig || '',
            pricePromo: row.pricePromo || '',
            daysText: row.daysText || '',
            itemImage: row.itemImage || null,
            logoImage: row.logoImage || null,
            item_nome: row.itemName || '',
            priceOriginal: row.priceOrig || '',
            preco_original: row.priceOrig || '',
            preco_promocional: row.pricePromo || '',
            daysActive: row.daysText || '',
            disponibilidade_diaria: row.daysText || '',
            estabelecimento_imagem: row.logoImage || null,
        };
    }

    function pickTemplateFormat(template, row) {
        const semImagem = !row.itemImage && !row.logoImage;
        if (semImagem && template.feed_no_image && template.story_no_image) {
            return { feed: template.feed_no_image, story: template.story_no_image };
        }
        return { feed: template.feed, story: template.story };
    }

    async function handleGenerate(templateId, rawRow, reply) {
        const templates = await getAllTemplates();
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            reply({ type: 'bigou:error', message: `Template "${templateId}" não encontrado no navegador.` });
            return;
        }

        const row = buildRow(rawRow);
        const { feed, story } = pickTemplateFormat(template, row);

        try {
            const [feedResult, storyResult] = await Promise.all([
                window.CanvasRenderer.generateImage(row, feed, true),
                window.CanvasRenderer.generateImage(row, story, false),
            ]);
            reply({
                type: 'bigou:result',
                feedDataUrl: feedResult.full,
                storyDataUrl: storyResult.full,
                alert: row.alert || null,
            });
        } catch (err) {
            reply({ type: 'bigou:error', message: err && err.message ? err.message : String(err) });
        }
    }

    async function handleListTemplates(reply) {
        const templates = await getAllTemplates();
        reply({
            type: 'bigou:templates',
            templates: templates.map(t => ({ id: t.id, name: t.name || 'Sem nome' })),
        });
    }

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        const reply = (payload) => event.source.postMessage(payload, event.origin);

        if (data.type === 'bigou:list-templates') {
            handleListTemplates(reply);
        } else if (data.type === 'bigou:generate') {
            handleGenerate(data.templateId, data.row || {}, reply);
        }
    });
})();
