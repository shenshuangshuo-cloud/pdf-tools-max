/* ========== Tool: Edit PDF — Text Extraction + ContentEditable + Render Back ========== */

const PREVIEW_SCALE = 3.0;

const FONT_FAMILIES = [
    { label: 'system-ui',         value: 'system-ui, -apple-system, sans-serif' },
    { label: '宋体',          value: 'SimSun, serif' },
    { label: '黑体',          value: 'SimHei, sans-serif' },
    { label: '楷体',          value: 'KaiTi, cursive' },
    { label: '仿宋',          value: 'FangSong, serif' },
    { label: '微软雅黑',      value: '"Microsoft YaHei", sans-serif' },
    { label: 'Arial',         value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
];

const FONT_SIZES = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 42, 48, 56, 64, 72, 80];

const HIGHLIGHT_COLORS = [
    { label: '黄', value: '#FFEB3B' },
    { label: '绿', value: '#A5D6A7' },
    { label: '蓝', value: '#90CAF9' },
    { label: '红', value: '#EF9A9A' },
    { label: '橙', value: '#FFCC80' },
    { label: '紫', value: '#CE93D8' },
];

/* Detect if a font name suggests serif */
function _isSerifFont(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('serif') || n.includes('song') || n.includes('simsun')
        || n.includes('fangsong') || n.includes('times') || n.includes('kaiti');
}

/* Detect if a font name suggests monospace */
function _isMonoFont(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('mono') || n.includes('courier') || n.includes('consolas');
}

/* Map pdf.js font name → a friendly CSS family */
function _mapPdfFont(name) {
    if (!name) return FONT_FAMILIES[0].value;
    const n = name.toLowerCase();
    if (n.includes('song') || n.includes('simsun') || n.includes('fangsong')) return 'SimSun, serif';
    if (n.includes('hei') || n.includes('simhei')) return 'SimHei, sans-serif';
    if (n.includes('kai')) return 'KaiTi, cursive';
    if (n.includes('yahei') || n.includes('microsoft')) return '"Microsoft YaHei", sans-serif';
    if (n.includes('times') || n.includes('serif')) return '"Times New Roman", serif';
    if (n.includes('arial') || n.includes('helvetica')) return 'Arial, sans-serif';
    if (n.includes('courier') || n.includes('mono')) return '"Courier New", monospace';
    if (_isSerifFont(n)) return '"Times New Roman", serif';
    if (_isMonoFont(n)) return '"Courier New", monospace';
    return FONT_FAMILIES[0].value; // system-ui default
}

