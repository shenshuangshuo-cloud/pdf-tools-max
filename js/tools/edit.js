/* ========== Tool: Edit PDF — 完整文档编辑器 ========== */

const PREVIEW_SCALE = 3.0;

const FONT_FAMILIES = [
    { label: '思源宋体', value: '"Noto Serif SC", "Source Han Serif CN", serif' },
    { label: '思源黑体', value: '"Noto Sans SC", "Source Han Sans CN", sans-serif' },
    { label: '宋体', value: 'SimSun, serif' },
    { label: '黑体', value: 'SimHei, sans-serif' },
    { label: '楷体', value: 'KaiTi, cursive' },
    { label: '仿宋', value: 'FangSong, serif' },
    { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Courier New', value: '"Courier New", monospace' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

const HIGHLIGHT_COLORS = [
    { label: '黄', value: '#FFEB3B' },
    { label: '绿', value: '#A5D6A7' },
    { label: '蓝', value: '#90CAF9' },
    { label: '红', value: '#EF9A9A' },
    { label: '橙', value: '#FFCC80' },
    { label: '紫', value: '#CE93D8' },
];

App.register('edit', {
    file: null, pdfDoc: null, pdfBytes: null,
    currentPage: 1, totalPages: 0,
    annotations: [],  // [{ id, page, type, x, y, w, h, text, fontFamily, fontSize, bold, italic, underline, color, bgColor, align }]
    nextId: 0,
    mode: 'select',   // 'select' | 'text' | 'highlight' | 'pan'
    selectedId: null, // currently selected annotation ID
    editingId: null,  // currently editing (contenteditable) annotation ID
    // defaults
    defaults: {
        fontFamily: '"Noto Serif SC", "Source Han Serif CN", serif',
        fontSize: 14,
        color: '#000000',
        bold: false, italic: false, underline: false,
        highlightColor: '#FFEB3B',
        align: 'left',
    },
    // drag state for moving annotations
    dragInfo: null,
    // highlight drawing
    highlightStart: null,
    _canvasScale: null, // scale factor: canvas CSS width / canvas actual width

    init(body) {
        this.file = null; this.currentPage = 1;
        this.annotations = []; this.nextId = 0;
        this.mode = 'select'; this.selectedId = null; this.editingId = null;
        this.dragInfo = null; this.highlightStart = null;
        this.setupGlobalEvents();
        body.innerHTML = `
            <div id="edit-wrap">
                <p class="workspace-desc" data-i18n="edit_desc">${I18N.t('edit_desc')}</p>
                ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
                <div id="edit-content" style="display:none;position:relative">
                    ${this.renderToolbar()}
                    <div class="edit-preview-wrap">
                        <div class="pdf-preview-area" id="edit-preview">
                            <canvas id="edit-canvas"></canvas>
                            <div class="edit-overlays" id="edit-overlays"></div>
                        </div>
                    </div>
                    <div id="edit-page-nav"></div>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    renderToolbar() {
        const F = this.defaults;
        const fontOpts = FONT_FAMILIES.map(f =>
            `<option value="${f.value.replace(/"/g, '&quot;')}" style="font-family:${f.value}">${f.label}</option>`
        ).join('');
        const sizeOpts = FONT_SIZES.map(s =>
            `<option value="${s}" ${s === F.fontSize ? 'selected' : ''}>${s}</option>`
        ).join('');
        const hlOpts = HIGHLIGHT_COLORS.map(c =>
            `<option value="${c.value}">${c.label}</option>`
        ).join('');

        return `
        <div class="edit-toolbar" id="edit-toolbar">
            <div class="tb-section">
                <button class="tb-btn tb-icon" id="tb-mode-select" title="选择" data-mode="select" onclick="App.toolRegistry['edit'].setMode('select')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l16 8-7 1-2 7z"/></svg>
                </button>
                <button class="tb-btn tb-icon" id="tb-mode-pan" title="拖拽" data-mode="pan" onclick="App.toolRegistry['edit'].setMode('pan')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a1 1 0 01-1 1H7a1 1 0 01-1-1v-6M12 3v12M8 7l4-4 4 4"/></svg>
                </button>
                <button class="tb-btn tb-active" id="tb-mode-text" title="添加文本" data-mode="text" onclick="App.toolRegistry['edit'].setMode('text')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="5" rx="1"/><line x1="5" y1="12" x2="5" y2="20"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="19" y1="12" x2="19" y2="20"/></svg>
                </button>
                <button class="tb-btn" id="tb-mode-highlight" title="高亮" data-mode="highlight" onclick="App.toolRegistry['edit'].setMode('highlight')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
            </div>
            <div class="tb-divider"></div>
            <div class="tb-section">
                <select class="tb-select" id="tb-font" onchange="App.toolRegistry['edit'].applyStyle('fontFamily', this.value)">${fontOpts}</select>
                <select class="tb-select tb-select-sm" id="tb-size" onchange="App.toolRegistry['edit'].applyStyle('fontSize', parseInt(this.value))">${sizeOpts}</select>
            </div>
            <div class="tb-divider"></div>
            <div class="tb-section">
                <button class="tb-btn tb-icon" id="tb-bold" title="加粗" onclick="App.toolRegistry['edit'].toggleStyle('bold')"><b>B</b></button>
                <button class="tb-btn tb-icon" id="tb-italic" title="斜体" onclick="App.toolRegistry['edit'].toggleStyle('italic')"><i>I</i></button>
                <button class="tb-btn tb-icon" id="tb-underline" title="下划线" onclick="App.toolRegistry['edit'].toggleStyle('underline')"><u>U</u></button>
            </div>
            <div class="tb-divider"></div>
            <div class="tb-section">
                <div class="tb-color-wrap">
                    <span class="tb-color-label">A</span>
                    <input type="color" id="tb-color" value="${F.color}" oninput="App.toolRegistry['edit'].applyStyle('color', this.value)">
                </div>
                <div class="tb-color-wrap" title="高亮颜色">
                    <svg width="14" height="14" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" fill="${F.highlightColor}"/></svg>
                    <input type="color" id="tb-hl-color" value="${F.highlightColor}" oninput="App.toolRegistry['edit'].applyStyle('bgColor', this.value)">
                </div>
            </div>
            <div class="tb-divider"></div>
            <div class="tb-section">
                <button class="tb-btn tb-icon" title="左对齐" onclick="App.toolRegistry['edit'].applyStyle('align','left')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="14" height="2"/><rect x="3" y="8" width="10" height="2"/><rect x="3" y="12" width="16" height="2"/><rect x="3" y="16" width="12" height="2"/></svg>
                </button>
                <button class="tb-btn tb-icon" title="居中" onclick="App.toolRegistry['edit'].applyStyle('align','center')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="14" height="2"/><rect x="6" y="8" width="12" height="2"/><rect x="3" y="12" width="18" height="2"/><rect x="7" y="16" width="10" height="2"/></svg>
                </button>
                <button class="tb-btn tb-icon" title="右对齐" onclick="App.toolRegistry['edit'].applyStyle('align','right')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="4" width="14" height="2"/><rect x="11" y="8" width="10" height="2"/><rect x="5" y="12" width="16" height="2"/><rect x="9" y="16" width="12" height="2"/></svg>
                </button>
            </div>
            <div class="tb-spacer"></div>
            <div class="tb-section tb-right">
                <button class="tb-btn tb-btn-primary" onclick="App.toolRegistry['edit'].download()">${I18N.t('edit_btn_download')}</button>
            </div>
        </div>`;
    },

    /* ========== Load File ========== */
    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        this.currentPage = 1;
        this.annotations = [];
        this.nextId = 0;
        this.selectedId = null;
        this.editingId = null;
        document.getElementById('edit-content').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';
        this.setMode('text');
        await this.renderPage(1);
    },

    /* ========== Render ========== */
    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const canvas = document.getElementById('edit-canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        this.renderOverlays();
        this._bindCanvasEvents();

        document.getElementById('edit-page-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['edit'].renderPage(${num - 1})`,
            `App.toolRegistry['edit'].renderPage(${num + 1})`
        );
    },

    /* ========== Overlays ========== */
    renderOverlays() {
        const container = document.getElementById('edit-overlays');
        const canvas = document.getElementById('edit-canvas');
        container.innerHTML = '';
        container.style.width = canvas.offsetWidth + 'px';
        container.style.height = canvas.offsetHeight + 'px';
        this._canvasScale = canvas.offsetWidth / canvas.width;

        const pageAnns = this.annotations.filter(a => a.page === this.currentPage);
        for (const ann of pageAnns) {
            if (ann.type === 'text') this._renderTextBox(ann);
            else if (ann.type === 'highlight') this._renderHighlight(ann);
        }
    },

    _renderTextBox(ann) {
        const container = document.getElementById('edit-overlays');
        const sc = this._canvasScale;
        const el = document.createElement('div');
        el.className = 'edit-textbox';
        el.dataset.id = ann.id;
        el.style.left = (ann.x * sc) + 'px';
        el.style.top = (ann.y * sc) + 'px';
        el.style.minWidth = (ann.w * sc) + 'px';
        el.style.minHeight = Math.max(20, ann.h * sc) + 'px';
        el.style.fontFamily = ann.fontFamily;
        el.style.fontSize = (ann.fontSize * sc) + 'px';
        el.style.color = ann.color;
        el.style.fontWeight = ann.bold ? 'bold' : 'normal';
        el.style.fontStyle = ann.italic ? 'italic' : 'normal';
        el.style.textDecoration = ann.underline ? 'underline' : 'none';
        el.style.textAlign = ann.align || 'left';
        el.textContent = ann.text;

        if (ann.id === this.editingId) {
            el.contentEditable = true;
            el.classList.add('editing');
            el.focus();
        }

        if (ann.id === this.selectedId) {
            el.classList.add('selected');
        }

        // Drag to move
        el.addEventListener('mousedown', (e) => this._onAnnotationMouseDown(e, ann));
        // Double-click to edit
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._startEditing(ann.id);
        });

        container.appendChild(el);
    },

    _renderHighlight(ann) {
        const container = document.getElementById('edit-overlays');
        const sc = this._canvasScale;
        const el = document.createElement('div');
        el.className = 'edit-highlight';
        el.dataset.id = ann.id;
        el.style.left = (ann.x * sc) + 'px';
        el.style.top = (ann.y * sc) + 'px';
        el.style.width = (ann.w * sc) + 'px';
        el.style.height = (ann.h * sc) + 'px';
        el.style.backgroundColor = ann.bgColor;
        el.style.opacity = '0.4';

        if (ann.id === this.selectedId) {
            el.style.outline = '2px solid #2563EB';
            el.style.opacity = '0.55';
        }

        el.addEventListener('mousedown', (e) => this._onAnnotationMouseDown(e, ann));
        el.addEventListener('dblclick', () => {
            this._deleteAnnotation(ann.id);
        });

        container.appendChild(el);
    },

    /* ========== Annotation Interaction ========== */
    _onAnnotationMouseDown(e, ann) {
        if (this.mode === 'text' || this.mode === 'highlight') return;
        e.stopPropagation();
        this._selectAnnotation(ann.id);
        // begin drag
        const container = document.getElementById('edit-overlays');
        const sc = this._canvasScale;
        this.dragInfo = {
            id: ann.id,
            sx: e.clientX,
            sy: e.clientY,
            ox: ann.x,
            oy: ann.y,
            container,
            sc,
        };
    },

    _selectAnnotation(id) {
        this.selectedId = id;
        this._updateToolbarForAnnotation(id);
        this.renderOverlays();
    },

    _startEditing(id) {
        this.editingId = id;
        this.selectedId = id;
        this.renderOverlays();
        const el = document.querySelector(`.edit-textbox[data-id="${id}"]`);
        if (el) {
            el.focus();
            // select all text
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    _stopEditing(save) {
        if (this.editingId === null) return;
        const el = document.querySelector(`.edit-textbox[data-id="${this.editingId}"]`);
        if (el && save) {
            const ann = this.annotations.find(a => a.id === this.editingId);
            if (ann) {
                ann.text = el.textContent.trim() || ann.text;
                ann.w = Math.max(40, el.offsetWidth / this._canvasScale);
                ann.h = Math.max(16, el.offsetHeight / this._canvasScale);
            }
        }
        this.editingId = null;
        this.renderOverlays();
    },

    _deleteAnnotation(id) {
        this.annotations = this.annotations.filter(a => a.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        if (this.editingId === id) this.editingId = null;
        this.renderOverlays();
    },

    /* ========== Canvas Events ========== */
    _bindCanvasEvents() {
        const canvas = document.getElementById('edit-canvas');
        const overlays = document.getElementById('edit-overlays');
        if (!canvas._bound) {
            canvas._bound = true;
            canvas.addEventListener('click', (e) => this._onCanvasClick(e));
            canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
        }
        if (!overlays._bound) {
            overlays._bound = true;
            overlays.addEventListener('click', () => {
                this.selectedId = null;
                this._updateToolbarForAnnotation(null);
                this._stopEditing(true);
            });
        }
    },

    _onCanvasClick(e) {
        if (this.mode === 'text') {
            this._stopEditing(true);
            this.selectedId = null;
            const rect = e.target.getBoundingClientRect();
            const sc = this._canvasScale;
            const x = (e.clientX - rect.left) / sc;
            const y = (e.clientY - rect.top) / sc;
            this._addTextBox(x, y);
        }
    },

    _onCanvasMouseDown(e) {
        if (this.mode === 'highlight') {
            this._stopEditing(true);
            this.selectedId = null;
            const rect = e.target.getBoundingClientRect();
            const sc = this._canvasScale;
            const x = (e.clientX - rect.left) / sc;
            const y = (e.clientY - rect.top) / sc;
            this.highlightStart = { x, y };
        }
    },

    /* ========== Add Text Box ========== */
    _addTextBox(x, y) {
        const ann = {
            id: ++this.nextId,
            page: this.currentPage,
            type: 'text',
            x, y,
            w: 160,
            h: 20,
            text: '输入文本',
            fontFamily: this.defaults.fontFamily,
            fontSize: this.defaults.fontSize,
            bold: this.defaults.bold,
            italic: this.defaults.italic,
            underline: this.defaults.underline,
            color: this.defaults.color,
            bgColor: null,
            align: this.defaults.align,
        };
        this.annotations.push(ann);
        this.selectedId = ann.id;
        this.renderOverlays();
        // auto-start editing
        setTimeout(() => this._startEditing(ann.id), 50);
    },

    /* ========== Toolbar Updates ========== */
    _updateToolbarForAnnotation(id) {
        const ann = id ? this.annotations.find(a => a.id === id) : null;
        // font
        const fontSel = document.getElementById('tb-font');
        if (fontSel && ann && ann.type === 'text') fontSel.value = ann.fontFamily;
        // size
        const sizeSel = document.getElementById('tb-size');
        if (sizeSel && ann && ann.type === 'text') sizeSel.value = ann.fontSize;
        // color
        const colorInput = document.getElementById('tb-color');
        if (colorInput && ann && ann.type === 'text') colorInput.value = ann.color;
        // highlight color
        const hlInput = document.getElementById('tb-hl-color');
        if (hlInput && ann) hlInput.value = ann.bgColor || this.defaults.highlightColor;
        // bold/italic/underline
        ['bold', 'italic', 'underline'].forEach(prop => {
            const btn = document.getElementById('tb-' + prop);
            if (btn) btn.classList.toggle('tb-active', ann && ann.type === 'text' && ann[prop]);
        });
    },

    /* ========== Mode Switching ========== */
    setMode(mode) {
        this.mode = mode;
        this._stopEditing(true);
        if (mode !== 'select' && mode !== 'pan') {
            this.selectedId = null;
        }
        // Update toolbar buttons
        ['select', 'pan', 'text', 'highlight'].forEach(m => {
            const btn = document.getElementById('tb-mode-' + m);
            if (btn) btn.classList.toggle('tb-active', m === mode);
        });
        // Update canvas cursor
        const canvas = document.getElementById('edit-canvas');
        if (canvas) {
            const cursors = { select: 'default', pan: 'grab', text: 'crosshair', highlight: 'crosshair' };
            canvas.style.cursor = cursors[mode] || 'default';
        }
        // Pan mode
        if (mode === 'pan') this._enablePan();
        else this._disablePan();
    },

    /* ========== Style Application ========== */
    applyStyle(prop, value) {
        if (prop === 'fontFamily' || prop === 'fontSize' || prop === 'color') {
            this.defaults[prop] = value;
        }
        if (this.selectedId) {
            const ann = this.annotations.find(a => a.id === this.selectedId);
            if (ann && ann.type === 'text') {
                ann[prop] = value;
                this.renderOverlays();
            } else if (ann && ann.type === 'highlight' && prop === 'bgColor') {
                ann.bgColor = value;
                this.renderOverlays();
            }
        }
    },

    toggleStyle(prop) {
        if (this.selectedId) {
            const ann = this.annotations.find(a => a.id === this.selectedId);
            if (ann && ann.type === 'text') {
                ann[prop] = !ann[prop];
                this.renderOverlays();
                this._updateToolbarForAnnotation(this.selectedId);
            }
        } else {
            // toggle default
            this.defaults[prop] = !this.defaults[prop];
            const btn = document.getElementById('tb-' + prop);
            if (btn) btn.classList.toggle('tb-active', this.defaults[prop]);
        }
    },

    /* ========== Pan ========== */
    _enablePan() {
        const canvas = document.getElementById('edit-canvas');
        const preview = document.getElementById('edit-preview');
        if (!canvas || !preview) return;
        let isPanning = false, sx, sy, ox, oy;
        const onDown = (e) => {
            if (this.mode !== 'pan') return;
            isPanning = true; sx = e.clientX; sy = e.clientY;
            ox = preview.scrollLeft; oy = preview.scrollTop;
            canvas.style.cursor = 'grabbing';
        };
        const onMove = (e) => {
            if (!isPanning) return;
            preview.scrollLeft = ox - (e.clientX - sx);
            preview.scrollTop = oy - (e.clientY - sy);
        };
        const onUp = () => { isPanning = false; canvas.style.cursor = 'grab'; };
        canvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        this._panHandlers = { onDown, onMove, onUp };
    },
    _disablePan() {
        if (!this._panHandlers) return;
        const canvas = document.getElementById('edit-canvas');
        if (canvas) {
            canvas.removeEventListener('mousedown', this._panHandlers.onDown);
        }
        window.removeEventListener('mousemove', this._panHandlers.onMove);
        window.removeEventListener('mouseup', this._panHandlers.onUp);
        this._panHandlers = null;
    },

    /* ========== Download ========== */
    async download() {
        this._stopEditing(true);
        App.toast(I18N.t('processing'), 'info');

        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const pages = doc.getPages();

        for (let pgNum = 1; pgNum <= this.totalPages; pgNum++) {
            const page = pages[pgNum - 1];
            const pw = page.getWidth();
            const ph = page.getHeight();

            // Get PDF point dimensions from pdf.js viewport
            const pdfPage = await this.pdfDoc.getPage(pgNum);
            const vp = pdfPage.getViewport({ scale: 1.0 });
            // Scale from canvas coords → PDF point coords
            const scaleX = vp.width / (vp.width * PREVIEW_SCALE / PREVIEW_SCALE); // = 1/previewScale in point space
            // Actually: canvas_px / previewScale = pdf_points
            const toPdfX = (cx) => cx / PREVIEW_SCALE;
            const toPdfY = (cy) => ph - cy / PREVIEW_SCALE;

            const pageAnns = this.annotations.filter(a => a.page === pgNum);

            for (const ann of pageAnns) {
                if (ann.type === 'text') {
                    // Render text to canvas image, embed in PDF
                    const png = await this._renderTextToPng(ann);
                    if (png) {
                        const img = await doc.embedPng(png);
                        const pdfX = toPdfX(ann.x);
                        const imgH = (ann.h / PREVIEW_SCALE) * 1.2; // slightly taller
                        const imgW = (ann.w / PREVIEW_SCALE) * 1.1;
                        const pdfY = ph - (ann.y / PREVIEW_SCALE) - imgH;
                        page.drawImage(img, { x: pdfX, y: pdfY, width: imgW, height: imgH, opacity: 1 });
                    }
                } else if (ann.type === 'highlight') {
                    const x = toPdfX(ann.x);
                    const w = ann.w / PREVIEW_SCALE;
                    const h = ann.h / PREVIEW_SCALE;
                    const y = toPdfY(ann.y) - h;
                    const hex = ann.bgColor || '#FFEB3B';
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    page.drawRectangle({ x, y, width: w, height: h, color: PDFLib.rgb(r, g, b), opacity: 0.4 });
                }
            }
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'edited.pdf');
    },

    async _renderTextToPng(ann) {
        return new Promise((resolve) => {
            const offCanvas = document.createElement('canvas');
            const ctx = offCanvas.getContext('2d');
            // Measure
            ctx.font = `${ann.bold ? 'bold ' : ''}${ann.italic ? 'italic ' : ''}${ann.fontSize * 2}px ${ann.fontFamily}`;
            const metrics = ctx.measureText(ann.text);
            const textW = Math.ceil(metrics.width) + 8;
            const textH = Math.ceil(ann.fontSize * 2 * 1.5);
            offCanvas.width = textW;
            offCanvas.height = textH;
            ctx.clearRect(0, 0, textW, textH);
            // Redraw with correct font
            ctx.font = `${ann.bold ? 'bold ' : ''}${ann.italic ? 'italic ' : ''}${ann.fontSize * 2}px ${ann.fontFamily}`;
            ctx.fillStyle = ann.color;
            ctx.textBaseline = 'top';

            // Handle alignment
            let tx = 4;
            if (ann.align === 'center') tx = (textW - metrics.width) / 2;
            else if (ann.align === 'right') tx = textW - metrics.width - 4;

            ctx.fillText(ann.text, tx, 2);

            // Underline
            if (ann.underline) {
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = Math.max(1, ann.fontSize * 0.08 * 2);
                ctx.beginPath();
                ctx.moveTo(tx, ann.fontSize * 2 + 2);
                ctx.lineTo(tx + metrics.width, ann.fontSize * 2 + 2);
                ctx.stroke();
            }

            offCanvas.toBlob((blob) => {
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                } else {
                    resolve(null);
                }
            }, 'image/png');
        });
    },

    /* ========== Global Events ========== */
    _globalMouseUp: null,
    _globalMouseMove: null,

    setupGlobalEvents() {
        if (this._globalMouseUp) return;
        this._globalMouseUp = (e) => {
            // End highlight drawing
            if (this.highlightStart && this.mode === 'highlight') {
                const canvas = document.getElementById('edit-canvas');
                const rect = canvas.getBoundingClientRect();
                const sc = this._canvasScale;
                const ex = (e.clientX - rect.left) / sc;
                const ey = (e.clientY - rect.top) / sc;
                const x1 = Math.min(this.highlightStart.x, ex);
                const y1 = Math.min(this.highlightStart.y, ey);
                const x2 = Math.max(this.highlightStart.x, ex);
                const y2 = Math.max(this.highlightStart.y, ey);
                if (x2 - x1 > 5 && y2 - y1 > 5) {
                    this.annotations.push({
                        id: ++this.nextId,
                        page: this.currentPage,
                        type: 'highlight',
                        x: x1, y: y1,
                        w: x2 - x1, h: y2 - y1,
                        bgColor: this.defaults.highlightColor,
                    });
                    this.renderOverlays();
                }
                this.highlightStart = null;
            }
            // End annotation drag
            if (this.dragInfo) {
                this.dragInfo = null;
            }
        };
        this._globalMouseMove = (e) => {
            if (this.dragInfo) {
                const d = this.dragInfo;
                const dx = (e.clientX - d.sx) / d.sc;
                const dy = (e.clientY - d.sy) / d.sc;
                const ann = this.annotations.find(a => a.id === d.id);
                if (ann) {
                    ann.x = d.ox + dx;
                    ann.y = d.oy + dy;
                    this.renderOverlays();
                }
            }
            // Highlight preview
            if (this.highlightStart && this.mode === 'highlight') {
                const overlays = document.getElementById('edit-overlays');
                let preview = overlays.querySelector('.highlight-preview');
                if (!preview) {
                    preview = document.createElement('div');
                    preview.className = 'highlight-preview';
                    overlays.appendChild(preview);
                }
                const sc = this._canvasScale;
                const rect = document.getElementById('edit-canvas').getBoundingClientRect();
                const ex = (e.clientX - rect.left) / sc;
                const ey = (e.clientY - rect.top) / sc;
                const x1 = Math.min(this.highlightStart.x, ex);
                const y1 = Math.min(this.highlightStart.y, ey);
                const x2 = Math.max(this.highlightStart.x, ex);
                const y2 = Math.max(this.highlightStart.y, ey);
                preview.style.left = (x1 * sc) + 'px';
                preview.style.top = (y1 * sc) + 'px';
                preview.style.width = ((x2 - x1) * sc) + 'px';
                preview.style.height = ((y2 - y1) * sc) + 'px';
                preview.style.backgroundColor = this.defaults.highlightColor;
                preview.style.display = 'block';
            }
        };
        window.addEventListener('mouseup', this._globalMouseUp);
        window.addEventListener('mousemove', this._globalMouseMove);
    },

    removeGlobalEvents() {
        if (this._globalMouseUp) {
            window.removeEventListener('mouseup', this._globalMouseUp);
            window.removeEventListener('mousemove', this._globalMouseMove);
            this._globalMouseUp = null;
            this._globalMouseMove = null;
        }
    },

    cleanup() {
        this.removeGlobalEvents();
        this._disablePan();
        this.file = null;
        this.pdfDoc = null;
        this.annotations = [];
    },
});
