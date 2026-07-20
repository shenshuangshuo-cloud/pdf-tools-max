/* ========== Tool: Edit PDF — Fabric.js Overlay Architecture ========== */

App.register('edit', {

    /* ── State ── */
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    originalFile: null,
    fileName: '',

    pdfCanvas: null,
    fabricCanvas: null,

    scale: 1.5,
    zoom: 1.0,

    currentMode: 'cursor',
    shapeType: 'rect',
    textColor: '#000000',
    textSize: 16,
    textFont: 'Noto Sans SC',

    history: [],
    historyIndex: -1,
    _pageStates: {},

    /* ── Init ── */
    async init(body) {
        body.innerHTML = this._buildHTML();
        this.initFabric();
        this.bindToolbar();
        this._bindPageNav();
        this._bindZoom();
        this._bindSave();
        this._bindDelete();
        this._bindUndoRedo();
        this._bindKeyboard();
        this._bindStyleControls();

        // Show upload zone
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    /* ── HTML ── */
    _buildHTML() {
        return `
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="edit-content" style="display:none">
                ${this._toolbarHTML()}
                <div class="edit-canvas-container" id="edit-container">
                    <canvas id="pdf-canvas"></canvas>
                    <canvas id="fabric-canvas"></canvas>
                    <div class="page-nav">
                        <button id="btn-prev">&#8592;</button>
                        <span id="page-indicator">1 / 1</span>
                        <button id="btn-next">&#8594;</button>
                    </div>
                </div>
            </div>
        `;
    },

    _toolbarHTML() {
        return `
        <div class="edit-toolbar">
            <div class="toolbar-group">
                <button class="tb-btn active" data-mode="cursor" title="选择/移动">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l6 16 2-6 6-2z"/></svg>
                    指针
                </button>
                <button class="tb-btn" data-mode="text" title="添加文字">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                    文字
                </button>
                <button class="tb-btn" data-mode="image" title="添加图片">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    图片
                </button>
                <button class="tb-btn" data-mode="shape" title="添加形状">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    形状
                </button>
            </div>
            <div class="toolbar-group" id="shape-options" style="display:none">
                <button class="tb-btn" data-shape="rect">矩形</button>
                <button class="tb-btn" data-shape="circle">圆形</button>
                <button class="tb-btn" data-shape="line">直线</button>
            </div>
            <div class="toolbar-group">
                <input type="color" id="text-color" value="#000000" title="颜色">
                <select id="text-size">
                    <option value="12">12</option>
                    <option value="14">14</option>
                    <option value="16" selected>16</option>
                    <option value="20">20</option>
                    <option value="24">24</option>
                    <option value="32">32</option>
                    <option value="48">48</option>
                </select>
                <select id="text-font">
                    <option value="Noto Sans SC">Noto Sans SC</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                </select>
            </div>
            <div class="toolbar-group">
                <button class="tb-btn" id="btn-undo" title="撤销">&#8617;</button>
                <button class="tb-btn" id="btn-redo" title="重做">&#8618;</button>
                <button class="tb-btn" id="btn-delete" title="删除选中">&#10005;</button>
            </div>
            <div class="toolbar-group">
                <button class="tb-btn" id="btn-zoom-out">&#8722;</button>
                <span class="zoom-label" id="zoom-label">100%</span>
                <button class="tb-btn" id="btn-zoom-in">+</button>
                <button class="tb-btn" id="btn-zoom-fit">适应</button>
            </div>
            <div class="toolbar-group">
                <button class="tb-btn primary" id="btn-save">保存 PDF</button>
            </div>
        </div>`;
    },

    /* ── Load File ── */
    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.originalFile = file;
        this.fileName = file.name;

        const arrayBuffer = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        this.totalPages = this.pdfDoc.numPages;
        this.currentPage = 1;
        this._pageStates = {};
        this.history = [];
        this.historyIndex = -1;

        document.getElementById('edit-content').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';

        this.pdfCanvas = document.getElementById('pdf-canvas');
        await this.renderPage();
        this._saveHistory();
    },

    /* ── Init Fabric ── */
    initFabric() {
        this.fabricCanvas = new fabric.Canvas('fabric-canvas', {
            selection: true,
            preserveObjectStacking: true
        });
        this.fabricCanvas.on('selection:created', () => this._onSelectionChange());
        this.fabricCanvas.on('selection:updated', () => this._onSelectionChange());
        this.fabricCanvas.on('selection:cleared', () => this._onSelectionChange());
        this.fabricCanvas.on('object:modified', () => this._saveHistory());
        this.fabricCanvas.on('object:added', () => { if (!this._isLoadingHistory) this._saveHistory(); });
        this.fabricCanvas.on('object:removed', () => { if (!this._isLoadingHistory) this._saveHistory(); });
        this._isLoadingHistory = false;
    },

    /* ── Render Page ── */
    async renderPage() {
        const page = await this.pdfDoc.getPage(this.currentPage);
        const viewport = page.getViewport({ scale: this.scale });

        this.pdfCanvas.width = viewport.width;
        this.pdfCanvas.height = viewport.height;

        const ctx = this.pdfCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        this.fabricCanvas.setWidth(viewport.width);
        this.fabricCanvas.setHeight(viewport.height);

        this._applyZoom();
        this._restorePageState();
        document.getElementById('page-indicator').textContent = this.currentPage + ' / ' + this.totalPages;
    },

    /* ── Toolbar Bindings ── */
    bindToolbar() {
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentMode = btn.dataset.mode;
                document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('shape-options').style.display =
                    this.currentMode === 'shape' ? 'flex' : 'none';
            });
        });

        document.querySelectorAll('[data-shape]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.shapeType = btn.dataset.shape;
                document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        this.fabricCanvas.on('mouse:down', (opt) => {
            if (this.currentMode === 'cursor') return;
            const pointer = this.fabricCanvas.getPointer(opt.e);
            if (this.currentMode === 'text') { this._addText(pointer); this.currentMode = 'cursor'; this._updateToolbarState(); }
            else if (this.currentMode === 'image') { this._addImage(pointer); this.currentMode = 'cursor'; this._updateToolbarState(); }
            else if (this.currentMode === 'shape') { this._addShape(pointer); this.currentMode = 'cursor'; this._updateToolbarState(); }
        });
    },

    _updateToolbarState() {
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
        });
        document.getElementById('shape-options').style.display =
            this.currentMode === 'shape' ? 'flex' : 'none';
    },

    /* ── Add Text ── */
    _addText(pointer) {
        const textbox = new fabric.Textbox('输入文字', {
            left: pointer.x,
            top: pointer.y,
            fontSize: this.textSize,
            fontFamily: this.textFont,
            fill: this.textColor,
            width: 300,
            editable: true,
            splitByGrapheme: true
        });
        this.fabricCanvas.add(textbox);
        this.fabricCanvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.on('editing:entered', () => {
            textbox.hiddenTextarea.value = textbox.text;
        });
    },

    /* ── Add Shape ── */
    _addShape(pointer) {
        let shape;
        const common = { left: pointer.x, top: pointer.y, fill: 'transparent', stroke: this.textColor, strokeWidth: 2 };
        if (this.shapeType === 'rect') {
            shape = new fabric.Rect({ ...common, width: 100, height: 60 });
        } else if (this.shapeType === 'circle') {
            shape = new fabric.Circle({ ...common, radius: 40 });
        } else if (this.shapeType === 'line') {
            shape = new fabric.Line([pointer.x, pointer.y, pointer.x + 100, pointer.y],
                { stroke: this.textColor, strokeWidth: 2 });
        }
        this.fabricCanvas.add(shape);
        this.fabricCanvas.setActiveObject(shape);
    },

    /* ── Add Image ── */
    _addImage(pointer) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                fabric.Image.fromURL(ev.target.result, (img) => {
                    const maxW = this.fabricCanvas.width * 0.6;
                    const maxH = this.fabricCanvas.height * 0.6;
                    if (img.width > maxW || img.height > maxH) {
                        const ratio = Math.min(maxW / img.width, maxH / img.height);
                        img.scale(ratio);
                    }
                    img.set({ left: pointer.x, top: pointer.y });
                    this.fabricCanvas.add(img);
                    this.fabricCanvas.setActiveObject(img);
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    },

    /* ── Delete ── */
    _deleteSelected() {
        const active = this.fabricCanvas.getActiveObject();
        if (active) {
            this.fabricCanvas.remove(active);
            this.fabricCanvas.discardActiveObject();
            this.fabricCanvas.requestRenderAll();
        }
    },

    _bindDelete() {
        document.getElementById('btn-delete').addEventListener('click', () => this._deleteSelected());
    },

    /* ── Undo / Redo ── */
    _saveHistory() {
        if (this._isLoadingHistory) return;
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(JSON.stringify(this.fabricCanvas.toJSON(['id', 'selectable', 'evented'])));
        this.historyIndex++;
        if (this.history.length > 50) { this.history.shift(); this.historyIndex--; }
        this._updateUndoRedoButtons();
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this._loadHistoryState();
        }
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this._loadHistoryState();
        }
    },

    _loadHistoryState() {
        this._isLoadingHistory = true;
        this.fabricCanvas.loadFromJSON(this.history[this.historyIndex], () => {
            this.fabricCanvas.requestRenderAll();
            this._updateUndoRedoButtons();
            this._isLoadingHistory = false;
        });
    },

    _updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    },

    _bindUndoRedo() {
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    },

    /* ── Zoom ── */
    _applyZoom() {
        const scale = this.zoom;
        const pdfW = this.pdfCanvas.width;
        const pdfH = this.pdfCanvas.height;
        const displayW = pdfW * scale;
        const displayH = pdfH * scale;

        [this.pdfCanvas, this.fabricCanvas.lowerCanvasEl].forEach(el => {
            el.style.width = displayW + 'px';
            el.style.height = displayH + 'px';
        });

        this.fabricCanvas.setZoom(scale);
        this.fabricCanvas.requestRenderAll();

        document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
    },

    zoomIn() {
        this.zoom = Math.min(3.0, this.zoom + 0.25);
        this._applyZoom();
    },

    zoomOut() {
        this.zoom = Math.max(0.25, this.zoom - 0.25);
        this._applyZoom();
    },

    zoomFit() {
        const container = document.getElementById('edit-container');
        const maxW = container.clientWidth - 32;
        const maxH = container.clientHeight - 80;
        const scaleX = maxW / this.pdfCanvas.width;
        const scaleY = maxH / this.pdfCanvas.height;
        this.zoom = Math.min(scaleX, scaleY, 1.5);
        this._applyZoom();
    },

    _bindZoom() {
        document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('btn-zoom-fit').addEventListener('click', () => this.zoomFit());
    },

    /* ── Page Nav ── */
    _bindPageNav() {
        document.getElementById('btn-prev').addEventListener('click', () => this.prevPage());
        document.getElementById('btn-next').addEventListener('click', () => this.nextPage());
    },

    async prevPage() {
        if (this.currentPage > 1) {
            this._pageStates[this.currentPage] = JSON.stringify(this.fabricCanvas.toJSON(['id', 'selectable', 'evented']));
            this.currentPage--;
            await this.renderPage();
        }
    },

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            this._pageStates[this.currentPage] = JSON.stringify(this.fabricCanvas.toJSON(['id', 'selectable', 'evented']));
            this.currentPage++;
            await this.renderPage();
        }
    },

    _restorePageState() {
        const state = this._pageStates[this.currentPage];
        if (state) {
            this._isLoadingHistory = true;
            this.fabricCanvas.loadFromJSON(state, () => {
                this.fabricCanvas.requestRenderAll();
                this._isLoadingHistory = false;
            });
            this.history = [state];
            this.historyIndex = 0;
        } else {
            this.fabricCanvas.clear();
            this.history = [JSON.stringify(this.fabricCanvas.toJSON(['id', 'selectable', 'evented']))];
            this.historyIndex = 0;
        }
        this._updateUndoRedoButtons();
    },

    /* ── Keyboard ── */
    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                document.activeElement.tagName !== 'INPUT' &&
                document.activeElement.tagName !== 'TEXTAREA') {
                this._deleteSelected();
            }
        });
    },

    /* ── Style Controls ── */
    _bindStyleControls() {
        document.getElementById('text-color').addEventListener('input', (e) => {
            this.textColor = e.target.value;
            const obj = this.fabricCanvas.getActiveObject();
            if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
                obj.set('fill', e.target.value);
            } else if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'line')) {
                obj.set('stroke', e.target.value);
            }
            this.fabricCanvas.requestRenderAll();
        });

        document.getElementById('text-size').addEventListener('change', (e) => {
            this.textSize = parseInt(e.target.value);
            const obj = this.fabricCanvas.getActiveObject();
            if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
                obj.set('fontSize', this.textSize);
            }
            this.fabricCanvas.requestRenderAll();
        });

        document.getElementById('text-font').addEventListener('change', (e) => {
            this.textFont = e.target.value;
            const obj = this.fabricCanvas.getActiveObject();
            if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
                obj.set('fontFamily', this.textFont);
            }
            this.fabricCanvas.requestRenderAll();
        });
    },

    _onSelectionChange() {
        const obj = this.fabricCanvas.getActiveObject();
        if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
            document.getElementById('text-color').value = obj.fill || '#000000';
            document.getElementById('text-size').value = obj.fontSize || 16;
            document.getElementById('text-font').value = obj.fontFamily || 'Noto Sans SC';
        }
    },

    /* ── Save / Download ── */
    _bindSave() {
        document.getElementById('btn-save').addEventListener('click', () => this.exportPDF());
    },

    async exportPDF() {
        this._pageStates[this.currentPage] = JSON.stringify(this.fabricCanvas.toJSON(['id', 'selectable', 'evented']));

        App.toast(I18N.t('processing'), 'info');

        try {
            const originalBytes = await this.originalFile.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(originalBytes);
            const pages = pdfDoc.getPages();

            for (let i = 0; i < this.totalPages; i++) {
                const page = pages[i];
                const pageNum = i + 1;
                const { width, height } = page.getSize();

                const fabricState = this._pageStates[pageNum];
                if (!fabricState || fabricState === '{"version":"5.3.0","objects":[]}') continue;

                const fabricJson = JSON.parse(fabricState);

                const viewport = (await this.pdfDoc.getPage(pageNum)).getViewport({ scale: 2.0 });
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const tempCtx = tempCanvas.getContext('2d');
                await (await this.pdfDoc.getPage(pageNum)).render({ canvasContext: tempCtx, viewport }).promise;

                const pngBlob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
                const pngImage = await pdfDoc.embedPng(await pngBlob.arrayBuffer());
                page.drawImage(pngImage, { x: 0, y: 0, width: width, height: height });

                const scaleFactor = width / viewport.width;

                for (const obj of fabricJson.objects) {
                    if (obj.type === 'textbox' || obj.type === 'i-text') {
                        page.drawText(obj.text, {
                            x: obj.left * scaleFactor,
                            y: height - (obj.top + obj.fontSize * (obj.scaleY || 1)) * scaleFactor,
                            size: obj.fontSize * (obj.scaleY || 1) * scaleFactor,
                            color: PDFLib.rgb(
                                parseInt(obj.fill.slice(1, 3), 16) / 255,
                                parseInt(obj.fill.slice(3, 5), 16) / 255,
                                parseInt(obj.fill.slice(5, 7), 16) / 255
                            )
                        });
                    } else if (obj.type === 'rect') {
                        page.drawRectangle({
                            x: obj.left * scaleFactor,
                            y: height - (obj.top + obj.height * (obj.scaleY || 1)) * scaleFactor,
                            width: obj.width * (obj.scaleX || 1) * scaleFactor,
                            height: obj.height * (obj.scaleY || 1) * scaleFactor,
                            borderColor: PDFLib.rgb(
                                parseInt((obj.stroke || '#000000').slice(1, 3), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(3, 5), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(5, 7), 16) / 255
                            ),
                            borderWidth: (obj.strokeWidth || 2) * scaleFactor
                        });
                    } else if (obj.type === 'circle') {
                        const rx = (obj.radius || 40) * (obj.scaleX || 1);
                        const ry = (obj.radius || 40) * (obj.scaleY || 1);
                        page.drawEllipse({
                            x: (obj.left + rx) * scaleFactor,
                            y: height - (obj.top + ry) * scaleFactor,
                            xScale: rx * scaleFactor,
                            yScale: ry * scaleFactor,
                            borderColor: PDFLib.rgb(
                                parseInt((obj.stroke || '#000000').slice(1, 3), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(3, 5), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(5, 7), 16) / 255
                            ),
                            borderWidth: (obj.strokeWidth || 2) * scaleFactor
                        });
                    } else if (obj.type === 'line') {
                        page.drawLine({
                            start: { x: obj.x1 * scaleFactor, y: height - obj.y1 * scaleFactor },
                            end: { x: obj.x2 * scaleFactor, y: height - obj.y2 * scaleFactor },
                            color: PDFLib.rgb(
                                parseInt((obj.stroke || '#000000').slice(1, 3), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(3, 5), 16) / 255,
                                parseInt((obj.stroke || '#000000').slice(5, 7), 16) / 255
                            ),
                            thickness: (obj.strokeWidth || 2) * scaleFactor
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            App.downloadBlob(
                new Blob([pdfBytes], { type: 'application/pdf' }),
                this.fileName.replace('.pdf', '-edited.pdf')
            );
        } catch (e) {
            console.error('Export error:', e);
            App.toast(I18N.t('error'), 'error');
        }
    },

    /* ── Cleanup ── */
    cleanup() {
        if (this.fabricCanvas) {
            this.fabricCanvas.dispose();
            this.fabricCanvas = null;
        }
        this.pdfDoc = null;
        this.originalFile = null;
        this._pageStates = {};
        this.history = [];
    }
});