App.register('edit', {
    /* ── State ── */
    file: null, pdfDoc: null, pdfBytes: null,
    currentPage: 1, totalPages: 0,

    // Text blocks extracted from PDF text layer
    allTextBlocks: {},

    // Highlights drawn by user (separate from text blocks)
    allHighlights: {},
    nextHighlightId: 0,

    selectedBlockId: null,
    mode: 'edit', // 'edit' | 'annotate'
    // Sub-mode for annotate: 'highlight' | 'select'
    annotateMode: 'highlight',

    defaults: {
        fontFamily: FONT_FAMILIES[0].value,
        fontSize: 14,
        color: '#000000',
        bold: false, italic: false, underline: false,
        textAlign: 'left',
        highlightColor: '#FFEB3B',
    },

    _canvasScale: null,
    highlightStart: null,
    _zoomLevel: 100,
    _panState: null,
    _panHandlers: null,

    /* ── Init ── */
    init(body) {
        this.file = null; this.currentPage = 1;
        this.allTextBlocks = {}; this.allHighlights = {};
        this.nextHighlightId = 0;
        this.mode = 'edit'; this.selectedBlockId = null;
        this.highlightStart = null; this._panState = null;
        this._zoomLevel = 100;
        this.setupGlobalEvents();
        body.innerHTML = `
            <div id="edit-wrap">
                <p class="workspace-desc" data-i18n="edit_desc">${I18N.t('edit_desc')}</p>
                ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
                <div id="edit-content" style="display:none;position:relative">
                    ${this.renderToolbar()}
                    <div class="edit-preview-wrap" id="edit-preview-wrap">
                        <div class="pdf-preview-area" id="edit-preview">
                            <canvas id="edit-canvas"></canvas>
                            <div class="edit-overlay" id="edit-overlay"></div>
                            <div class="edit-textblock-layer" id="edit-textblocks"></div>
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

        return `
        <!-- Mode Tabs + Main Toolbar -->
        <div class="edit-toolbar" id="edit-toolbar">
            <!-- Mode Toggle Tabs -->
            <div class="edit-mode-tabs" id="edit-mode-tabs">
                <button class="edit-mode-tab active" data-mode="edit" onclick="App.toolRegistry['edit'].switchMode('edit')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    <span data-i18n="edit_tab_edit">${I18N.t('edit_tab_edit')}</span>
                </button>
                <button class="edit-mode-tab" data-mode="annotate" onclick="App.toolRegistry['edit'].switchMode('annotate')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    <span data-i18n="edit_tab_annotate">${I18N.t('edit_tab_annotate')}</span>
                </button>
            </div>
            <div class="tb-divider"></div>

            <!-- Edit Formatting Tools (shown in edit mode) -->
            <div class="edit-format-tools" id="edit-format-tools">
                <div class="tb-section">
                    <select class="tb-select tb-font-sel" id="tb-font" onchange="App.toolRegistry['edit'].applyStyle('fontFamily', this.value)">${fontOpts}</select>
                    <select class="tb-select tb-size-sel" id="tb-size" onchange="App.toolRegistry['edit'].applyStyle('fontSize', parseInt(this.value))">
                        ${FONT_FAMILIES[0].value ? FONT_SIZES.map(() => '').join('') : ''}
                    </select>
                </div>
                <div class="tb-divider"></div>
                <div class="tb-section tb-style-btns">
                    <button class="tb-btn tb-icon tb-bold-btn" id="tb-bold" title="${I18N.t('edit_bold')}" onclick="App.toolRegistry['edit'].toggleStyle('bold')"><b>B</b></button>
                    <button class="tb-btn tb-icon tb-italic-btn" id="tb-italic" title="${I18N.t('edit_italic')}" onclick="App.toolRegistry['edit'].toggleStyle('italic')"><i>I</i></button>
                    <button class="tb-btn tb-icon tb-underline-btn" id="tb-underline" title="${I18N.t('edit_underline')}" onclick="App.toolRegistry['edit'].toggleStyle('underline')"><u>U</u></button>
                </div>
                <div class="tb-divider"></div>
                <div class="tb-section">
                    <div class="tb-color-wrap" title="${I18N.t('edit_text_color')}">
                        <span class="tb-color-label">A</span>
                        <span class="tb-color-swatch" id="tb-color-swatch" style="background:${F.color}"></span>
                        <input type="color" id="tb-color" value="${F.color}" oninput="App.toolRegistry['edit'].applyStyle('color', this.value);document.getElementById('tb-color-swatch').style.background=this.value">
                    </div>
                </div>
                <div class="tb-divider"></div>
                <div class="tb-section tb-align-btns">
                    <button class="tb-btn tb-icon" id="tb-align-left" title="${I18N.t('edit_align_left')}" onclick="App.toolRegistry['edit'].applyAlign('left')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm0 8h12v2H3v-2zm0 8h18v2H3v-2zm0-4h16v2H3v-2z"/></svg>
                    </button>
                    <button class="tb-btn tb-icon" id="tb-align-center" title="${I18N.t('edit_align_center')}" onclick="App.toolRegistry['edit'].applyAlign('center')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm4 8h10v2H7v-2zm-4 8h18v2H3v-2zm2-4h14v2H5v-2z"/></svg>
                    </button>
                    <button class="tb-btn tb-icon" id="tb-align-right" title="${I18N.t('edit_align_right')}" onclick="App.toolRegistry['edit'].applyAlign('right')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm6 8h12v2H9v-2zm-6 8h18v2H3v-2zm2-4h16v2H5v-2z"/></svg>
                    </button>
                </div>
                <div class="tb-divider"></div>
                <div class="tb-section">
                    <button class="tb-btn tb-icon" id="tb-link" title="${I18N.t('edit_add_link')}" onclick="App.toolRegistry['edit'].addLink()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    </button>
                </div>
            </div>

            <!-- Annotate Tools (shown in annotate mode) -->
            <div class="edit-annotate-tools" id="edit-annotate-tools" style="display:none">
                <div class="tb-section">
                    <button class="tb-btn tb-icon tb-active" id="tb-annotate-highlight" title="${I18N.t('edit_mode_highlight')}" onclick="App.toolRegistry['edit'].setAnnotateMode('highlight')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="7" rx="1"/><path d="M22 11v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8"/><line x1="12" y1="4" x2="12" y2="11"/></svg>
                    </button>
                </div>
                <div class="tb-divider"></div>
                <div class="tb-section">
                    <div class="tb-color-wrap" title="${I18N.t('edit_highlight_color')}">
                        <svg width="14" height="14" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" fill="${F.highlightColor}"/></svg>
                        <input type="color" id="tb-hl-color" value="${F.highlightColor}" oninput="App.toolRegistry['edit'].applyStyle('highlightColor', this.value)">
                    </div>
                </div>
            </div>

            <div class="tb-spacer"></div>

            <!-- Save Changes Button -->
            <div class="tb-section tb-right">
                <button class="btn-save-changes" onclick="App.toolRegistry['edit'].download()">
                    <span data-i18n="edit_save_changes">${I18N.t('edit_save_changes')}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
            </div>
        </div>`;
    },

    switchMode(mode) {
        this.mode = mode;
        if (mode === 'annotate') {
            this.selectedBlockId = null;
            this._updateToolbarForBlock(null);
        }

        // Update tab buttons
        const tabs = document.querySelectorAll('.edit-mode-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        // Show/hide format vs annotate tools
        const formatTools = document.getElementById('edit-format-tools');
        const annotateTools = document.getElementById('edit-annotate-tools');
        if (formatTools) formatTools.style.display = mode === 'edit' ? '' : 'none';
        if (annotateTools) annotateTools.style.display = mode === 'annotate' ? '' : 'none';

        // Update text block layer
        const container = document.getElementById('edit-textblocks');
        if (container) {
            if (mode === 'annotate') {
                container.querySelectorAll('.edit-textblock').forEach(el => el.classList.remove('selected'));
                container.style.pointerEvents = 'none';
            } else {
                container.style.pointerEvents = 'auto';
            }
        }

        // Update canvas cursor
        const canvas = document.getElementById('edit-canvas');
        if (canvas) {
            canvas.style.cursor = mode === 'annotate' ? 'crosshair' : 'default';
        }
    },

    setAnnotateMode(subMode) {
        this.annotateMode = subMode;
        const hlBtn = document.getElementById('tb-annotate-highlight');
        if (hlBtn) hlBtn.classList.toggle('tb-active', subMode === 'highlight');
    },

    /* ═══════════════════════ Load File ═══════════════════════ */
    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        this.currentPage = 1;
        this.allTextBlocks = {};
        this.allHighlights = {};
        this.nextHighlightId = 0;
        this.selectedBlockId = null;
        this._zoomLevel = 100;
        document.getElementById('edit-content').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';
        this.switchMode('edit');
        await this.renderPage(1);
    },

    /* ═══════════════════════ Render Page ═══════════════════════ */
    async renderPage(num) {
        this._syncCurrentEdits();

        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const canvas = document.getElementById('edit-canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Apply zoom — _canvasScale is correctly set inside _applyZoom()
        this._applyZoom();

        if (!this.allTextBlocks[num]) {
            try {
                this.allTextBlocks[num] = await this._extractTextBlocks(page);
            } catch (err) {
                console.error('_extractTextBlocks failed:', err);
                this.allTextBlocks[num] = [];
            }
        }

        this._renderHighlightLayer();
        this._renderTextBlockLayer();
        this._bindCanvasEvents();
        this._renderPageNav();
    },

    _applyZoom() {
        const canvas = document.getElementById('edit-canvas');
        if (!canvas) return;
        const scale = this._zoomLevel / 100;
        canvas.style.width = (canvas.width * scale) + 'px';
        canvas.style.height = (canvas.height * scale) + 'px';
        // Force synchronous layout reflow — void offsetHeight triggers layout
        void canvas.offsetHeight;
        const cw = canvas.offsetWidth;
        this._canvasScale = (cw > 0 && canvas.width > 0) ? (cw / canvas.width) : scale;
        // Safety guard
        if (!this._canvasScale || this._canvasScale <= 0 || !isFinite(this._canvasScale)) {
            this._canvasScale = scale;
        }
    },

    zoomIn() {
        this._zoomLevel = Math.min(300, this._zoomLevel + 10);
        this._applyZoom();
        this._renderHighlightLayer();
        this._renderTextBlockLayer();
        this._updateZoomDisplay();
    },

    zoomOut() {
        this._zoomLevel = Math.max(20, this._zoomLevel - 10);
        this._applyZoom();
        this._renderHighlightLayer();
        this._renderTextBlockLayer();
        this._updateZoomDisplay();
    },

    zoomFit() {
        this._zoomLevel = 100;
        this._applyZoom();
        this._renderHighlightLayer();
        this._renderTextBlockLayer();
        this._updateZoomDisplay();
    },

    _updateZoomDisplay() {
        const el = document.getElementById('edit-zoom-display');
        if (el) el.textContent = this._zoomLevel + '%';
    },

    _renderPageNav() {
        const nav = document.getElementById('edit-page-nav');
        if (!nav) return;
        nav.innerHTML = `
            <div class="edit-bottom-bar">
                <div class="edit-page-controls">
                    <button class="edit-nav-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="App.toolRegistry['edit'].renderPage(${this.currentPage - 1})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span class="edit-page-indicator">${this.currentPage} / ${this.totalPages}</span>
                    <button class="edit-nav-btn" ${this.currentPage >= this.totalPages ? 'disabled' : ''} onclick="App.toolRegistry['edit'].renderPage(${this.currentPage + 1})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                </div>
                <div class="edit-zoom-controls">
                    <button class="edit-zoom-btn" onclick="App.toolRegistry['edit'].zoomOut()" title="${I18N.t('edit_zoom_out')}">-</button>
                    <span class="edit-zoom-display" id="edit-zoom-display">${this._zoomLevel}%</span>
                    <button class="edit-zoom-btn" onclick="App.toolRegistry['edit'].zoomIn()" title="${I18N.t('edit_zoom_in')}">+</button>
                    <button class="edit-zoom-fit-btn" onclick="App.toolRegistry['edit'].zoomFit()" title="${I18N.t('edit_zoom_fit')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                </div>
            </div>`;
    },

    /* ── Sync contenteditable divs → allTextBlocks ── */
    _syncCurrentEdits() {
        const container = document.getElementById('edit-textblocks');
        if (!container) return;
        const blocks = this.allTextBlocks[this.currentPage];
        if (!blocks) return;
        const sc = this._canvasScale || 1;
        for (const block of blocks) {
            const el = container.querySelector(`[data-block-id="${block.id}"]`);
            if (el) {
                const newText = el.textContent || '';
                block.text = newText;
                const domW = el.offsetWidth / sc;
                const domH = el.offsetHeight / sc;
                if (domW > block.w) block.w = domW;
                if (domH > block.h) block.h = domH;
            }
        }
    },

    /* ═══════════════════════ Text Extraction ═══════════════════════ */
    async _extractTextBlocks(page) {
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const items = textContent.items;

        if (!items || items.length === 0) return [];

        const vpHeight = viewport.height;
        const textItems = items.map(item => {
            const tx = item.transform;
            const x = tx[4] * PREVIEW_SCALE;
            const y = vpHeight - tx[5] * PREVIEW_SCALE;
            const rawH = item.height || Math.abs(tx[3]) || 12;
            const fontSize = Math.abs(rawH) * PREVIEW_SCALE;
            return {
                str: item.str,
                x: x,
                y: y,
                fontSize: fontSize,
                fontName: item.fontName || '',
                width: item.width * PREVIEW_SCALE || 0,
            };
        });

        textItems.sort((a, b) => a.y - b.y || a.x - b.x);

        const lines = [];
        for (const item of textItems) {
            let added = false;
            const threshold = Math.max(2, item.fontSize * 0.25);
            for (const line of lines) {
                const lineY = line[0].y;
                if (Math.abs(item.y - lineY) < threshold) {
                    line.push(item);
                    added = true;
                    break;
                }
            }
            if (!added) {
                lines.push([item]);
            }
        }

        const rawBlocks = [];
        for (const line of lines) {
            line.sort((a, b) => a.x - b.x);

            let currentBlock = null;
            for (const item of line) {
                if (!currentBlock) {
                    currentBlock = {
                        text: item.str,
                        x: item.x,
                        y: item.y - item.fontSize,
                        fontSize: item.fontSize,
                        fontName: item.fontName,
                        rightX: item.x + (item.width || (() => {
                            let w = 0;
                            for (const ch of item.str) {
                                w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? item.fontSize : item.fontSize * 0.55;
                            }
                            return w;
                        })()),
                    };
                } else {
                    const gap = item.x - currentBlock.rightX;
                    const avgCharW = currentBlock.fontSize * 0.5;
                    if (gap < avgCharW * 1.5) {
                        currentBlock.text += item.str;
                        currentBlock.rightX = item.x + (item.width || item.str.length * item.fontSize * 0.6);
                        currentBlock.fontSize = Math.max(currentBlock.fontSize, item.fontSize);
                    } else {
                        rawBlocks.push(currentBlock);
                        currentBlock = {
                            text: item.str,
                            x: item.x,
                            y: item.y - item.fontSize,
                            fontSize: item.fontSize,
                            fontName: item.fontName,
                            rightX: item.x + (item.width || (() => {
                                let w = 0;
                                for (const ch of item.str) {
                                    w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? item.fontSize : item.fontSize * 0.55;
                                }
                                return w;
                            })()),
                        };
                    }
                }
            }
            if (currentBlock) rawBlocks.push(currentBlock);
        }

        rawBlocks.sort((a, b) => a.y - b.y || a.x - b.x);

        const blocks = rawBlocks.map((rb, i) => ({
            id: `b${i}`,
            x: rb.x,
            y: rb.y,
            w: Math.max(20, rb.rightX - rb.x),
            h: rb.fontSize * 1.3,
            text: rb.text,
            fontFamily: _mapPdfFont(rb.fontName),
            fontSize: Math.round(rb.fontSize),
            color: rb.fontName.toLowerCase().includes('bold') ? '#333333' : '#000000',
            bold: rb.fontName.toLowerCase().includes('bold'),
            italic: rb.fontName.toLowerCase().includes('italic') || rb.fontName.toLowerCase().includes('oblique'),
            textAlign: 'left',
            link: null,
            combined: false,
        }));

        const mergedBlocks = [];
        let i = 0;
        while (i < blocks.length) {
            const paraBlocks = [blocks[i]];
            let prevBlock = blocks[i];
            let j = i + 1;
            while (j < blocks.length) {
                const next = blocks[j];
                const lineSpacing = next.y - (prevBlock.y + prevBlock.h);
                if (Math.abs(next.x - prevBlock.x) < 15
                    && lineSpacing > 0
                    && lineSpacing < prevBlock.fontSize * 1.8
                    && Math.abs(next.fontSize - prevBlock.fontSize) <= 2) {
                    paraBlocks.push(next);
                    prevBlock = next;
                    j++;
                } else {
                    break;
                }
            }

            if (paraBlocks.length > 1) {
                const first = paraBlocks[0];
                const last = paraBlocks[paraBlocks.length - 1];
                const combinedText = paraBlocks.map(b => b.text).join('\n');
                mergedBlocks.push({
                    id: first.id,
                    x: Math.min(...paraBlocks.map(b => b.x)),
                    y: first.y,
                    w: Math.max(...paraBlocks.map(b => b.x + b.w)) - Math.min(...paraBlocks.map(b => b.x)),
                    h: (last.y + last.h) - first.y,
                    text: combinedText,
                    fontFamily: first.fontFamily,
                    fontSize: Math.round(paraBlocks.reduce((s, b) => s + b.fontSize, 0) / paraBlocks.length),
                    color: first.bold ? '#333333' : '#000000',
                    bold: first.bold,
                    italic: first.italic,
                    textAlign: 'left',
                    link: null,
                    combined: true,
                });
                i = j;
            } else {
                mergedBlocks.push(paraBlocks[0]);
                i++;
            }
        }

        return mergedBlocks;
    },

    /* ═══════════════════════ Render Highlight Layer ═══════════════════════ */
    _renderHighlightLayer() {
        const container = document.getElementById('edit-overlay');
        const canvas = document.getElementById('edit-canvas');
        container.innerHTML = '';
        container.style.width = canvas.offsetWidth + 'px';
        container.style.height = canvas.offsetHeight + 'px';

        const highlights = this.allHighlights[this.currentPage] || [];
        const sc = this._canvasScale;
        for (const hl of highlights) {
            const el = document.createElement('div');
            el.className = 'edit-highlight';
            el.style.left = (hl.x * sc) + 'px';
            el.style.top = (hl.y * sc) + 'px';
            el.style.width = (hl.w * sc) + 'px';
            el.style.height = (hl.h * sc) + 'px';
            el.style.backgroundColor = hl.bgColor;
            el.style.opacity = '0.4';
            el.addEventListener('dblclick', () => {
                this.allHighlights[this.currentPage] = highlights.filter(h => h.id !== hl.id);
                this._renderHighlightLayer();
            });
            container.appendChild(el);
        }
    },

    /* ═══════════════════════ Render Text Block Layer (ContentEditable) ═══════════════════════ */
    _renderTextBlockLayer() {
        const container = document.getElementById('edit-textblocks');
        const canvas = document.getElementById('edit-canvas');
        container.innerHTML = '';
        container.style.width = canvas.offsetWidth + 'px';
        container.style.height = canvas.offsetHeight + 'px';

        if (this.mode === 'annotate') {
            container.style.pointerEvents = 'none';
            return;
        }
        container.style.pointerEvents = 'auto';

        const blocks = this.allTextBlocks[this.currentPage] || [];
        const sc = this._canvasScale;

        for (const block of blocks) {
            const el = document.createElement('div');
            el.className = 'edit-textblock';
            el.dataset.blockId = block.id;
            el.contentEditable = 'true';
            el.style.left = (block.x * sc) + 'px';
            el.style.top = (block.y * sc) + 'px';
            el.style.minWidth = Math.max(20, block.w * sc) + 'px';
            el.style.minHeight = Math.max(14, block.h * sc) + 'px';
            el.style.fontFamily = block.fontFamily;
            el.style.fontSize = (block.fontSize * sc) + 'px';
            el.style.color = block.color;
            el.style.fontWeight = block.bold ? 'bold' : 'normal';
            el.style.fontStyle = block.italic ? 'italic' : 'normal';
            el.style.textDecoration = block.underline ? 'underline' : 'none';
            el.style.textAlign = block.textAlign || 'left';

            if (block.combined) {
                el.style.whiteSpace = 'pre-wrap';
            }
            el.textContent = block.text;

            if (block.id === this.selectedBlockId) {
                el.classList.add('selected');
            }

            el.addEventListener('focus', () => this._onBlockFocus(block.id));
            el.addEventListener('blur', () => {
                setTimeout(() => {
                    if (document.activeElement !== el) {
                        this._onBlockBlur(block.id, el);
                    }
                }, 150);
            });

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    el.blur();
                    this.selectedBlockId = null;
                    this._updateToolbarForBlock(null);
                }
            });

            container.appendChild(el);
        }
    },

    _onBlockFocus(blockId) {
        this.selectedBlockId = blockId;
        const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === blockId);
        this._updateToolbarForBlock(block || null);

        const container = document.getElementById('edit-textblocks');
        if (container) {
            container.querySelectorAll('.edit-textblock').forEach(el => {
                el.classList.toggle('selected', el.dataset.blockId === blockId);
            });
        }
    },

    _onBlockBlur(blockId, el) {
        const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === blockId);
        if (!block) return;

        const newText = el.textContent || '';
        block.text = newText;

        // Sync text-align from DOM
        block.textAlign = el.style.textAlign || 'left';

        const sc = this._canvasScale || 1;
        const domW = el.offsetWidth / sc;
        const domH = el.offsetHeight / sc;
        if (domW > block.w) block.w = domW;
        if (domH > block.h) block.h = domH;
    },

    /* ═══════════════════════ Toolbar Update ═══════════════════════ */
    _updateToolbarForBlock(block) {
        const fontSel = document.getElementById('tb-font');
        const sizeSel = document.getElementById('tb-size');
        const colorInput = document.getElementById('tb-color');
        const colorSwatch = document.getElementById('tb-color-swatch');

        if (!block) {
            if (fontSel) fontSel.value = this.defaults.fontFamily;
            if (sizeSel) {
                sizeSel.innerHTML = FONT_SIZES.map(s =>
                    `<option value="${s}" ${s === this.defaults.fontSize ? 'selected' : ''}>${s}</option>`
                ).join('');
                sizeSel.value = this.defaults.fontSize;
            }
            if (colorInput) colorInput.value = this.defaults.color;
            if (colorSwatch) colorSwatch.style.background = this.defaults.color;
            ['bold', 'italic', 'underline'].forEach(prop => {
                const btn = document.getElementById('tb-' + prop);
                if (btn) btn.classList.remove('tb-active');
            });
            ['left', 'center', 'right'].forEach(a => {
                const btn = document.getElementById('tb-align-' + a);
                if (btn) btn.classList.remove('tb-active');
            });
            return;
        }

        if (fontSel) fontSel.value = block.fontFamily;
        if (sizeSel) {
            sizeSel.innerHTML = FONT_SIZES.map(s =>
                `<option value="${s}" ${s === block.fontSize ? 'selected' : ''}>${s}</option>`
            ).join('');
            if (FONT_SIZES.indexOf(block.fontSize) >= 0) {
                sizeSel.value = block.fontSize;
            }
        }
        if (colorInput) colorInput.value = block.color;
        if (colorSwatch) colorSwatch.style.background = block.color;
        ['bold', 'italic', 'underline'].forEach(prop => {
            const btn = document.getElementById('tb-' + prop);
            if (btn) btn.classList.toggle('tb-active', !!block[prop]);
        });
        ['left', 'center', 'right'].forEach(a => {
            const btn = document.getElementById('tb-align-' + a);
            if (btn) btn.classList.toggle('tb-active', (block.textAlign || 'left') === a);
        });
    },

    /* ═══════════════════════ Style Application ═══════════════════════ */
    applyStyle(prop, value) {
        if (prop === 'fontFamily' || prop === 'fontSize' || prop === 'color') {
            this.defaults[prop] = value;
        }
        if (prop === 'highlightColor') {
            this.defaults.highlightColor = value;
        }

        if (this.selectedBlockId) {
            const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === this.selectedBlockId);
            if (block) {
                block[prop] = value;

                const el = document.querySelector(`[data-block-id="${this.selectedBlockId}"]`);
                if (el) {
                    if (prop === 'fontFamily') el.style.fontFamily = value;
                    if (prop === 'fontSize') el.style.fontSize = (value * this._canvasScale) + 'px';
                    if (prop === 'color') el.style.color = value;
                }
            }
        }
    },

    applyAlign(alignment) {
        if (this.selectedBlockId) {
            const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === this.selectedBlockId);
            if (block) {
                block.textAlign = alignment;
                const el = document.querySelector(`[data-block-id="${this.selectedBlockId}"]`);
                if (el) {
                    el.style.textAlign = alignment;
                }
                this._updateToolbarForBlock(block);
            }
        }
    },

    toggleStyle(prop) {
        if (this.selectedBlockId) {
            const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === this.selectedBlockId);
            if (block) {
                block[prop] = !block[prop];
                const el = document.querySelector(`[data-block-id="${this.selectedBlockId}"]`);
                if (el) {
                    if (prop === 'bold') el.style.fontWeight = block.bold ? 'bold' : 'normal';
                    if (prop === 'italic') el.style.fontStyle = block.italic ? 'italic' : 'normal';
                    if (prop === 'underline') el.style.textDecoration = block.underline ? 'underline' : 'none';
                }
                this._updateToolbarForBlock(block);
            }
        } else {
            this.defaults[prop] = !this.defaults[prop];
            const btn = document.getElementById('tb-' + prop);
            if (btn) btn.classList.toggle('tb-active', this.defaults[prop]);
        }
    },

    addLink() {
        if (!this.selectedBlockId) {
            App.toast(I18N.t('edit_select_text_first'), 'info');
            return;
        }
        const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === this.selectedBlockId);
        if (!block) return;

        const currentUrl = block.link || '';
        const url = prompt(I18N.t('edit_enter_url'), currentUrl);
        if (url === null) return; // cancelled

        block.link = url || null;
        const el = document.querySelector(`[data-block-id="${this.selectedBlockId}"]`);
        if (el) {
            if (url && url.trim()) {
                el.style.textDecoration = 'underline';
                el.style.color = '#2563eb';
            } else {
                el.style.textDecoration = block.underline ? 'underline' : 'none';
                el.style.color = block.color;
            }
        }
    },

    /* ═══════════════════════ Canvas Events ═══════════════════════ */
    _bindCanvasEvents() {
        const canvas = document.getElementById('edit-canvas');
        if (!canvas._bound) {
            canvas._bound = true;
            canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
            canvas.addEventListener('click', (e) => this._onCanvasClick(e));
        }
    },

    _onCanvasMouseDown(e) {
        if (this.mode !== 'annotate') return;
        this.selectedBlockId = null;
        this._updateToolbarForBlock(null);
        const container = document.getElementById('edit-textblocks');
        if (container) {
            container.querySelectorAll('.edit-textblock').forEach(el => el.classList.remove('selected'));
        }

        const rect = e.target.getBoundingClientRect();
        const sc = this._canvasScale;
        const x = (e.clientX - rect.left) / sc;
        const y = (e.clientY - rect.top) / sc;
        this.highlightStart = { x, y };
    },

    _onCanvasClick(e) {
        if (this.mode === 'edit') {
            this.selectedBlockId = null;
            this._updateToolbarForBlock(null);
            const container = document.getElementById('edit-textblocks');
            if (container) {
                container.querySelectorAll('.edit-textblock').forEach(el => el.classList.remove('selected'));
            }
        }
    },

    /* ═══════════════════════ Global Events ═══════════════════════ */
    _globalMouseUp: null,
    _globalMouseMove: null,

    setupGlobalEvents() {
        if (this._globalMouseUp) return;
        this._globalMouseUp = (e) => {
            if (this.highlightStart && this.mode === 'annotate') {
                const canvas = document.getElementById('edit-canvas');
                if (!canvas) { this.highlightStart = null; return; }
                const rect = canvas.getBoundingClientRect();
                const sc = this._canvasScale;
                const ex = (e.clientX - rect.left) / sc;
                const ey = (e.clientY - rect.top) / sc;
                const x1 = Math.min(this.highlightStart.x, ex);
                const y1 = Math.min(this.highlightStart.y, ey);
                const x2 = Math.max(this.highlightStart.x, ex);
                const y2 = Math.max(this.highlightStart.y, ey);
                if (x2 - x1 > 5 && y2 - y1 > 5) {
                    if (!this.allHighlights[this.currentPage]) this.allHighlights[this.currentPage] = [];
                    this.allHighlights[this.currentPage].push({
                        id: ++this.nextHighlightId,
                        x: x1, y: y1,
                        w: x2 - x1, h: y2 - y1,
                        bgColor: this.defaults.highlightColor,
                    });
                    this._renderHighlightLayer();
                }
                this.highlightStart = null;
            }
        };

        this._globalMouseMove = (e) => {
            if (this.highlightStart && this.mode === 'annotate') {
                const container = document.getElementById('edit-overlay');
                if (!container) return;
                let preview = container.querySelector('.highlight-preview');
                if (!preview) {
                    preview = document.createElement('div');
                    preview.className = 'highlight-preview';
                    container.appendChild(preview);
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

    /* ═══════════════════════ Save / Download ═══════════════════════ */
    async download() {
        this._syncCurrentEdits();

        App.toast(I18N.t('processing'), 'info');

        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const pages = doc.getPages();

            for (let pgNum = 1; pgNum <= this.totalPages; pgNum++) {
                const page = pages[pgNum - 1];
                const ph = page.getHeight();

                const toPdfX = (cx) => cx / PREVIEW_SCALE;
                const toPdfY = (cy) => ph - cy / PREVIEW_SCALE;

                // Process text blocks
                const blocks = this.allTextBlocks[pgNum] || [];
                for (const block of blocks) {
                    if (!block.text || block.text.trim() === '') continue;

                    // Cover original text area
                    const coverX = toPdfX(block.x) - 2 / PREVIEW_SCALE;
                    const coverW = block.w / PREVIEW_SCALE + 4 / PREVIEW_SCALE;
                    const coverH = block.h / PREVIEW_SCALE + 4 / PREVIEW_SCALE;
                    const coverY = toPdfY(block.y) - coverH;
                    page.drawRectangle({
                        x: coverX,
                        y: coverY,
                        width: coverW,
                        height: coverH,
                        color: PDFLib.rgb(1, 1, 1),
                    });

                    // Render edited text to PNG and embed
                    const pngDataUrl = await this._renderTextToPng(block);

                    if (pngDataUrl) {
                        const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
                        const img = await doc.embedPng(pngBytes);

                        const imgW = (block.w / PREVIEW_SCALE) * 1.1;
                        const imgH = (block.h / PREVIEW_SCALE) * 1.2;
                        const pdfX = toPdfX(block.x);
                        const pdfY = toPdfY(block.y) - imgH;

                        page.drawImage(img, {
                            x: pdfX,
                            y: pdfY,
                            width: imgW,
                            height: imgH,
                            opacity: 1,
                        });
                    }
                }

                // Process highlights
                const highlights = this.allHighlights[pgNum] || [];
                for (const hl of highlights) {
                    const x = toPdfX(hl.x);
                    const w = hl.w / PREVIEW_SCALE;
                    const h = hl.h / PREVIEW_SCALE;
                    const y = toPdfY(hl.y) - h;
                    const hex = hl.bgColor || '#FFEB3B';
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    page.drawRectangle({ x, y, width: w, height: h, color: PDFLib.rgb(r, g, b), opacity: 0.4 });
                }
            }

            const out = await doc.save();
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'signed-edited.pdf');
            App.toast(I18N.t('done'), 'success');
        } catch (e) {
            console.error('Edit save error:', e);
            App.toast(I18N.t('error'), 'error');
        }
    },

    async _renderTextToPng(block) {
        return new Promise((resolve) => {
            const offCanvas = document.createElement('canvas');
            const ctx = offCanvas.getContext('2d');

            const fontStyle = [
                block.bold ? 'bold' : '',
                block.italic ? 'italic' : '',
                (block.fontSize * 2) + 'px',
                block.fontFamily,
            ].filter(Boolean).join(' ');

            ctx.font = fontStyle;
            ctx.fillStyle = block.color;
            ctx.textBaseline = 'top';

            const lines = block.text.split('\n');
            const lineHeight = block.fontSize * 2 * 1.4;

            let maxWidth = 0;
            for (const line of lines) {
                const metrics = ctx.measureText(line);
                if (metrics.width > maxWidth) maxWidth = metrics.width;
            }

            const padX = 8;
            const padY = 4;
            const textW = Math.ceil(maxWidth) + padX * 2;
            const textH = Math.ceil(lines.length * lineHeight) + padY * 2;

            offCanvas.width = Math.max(40, textW);
            offCanvas.height = Math.max(16, textH);
            ctx.clearRect(0, 0, offCanvas.width, offCanvas.height);

            ctx.font = fontStyle;
            ctx.fillStyle = block.color;
            ctx.textBaseline = 'top';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const metrics = ctx.measureText(line);

                // Calculate x offset based on text alignment
                let tx = padX;
                const align = block.textAlign || 'left';
                if (align === 'center') {
                    tx = (offCanvas.width - metrics.width) / 2;
                } else if (align === 'right') {
                    tx = offCanvas.width - metrics.width - padX;
                }

                const ty = padY + i * lineHeight;
                ctx.fillText(line, tx, ty);

                if (block.underline) {
                    ctx.strokeStyle = block.color;
                    ctx.lineWidth = Math.max(1, block.fontSize * 2 * 0.06);
                    ctx.beginPath();
                    const underlineY = ty + block.fontSize * 2 * 1.05;
                    ctx.moveTo(tx, underlineY);
                    ctx.lineTo(tx + metrics.width, underlineY);
                    ctx.stroke();
                }
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

    /* ═══════════════════════ Cleanup ═══════════════════════ */
    cleanup() {
        this.removeGlobalEvents();
        this.file = null;
        this.pdfDoc = null;
        this.allTextBlocks = {};
        this.allHighlights = {};
        this.selectedBlockId = null;
        this.highlightStart = null;
    },
});
