const CanvasRenderer = {
    imageCache: new Map(),
    pendingFetches: new Map(),

    // fabric.Image.fromURL não dispara onerror de forma confiável: numa falha de carregamento
    // (404, bloqueio de CORS/rede, etc.) ele resolve com uma imagem "fantasma" de width/height 0
    // em vez de null. Sem essa checagem, o código seguinte tratava isso como sucesso e a foto
    // desaparecia da arte silenciosamente, sem nenhum alerta na Conferência.
    loadFabricImage(src, options) {
        return new Promise((resolve, reject) => {
            // O callback do fabric.Image.fromURL roda fora do corpo síncrono desta Promise
            // (é disparado depois, quando a imagem carrega/falha) — uma exceção aqui dentro
            // NÃO se torna uma rejeição automática, fica descoberta e a Promise nunca resolve
            // nem rejeita. Daí o try/catch: converte qualquer erro (ex.: acessar `img.width`
            // numa imagem quebrada) numa rejeição de verdade.
            try {
                fabric.Image.fromURL(src, (img) => {
                    try {
                        if (!img || !img.width || !img.height) {
                            reject(new Error('Imagem carregada vazia ou corrompida'));
                            return;
                        }
                        resolve(img);
                    } catch (err) {
                        reject(err);
                    }
                }, options);
            } catch (err) {
                reject(err);
            }
        });
    },

    // `fetch`/`fabric.Image.fromURL` não têm timeout embutido: uma URL ruim (host fora do ar,
    // bloqueado, etc.) trava até o navegador desistir por conta própria, o que pode levar bem
    // mais de um minuto — e isso multiplicado pelos 4 fallbacks em sequência. `withTimeout`
    // corta cada tentativa em `ms`, sem cancelar a requisição de verdade (só para de esperar).
    withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms)`)), ms);
            promise.then(
                v => { clearTimeout(timer); resolve(v); },
                e => { clearTimeout(timer); reject(e); },
            );
        });
    },

    async fetchImageAsBlob(url) {
        if (!url) return null;
        if (this.imageCache.has(url)) {
            const cachedSrc = this.imageCache.get(url);
            return this.loadFabricImage(cachedSrc, { crossOrigin: 'anonymous' }).catch(() => null);
        }
        // Feed e Story pedem a mesma logo/foto quase ao mesmo tempo — sem isso, os dois
        // disparariam a cascata inteira de fallbacks em paralelo, duplicando o trabalho.
        if (this.pendingFetches.has(url)) {
            return this.pendingFetches.get(url);
        }

        const promise = this._fetchImageAsBlobUncached(url);
        this.pendingFetches.set(url, promise);
        try {
            return await promise;
        } finally {
            this.pendingFetches.delete(url);
        }
    },

    async _fetchImageAsBlobUncached(url) {
        if (url.startsWith('data:')) {
            this.imageCache.set(url, url);
            return this.loadFabricImage(url).catch(() => null);
        }

        const ATTEMPT_TIMEOUT_MS = 4000;
        const tryFetch = async (targetUrl) => {
            const response = await this.withTimeout(fetch(targetUrl), ATTEMPT_TIMEOUT_MS);
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
                        return await this.withTimeout(
                            this.loadFabricImage(url, { crossOrigin: 'anonymous' }),
                            ATTEMPT_TIMEOUT_MS,
                        );
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

            // Watchdog: mesmo com os timeouts de imagem, garante que a arte nunca fica
            // pendurada indefinidamente por algum caso não previsto — a UI sempre recebe
            // uma resposta (sucesso ou erro) em no máximo 25s.
            let settled = false;
            const watchdog = setTimeout(() => {
                if (settled) return;
                settled = true;
                canvas.dispose();
                reject(new Error('Tempo limite ao gerar a arte (25s) — verifique as imagens do item/logo.'));
            }, 25000);

            this.loadObjects(canvas, templateConfigFormat.objects, dataRow, scaleMultiplier,
                (result) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(watchdog);
                    canvas.dispose(); // Clean up memory by disposing canvas
                    resolve(result);
                },
                (err) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(watchdog);
                    canvas.dispose(); // Clean up memory by disposing canvas
                    reject(err);
                }
            );
        });
    },

    async loadObjects(canvas, objectsJson, dataRow, scaleM, resolve, reject) {
        // Sem este try/catch, um erro síncrono ou numa promise dentro deste callback nunca
        // chega a `resolve`/`reject` — a `generateImage` de fora fica pendente pra sempre
        // (o "Gerando..." trava indefinidamente na UI, sem nenhum erro visível).
        fabric.util.enlivenObjects(objectsJson, async (objs) => {
          try {
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
          } catch (err) {
            console.error('[CanvasRenderer] Falha ao montar a arte:', err);
            reject(err);
          }
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
