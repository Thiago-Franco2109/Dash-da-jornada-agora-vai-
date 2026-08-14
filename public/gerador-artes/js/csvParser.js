const CsvParser = {
    formatDays(daysStr) {
        if (!daysStr || daysStr === 'NULL' || String(daysStr).trim() === '') return '';
        const daysArr = daysStr.split(',').map(d => parseInt(d.trim())).sort();
        
        const isEveryday = daysArr.length === 7;
        if (isEveryday) return '';

        const isWeekdays = daysArr.length === 5 && !daysArr.includes(0) && !daysArr.includes(6);
        if (isWeekdays) return 'Apenas de Segunda a Sexta';

        const isWeekend = daysArr.length === 2 && daysArr.includes(0) && daysArr.includes(6);
        if (isWeekend) return 'Apenas Sábado e Domingo';

        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const mapped = daysArr.map(d => dayNames[d]);
        
        if (mapped.length === 1) return `Apenas às ${mapped[0]}s`.replace('Domingos', 'Domingo').replace('Sábados', 'Sábado');
        
        const last = mapped.pop();
        return `Apenas ${mapped.join(', ')} e ${last}`;
    },

    formatPrice(priceVal) {
        if (!priceVal || priceVal === 'NULL') return '';
        const str = String(priceVal).trim();
        const num = parseFloat(str);
        if (isNaN(num)) return str;
        
        const formatted = num.toFixed(2).replace('.', ',');
        return `R$ ${formatted}`;
    },

    matchGeneric(itemName, genericsMap, keywordsMap) {
        const name = String(itemName).toLowerCase();
        
        // keywordsMap is like: { burger: 'hamburguer, x-, lanche', pizza: 'pizza, calzone' }
        for (const cat in keywordsMap) {
            const keys = keywordsMap[cat].split(',').map(k => k.trim().toLowerCase()).filter(k => k);
            for (const key of keys) {
                if (name.includes(key)) {
                    return genericsMap[cat]; // return the base64 image or empty string
                }
            }
        }
        return null;
    },

    async parse(file, genericsMap, keywordsMap) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const data = results.data.map(row => {
                        let alertMsg = null;
                        
                        let originalItemImg = (row.item_imagem && row.item_imagem !== 'NULL') ? row.item_imagem.trim() : '';
                        let hasOriginalPhoto = !!originalItemImg;
                        
                        let itemImageUrl = originalItemImg;
                        let logoImageUrl = (row.estabelecimento_imagem && row.estabelecimento_imagem !== 'NULL') ? row.estabelecimento_imagem.trim() : '';

                        // Resolver redirecionamento 301 da API para o CDN final para evitar bloqueio de CORS no navegador
                        if (itemImageUrl) {
                            itemImageUrl = itemImageUrl.replace('https://api.bigou.com.br/uploads/', 'https://labcinco.nyc3.cdn.digitaloceanspaces.com/bigou/');
                        }
                        if (logoImageUrl) {
                            logoImageUrl = logoImageUrl.replace('https://api.bigou.com.br/uploads/', 'https://labcinco.nyc3.cdn.digitaloceanspaces.com/bigou/');
                        }
                        
                        let usedGeneric = false;

                        if (!itemImageUrl) {
                            const genericMatched = this.matchGeneric(row.item_nome, genericsMap, keywordsMap);
                            if (genericMatched) {
                                itemImageUrl = genericMatched;
                                usedGeneric = true;
                            } else {
                                alertMsg = 'Item sem foto e nome não corresponde a nenhuma genérica.';
                            }
                        }

                        // Extract city name with fallback checks
                        let rawCity = row.cidade_nome || row.cidade || row.cidade_parceiro;
                        let cityName = (rawCity && rawCity !== 'NULL') ? String(rawCity).trim() : 'Sem Cidade';

                        return {
                            id: row.item_catalogo_id || Math.random().toString(36).substr(2, 9),
                            partnerName: (row.estabelecimento_nome && row.estabelecimento_nome !== 'NULL') ? row.estabelecimento_nome : 'Parceiro',
                            itemName: (row.item_nome && row.item_nome !== 'NULL') ? row.item_nome : '',
                            priceOrig: this.formatPrice(row.preco_original),
                            pricePromo: this.formatPrice(row.preco_promocional),
                            daysText: this.formatDays(row.disponibilidade_diaria),
                            itemImage: itemImageUrl,
                            logoImage: logoImageUrl,
                            usedGeneric,
                            alert: alertMsg,
                            hasOriginalPhoto,
                            cityName
                        };
                    });
                    resolve(data);
                },
                error: (err) => {
                    reject(err);
                }
            });
        });
    }
};

window.CsvParser = CsvParser;
