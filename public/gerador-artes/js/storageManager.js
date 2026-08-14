const StorageManager = {
    // genericCategories array removed. Using dynamic list in categoriesDB.
    defaultKeywords: {
        burger: 'hamburguer, burger, x-, sanduiche, lanche',
        pizza: 'pizza, calzone',
        acai: 'açai, açaí, acai',
        marmitex: 'marmitex, quentinha, almoço, prato',
        japonesa: 'sushi, sashimi, temaki, combo, japa',
        salgados: 'coxinha, salgado, pastel, empada',
        sorvete: 'sorvete, picole, picolé, milk shake',
        hotdog: 'hot dog, cachorro quente, prensado'
    },

    async init() {
        this.templatesDB = localforage.createInstance({ name: "bigou", storeName: "templates" });
        this.fontsDB = localforage.createInstance({ name: "bigou", storeName: "fonts" });
        this.genericsDB = localforage.createInstance({ name: "bigou", storeName: "generics" });
        this.keywordsDB = localforage.createInstance({ name: "bigou", storeName: "keywords" });
        this.categoriesDB = localforage.createInstance({ name: "bigou", storeName: "categories" });
        this.campaignsDB = localforage.createInstance({ name: "bigou", storeName: "campaigns" });
        
        await this.loadFontsFromStorage();
    },

    // --- CATEGORIES ---
    async getCategories() {
        const savedCategories = await this.categoriesDB.getItem('list');
        if (!savedCategories) {
            const defaultCats = [
                { id: 'burger', name: 'Hambúrguer' },
                { id: 'pizza', name: 'Pizza' },
                { id: 'acai', name: 'Açaí' },
                { id: 'marmitex', name: 'Marmitex' },
                { id: 'japonesa', name: 'Comida Japonesa' },
                { id: 'salgados', name: 'Salgados' },
                { id: 'sorvete', name: 'Sorvete' },
                { id: 'hotdog', name: 'Cachorro Quente' }
            ];
            await this.categoriesDB.setItem('list', defaultCats);
            return defaultCats;
        }
        return savedCategories;
    },

    async addCategory(name) {
        const id = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '_');
        const cats = await this.getCategories();
        if (!cats.some(c => c.id === id)) {
            cats.push({ id, name });
            await this.categoriesDB.setItem('list', cats);
        }
        return id;
    },

    // --- TEMPLATES ---
    async getTemplates() {
        const keys = await this.templatesDB.keys();
        const templates = [];
        for (let k of keys) {
            templates.push(await this.templatesDB.getItem(k));
        }
        return templates;
    },

    async saveTemplate(templateObj) {
        if (!templateObj.id) templateObj.id = 'tpl_' + Date.now();
        await this.templatesDB.setItem(templateObj.id, templateObj);
        return templateObj;
    },

    async deleteTemplate(id) {
        await this.templatesDB.removeItem(id);
    },

    // --- FONTS ---
    async getFonts() {
        const keys = await this.fontsDB.keys();
        const fonts = [];
        for (let k of keys) {
            fonts.push(await this.fontsDB.getItem(k));
        }
        return fonts;
    },

    async saveFont(name, base64Data) {
        const fontId = 'font_' + Date.now() + Math.floor(Math.random()*1000);
        const fontObj = { id: fontId, name, data: base64Data };
        await this.fontsDB.setItem(fontId, fontObj);
        await this.injectFont(name, base64Data);
        return fontObj;
    },

    async deleteFont(id) {
        await this.fontsDB.removeItem(id);
    },

    async loadFontsFromStorage() {
        const fonts = await this.getFonts();
        let cssString = '';
        const fontLoadPromises = [];
        fonts.forEach(f => {
            cssString += `
            @font-face {
                font-family: '${f.name}';
                src: url('${f.data}');
            }\n`;
        });
        document.getElementById('custom-fonts-style').innerHTML = cssString;
        
        // Força o navegador a pré-carregar as fontes na memória
        fonts.forEach(f => {
            try { fontLoadPromises.push(document.fonts.load(`16px "${f.name}"`)); } catch(e){}
        });
        await Promise.all(fontLoadPromises);
    },

    async injectFont(name, data) {
        const cssString = `
        @font-face {
            font-family: '${name}';
            src: url('${data}');
        }\n`;
        document.getElementById('custom-fonts-style').innerHTML += cssString;
        try { await document.fonts.load(`16px "${name}"`); } catch(e){}
    },

    // --- GENERICS & KEYWORDS ---
    async getGenerics() {
        const data = {};
        const cats = await this.getCategories();
        for (let cat of cats) {
            data[cat.id] = await this.genericsDB.getItem('gen_' + cat.id) || '';
        }
        return data;
    },

    async saveGeneric(type, base64Data) {
        await this.genericsDB.setItem('gen_' + type, base64Data);
    },

    async getKeywords() {
        const keys = {};
        const cats = await this.getCategories();
        for (let cat of cats) {
            let saved = await this.keywordsDB.getItem('kw_' + cat.id);
            keys[cat.id] = saved !== null ? saved : (this.defaultKeywords[cat.id] || '');
        }
        return keys;
    },

    async saveKeyword(type, keywordsString) {
        await this.keywordsDB.setItem('kw_' + type, keywordsString);
    },

    // --- CAMPAIGNS ---
    async getCampaigns() {
        const keys = await this.campaignsDB.keys();
        const campaigns = [];
        for (let k of keys) {
            // Retrieve only metadata to prevent heavy loading for list view
            const camp = await this.campaignsDB.getItem(k);
            if (camp) {
                // omit results array from list for performance, or just return it if memory is not an issue
                campaigns.push({
                    id: camp.id,
                    name: camp.name,
                    createdAt: camp.createdAt,
                    templateId: camp.templateId,
                    totalItems: camp.results ? camp.results.length : 0
                });
            }
        }
        return campaigns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getCampaign(id) {
        return await this.campaignsDB.getItem(id);
    },

    async saveCampaign(campaignObj) {
        if (!campaignObj.id) {
            campaignObj.id = 'camp_' + Date.now();
            campaignObj.createdAt = new Date().toISOString();
        }
        await this.campaignsDB.setItem(campaignObj.id, campaignObj);
        return campaignObj;
    },

    async deleteCampaign(id) {
        await this.campaignsDB.removeItem(id);
    }
};

window.StorageManager = StorageManager;
