document.addEventListener('DOMContentLoaded', async () => {
    // 1. Toast System
    window.showToast = (title, message, type = 'success') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'ph-check-circle' : 'ph-x-circle';
        
        toast.innerHTML = `
            <i class="ph ${icon} toast-icon"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    };

    window.showConfirm = (title, message, onConfirm) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        modal.classList.add('active');
        
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        
        const close = () => modal.classList.remove('active');
        
        okBtn.onclick = () => {
            onConfirm();
            close();
        };
        
        cancelBtn.onclick = close;
    };

    await window.StorageManager.init();
    if (window.Editor) window.Editor.init();

    // 2. Tabs Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(tabId) {
        if (tabId !== 'tab-review' && tabId !== 'tab-campaign-editor') {
            if (window.CanvasRenderer && typeof window.CanvasRenderer.clearCache === 'function') {
                window.CanvasRenderer.clearCache();
            }
        }
        
        navItems.forEach(item => {
            if (item.dataset.tab === tabId) item.classList.add('active');
            else item.classList.remove('active');
        });
        tabContents.forEach(content => {
            if (content.id === tabId) content.classList.add('active');
            else content.classList.remove('active');
        });
    }

    navItems.forEach(item => item.addEventListener('click', () => switchTab(item.dataset.tab)));

    // 3. Load Configs
    async function loadConfigs() {
        const fonts = await window.StorageManager.getFonts();
        const list = document.getElementById('font-list');
        const select = document.getElementById('prop-font');
        list.innerHTML = '';
        select.innerHTML = '<option value="Inter">Inter (Padrão)</option>';
        
        fonts.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${f.name}</span> <button class="btn btn-sm btn-outline text-danger" onclick="deleteFont('${f.id}')">X</button>`;
            list.appendChild(li);

            const opt = document.createElement('option');
            opt.value = f.name;
            opt.innerText = f.name;
            select.appendChild(opt);
        });

        const gens = await window.StorageManager.getGenerics();
        const keys = await window.StorageManager.getKeywords();
        const cats = await window.StorageManager.getCategories();
        const container = document.getElementById('generics-container');
        container.innerHTML = '';

        cats.forEach((catObj, index) => {
            const catId = catObj.id;
            const imgSrc = gens[catId] || '';
            const kw = keys[catId] || '';

            const div = document.createElement('div');
            div.className = 'generic-item';
            div.innerHTML = `
                <div class="generic-info">
                    <h4>${catObj.name}</h4>
                    <input type="text" id="kw_${catId}" class="form-control" style="margin-top: 8px;" value="${kw}" placeholder="Palavras-chave (separadas por vírgula)">
                </div>
                <div class="generic-upload">
                    <img id="preview-gen-${catId}" src="${imgSrc}" alt="Sem Imagem" class="gen-preview">
                    <input type="file" id="file-gen-${catId}" accept="image/*" class="hidden-input">
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('file-gen-${catId}').click()">Substituir</button>
                </div>
            `;
            container.appendChild(div);
            if(index < cats.length - 1) container.appendChild(document.createElement('hr'));

            const fileInput = div.querySelector(`#file-gen-${catId}`);
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if(!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    await window.StorageManager.saveGeneric(catId, ev.target.result);
                    div.querySelector(`#preview-gen-${catId}`).src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        });
    }
    document.getElementById('btn-save-keywords').addEventListener('click', async () => {
        const cats = await window.StorageManager.getCategories();
        for (let cat of cats) {
            const el = document.getElementById('kw_' + cat.id);
            if (el) {
                await window.StorageManager.saveKeyword(cat.id, el.value);
            }
        }
        showToast('Sucesso', 'Palavras-chave salvas com sucesso!');
    });

    document.getElementById('btn-show-add-cat').addEventListener('click', () => {
        document.getElementById('add-cat-form').classList.toggle('hidden');
    });

    document.getElementById('btn-add-cat').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-cat-name');
        const name = nameInput.value.trim();
        if (!name) return showToast('Aviso', 'Digite um nome para a categoria.', 'error');
        
        await window.StorageManager.addCategory(name);
        nameInput.value = '';
        document.getElementById('add-cat-form').classList.add('hidden');
        loadConfigs();
        showToast('Sucesso', 'Categoria adicionada! Você já pode inserir as palavras-chave e a imagem padrão dela.');
    });

    window.deleteFont = async (id) => {
        showConfirm('Excluir Fonte', 'Tem certeza que deseja excluir esta fonte?', async () => {
            await window.StorageManager.deleteFont(id);
            loadConfigs();
            showToast('Sucesso', 'Fonte excluída!');
        });
    };

    document.getElementById('btn-add-font').addEventListener('click', async () => {
        const files = document.getElementById('font-file').files;
        if (!files.length) return showToast('Aviso', 'Selecione os arquivos de fonte.', 'error');
        
        for(let i = 0; i < files.length; i++) {
            const file = files[i];
            const name = file.name.split('.')[0];
            
            await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    await window.StorageManager.saveFont(name, e.target.result);
                    resolve();
                };
                reader.readAsDataURL(file);
            });
        }
        
        showToast('Sucesso', 'Fontes adicionadas!');
        document.getElementById('font-file').value = '';
        loadConfigs();
    });

    // 4. Templates
    async function loadTemplates() {
        const templates = await window.StorageManager.getTemplates();
        
        const tbody = document.querySelector('#templates-table tbody');
        tbody.innerHTML = '';
        if (templates.length === 0) {
            document.getElementById('no-templates-msg').style.display = 'block';
            document.getElementById('templates-table').style.display = 'none';
        } else {
            document.getElementById('no-templates-msg').style.display = 'none';
            document.getElementById('templates-table').style.display = 'table';
            templates.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${t.name}</strong></td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="editTemplate('${t.id}')">Editar</button>
                        <button class="btn btn-sm btn-outline" onclick="exportTemplate('${t.id}')">Exportar</button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="deleteTemplate('${t.id}')">Excluir</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const select = document.getElementById('select-active-template');
        select.innerHTML = '<option value="">Selecione um template...</option>';
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.name;
            select.appendChild(opt);
        });
    }

    window.editTemplate = async (id) => {
        const templates = await window.StorageManager.getTemplates();
        const t = templates.find(x => x.id === id);
        if(t) {
            document.getElementById('template-list-view').classList.add('hidden');
            document.getElementById('template-editor-view').classList.remove('hidden');
            window.Editor.loadTemplate(t);
        }
    };

    window.deleteTemplate = async (id) => {
        showConfirm('Excluir Template', 'Tem certeza que deseja excluir este template?', async () => {
            await window.StorageManager.deleteTemplate(id);
            loadTemplates();
            showToast('Sucesso', 'Template excluído com sucesso!');
        });
    };

    window.exportTemplate = async (id) => {
        const templates = await window.StorageManager.getTemplates();
        const t = templates.find(x => x.id === id);
        if (t) {
            // Strip out variant keys to export only normal Feed and Story templates
            const exportObj = {
                id: t.id,
                name: t.name,
                feed: t.feed,
                story: t.story
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href",     dataStr);
            downloadAnchorNode.setAttribute("download", (t.name || 'template') + ".json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast('Sucesso', 'Template exportado com sucesso!');
        }
    };

    document.getElementById('btn-new-template').addEventListener('click', () => {
        document.getElementById('template-list-view').classList.add('hidden');
        document.getElementById('template-editor-view').classList.remove('hidden');
        window.Editor.loadTemplate({ id: null, name: '' });
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        document.getElementById('template-list-view').classList.remove('hidden');
        document.getElementById('template-editor-view').classList.add('hidden');
    });

    document.getElementById('btn-save-template').addEventListener('click', async () => {
        const tpl = window.Editor.getTemplateToSave();
        await window.StorageManager.saveTemplate(tpl);
        showToast('Sucesso', 'Template Salvo!');
        document.getElementById('template-list-view').classList.remove('hidden');
        document.getElementById('template-editor-view').classList.add('hidden');
        loadTemplates();
    });

    // Modal Lightbox Logic
    const modal = document.getElementById('preview-modal');
    const modalImg = document.getElementById('modal-image');
    document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.remove('active');
    });

    window.openModal = (src) => {
        modalImg.src = src;
        modal.classList.add('active');
    };

    // 5. Generator
    const csvFileInput = document.getElementById('csv-file');
    const btnProcess = document.getElementById('btn-process');
    const statusBox = document.getElementById('processing-status');
    const statusText = document.getElementById('processing-text');
    const progressFill = document.getElementById('progress-fill');
    
    let parsedData = [];
    let generatedResults = [];
    let activeCampaignId = null;

    csvFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const generics = await window.StorageManager.getGenerics();
            const keywords = await window.StorageManager.getKeywords();
            
            parsedData = await window.CsvParser.parse(file, generics, keywords);

            // Analyze the parsed data
            const total = parsedData.length;
            const withPhoto = parsedData.filter(row => row.hasOriginalPhoto).length;
            const withoutPhoto = total - withPhoto;
            
            // Update analysis UI
            document.getElementById('analysis-total').innerText = total;
            document.getElementById('analysis-with-photo').innerText = withPhoto;
            document.getElementById('analysis-without-photo').innerText = withoutPhoto;
            
            // Show the analysis box
            document.getElementById('csv-analysis-box').classList.remove('hidden');
            
            // Hide or show the variant treatment option depending on whether there are items without photos
            const variantOption = document.getElementById('treatment-variant-option');
            if (withoutPhoto === 0) {
                // If there are no items without photos, default to 'default-image' and disable variant choice
                document.querySelector('input[name="no-photo-treatment"][value="default-image"]').checked = true;
                if (variantOption) {
                    variantOption.style.opacity = '0.5';
                    variantOption.style.pointerEvents = 'none';
                }
            } else {
                if (variantOption) {
                    variantOption.style.opacity = '1';
                    variantOption.style.pointerEvents = 'auto';
                }
            }

            btnProcess.disabled = false;
            btnProcess.innerText = `Processar ${parsedData.length} parceiros`;
            document.querySelector('#csv-dropzone h3').innerText = file.name;
        } catch (err) {
            showToast('Erro', 'Erro ao ler o arquivo CSV. Verifique o console.', 'error');
            console.error(err);
        }
    });

    btnProcess.addEventListener('click', async () => {
        const campaignName = document.getElementById('campaign-name').value.trim();
        if(!campaignName) return showToast('Aviso', 'Informe um nome para a campanha.', 'error');

        const selectedTplId = document.getElementById('select-active-template').value;
        if(!selectedTplId) return showToast('Aviso', 'Selecione um template base.', 'error');
        if (!parsedData.length) return;

        const templates = await window.StorageManager.getTemplates();
        const activeTpl = templates.find(x => x.id === selectedTplId);

        // Read treatment selection
        const treatment = document.querySelector('input[name="no-photo-treatment"]:checked').value; // 'default-image' | 'no-image-template'

        const hasFeedNoImgVariant = activeTpl.feed_no_image && activeTpl.feed_no_image.bg;
        const hasStoryNoImgVariant = activeTpl.story_no_image && activeTpl.story_no_image.bg;

        if (treatment === 'no-image-template' && (!hasFeedNoImgVariant || !hasStoryNoImgVariant)) {
            showToast('Aviso', 'O template selecionado não possui variantes "sem foto" completas. O sistema utilizará a imagem padrão/genérica como fallback nos layouts ausentes.', 'warning');
        }

        // Apply treatment preprocessing
        if (treatment === 'no-image-template') {
            parsedData.forEach(row => {
                if (!row.hasOriginalPhoto) {
                    row.itemImage = '';
                    row.usedGeneric = false;
                    row.alert = null;
                }
            });
        }

        btnProcess.disabled = true;
        statusBox.classList.remove('hidden');
        generatedResults = [];
        
        // Group parsedData by cityName
        const groupedByCity = {};
        parsedData.forEach(row => {
            const city = row.cityName || 'Sem Cidade';
            if (!groupedByCity[city]) groupedByCity[city] = [];
            groupedByCity[city].push(row);
        });

        const cities = Object.keys(groupedByCity);
        let currentTotalProcessed = 0;
        const totalItems = parsedData.length;

        for (let city of cities) {
            const cityRows = groupedByCity[city];
            const cityTotal = cityRows.length;
            
            for (let i = 0; i < cityTotal; i++) {
                const row = cityRows[i];
                currentTotalProcessed++;
                
                statusText.innerText = `Processando: [${city}] - ${i+1}/${cityTotal} artes (${row.partnerName})...`;
                progressFill.style.width = `${((currentTotalProcessed - 1) / totalItems) * 100}%`;

                try {
                    const useFeedNoImg = (treatment === 'no-image-template' && !row.hasOriginalPhoto && hasFeedNoImgVariant);
                    const useStoryNoImg = (treatment === 'no-image-template' && !row.hasOriginalPhoto && hasStoryNoImgVariant);
                    
                    const feedTplFormat = useFeedNoImg ? activeTpl.feed_no_image : activeTpl.feed;
                    const storyTplFormat = useStoryNoImg ? activeTpl.story_no_image : activeTpl.story;

                    const feedRes = await window.CanvasRenderer.generateImage(row, feedTplFormat, true);
                    const storyRes = await window.CanvasRenderer.generateImage(row, storyTplFormat, false);
                    
                    generatedResults.push({
                        rowData: row,
                        feedDataUrl: feedRes ? feedRes.full : null,
                        storyDataUrl: storyRes ? storyRes.full : null,
                        feedThumbUrl: feedRes ? feedRes.thumb : null,
                        storyThumbUrl: storyRes ? storyRes.thumb : null
                    });
                } catch (err) {
                    console.error('Erro ao gerar imagem para', row, err);
                    row.alert = row.alert ? row.alert + " | " + err : String(err);
                    generatedResults.push({
                        rowData: row,
                        feedDataUrl: null,
                        storyDataUrl: null
                    });
                }
            }
        }

        progressFill.style.width = '100%';
        statusText.innerText = 'Geração concluída! Salvando campanha...';

        // Clear rendering cache and revoke blob URLs to free memory
        if (window.CanvasRenderer && typeof window.CanvasRenderer.clearCache === 'function') {
            window.CanvasRenderer.clearCache();
        }

        const newCampaign = await window.StorageManager.saveCampaign({
            name: campaignName,
            templateId: selectedTplId,
            results: generatedResults,
            parsedData: parsedData,
            noPhotoTreatment: treatment // Store selection!
        });
        
        activeCampaignId = newCampaign.id;
        document.getElementById('review-campaign-name').innerText = `- ${campaignName}`;
        
        loadCampaigns();

        statusText.innerText = 'Campanha salva! Vá para a aba de Conferência.';
        showToast('Sucesso', 'Campanha gerada e salva com sucesso!');
        
        document.getElementById('nav-review-btn').disabled = false;
        renderReviewGrid();
        setTimeout(() => switchTab('tab-review'), 1000);
    });

    let reviewStats = null;
    let currentReviewFilter = 'all';
    let reviewItemsToRender = [];
    let reviewCurrentPage = 0;
    const ITEMS_PER_PAGE = 20;

    function calculateReviewStats() {
        let countAll = generatedResults.length;
        let countAlerts = 0;
        let countError = 0;
        let countTextLong = 0;
        let countGeneric = 0;
        let countSuccess = 0;

        generatedResults.forEach((result, index) => {
            const row = result.rowData;
            const isError = !!row.alert;
            const sanitizedName = (row.itemName || '').trim().replace(/\s+/g, ' ');
            const isTextLong = sanitizedName.length >= 28;
            const isGeneric = !!row.usedGeneric;

            let badgeCls = 'badge-success';
            let badgeTxt = 'Sucesso';

            if (isError) {
                badgeCls = 'badge-danger';
                badgeTxt = 'Imagem não encontrada';
            } else if (isTextLong) {
                badgeCls = 'badge-info';
                badgeTxt = 'Texto muito longo';
            } else if (isGeneric) {
                badgeCls = 'badge-warning';
                badgeTxt = 'Usou imagem padrão';
            }

            if (badgeCls !== 'badge-success') countAlerts++;
            else countSuccess++;

            if (badgeCls === 'badge-danger') countError++;
            if (badgeCls === 'badge-info') countTextLong++;
            if (badgeCls === 'badge-warning') countGeneric++;

            result._badgeCls = badgeCls;
            result._badgeTxt = badgeTxt;
            result._isError = isError;
            result._isTextLong = isTextLong;
            result._originalIndex = index;
        });

        reviewStats = {
            countAll, countAlerts, countError, countTextLong, countGeneric, countSuccess
        };

        const select = document.getElementById('review-filter-select');
        if (select) {
            select.options[0].text = `Todas as Artes (${countAll})`;
            select.options[1].text = `Somente Alertas (${countAlerts})`;
            select.options[2].text = `🔴 Imagem não encontrada (${countError})`;
            select.options[3].text = `🔵 Nome muito longo (${countTextLong})`;
            select.options[4].text = `🟠 Usou imagem padrão (${countGeneric})`;
            select.options[5].text = `🟢 Sucesso (${countSuccess})`;
        }
        
        const badge = document.getElementById('review-badge');
        if (badge) {
            badge.innerText = countAlerts;
            badge.style.display = countAlerts > 0 ? 'inline-block' : 'none';
            if(countAlerts > 0) badge.style.backgroundColor = 'var(--danger)';
            else badge.style.backgroundColor = 'var(--primary)';
        }
    }

    function initReviewGrid(filter = 'all') {
        currentReviewFilter = filter;
        reviewCurrentPage = 0;
        
        if (!reviewStats) calculateReviewStats();

        reviewItemsToRender = generatedResults.filter(result => {
            const badgeCls = result._badgeCls;
            if (filter === 'success' && badgeCls !== 'badge-success') return false;
            if (filter === 'all-alerts' && badgeCls === 'badge-success') return false;
            if (filter === 'error-img' && badgeCls !== 'badge-danger') return false;
            if (filter === 'alert-text' && badgeCls !== 'badge-info') return false;
            if (filter === 'alert-generic' && badgeCls !== 'badge-warning') return false;
            return true;
        });

        const grid = document.getElementById('review-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (window._reviewObserver) {
            window._reviewObserver.disconnect();
        }

        renderNextReviewBatch();
    }

    function renderNextReviewBatch() {
        const grid = document.getElementById('review-grid');
        if (!grid) return;
        const start = reviewCurrentPage * ITEMS_PER_PAGE;
        const end = Math.min(start + ITEMS_PER_PAGE, reviewItemsToRender.length);
        
        if (start >= reviewItemsToRender.length) return;

        for (let i = start; i < end; i++) {
            const result = reviewItemsToRender[i];
            const card = generateReviewCardHtml(result, result._originalIndex);
            grid.appendChild(card);
        }

        reviewCurrentPage++;
        
        if (end < reviewItemsToRender.length) {
            let observerTarget = document.getElementById('review-load-more');
            if (!observerTarget) {
                observerTarget = document.createElement('div');
                observerTarget.id = 'review-load-more';
                observerTarget.style.gridColumn = '1 / -1';
                observerTarget.style.height = '20px';
                grid.appendChild(observerTarget);
                
                window._reviewObserver = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        renderNextReviewBatch();
                    }
                }, { rootMargin: '400px' });
                window._reviewObserver.observe(observerTarget);
            } else {
                grid.appendChild(observerTarget);
            }
        } else {
            const observerTarget = document.getElementById('review-load-more');
            if (observerTarget) observerTarget.remove();
        }
    }

    function generateReviewCardHtml(result, index) {
        const row = result.rowData;
        const badgeCls = result._badgeCls;
        const badgeTxt = result._badgeTxt;
        const isError = result._isError;
        const isTextLong = result._isTextLong;

        const card = document.createElement('div');
        card.className = 'review-card';
        card.id = `review-card-${index}`;

        const fSrcFull = result.feedDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
        const sSrcFull = result.storyDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
        const fSrcThumb = result.feedThumbUrl || fSrcFull; 
        const sSrcThumb = result.storyThumbUrl || sSrcFull; 

        card.innerHTML = `
            <span class="review-badge ${badgeCls}">${badgeTxt}</span>
            <div class="dual-preview">
                <img src="${fSrcThumb}" alt="Feed" loading="lazy" onclick="openModal('${fSrcFull}')">
                <img src="${sSrcThumb}" alt="Story" loading="lazy" onclick="openModal('${sSrcFull}')">
            </div>
            <div class="review-info">
                <h4>${row.partnerName}</h4>
                <p>Item: ${row.itemName || 'Sem nome'}</p>
                ${isError ? `<p style="color:var(--danger); font-size: 0.75rem; margin-top:4px;">${row.alert}</p>` : ''}
                ${isError ? `<button class="btn btn-sm btn-outline mt-2" style="border-color:var(--danger); color:var(--danger);" onclick="window.openCorrectionModal(${index})">Resolver Pendência</button>` : ''}
                ${isTextLong && !isError ? `<button class="btn btn-sm btn-outline mt-2" style="border-color:#3b82f6; color:#3b82f6;" onclick="window.openEditNameModal(${index})">Editar Nome</button>` : ''}
            </div>
        `;
        return card;
    }

    window.updateSingleReviewCard = (index) => {
        calculateReviewStats(); // Recalculate stats since this item changed
        const cardNode = document.getElementById(`review-card-${index}`);
        if (cardNode) {
            const newCard = generateReviewCardHtml(generatedResults[index], index);
            cardNode.replaceWith(newCard);
        }
    };

    function renderReviewGrid(filter = 'all') {
        reviewStats = null; // force recalculate on explicit render
        initReviewGrid(filter);
    }

    document.getElementById('review-filter-select')?.addEventListener('change', (e) => {
        initReviewGrid(e.target.value);
    });

    // Edit Name Modal Logic
    window.openEditNameModal = (index) => {
        const result = generatedResults[index];
        const row = result.rowData;
        
        document.getElementById('edit-name-original').innerText = row.itemName || '';
        document.getElementById('edit-name-input').value = row.itemName || '';
        
        const modal = document.getElementById('edit-name-modal');
        modal.dataset.activeIndex = index;
        modal.classList.add('active');
    };

    document.getElementById('edit-name-modal-close').addEventListener('click', () => {
        document.getElementById('edit-name-modal').classList.remove('active');
    });

    document.getElementById('btn-save-name-edit').addEventListener('click', async () => {
        const modal = document.getElementById('edit-name-modal');
        const index = modal.dataset.activeIndex;
        if (index === undefined) return;

        const result = generatedResults[index];
        const row = result.rowData;
        
        const newName = document.getElementById('edit-name-input').value.trim();
        if (!newName) return showToast('Aviso', 'O nome não pode ficar vazio.', 'error');

        const btn = document.getElementById('btn-save-name-edit');
        btn.disabled = true;
        btn.innerText = 'Processando...';

        try {
            row.itemName = newName;

            const selectedTplId = document.getElementById('select-active-template').value;
            const templates = await window.StorageManager.getTemplates();
            const activeTpl = templates.find(x => x.id === selectedTplId);

            let treatment = 'default-image';
            if (activeCampaignId) {
                const camp = await window.StorageManager.getCampaign(activeCampaignId);
                if (camp) treatment = camp.noPhotoTreatment || 'default-image';
            }

            const useFeedNoImg = (treatment === 'no-image-template' && !row.hasOriginalPhoto && activeTpl.feed_no_image && activeTpl.feed_no_image.bg);
            const useStoryNoImg = (treatment === 'no-image-template' && !row.hasOriginalPhoto && activeTpl.story_no_image && activeTpl.story_no_image.bg);

            const feedTplFormat = useFeedNoImg ? activeTpl.feed_no_image : activeTpl.feed;
            const storyTplFormat = useStoryNoImg ? activeTpl.story_no_image : activeTpl.story;

            const feedPromise = feedTplFormat && feedTplFormat.objects && feedTplFormat.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, feedTplFormat, true) 
                : Promise.resolve(null);
            
            const storyPromise = storyTplFormat && storyTplFormat.objects && storyTplFormat.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, storyTplFormat, false) 
                : Promise.resolve(null);

            const [fImg, sImg] = await Promise.all([feedPromise, storyPromise]);
            
            result.feedDataUrl = fImg ? fImg.full : null;
            result.storyDataUrl = sImg ? sImg.full : null;
            result.feedThumbUrl = fImg ? fImg.thumb : null;
            result.storyThumbUrl = sImg ? sImg.thumb : null;

            if (activeCampaignId) {
                const camp = await window.StorageManager.getCampaign(activeCampaignId);
                if(camp) {
                    camp.results = generatedResults;
                    await window.StorageManager.saveCampaign(camp);
                }
            }

            modal.classList.remove('active');
            renderReviewGrid(document.getElementById('review-filter-select').value);
            
        } catch (e) {
            console.error(e);
            showToast('Erro', e.message || 'Erro ao recriar a arte.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-check"></i> Salvar e Regerar';
        }
    });

    // Corrections Modal Logic
    window.openCorrectionModal = async (index) => {
        const result = generatedResults[index];
        const row = result.rowData;

        document.getElementById('corr-alert-reason').innerText = row.alert;
        document.getElementById('corr-partner-name').innerText = row.partnerName;
        document.getElementById('corr-item-name').innerText = row.itemName || 'N/A';
        
        const select = document.getElementById('corr-category-select');
        select.innerHTML = '<option value="">Selecione...</option>';
        const cats = await window.StorageManager.getCategories();
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = c.name;
            select.appendChild(opt);
        });

        document.getElementById('corr-new-keyword').value = '';
        document.getElementById('corr-specific-upload').value = '';
        document.getElementById('corr-upload-name').style.display = 'none';

        document.getElementById('corr-action-type').value = 'existing';
        document.getElementById('corr-panel-existing').classList.remove('hidden');
        document.getElementById('corr-panel-new').classList.add('hidden');
        document.getElementById('corr-panel-specific').classList.add('hidden');

        document.getElementById('correction-modal').dataset.activeIndex = index;
        document.getElementById('correction-modal').classList.add('active');
    };

    document.getElementById('corr-action-type').addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('corr-panel-existing').classList.toggle('hidden', val !== 'existing');
        document.getElementById('corr-panel-new').classList.toggle('hidden', val !== 'new');
        document.getElementById('corr-panel-specific').classList.toggle('hidden', val !== 'specific');
    });

    document.getElementById('corr-specific-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('corr-upload-name').innerText = file.name;
            document.getElementById('corr-upload-name').style.display = 'block';
        }
    });

    document.getElementById('corr-create-cat-img').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('corr-create-cat-img-name').innerText = file.name;
        }
    });

    document.getElementById('correction-modal-close').addEventListener('click', () => {
        document.getElementById('correction-modal').classList.remove('active');
    });

    document.getElementById('btn-apply-correction').addEventListener('click', async () => {
        const modal = document.getElementById('correction-modal');
        const index = modal.dataset.activeIndex;
        if (index === undefined) return;

        const result = generatedResults[index];
        const row = result.rowData;
        const btn = document.getElementById('btn-apply-correction');

        const actionType = document.getElementById('corr-action-type').value;

        let catId = null;
        let specificFile = null;
        let keyword = '';

        if (actionType === 'existing') {
            catId = document.getElementById('corr-category-select').value;
            keyword = document.getElementById('corr-new-keyword').value.trim();
            if (!catId) return showToast('Aviso', 'Selecione uma categoria existente.', 'error');
        } else if (actionType === 'new') {
            const newCatName = document.getElementById('corr-create-cat-name').value.trim();
            keyword = document.getElementById('corr-create-cat-kws').value.trim();
            const newCatImgFile = document.getElementById('corr-create-cat-img').files[0];
            
            if (!newCatName) return showToast('Aviso', 'Informe o nome da nova categoria.', 'error');
            if (!newCatImgFile) return showToast('Aviso', 'Anexe uma foto padrão para a nova categoria.', 'error');

            catId = await window.StorageManager.addCategory(newCatName);
            const base64Img = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(newCatImgFile);
            });
            await window.StorageManager.saveGeneric(catId, base64Img);
            
            // Re-load configs quietly to update memory
            loadConfigs();
            
        } else if (actionType === 'specific') {
            specificFile = document.getElementById('corr-specific-upload').files[0];
            if (!specificFile) return showToast('Aviso', 'Faça o upload de uma foto específica.', 'error');
        }

        btn.disabled = true;
        btn.innerText = 'Processando...';

        try {
            if (specificFile) {
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(specificFile);
                });
                row.itemImage = base64; 
            } else if (catId) {
                const gens = await window.StorageManager.getGenerics();
                const genBase64 = gens[catId];
                if (!genBase64) {
                    throw new Error('A categoria selecionada não possui uma imagem padrão salva.');
                }
                
                row.itemImage = genBase64;

                if (keyword) {
                    const keys = await window.StorageManager.getKeywords();
                    let currentKeys = keys[catId] || '';
                    
                    const existingArr = currentKeys.split(',').map(k => k.trim()).filter(k => k);
                    const newArr = keyword.split(',').map(k => k.trim()).filter(k => k);
                    
                    const uniqueKeys = [...new Set([...existingArr, ...newArr])];
                    await window.StorageManager.saveKeyword(catId, uniqueKeys.join(', '));
                    
                    // Reload configs in background so it's immediately available without refresh
                    loadConfigs();
                }
            }

            const selectedTplId = document.getElementById('select-active-template').value;
            const templates = await window.StorageManager.getTemplates();
            const activeTpl = templates.find(x => x.id === selectedTplId);

            delete row.alert; 
            row.usedGeneric = !!catId; 
            row.hasOriginalPhoto = true; 

            const feedPromise = activeTpl.feed && activeTpl.feed.objects && activeTpl.feed.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, activeTpl.feed, true) 
                : Promise.resolve(null);
            
            const storyPromise = activeTpl.story && activeTpl.story.objects && activeTpl.story.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, activeTpl.story, false) 
                : Promise.resolve(null);

            const [fImg, sImg] = await Promise.all([feedPromise, storyPromise]);
            
            result.feedDataUrl = fImg ? fImg.full : null;
            result.storyDataUrl = sImg ? sImg.full : null;
            result.feedThumbUrl = fImg ? fImg.thumb : null;
            result.storyThumbUrl = sImg ? sImg.thumb : null;

            if (activeCampaignId) {
                const camp = await window.StorageManager.getCampaign(activeCampaignId);
                if(camp) {
                    camp.results = generatedResults;
                    await window.StorageManager.saveCampaign(camp);
                }
            }

            modal.classList.remove('active');
            renderReviewGrid(document.getElementById('review-filter-select').value);
            
        } catch (e) {
            console.error(e);
            showToast('Erro', e.message || 'Erro ao aplicar correção.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-check"></i> Aplicar Correção e Regerar';
        }
    });

    document.getElementById('btn-download-zip').addEventListener('click', async () => {
        if (!generatedResults.length) return;
        
        const btn = document.getElementById('btn-download-zip');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Compactando...';
        btn.disabled = true;

        const zip = new JSZip();
        let savedCount = 0;

        const campaignNameStr = document.getElementById('review-campaign-name').innerText.replace('- ', '').trim() || 'Campanha';
        const safeCampaignName = campaignNameStr.replace(/[^a-z0-9_-]/gi, '_');
        
        const rootFolder = zip.folder(safeCampaignName);
        const partnerCounts = {};

        generatedResults.forEach(res => {
            if (res.rowData.alert && !res.feedDataUrl) return; 
            
            const cityName = res.rowData.cityName || 'Sem Cidade';
            const safeCityName = cityName.replace(/[^a-zA-Z0-9À-ÿ _-]/gi, '_').trim();
            const safePartnerName = res.rowData.partnerName.replace(/[^a-zA-Z0-9À-ÿ _-]/gi, '_').trim();
            
            const cityFolder = rootFolder.folder(safeCityName);
            const partnerFolder = cityFolder.folder(safePartnerName);

            const partnerKey = `${safeCityName}/${safePartnerName}`;
            if (!partnerCounts[partnerKey]) {
                partnerCounts[partnerKey] = 0;
            }
            partnerCounts[partnerKey]++;
            const suffix = partnerCounts[partnerKey] > 1 ? `_${partnerCounts[partnerKey]}` : '';

            if (res.feedDataUrl) {
                const feedBase64 = res.feedDataUrl.split(',')[1];
                partnerFolder.file(`feed${suffix}.png`, feedBase64, {base64: true});
            }
            if (res.storyDataUrl) {
                const storyBase64 = res.storyDataUrl.split(',')[1];
                partnerFolder.file(`story${suffix}.png`, storyBase64, {base64: true});
            }
            savedCount++;
        });

        if (savedCount === 0) {
            showToast('Aviso', 'Não há imagens válidas para baixar.', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        if (activeCampaignId) {
            const camp = await window.StorageManager.getCampaign(activeCampaignId);
            if (camp) {
                rootFolder.file('metadata.json', JSON.stringify({
                    id: camp.id,
                    name: camp.name,
                    createdAt: camp.createdAt,
                    templateId: camp.templateId,
                    totalItems: savedCount
                }, null, 2));
                
                if (camp.parsedData && window.Papa) {
                    rootFolder.folder('csv').file('dados_originais.csv', window.Papa.unparse(camp.parsedData));
                }
            }
        }

        zip.generateAsync({type: "blob"}).then(function(content) {
            saveAs(content, `${safeCampaignName}.zip`);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    });

    // 6. Campaigns Functions
    async function loadCampaigns() {
        const campaigns = await window.StorageManager.getCampaigns();
        const tbody = document.querySelector('#campaigns-table tbody');
        tbody.innerHTML = '';
        if (campaigns.length === 0) {
            document.getElementById('no-campaigns-msg').style.display = 'block';
            document.getElementById('campaigns-table').style.display = 'none';
        } else {
            document.getElementById('no-campaigns-msg').style.display = 'none';
            document.getElementById('campaigns-table').style.display = 'table';
            
            const templates = await window.StorageManager.getTemplates();
            
            campaigns.forEach(c => {
                const tr = document.createElement('tr');
                const d = new Date(c.createdAt);
                tr.innerHTML = `
                    <td><strong>${c.name}</strong></td>
                    <td>${d.toLocaleDateString()} ${d.toLocaleTimeString()}</td>
                    <td>${c.totalItems}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="openCampaign('${c.id}')">Abrir</button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="deleteCampaign('${c.id}')">Excluir</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    window.openCampaign = async (id) => {
        const camp = await window.StorageManager.getCampaign(id);
        if(camp) {
            activeCampaignId = camp.id;
            generatedResults = camp.results || [];
            parsedData = camp.parsedData || [];
            document.getElementById('editor-campaign-name').innerText = `- ${camp.name}`;
            document.getElementById('review-campaign-name').innerText = `- ${camp.name}`;
            
            // Switch to Campaign Editor Tab
            switchTab('tab-campaign-editor');

            const grid = document.getElementById('editor-grid');
            if (grid) grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="ph ph-spinner ph-spin" style="font-size: 2rem;"></i><p style="margin-top: 10px;">Carregando artes...</p></div>';

            setTimeout(() => {
                renderEditorGrid();
            }, 50);
        }
    };

    // --- Campaign Editor Logic ---
    function renderEditorGrid(filter = 'all', searchQuery = '') {
        const grid = document.getElementById('editor-grid');
        grid.innerHTML = '';
        
        const query = searchQuery.toLowerCase();

        generatedResults.forEach((result, index) => {
            const row = result.rowData;
            const isEdited = !!row.isManuallyEdited;

            if (filter === 'edited' && !isEdited) return;

            const partnerNameLower = (row.partnerName || '').toLowerCase();
            const itemNameLower = (row.itemName || '').toLowerCase();
            if (query && !partnerNameLower.includes(query) && !itemNameLower.includes(query)) return;

            const card = document.createElement('div');
            card.className = 'review-card';
            card.id = `editor-card-${index}`;

            const badgeCls = isEdited ? 'badge-alert' : 'badge-success'; // Using alert color (yellow) for edited
            const badgeTxt = isEdited ? 'Editada Manualmente' : 'Original';
            
            // Optional: Hide badge if not edited for cleaner UI? Let's show "Original" as success.
            const badgeHtml = `<span class="review-badge ${badgeCls}" style="${isEdited ? 'background-color: var(--warning); color: #fff;' : ''}">${badgeTxt}</span>`;

            const fSrcFull = result.feedDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
            const sSrcFull = result.storyDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
            const fSrcThumb = result.feedThumbUrl || fSrcFull; 
            const sSrcThumb = result.storyThumbUrl || sSrcFull; 

            card.innerHTML = `
                ${badgeHtml}
                <div class="dual-preview">
                    <img src="${fSrcThumb}" alt="Feed" loading="lazy" onclick="openModal('${fSrcFull}')">
                    <img src="${sSrcThumb}" alt="Story" loading="lazy" onclick="openModal('${sSrcFull}')">
                </div>
                <div class="review-info">
                    <h4>${row.partnerName}</h4>
                    <p>Item: ${row.itemName || 'Sem nome'}</p>
                    <button class="btn btn-sm btn-outline mt-2" onclick="window.openManualEditModal(${index})"><i class="ph ph-pencil-simple"></i> Editar Arte</button>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    document.querySelectorAll('#tab-campaign-editor .filters .btn').forEach(btn => {
        if(btn.dataset.filter) {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#tab-campaign-editor .filters .btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderEditorGrid(e.target.dataset.filter, document.getElementById('search-editor').value);
            });
        }
    });

    window.updateSingleEditorCard = (index) => {
        const card = document.getElementById(`editor-card-${index}`);
        if (!card) return;
        const result = generatedResults[index];
        const row = result.rowData;
        const isEdited = !!row.isManuallyEdited;
        const badgeCls = isEdited ? 'badge-alert' : 'badge-success';
        const badgeTxt = isEdited ? 'Editada Manualmente' : 'Original';
        const badgeHtml = `<span class="review-badge ${badgeCls}" style="${isEdited ? 'background-color: var(--warning); color: #fff;' : ''}">${badgeTxt}</span>`;

        const fSrcFull = result.feedDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const sSrcFull = result.storyDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const fSrcThumb = result.feedThumbUrl || fSrcFull;
        const sSrcThumb = result.storyThumbUrl || sSrcFull;

        card.innerHTML = `
            ${badgeHtml}
            <div class="dual-preview">
                <img src="${fSrcThumb}" alt="Feed" loading="lazy" onclick="openModal('${fSrcFull}')">
                <img src="${sSrcThumb}" alt="Story" loading="lazy" onclick="openModal('${sSrcFull}')">
            </div>
            <div class="review-info">
                <h4>${row.partnerName}</h4>
                <p>Item: ${row.itemName || 'Sem nome'}</p>
                <button class="btn btn-sm btn-outline mt-2" onclick="window.openManualEditModal(${index})"><i class="ph ph-pencil-simple"></i> Editar Arte</button>
            </div>
        `;
    };

    document.getElementById('search-editor').addEventListener('input', (e) => {
        const filter = document.querySelector('#tab-campaign-editor .filters .btn.active').dataset.filter;
        renderEditorGrid(filter, e.target.value);
    });

    // Manual Edit Modal Logic
    window.openManualEditModal = (index) => {
        const row = generatedResults[index].rowData;
        document.getElementById('manual-edit-modal').dataset.activeIndex = index;
        
        document.getElementById('edit-item-name').value = row.itemName || row.item_nome || '';
        document.getElementById('edit-price-orig').value = row.priceOrig || row.priceOriginal || row.preco_original || '';
        document.getElementById('edit-price-promo').value = row.pricePromo || row.preco_promocional || '';
        document.getElementById('edit-days').value = row.daysText || row.daysActive || row.disponibilidade_diaria || '';
        
        document.getElementById('edit-item-img').value = '';
        document.getElementById('edit-logo').value = '';
        
        const itemPreview = document.getElementById('edit-item-img-preview');
        if(row.itemImage) { itemPreview.src = row.itemImage; itemPreview.style.display = 'block'; }
        else { itemPreview.style.display = 'none'; }
        
        const logoPreview = document.getElementById('edit-logo-preview');
        if(row.estabelecimentoImage) { logoPreview.src = row.estabelecimentoImage; logoPreview.style.display = 'block'; }
        else { logoPreview.style.display = 'none'; }

        document.getElementById('manual-edit-modal').classList.add('active');
    };

    const handleEditImgChange = (inputId, previewId) => {
        document.getElementById(inputId).addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = ev => {
                    const preview = document.getElementById(previewId);
                    preview.src = ev.target.result;
                    preview.style.display = 'block';
                    preview.dataset.base64 = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    };
    handleEditImgChange('edit-item-img', 'edit-item-img-preview');
    handleEditImgChange('edit-logo', 'edit-logo-preview');

    document.getElementById('manual-edit-modal-close').addEventListener('click', () => {
        document.getElementById('manual-edit-modal').classList.remove('active');
    });

    document.getElementById('btn-save-manual-edit').addEventListener('click', async () => {
        const modal = document.getElementById('manual-edit-modal');
        const index = modal.dataset.activeIndex;
        if (index === undefined) return;
        
        const result = generatedResults[index];
        const row = result.rowData;
        const btn = document.getElementById('btn-save-manual-edit');

        // Extract values with backwards compatibility
        const valItemName = document.getElementById('edit-item-name').value.trim();
        if (valItemName) {
            row.itemName = valItemName;
            row.item_nome = valItemName;
        }
        
        const valPriceOrig = document.getElementById('edit-price-orig').value.trim();
        if (valPriceOrig) {
            row.priceOrig = valPriceOrig;
            row.priceOriginal = valPriceOrig; 
            row.preco_original = valPriceOrig; 
        }
        
        const valPricePromo = document.getElementById('edit-price-promo').value.trim();
        if (valPricePromo) {
            row.pricePromo = valPricePromo;
            row.preco_promocional = valPricePromo;
        }
        
        const valDays = document.getElementById('edit-days').value.trim();
        if (valDays) {
            row.daysText = valDays;
            row.daysActive = valDays;
            row.disponibilidade_diaria = valDays;
        }
        
        const itemPreview = document.getElementById('edit-item-img-preview');
        if(itemPreview.dataset.base64) {
            row.itemImage = itemPreview.dataset.base64;
            row.item_imagem = itemPreview.dataset.base64;
            row.hasOriginalPhoto = true; // Mark as having photo
        }
        
        const logoPreview = document.getElementById('edit-logo-preview');
        if(logoPreview.dataset.base64) {
            row.logoImage = logoPreview.dataset.base64;
            row.estabelecimentoImage = logoPreview.dataset.base64;
            row.estabelecimento_imagem = logoPreview.dataset.base64;
        }

        row.isManuallyEdited = true;

        btn.disabled = true;
        btn.innerText = 'Regerando Arte...';

        try {
            if (!activeCampaignId) throw new Error("ID da campanha ativo não encontrado.");
            const activeCampaign = await window.StorageManager.getCampaign(activeCampaignId);
            if (!activeCampaign) throw new Error("Campanha não encontrada no banco de dados.");
            const templates = await window.StorageManager.getTemplates();
            const activeTpl = templates.find(x => x.id === activeCampaign.templateId);

            const treatment = activeCampaign.noPhotoTreatment || 'default-image';
            const rowHasPhoto = !!row.itemImage;

            const hasFeedNoImgVariant = activeTpl.feed_no_image && activeTpl.feed_no_image.bg;
            const hasStoryNoImgVariant = activeTpl.story_no_image && activeTpl.story_no_image.bg;

            const useFeedNoImg = (treatment === 'no-image-template' && !rowHasPhoto && hasFeedNoImgVariant);
            const useStoryNoImg = (treatment === 'no-image-template' && !rowHasPhoto && hasStoryNoImgVariant);

            const feedTplFormat = useFeedNoImg ? activeTpl.feed_no_image : activeTpl.feed;
            const storyTplFormat = useStoryNoImg ? activeTpl.story_no_image : activeTpl.story;

            const feedPromise = feedTplFormat && feedTplFormat.objects && feedTplFormat.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, feedTplFormat, true) 
                : Promise.resolve(null);
            
            const storyPromise = storyTplFormat && storyTplFormat.objects && storyTplFormat.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, storyTplFormat, false) 
                : Promise.resolve(null);

            const [fImg, sImg] = await Promise.all([feedPromise, storyPromise]);
            
            result.feedDataUrl = fImg ? fImg.full : null;
            result.storyDataUrl = sImg ? sImg.full : null;
            result.feedThumbUrl = fImg ? fImg.thumb : null;
            result.storyThumbUrl = sImg ? sImg.thumb : null;

            // Auto-save
            activeCampaign.results = generatedResults;
            await window.StorageManager.saveCampaign(activeCampaign);

            modal.classList.remove('active');
            
            window.updateSingleEditorCard(index);
            showToast('Sucesso', 'Arte editada e regerada com sucesso!');
        } catch (e) {
            console.error(e);
            showToast('Erro', e.message || 'Erro ao regerar arte.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-check"></i> Salvar e Regerar Arte';
        }
    });

    window.deleteCampaign = async (id) => {
        showConfirm('Excluir Campanha', 'Tem certeza que deseja excluir esta campanha? Todos os resultados salvos serão perdidos.', async () => {
            await window.StorageManager.deleteCampaign(id);
            if(activeCampaignId === id) {
                activeCampaignId = null;
                generatedResults = [];
                parsedData = [];
                document.getElementById('review-campaign-name').innerText = '';
                document.getElementById('nav-review-btn').disabled = true;
            }
            loadCampaigns();
            showToast('Sucesso', 'Campanha excluída.');
        });
    };

    // --- Geração Avulsa Logic ---
    let singleImportedTemplate = null;
    let singleFeedUrl = null;
    let singleStoryUrl = null;

    document.getElementById('import-template-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                singleImportedTemplate = JSON.parse(ev.target.result);
                document.getElementById('single-template-status').innerText = `Template importado: ${singleImportedTemplate.name || 'Sem nome'}`;
                document.getElementById('single-template-status').style.color = 'var(--success)';
                document.getElementById('btn-generate-single').disabled = false;
            } catch (err) {
                showToast('Erro', 'Arquivo de template inválido.', 'error');
            }
        };
        reader.readAsText(file);
    });

    const fileToBase64 = (file) => {
        return new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    };

    document.getElementById('btn-generate-single').addEventListener('click', async () => {
        if (!singleImportedTemplate) return showToast('Aviso', 'Importe um template primeiro.', 'error');

        const btn = document.getElementById('btn-generate-single');
        btn.disabled = true;
        btn.innerText = 'Processando...';

        try {
            const partnerName = document.getElementById('single-partner-name').value.trim();
            const itemName = document.getElementById('single-item-name').value.trim();
            const priceOrig = document.getElementById('single-price-orig').value.trim();
            const pricePromo = document.getElementById('single-price-promo').value.trim();
            const daysText = document.getElementById('single-days').value.trim();
            
            const itemImageFile = document.getElementById('single-item-img').files[0];
            const logoImageFile = document.getElementById('single-logo-img').files[0];

            const itemImageB64 = await fileToBase64(itemImageFile);
            const logoImageB64 = await fileToBase64(logoImageFile);

            const row = {
                partnerName: partnerName || 'Nome do Parceiro',
                itemName: itemName || 'Nome do Item',
                priceOrig: priceOrig || '',
                pricePromo: pricePromo || '',
                daysText: daysText || '',
                itemImage: itemImageB64 || null,
                logoImage: logoImageB64 || null,
                // Fallbacks since template bindings can map to multiple fields:
                item_nome: itemName || 'Nome do Item',
                priceOriginal: priceOrig || '',
                preco_original: priceOrig || '',
                preco_promocional: pricePromo || '',
                daysActive: daysText || '',
                disponibilidade_diaria: daysText || '',
                estabelecimento_imagem: logoImageB64 || null
            };

            const feedPromise = singleImportedTemplate.feed && singleImportedTemplate.feed.objects && singleImportedTemplate.feed.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, singleImportedTemplate.feed, true) 
                : Promise.resolve(null);
            
            const storyPromise = singleImportedTemplate.story && singleImportedTemplate.story.objects && singleImportedTemplate.story.objects.length > 0 
                ? window.CanvasRenderer.generateImage(row, singleImportedTemplate.story, false) 
                : Promise.resolve(null);

            const [fImg, sImg] = await Promise.all([feedPromise, storyPromise]);

            singleFeedUrl = fImg ? fImg.full : null;
            singleStoryUrl = sImg ? sImg.full : null;

            const feedPreview = document.getElementById('single-feed-preview');
            const storyPreview = document.getElementById('single-story-preview');

            feedPreview.src = (fImg ? fImg.thumb : null) || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            storyPreview.src = (sImg ? sImg.thumb : null) || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

            document.getElementById('single-result-area').classList.remove('hidden');

            showToast('Sucesso', 'Artes geradas com sucesso!');
        } catch (err) {
            console.error(err);
            showToast('Erro', 'Ocorreu um erro ao gerar as artes.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = '3. Gerar Artes Avulsas';
        }
    });

    document.getElementById('btn-download-single').addEventListener('click', () => {
        if (!singleFeedUrl && !singleStoryUrl) return showToast('Aviso', 'Nenhuma arte para baixar.', 'error');
        
        const partnerName = document.getElementById('single-partner-name').value.trim() || 'parceiro';
        const safePartnerName = partnerName.replace(/[^a-z0-9_-]/gi, '_');

        const zip = new JSZip();
        
        if (singleFeedUrl) {
            const feedBase64 = singleFeedUrl.split(',')[1];
            zip.file(`feed_${safePartnerName}.png`, feedBase64, {base64: true});
        }
        if (singleStoryUrl) {
            const storyBase64 = singleStoryUrl.split(',')[1];
            zip.file(`story_${safePartnerName}.png`, storyBase64, {base64: true});
        }

        zip.generateAsync({type: "blob"}).then(function(content) {
            saveAs(content, `promocao_${safePartnerName}.zip`);
        });
    });

    // Initial loads
    loadConfigs();
    loadTemplates();
    loadCampaigns();
});
