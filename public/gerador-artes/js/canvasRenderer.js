const CanvasRenderer = {
    imageCache: new Map(),

    // fabric.Image.fromURL não dispara onerror de forma confiável: numa falha de carregamento
    // (404, bloqueio de CORS/rede, etc.) ele resolve com uma imagem "fantasma" de width/height 0
    // em vez de null. Sem essa checagem, o código seguinte tratava isso como sucesso e a foto
    // desaparecia da arte silenciosamente, sem nenhum alerta na Conferência.
    loadFabricImage(src, options) {
        return new Promise((resolve, reject) => {
            fabric.Image.fromURL(src, (img) => {
                if (!img || !img.width || !img.height) {
                    reject(new Error('Imagem carregada vazia ou corrompida'));
                    return;
                }
                resolve(img);
            }, options);
        });
    },

    async fetchImageAsBlob(url) {
        if (!url) return null;
        if (this.imageCache.has(url)) {
            const cachedSrc = this.imageCache.get(url);
            return this.loadFabricImage(cachedSrc, { crossOrigin: 'anonymous' }).catch(() => null);
        }

        if (url.startsWith('data:')) {
            this.imageCache.set(url, url);
            return this.loadFabricImage(url).catch(() => null);
        }

        const tryFetch = async (targetUrl) => {
            const response = await fetch(targetUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            this.imageCache.set(url, objectUrl);

            return await this.loadFabricImage(objectUrl);
        };

        try {
            // First attempt: Direct fetch (works best if API supports CORS or forces download)
            return await tryFetch(url);
        } catch (e0) {
            console.warn("Direct fetch failed, trying proxies...", e0);
            try {
                const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
                return await tryFetch(proxyUrl);
            } catch (e) {
                console.warn("Codetabs proxy failed, trying corsproxy.io...", e);
                try {
                    const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                    return await tryFetch(proxyUrl2);
                } catch (err) {
                    console.warn("All proxies failed, trying direct img src load...", err);
                    try {
                        this.imageCache.set(url, url);
                        return await this.loadFabricImage(url, { crossOrigin: 'anonymous' });
                    } catch (finalErr) {
                        console.warn("Direct img src load also failed:", finalErr);
                        this.imageCache.delete(url);
                        return null;
                    }
                }
            }
        }
    },

    createTextImage(text, targetWidth, targetHeight, color, fontName, alignment) {
        return new Promise((resolve) => {
            const offCanvas = document.createElement('canvas');
            const ctx = offCanvas.getContext('2d');
            
            offCanvas.width = targetWidth;
            offCanvas.height = targetHeight;
            
            let fontSize = targetHeight; 
            ctx.font = `bold ${fontSize}px "${fontName}"`;
            
            // Native measurement loop (ultra fast)
            while (ctx.measureText(text).width > targetWidth && fontSize > 10) {
                fontSize--;
                ctx.font = `bold ${fontSize}px "${fontName}"`;
            }

            ctx.fillStyle = color;
            ctx.textBaseline = 'middle';
            
            let xPos = 0;
            if (alignment === 'center') {
                ctx.textAlign = 'center';
                xPos = targetWidth / 2;
            } else if (alignment === 'right') {
                ctx.textAlign = 'right';
                xPos = targetWidth;
            } else {
                ctx.textAlign = 'left';
                xPos = 0;
            }
            
            ctx.fillText(text, xPos, targetHeight / 2);
            
            fabric.Image.fromURL(offCanvas.toDataURL(), (img) => {
                resolve(img);
            });
        });
    },

    async generateImage(dataRow, templateConfigFormat, isFeed) {
        await document.fonts.ready;
        return new Promise((resolve, reject) => {
            if (!templateConfigFormat || !templateConfigFormat.objects) {
                return reject("Template format invalid");
            }

            const w = templateConfigFormat.bgDimensions ? templateConfigFormat.bgDimensions.w : 1080;
            const h = templateConfigFormat.bgDimensions ? templateConfigFormat.bgDimensions.h : (isFeed ? 1350 : 1920);

            const canvas = new fabric.StaticCanvas(null, {
                width: w,
                height: h
            });

            const scaleMultiplier = 1; // Removed legacy scaling since editor uses true coordinates

            canvas.backgroundColor = '#ffffff';

            this.loadObjects(canvas, templateConfigFormat.objects, dataRow, scaleMultiplier, 
                (result) => {
                    canvas.dispose(); // Clean up memory by disposing canvas
                    resolve(result);
                }, 
                (err) => {
                    canvas.dispose(); // Clean up memory by disposing canvas
                    reject(err);
                }
            );
        });
    },

    async loadObjects(canvas, objectsJson, dataRow, scaleM, resolve, reject) {
        fabric.util.enlivenObjects(objectsJson, async (objs) => {
            const promises = [];

            for (let obj of objs) {
                // No scale mapping needed, objects are already in true coordinates
                // Keep obj as is


                if (obj.isBgImage) {
                    obj.set({
                        scaleX: canvas.width / obj.width,
                        scaleY: canvas.height / obj.height,
                        originX: 'left',
                        originY: 'top',
                        left: 0,
                        top: 0
                    });
                    canvas.add(obj);
                    obj.sendToBack();
                }
                else if (obj.placeholderType === 'text' && obj.bindKey) {
                    let textVal = String(dataRow[obj.bindKey] || '');
                    
                    const targetW = obj.width * obj.scaleX;
                    const targetH = obj.height * obj.scaleY;
                    
                    const p = this.createTextImage(
                        textVal, 
                        targetW, 
                        targetH, 
                        obj.customColor || '#ffffff', 
                        obj.customFont || 'Inter', 
                        obj.customAlign || 'center'
                    ).then(textImg => {
                        textImg.set({
                            left: obj.left,
                            top: obj.top,
                            originX: obj.originX,
                            originY: obj.originY
                        });
                        canvas.add(textImg);
                    });
                    promises.push(p);
                } 
                else if (obj.isPlaceholder && obj.bindKey) {
                    let imgUrl = dataRow[obj.bindKey];
                    if (imgUrl) {
                        const p = this.fetchImageAsBlob(imgUrl).then(fImg => {
                            if (fImg && fImg.width && fImg.height) {
                                const targetW = obj.width * obj.scaleX;
                                const targetH = obj.height * obj.scaleY;
                                
                                const ratioX = targetW / fImg.width;
                                const ratioY = targetH / fImg.height;
                                const ratio = Math.max(ratioX, ratioY);

                                const originX = obj.originX || 'left';
                                const originY = obj.originY || 'top';
                                
                                const placeholderCenterX = obj.left + (originX === 'center' ? 0 : targetW / 2);
                                const placeholderCenterY = obj.top + (originY === 'center' ? 0 : targetH / 2);

                                fImg.set({
                                    left: placeholderCenterX,
                                    top: placeholderCenterY,
                                    originX: 'center',
                                    originY: 'center',
                                    scaleX: ratio,
                                    scaleY: ratio
                                });

                                let clipPath;
                                if (obj.placeholderShape === 'circle') {
                                    clipPath = new fabric.Circle({
                                        radius: (obj.width / 2),
                                        originX: 'center',
                                        originY: 'center',
                                    });
                                } else {
                                    clipPath = new fabric.Rect({
                                        width: obj.width,
                                        height: obj.height,
                                        originX: 'center',
                                        originY: 'center',
                                    });
                                }
                                
                                clipPath.scaleX = 1/ratio * obj.scaleX;
                                clipPath.scaleY = 1/ratio * obj.scaleY;
                                
                                fImg.set({ clipPath: clipPath });
                                canvas.add(fImg);
                            } else {
                                if(!dataRow.alert) dataRow.alert = `Não foi possível carregar a imagem de "${obj.bindKey}" (URL inacessível ou bloqueada pela rede/navegador).`;
                            }
                        });
                        promises.push(p);
                    } else {
                        if(!dataRow.alert) dataRow.alert = `Campo "${obj.bindKey}" sem valor de imagem para preencher este elemento.`;
                    }
                } else {
                    canvas.add(obj);
                }
            }

            await Promise.all(promises);
            canvas.renderAll();
            
            const fullDataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
            const thumbDataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.6, multiplier: 0.2 });
            resolve({ full: fullDataUrl, thumb: thumbDataUrl });
        });
    },

    clearCache() {
        for (let [url, objectUrl] of this.imageCache.entries()) {
            if (objectUrl && objectUrl.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(objectUrl);
                } catch (e) {
                    console.warn("Failed to revoke object URL:", objectUrl, e);
                }
            }
        }
        this.imageCache.clear();
        console.log("[CanvasRenderer] Cache cleared and object URLs revoked.");
    }
};

window.CanvasRenderer = CanvasRenderer;
