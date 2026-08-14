const Editor = {
    canvas: null,
    currentFormat: 'feed', // feed | story
    currentTemplateId: null,
    
    templateData: {
        name: '',
        feed: { bg: null, bgDimensions: null, objects: [] },
        story: { bg: null, bgDimensions: null, objects: [] },
        feed_no_image: { bg: null, bgDimensions: null, objects: [] },
        story_no_image: { bg: null, bgDimensions: null, objects: [] }
    },

    undoStack: [],
    clipboard: null,
    isProcessingUndo: false,
    isLoadingFormat: false,

    init() {
        this.canvas = new fabric.Canvas('fabric-canvas', {
            preserveObjectStacking: true
        });

        fabric.Object.prototype.transparentCorners = false;
        fabric.Object.prototype.cornerColor = '#26b573';
        fabric.Object.prototype.cornerStrokeColor = '#ffffff';
        fabric.Object.prototype.borderColor = '#26b573';
        fabric.Object.prototype.cornerStyle = 'circle';
        fabric.Object.prototype.cornerSize = 16;
        fabric.Object.prototype.padding = 5;

        // Native rendering overrides for placeholders
        const origRectRender = fabric.Rect.prototype._render;
        fabric.Rect.prototype._render = function(ctx) {
            origRectRender.call(this, ctx);
            if (this.isPlaceholder) {
                ctx.save();
                if (this.placeholderType === 'text') {
                    ctx.fillStyle = this.customColor || '#ffffff';
                    let fontSize = this.height * 0.6; // Better fit
                    const text = this.textLabel || "Texto";
                    ctx.font = `bold ${fontSize}px "${this.customFont || 'Inter'}"`;
                    
                    // Same logic as final generator: shrink font to fit width
                    while (ctx.measureText(text).width > (this.width - 20) && fontSize > 10) {
                        fontSize--;
                        ctx.font = `bold ${fontSize}px "${this.customFont || 'Inter'}"`;
                    }

                    ctx.textBaseline = 'middle';
                    let xPos = 0;
                    if (this.customAlign === 'left') {
                        ctx.textAlign = 'left';
                        xPos = -this.width / 2 + 10;
                    } else if (this.customAlign === 'right') {
                        ctx.textAlign = 'right';
                        xPos = this.width / 2 - 10;
                    } else {
                        ctx.textAlign = 'center';
                    }
                    ctx.fillText(text, xPos, 0);
                } else if (this.placeholderType === 'image') {
                    ctx.fillStyle = '#ffffff';
                    const fontSize = this.height * 0.2;
                    ctx.font = `${fontSize}px Inter`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("Foto", 0, 0);
                }
                ctx.restore();
            }
        };

        const origCircleRender = fabric.Circle.prototype._render;
        fabric.Circle.prototype._render = function(ctx) {
            origCircleRender.call(this, ctx);
            if (this.isPlaceholder && this.placeholderType === 'image') {
                ctx.save();
                ctx.fillStyle = '#ffffff';
                const fontSize = this.radius * 0.4;
                ctx.font = `${fontSize}px Inter`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText("Logo", 0, 0);
                ctx.restore();
            }
        };


        // Resize listener for Fit To Screen
        window.addEventListener('resize', () => {
            if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.loadFormatState(this.currentFormat);
            }, 200);
        });

        this.setupListeners();
        this.saveHistory();
    },

    calculateFitDimensions(w, h) {
        const panel = document.querySelector('.canvas-panel');
        if (!panel) return { w, h, scale: 1 };
        
        const paddingW = 80; // 40px left + 40px right
        const paddingH = 120; // 60px top + 60px bottom
        let availableW = panel.clientWidth - paddingW;
        let availableH = panel.clientHeight - paddingH; 
        
        console.log(`[Viewport] Panel Client Size: ${panel.clientWidth}x${panel.clientHeight}`);
        
        // Ensure we always have a positive space
        if (availableW <= 0) availableW = window.innerWidth * 0.5;
        if (availableH <= 0) availableH = window.innerHeight * 0.6;

        const ratioX = availableW / w;
        const ratioY = availableH / h;
        const scale = Math.max(0.1, Math.min(ratioX, ratioY)); 

        const finalW = w * scale;
        const finalH = h * scale;

        console.log(`[Viewport] Image: ${w}x${h} -> Fit Scale: ${scale.toFixed(4)} -> Final Canvas: ${finalW.toFixed(0)}x${finalH.toFixed(0)}`);

        return {
            w: finalW,
            h: finalH,
            scale: scale
        };
    },

    updateActiveButtons() {
        const objs = this.canvas.getObjects();
        const keysInCanvas = objs.map(o => o.bindKey).filter(k => k);
        
        document.querySelectorAll('.add-el-btn').forEach(btn => {
            if (keysInCanvas.includes(btn.dataset.bindkey)) {
                btn.classList.add('active-green');
            } else {
                btn.classList.remove('active-green');
            }
        });
    },

    saveHistory() {
        if (this.isProcessingUndo || this.isLoadingFormat) return;
        const json = this.canvas.toJSON(['bindKey', 'isPlaceholder', 'placeholderShape', 'placeholderType', 'customColor', 'customFont', 'customAlign', 'isBgImage', 'textLabel']);
        this.templateData[this.currentFormat].objects = json.objects;
        
        this.undoStack.push(JSON.stringify(json));
        if (this.undoStack.length > 20) this.undoStack.shift(); 
        
        this.updateActiveButtons();
    },

    undo() {
        if (this.undoStack.length > 1) {
            this.isProcessingUndo = true;
            this.undoStack.pop(); 
            const previousState = this.undoStack[this.undoStack.length - 1];
            
            this.canvas.loadFromJSON(previousState, () => {
                this.canvas.renderAll();
                this.isProcessingUndo = false;
                this.updateActiveButtons();
            });
        }
    },

    alignSelected(direction) {
        const activeObj = this.canvas.getActiveObject();
        if (!activeObj) return;

        if (activeObj.type === 'activeSelection') {
            const objects = activeObj.getObjects();
            objects.forEach(obj => {
                const w = obj.width * obj.scaleX;
                const h = obj.height * obj.scaleY;
                
                switch (direction) {
                    case 'left':
                        obj.set('left', -activeObj.width / 2 + (obj.originX === 'center' ? w / 2 : 0));
                        break;
                    case 'center-h':
                        obj.set('left', 0 - (obj.originX === 'left' ? w / 2 : 0));
                        break;
                    case 'right':
                        obj.set('left', activeObj.width / 2 - (obj.originX === 'left' ? w : w / 2));
                        break;
                    case 'top':
                        obj.set('top', -activeObj.height / 2 + (obj.originY === 'center' ? h / 2 : 0));
                        break;
                    case 'center-v':
                        obj.set('top', 0 - (obj.originY === 'top' ? h / 2 : 0));
                        break;
                    case 'bottom':
                        obj.set('top', activeObj.height / 2 - (obj.originY === 'top' ? h : h / 2));
                        break;
                }
            });
            activeObj.setCoords();
            this.canvas.renderAll();
            this.saveHistory();
        } else {
            const canvasW = this.canvas.width;
            const canvasH = this.canvas.height;
            const w = activeObj.width * activeObj.scaleX;
            const h = activeObj.height * activeObj.scaleY;

            switch (direction) {
                case 'left':
                    activeObj.set('left', activeObj.originX === 'center' ? w / 2 : 0);
                    break;
                case 'center-h':
                    activeObj.set('left', canvasW / 2 - (activeObj.originX === 'left' ? w / 2 : 0));
                    break;
                case 'right':
                    activeObj.set('left', canvasW - (activeObj.originX === 'left' ? w : w / 2));
                    break;
                case 'top':
                    activeObj.set('top', activeObj.originY === 'center' ? h / 2 : 0);
                    break;
                case 'center-v':
                    activeObj.set('top', canvasH / 2 - (activeObj.originY === 'top' ? h / 2 : 0));
                    break;
                case 'bottom':
                    activeObj.set('top', canvasH - (activeObj.originY === 'top' ? h : h / 2));
                    break;
            }
            activeObj.setCoords();
            this.canvas.renderAll();
            this.saveHistory();
        }
    },

    copy() {
        const active = this.canvas.getActiveObject();
        if (active) {
            active.clone((cloned) => {
                this.clipboard = cloned;
            }, ['bindKey', 'isPlaceholder', 'placeholderShape', 'placeholderType', 'customColor', 'customFont', 'customAlign', 'isBgImage', 'textLabel']);
        }
    },

    paste() {
        if (this.clipboard && !this.clipboard.isBgImage) {
            this.clipboard.clone((clonedObj) => {
                this.canvas.discardActiveObject();
                clonedObj.set({
                    left: clonedObj.left + 50,
                    top: clonedObj.top + 50,
                    evented: true,
                });
                if (clonedObj.type === 'activeSelection') {
                    clonedObj.canvas = this.canvas;
                    clonedObj.forEachObject((obj) => {
                        this.canvas.add(obj);
                    });
                    clonedObj.setCoords();
                } else {
                    this.canvas.add(clonedObj);
                }
                this.clipboard.top += 50;
                this.clipboard.left += 50;
                this.canvas.setActiveObject(clonedObj);
                this.canvas.requestRenderAll();
                this.saveHistory();
            }, ['bindKey', 'isPlaceholder', 'placeholderShape', 'placeholderType', 'customColor', 'customFont', 'customAlign', 'isBgImage', 'textLabel']);
        }
    },

    setupListeners() {
        this.canvas.on('selection:created', (e) => this.showElementProps(e.selected[0]));
        this.canvas.on('selection:updated', (e) => this.showElementProps(e.selected[0]));
        this.canvas.on('selection:cleared', () => document.getElementById('element-props').classList.add('hidden'));

        this.canvas.on('object:modified', () => this.saveHistory());
        this.canvas.on('object:added', () => this.saveHistory());
        this.canvas.on('object:removed', () => this.saveHistory());

        // Prevent text deformation when resizing placeholders
        this.canvas.on('object:scaling', (e) => {
            const obj = e.target;
            if (obj.isPlaceholder) {
                if (obj.type === 'circle') {
                    const newRadius = obj.radius * Math.max(obj.scaleX, obj.scaleY);
                    obj.set({
                        radius: newRadius,
                        scaleX: 1,
                        scaleY: 1
                    });
                } else {
                    obj.set({
                        width: obj.width * obj.scaleX,
                        height: obj.height * obj.scaleY,
                        scaleX: 1,
                        scaleY: 1
                    });
                }
            }
        });

        window.addEventListener('keydown', (e) => {
            if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.ctrlKey && e.key === 'c') { e.preventDefault(); this.copy(); }
            if (e.ctrlKey && e.key === 'v') { e.preventDefault(); this.paste(); }
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
            }
        });

        const colorPicker = document.getElementById('prop-color');
        const colorHex = document.getElementById('prop-color-hex');

        colorPicker.addEventListener('input', (e) => {
            colorHex.value = e.target.value.toUpperCase();
            this.updateTextColor(e.target.value);
        });

        colorHex.addEventListener('input', (e) => {
            let val = e.target.value;
            if(val.length === 7 && val.startsWith('#')) {
                colorPicker.value = val;
                this.updateTextColor(val);
            }
        });

        document.getElementById('prop-font').addEventListener('change', (e) => {
            const obj = this.canvas.getActiveObject();
            if (obj && obj.placeholderType === 'text') {
                obj.set('customFont', e.target.value);
                this.canvas.renderAll();
                this.saveHistory();
            }
        });



        const formats = [
            { id: 'btn-switch-feed', name: 'feed', label: 'Feed Normal', hasClone: false },
            { id: 'btn-switch-story', name: 'story', label: 'Story Normal', hasClone: true, cloneFrom: 'feed' },
            { id: 'btn-switch-feed-no-image', name: 'btn-switch-feed-no-image', realName: 'feed_no_image', label: 'Feed Sem Foto', hasClone: false },
            { id: 'btn-switch-story-no-image', name: 'btn-switch-story-no-image', realName: 'story_no_image', label: 'Story Sem Foto', hasClone: true, cloneFrom: 'feed_no_image' }
        ];

        formats.forEach(fmt => {
            const el = document.getElementById(fmt.id);
            if (el) {
                el.addEventListener('click', () => {
                    formats.forEach(f => {
                        const btn = document.getElementById(f.id);
                        if (btn) btn.classList.toggle('active', f.id === fmt.id);
                    });
                    
                    document.getElementById('bg-format-lbl').innerText = fmt.label;
                    
                    const cloneArea = document.getElementById('story-clone-area');
                    const cloneBtn = document.getElementById('btn-clone-feed');
                    
                    const formatName = fmt.realName || fmt.name;
                    
                    if (cloneArea) {
                        cloneArea.classList.toggle('hidden', !fmt.hasClone);
                        if (fmt.hasClone) {
                            cloneBtn.innerText = `Clonar Elementos do ${fmt.cloneFrom === 'feed' ? 'Feed Normal' : 'Feed Sem Foto'}`;
                            cloneBtn.dataset.cloneFrom = fmt.cloneFrom;
                            cloneBtn.disabled = !this.templateData[fmt.cloneFrom].bgDimensions;
                        }
                    }
                    
                    this.switchFormat(formatName);
                });
            }
        });

        document.getElementById('bg-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setBackground(event.target.result);
                document.getElementById('bg-upload').value = '';
            };
            reader.readAsDataURL(file);
        });

        // Clone Elements Feed -> Story (support both Normal and Sem Foto)
        document.getElementById('btn-clone-feed').addEventListener('click', () => {
            const cloneFrom = document.getElementById('btn-clone-feed').dataset.cloneFrom || 'feed';
            const fromData = this.templateData[cloneFrom];
            if (!fromData || !fromData.objects || fromData.objects.length === 0) return;
            
            const bgDimFrom = fromData.bgDimensions;
            const bgDimTo = this.templateData[this.currentFormat].bgDimensions;

            if (!bgDimFrom || !bgDimTo) {
                const fromLabel = cloneFrom === 'feed' ? 'Feed Normal' : 'Feed Sem Foto';
                const toLabel = this.currentFormat === 'story' ? 'Story Normal' : 'Story Sem Foto';
                return showToast('Aviso', `Para clonar, é necessário que tanto o ${fromLabel} quanto o ${toLabel} tenham imagens de fundo anexadas para calcular as posições.`, 'error');
            }
            
            const scaleRatio = bgDimTo.w / bgDimFrom.w; 
            const yOffset = (bgDimTo.h - (bgDimFrom.h * scaleRatio)) / 2;
            
            const clonedObjects = fromData.objects.map(obj => {
                if (obj.isBgImage) return null; 
                const newObj = JSON.parse(JSON.stringify(obj));
                newObj.left *= scaleRatio;
                newObj.top = (newObj.top * scaleRatio) + yOffset;
                newObj.scaleX *= scaleRatio;
                newObj.scaleY *= scaleRatio;
                return newObj;
            }).filter(x => x !== null);
            
            // Keep current Story BG
            const objsToKeep = this.templateData[this.currentFormat].objects.filter(o => o.isBgImage);
            this.templateData[this.currentFormat].objects = objsToKeep.concat(clonedObjects);
            
            this.loadFormatState(this.currentFormat);
        });
    },

    updateTextColor(hexValue) {
        const obj = this.canvas.getActiveObject();
        if (obj && obj.placeholderType === 'text') {
            obj.set('customColor', hexValue);
            this.canvas.renderAll();
            this.saveHistory();
        }
    },

    showElementProps(obj) {
        if (!obj) return;
        const panel = document.getElementById('element-props');
        panel.classList.remove('hidden');

        if (obj.placeholderType === 'text') {
            document.getElementById('color-wrapper').style.display = 'block';
            document.getElementById('prop-font').parentElement.style.display = 'block';
            
            const color = obj.customColor || '#ffffff';
            document.getElementById('prop-color').value = color;
            document.getElementById('prop-color-hex').value = color.toUpperCase();
            document.getElementById('prop-font').value = obj.customFont || 'Inter';
            
            document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
            if(obj.customAlign) {
                const btn = document.querySelector(`.align-btn[data-align="${obj.customAlign}"]`);
                if(btn) btn.classList.add('active');
            }
        } else {
            document.getElementById('color-wrapper').style.display = 'none';
            document.getElementById('prop-font').parentElement.style.display = 'none';
        }
    },

    addTextElement(label, bindKey) {
        if (!this.templateData[this.currentFormat].bgDimensions) {
            return showToast('Aviso', "Anexe uma imagem de fundo primeiro para definir o tamanho da arte.", 'error');
        }
        
        const obj = new fabric.Rect({
            left: 200, top: 200, 
            width: 400, height: 80,
            fill: 'rgba(0, 0, 0, 0.4)', stroke: '#ffffff', strokeWidth: 2, strokeDashArray: [6,6],
            lockRotation: true
        });
        
        obj.bindKey = bindKey;
        obj.isPlaceholder = true;
        obj.placeholderType = 'text';
        obj.textLabel = label;
        obj.customColor = '#ffffff';
        obj.customFont = 'Inter';
        obj.customAlign = 'center';

        obj.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: false });

        this.canvas.add(obj);
        this.canvas.setActiveObject(obj);
    },

    addPlaceholder(bindKey, shape) {
        if (!this.templateData[this.currentFormat].bgDimensions) {
            return showToast('Aviso', "Anexe uma imagem de fundo primeiro para definir o tamanho da arte.", 'error');
        }

        let obj;
        if (shape === 'circle') {
            obj = new fabric.Circle({
                radius: 120, 
                fill: 'rgba(0, 0, 0, 0.5)', stroke: '#ffffff', strokeWidth: 3, strokeDashArray: [6,6],
                left: 100, top: 100, lockRotation: true
            });
            obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
        } else {
            obj = new fabric.Rect({
                width: 300, height: 300, 
                fill: 'rgba(0, 0, 0, 0.5)', stroke: '#ffffff', strokeWidth: 3, strokeDashArray: [6,6],
                left: 100, top: 100, lockRotation: true
            });
            obj.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: false });
        }
        
        obj.bindKey = bindKey;
        obj.isPlaceholder = true;
        obj.placeholderType = 'image';
        obj.placeholderShape = shape;
        
        this.canvas.add(obj);
        this.canvas.setActiveObject(obj);
    },

    deleteSelected() {
        const active = this.canvas.getActiveObjects();
        if (active.length) {
            this.canvas.discardActiveObject();
            active.forEach(obj => {
                if(!obj.isBgImage) this.canvas.remove(obj);
            });
        }
    },

    setBackground(dataUrl) {
        console.log("[Editor] setBackground called with dataUrl length:", dataUrl.length);
        this.templateData[this.currentFormat].bg = dataUrl;
        
        fabric.Image.fromURL(dataUrl, (img) => {
            if (!img) {
                console.error("[Editor] Failed to load background image from URL");
                return;
            }
            
            const w = img.width;
            const h = img.height;
            console.log(`[Editor] Background Image Object Loaded: ${w}x${h}`);
            
            this.templateData[this.currentFormat].bgDimensions = { w, h };
            
            const fit = this.calculateFitDimensions(w, h);

            this.canvas.setWidth(fit.w);
            this.canvas.setHeight(fit.h);
            this.canvas.setZoom(fit.scale);
            
            const objects = this.canvas.getObjects();
            const oldBg = objects.find(o => o.isBgImage);
            if(oldBg) {
                this.canvas.remove(oldBg);
            }

            img.set({
                scaleX: 1,
                scaleY: 1,
                originX: 'left',
                originY: 'top',
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
                isBgImage: true,
                opacity: 1
            });
            
            this.canvas.add(img);
            img.sendToBack();
            
            this.canvas.requestRenderAll();
            this.canvas.calcOffset();
            console.log("[Editor] Canvas rendered and offset calculated.");
            
            this.saveHistory();

            if (this.currentFormat === 'story') {
                document.getElementById('btn-clone-feed').disabled = false;
            }
        }, { crossOrigin: 'anonymous' });
    },

    loadFormatState(format) {
        // Use a small delay to ensure DOM is visible and panel has dimensions
        setTimeout(() => {
            this._executeLoadFormatState(format);
        }, 50);
    },

    _executeLoadFormatState(format) {
        this.isLoadingFormat = true;
        this.canvas.clear();
        this.undoStack = [];
        
        const data = this.templateData[format];
        
        if (format === 'story') {
            document.getElementById('btn-clone-feed').disabled = !data.bgDimensions;
        }

        if (!data.bgDimensions) {
            const tempW = 1080;
            const tempH = format === 'feed' ? 1350 : 1920;
            const fit = this.calculateFitDimensions(tempW, tempH);
            this.canvas.setWidth(fit.w);
            this.canvas.setHeight(fit.h);
            this.canvas.setZoom(fit.scale);
        } else {
            const fit = this.calculateFitDimensions(data.bgDimensions.w, data.bgDimensions.h);
            this.canvas.setWidth(fit.w);
            this.canvas.setHeight(fit.h);
            this.canvas.setZoom(fit.scale);
        }

        const finalizeLoad = () => {
            this.isLoadingFormat = false;
        };

        if (data.objects && data.objects.length) {
            fabric.util.enlivenObjects(data.objects, (objs) => {
                objs.forEach(o => this.canvas.add(o));
                
                const hasBgObj = objs.some(o => o.isBgImage);
                if (data.bg && !hasBgObj) {
                    finalizeLoad();
                    this.setBackground(data.bg);
                } else {
                    finalizeLoad();
                    this.canvas.renderAll();
                    this.saveHistory();
                }
            });
        } else {
            finalizeLoad();
            if (data.bg) this.setBackground(data.bg);
            else this.saveHistory();
        }
    },


    undo() {
        if (this.undoStack.length === 0) return;
        this.isProcessingUndo = true;
        const state = this.undoStack.pop();
        
        this.canvas.loadFromJSON(state, () => {
            this.canvas.renderAll();
            this.isProcessingUndo = false;
            
            const json = this.canvas.toJSON(['bindKey', 'isPlaceholder', 'placeholderShape', 'placeholderType', 'customColor', 'customFont', 'customAlign', 'isBgImage', 'textLabel']);
            this.templateData[this.currentFormat].objects = json.objects;
        });
    },

    switchFormat(format) {
        this.currentFormat = format;
        this.loadFormatState(format);
    },

    loadTemplate(templateObj) {
        this.currentTemplateId = templateObj.id;
        document.getElementById('tpl-name').value = templateObj.name || '';
        
        const safeFeed = templateObj.feed || { bg: null, objects: [] };
        const safeStory = templateObj.story || { bg: null, objects: [] };
        const safeFeedNoImg = templateObj.feed_no_image || (templateObj.variants && templateObj.variants.feed_no_image) || { bg: null, objects: [] };
        const safeStoryNoImg = templateObj.story_no_image || (templateObj.variants && templateObj.variants.story_no_image) || { bg: null, objects: [] };

        this.templateData = {
            name: templateObj.name,
            feed: safeFeed,
            story: safeStory,
            feed_no_image: safeFeedNoImg,
            story_no_image: safeStoryNoImg
        };
        
        document.getElementById('btn-switch-feed').click();
    },

    getTemplateToSave() {
        this.saveHistory(); // ensure latest is saved
        return {
            id: this.currentTemplateId,
            name: document.getElementById('tpl-name').value || 'Template Sem Nome',
            feed: this.templateData.feed,
            story: this.templateData.story,
            feed_no_image: this.templateData.feed_no_image,
            story_no_image: this.templateData.story_no_image,
            variants: {
                feed_normal: this.templateData.feed,
                feed_no_image: this.templateData.feed_no_image,
                story_normal: this.templateData.story,
                story_no_image: this.templateData.story_no_image
            }
        };
    }
};

window.Editor = Editor;
