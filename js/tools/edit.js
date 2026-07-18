/* ========== Tool: Edit PDF — Text Extraction + ContentEditable + Render Back ========== */

const PREVIEW_SCALE = 3.0;

const FONT_FAMILIES = [
    { label: 'system-ui',     value: 'system-ui, -apple-system, sans-serif' },
    { label: '宋体',          value: 'SimSun, serif' },
    { label: '黑体',          value: 'SimHei, sans-serif' },
    { label: '楷体',          value: 'KaiTi, cursive' },
    { label: '仿宋',          value: 'FangSong, serif' },
    { label: '微软雅黑',      value: '"Microsoft YaHei", sans-serif' },
    { label: 'Arial',         value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
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
    // allTextBlocks[pageNum] = [{ id, x, y, w, h, text, fontFamily, fontSize, color, bold, italic, combined }]
    allTextBlocks: {},

    // Highlights drawn by user (separate from text blocks)
    // allHighlights[pageNum] = [{ id, x, y, w, h, bgColor }]
    allHighlights: {},
    nextHighlightId: 0,

    selectedBlockId: null,
    mode: 'select', // 'select' | 'highlight'

    defaults: {
        fontFamily: FONT_FAMILIES[0].value,
        fontSize: 14,
        color: '#000000',
        bold: false, italic: false, underline: false,
        highlightColor: '#FFEB3B',
    },

    _canvasScale: null,
    highlightStart: null,
    _panState: null,
    _panHandlers: null,

    /* ── Init ── */
    init(body) {
        this.file = null; this.currentPage = 1;
        this.allTextBlocks = {}; this.allHighlights = {};
        this.nextHighlightId = 0;
        this.mode = 'select'; this.selectedBlockId = null;
        this.highlightStart = null; this._panState = null;
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
        const sizeOpts = FONT_SIZES.map(s =>
            `<option value="${s}" ${s === F.fontSize ? 'selected' : ''}>${s}</option>`
        ).join('');

        return `
        <div class="edit-toolbar" id="edit-toolbar">
            <div class="tb-section">
                <button class="tb-btn tb-icon tb-active" id="tb-mode-select" title="${I18N.t('edit_mode_select')}" data-mode="select" onclick="App.toolRegistry['edit'].setMode('select')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l16 8-7 1-2 7z"/></svg>
                </button>
                <button class="tb-btn" id="tb-mode-highlight" title="${I18N.t('edit_mode_highlight')}" data-mode="highlight" onclick="App.toolRegistry['edit'].setMode('highlight')">
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
                <button class="tb-btn tb-icon" id="tb-bold" title="${I18N.t('edit_bold')}" onclick="App.toolRegistry['edit'].toggleStyle('bold')"><b>B</b></button>
                <button class="tb-btn tb-icon" id="tb-italic" title="${I18N.t('edit_italic')}" onclick="App.toolRegistry['edit'].toggleStyle('italic')"><i>I</i></button>
                <button class="tb-btn tb-icon" id="tb-underline" title="${I18N.t('edit_underline')}" onclick="App.toolRegistry['edit'].toggleStyle('underline')"><u>U</u></button>
            </div>
            <div class="tb-divider"></div>
            <div class="tb-section">
                <div class="tb-color-wrap" title="${I18N.t('edit_text_color')}">
                    <span class="tb-color-label">A</span>
                    <input type="color" id="tb-color" value="${F.color}" oninput="App.toolRegistry['edit'].applyStyle('color', this.value)">
                </div>
                <div class="tb-color-wrap" title="${I18N.t('edit_highlight_color')}">
                    <svg width="14" height="14" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" fill="${F.highlightColor}"/></svg>
                    <input type="color" id="tb-hl-color" value="${F.highlightColor}" oninput="App.toolRegistry['edit'].applyStyle('highlightColor', this.value)">
                </div>
            </div>
            <div class="tb-spacer"></div>
            <div class="tb-section tb-right">
                <button class="tb-btn tb-btn-primary" onclick="App.toolRegistry['edit'].download()">${I18N.t('edit_btn_download')}</button>
            </div>
        </div>`;
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
        document.getElementById('edit-content').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';
        this.setMode('select');
        await this.renderPage(1);
    },

    /* ═══════════════════════ Render Page ═══════════════════════ */
    async renderPage(num) {
        // Save any pending edits from current page back to allTextBlocks
        this._syncCurrentEdits();

        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const canvas = document.getElementById('edit-canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        this._canvasScale = canvas.offsetWidth / canvas.width;

        // Extract text blocks if not yet cached for this page
        if (!this.allTextBlocks[num]) {
            this.allTextBlocks[num] = await this._extractTextBlocks(page);
        }

        this._renderHighlightLayer();
        this._renderTextBlockLayer();
        this._bindCanvasEvents();

        document.getElementById('edit-page-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['edit'].renderPage(${num - 1})`,
            `App.toolRegistry['edit'].renderPage(${num + 1})`
        );
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
                // Update dimensions from DOM
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

        // ── 1. Convert each text item to canvas coordinates ──
        const textItems = items.map(item => {
            const tx = item.transform;
            // Apply viewport transform to get canvas coordinates
            const x = tx[4] * PREVIEW_SCALE;
            const y = tx[5] * PREVIEW_SCALE;
            // Font height in canvas pixels
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

        // ── 2. Group by Y coordinate into lines ──
        // Sort by Y first
        textItems.sort((a, b) => a.y - b.y || a.x - b.x);

        const lines = [];
        for (const item of textItems) {
            let added = false;
            // Try to add to an existing line (Y within threshold)
            const threshold = Math.max(3, item.fontSize * 0.4);
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

        // ── 3. Within each line, sort by X and merge into blocks ──
        const rawBlocks = [];
        for (const line of lines) {
            line.sort((a, b) => a.x - b.x);

            let currentBlock = null;
            for (const item of line) {
                if (!currentBlock) {
                    currentBlock = {
                        text: item.str,
                        x: item.x,
                        y: item.y - item.fontSize * 0.85, // top of text
                        fontSize: item.fontSize,
                        fontName: item.fontName,
                        rightX: item.x + (item.width || item.str.length * item.fontSize * 0.6),
                    };
                } else {
                    const gap = item.x - currentBlock.rightX;
                    const avgCharW = currentBlock.fontSize * 0.5;
                    if (gap < avgCharW * 1.5) {
                        // Same block: merge
                        currentBlock.text += item.str;
                        currentBlock.rightX = item.x + (item.width || item.str.length * item.fontSize * 0.6);
                        currentBlock.fontSize = Math.max(currentBlock.fontSize, item.fontSize);
                    } else {
                        // New block
                        rawBlocks.push(currentBlock);
                        currentBlock = {
                            text: item.str,
                            x: item.x,
                            y: item.y - item.fontSize * 0.85,
                            fontSize: item.fontSize,
                            fontName: item.fontName,
                            rightX: item.x + (item.width || item.str.length * item.fontSize * 0.6),
                        };
                    }
                }
            }
            if (currentBlock) rawBlocks.push(currentBlock);
        }

        // Sort blocks by Y then X
        rawBlocks.sort((a, b) => a.y - b.y || a.x - b.x);

        // ── 4. Build structured blocks ──
        const blocks = rawBlocks.map((rb, i) => ({
            id: `b${i}`,
            x: rb.x,
            y: rb.y,
            w: Math.max(20, rb.rightX - rb.x),
            h: rb.fontSize * 1.3,
            text: rb.text,
            fontFamily: _mapPdfFont(rb.fontName),
            fontSize: Math.round(rb.fontSize),
            color: '#000000',
            bold: rb.fontName.toLowerCase().includes('bold'),
            italic: rb.fontName.toLowerCase().includes('italic') || rb.fontName.toLowerCase().includes('oblique'),
            combined: false,
        }));

        // ── 5. Merge consecutive lines into paragraph blocks ──
        const mergedBlocks = [];
        let i = 0;
        while (i < blocks.length) {
            const current = blocks[i];
            const paraBlocks = [current];

            // Look ahead for consecutive lines that form a paragraph
            let j = i + 1;
            while (j < blocks.length) {
                const next = blocks[j];
                const lineSpacing = next.y - (current.y + current.h);
                const lineHeight = current.fontSize * 1.5;

                // Conditions for same paragraph:
                // - Similar X start (within 15px)
                // - Y spacing within line height range
                // - Similar font size
                if (Math.abs(next.x - current.x) < 15
                    && lineSpacing > 0
                    && lineSpacing < lineHeight * 2.0
                    && Math.abs(next.fontSize - current.fontSize) <= 2) {
                    paraBlocks.push(next);
                    j++;
                } else {
                    break;
                }
            }

            if (paraBlocks.length > 1) {
                // Merge into a single multi-line block
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
                    color: '#000000',
                    bold: first.bold,
                    italic: first.italic,
                    combined: true,
                });
                i = j;
            } else {
                mergedBlocks.push(current);
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

        // If in highlight mode, make contenteditable divs non-interactive
        if (this.mode === 'highlight') {
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

            // For combined (multi-line) blocks, use pre-wrap to preserve newlines
            if (block.combined) {
                el.style.whiteSpace = 'pre-wrap';
            }
            el.textContent = block.text;

            if (block.id === this.selectedBlockId) {
                el.classList.add('selected');
                this._updateToolbarForBlock(block);
            }

            // Focus → select block + update toolbar
            el.addEventListener('focus', () => this._onBlockFocus(block.id));
            el.addEventListener('blur', () => {
                // Small delay to allow click on toolbar buttons
                setTimeout(() => {
                    if (document.activeElement !== el) {
                        this._onBlockBlur(block.id, el);
                    }
                }, 150);
            });

            // Enter key handling: if at end of text, could split (handled naturally by contenteditable wrapping)
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

        // Update highlight visual
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

        // Update dimensions
        const sc = this._canvasScale || 1;
        const domW = el.offsetWidth / sc;
        const domH = el.offsetHeight / sc;
        if (domW > block.w) block.w = domW;
        if (domH > block.h) block.h = domH;
    },

    /* ═══════════════════════ Toolbar Update ═══════════════════════ */
    _updateToolbarForBlock(block) {
        if (!block) {
            // Reset toolbar to defaults
            const fontSel = document.getElementById('tb-font');
            if (fontSel) fontSel.value = this.defaults.fontFamily;
            const sizeSel = document.getElementById('tb-size');
            if (sizeSel) sizeSel.value = this.defaults.fontSize;
            const colorInput = document.getElementById('tb-color');
            if (colorInput) colorInput.value = this.defaults.color;
            ['bold', 'italic', 'underline'].forEach(prop => {
                const btn = document.getElementById('tb-' + prop);
                if (btn) btn.classList.remove('tb-active');
            });
            return;
        }

        const fontSel = document.getElementById('tb-font');
        if (fontSel) fontSel.value = block.fontFamily;
        const sizeSel = document.getElementById('tb-size');
        if (sizeSel) sizeSel.value = block.fontSize;
        const colorInput = document.getElementById('tb-color');
        if (colorInput) colorInput.value = block.color;
        ['bold', 'italic'].forEach(prop => {
            const btn = document.getElementById('tb-' + prop);
            if (btn) btn.classList.toggle('tb-active', !!block[prop]);
        });
        // underline handled via contenteditable execCommand or style
    },

    /* ═══════════════════════ Mode Switching ═══════════════════════ */
    setMode(mode) {
        this.mode = mode;
        ['select', 'highlight'].forEach(m => {
            const btn = document.getElementById('tb-mode-' + m);
            if (btn) btn.classList.toggle('tb-active', m === mode);
        });

        const canvas = document.getElementById('edit-canvas');
        if (canvas) {
            canvas.style.cursor = mode === 'highlight' ? 'crosshair' : 'default';
        }

        // Re-render text block layer to update pointer-events
        const container = document.getElementById('edit-textblocks');
        if (container) {
            container.style.pointerEvents = mode === 'highlight' ? 'none' : 'auto';
        }
    },

    /* ═══════════════════════ Style Application ═══════════════════════ */
    applyStyle(prop, value) {
        // Update defaults
        if (prop === 'fontFamily' || prop === 'fontSize' || prop === 'color') {
            this.defaults[prop] = value;
        }
        if (prop === 'highlightColor') {
            this.defaults.highlightColor = value;
        }

        // Apply to selected text block
        if (this.selectedBlockId) {
            const block = (this.allTextBlocks[this.currentPage] || []).find(b => b.id === this.selectedBlockId);
            if (block) {
                block[prop] = value;

                // Update the DOM element's style directly
                const el = document.querySelector(`[data-block-id="${this.selectedBlockId}"]`);
                if (el) {
                    if (prop === 'fontFamily') el.style.fontFamily = value;
                    if (prop === 'fontSize') el.style.fontSize = (value * this._canvasScale) + 'px';
                    if (prop === 'color') el.style.color = value;
                }
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

    /* ═══════════════════════ Canvas Events (Highlight drawing) ═══════════════════════ */
    _bindCanvasEvents() {
        const canvas = document.getElementById('edit-canvas');
        if (!canvas._bound) {
            canvas._bound = true;
            canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
            canvas.addEventListener('click', (e) => this._onCanvasClick(e));
        }
    },

    _onCanvasMouseDown(e) {
        if (this.mode !== 'highlight') return;
        // Deselect text block
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
        if (this.mode === 'select') {
            // Clicking on empty canvas area deselects
            this.selectedBlockId = null;
            this._updateToolbarForBlock(null);
            const container = document.getElementById('edit-textblocks');
            if (container) {
                container.querySelectorAll('.edit-textblock').forEach(el => el.classList.remove('selected'));
            }
        }
    },

    /* ═══════════════════════ Global Events (highlight draw + drag) ═══════════════════════ */
    _globalMouseUp: null,
    _globalMouseMove: null,

    setupGlobalEvents() {
        if (this._globalMouseUp) return;
        this._globalMouseUp = (e) => {
            // End highlight drawing
            if (this.highlightStart && this.mode === 'highlight') {
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
            // Highlight preview rectangle
            if (this.highlightStart && this.mode === 'highlight') {
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
        // Sync any pending edits first
        this._syncCurrentEdits();

        App.toast(I18N.t('processing'), 'info');

        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const pages = doc.getPages();

            for (let pgNum = 1; pgNum <= this.totalPages; pgNum++) {
                const page = pages[pgNum - 1];
                const ph = page.getHeight();

                // Helper: canvas coord → PDF point coord
                const toPdfX = (cx) => cx / PREVIEW_SCALE;
                const toPdfY = (cy) => ph - cy / PREVIEW_SCALE;

                // ── Process text blocks: cover original + render new text ──
                const blocks = this.allTextBlocks[pgNum] || [];
                for (const block of blocks) {
                    // Skip empty blocks
                    if (!block.text || block.text.trim() === '') continue;

                    // Step A: Cover original text area with white rectangle (slightly enlarged)
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

                    // Step B: Render edited text to PNG and embed
                    const pngDataUrl = await this._renderTextToPng(block);

                    if (pngDataUrl) {
                        const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
                        const img = await doc.embedPng(pngBytes);

                        // Image dimensions in PDF points
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

                // ── Process highlights: draw colored rectangles ──
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

            // Split text by newlines for multi-line rendering
            const lines = block.text.split('\n');
            const lineHeight = block.fontSize * 2 * 1.4;

            // Measure max width across all lines
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

            // Re-apply font after resize
            ctx.font = fontStyle;
            ctx.fillStyle = block.color;
            ctx.textBaseline = 'top';

            // Draw each line
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const metrics = ctx.measureText(line);
                const tx = padX;
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
