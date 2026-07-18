/* ========== PDF Craft — Application Core ========== */

const App = {
    toolRegistry: {},
    currentTool: null,
    state: {},

    /* ---------- Define tools ---------- */
    tools: [
        { id: 'merge', cat: 'organize', iconClass: 'icon-merge', icon: '📑', nameKey: 'tool_merge', descKey: 'tool_merge_desc' },
        { id: 'split', cat: 'organize', iconClass: 'icon-split', icon: '✂️', nameKey: 'tool_split', descKey: 'tool_split_desc' },
        { id: 'rotate', cat: 'organize', iconClass: 'icon-rotate', icon: '🔄', nameKey: 'tool_rotate', descKey: 'tool_rotate_desc' },
        { id: 'compress', cat: 'security', iconClass: 'icon-compress', icon: '📦', nameKey: 'tool_compress', descKey: 'tool_compress_desc' },
        { id: 'pdf2word', cat: 'convert', iconClass: 'icon-convert', icon: '📝', nameKey: 'tool_pdf_word', descKey: 'tool_pdf_word_desc' },
        { id: 'pdf2jpg', cat: 'convert', iconClass: 'icon-image', icon: '🖼️', nameKey: 'tool_pdf_jpg', descKey: 'tool_pdf_jpg_desc' },
        { id: 'jpg2pdf', cat: 'convert', iconClass: 'icon-image', icon: '📸', nameKey: 'tool_jpg_pdf', descKey: 'tool_jpg_pdf_desc' },
        { id: 'edit', cat: 'edit', iconClass: 'icon-edit', icon: '✏️', nameKey: 'tool_edit', descKey: 'tool_edit_desc' },
        { id: 'sign', cat: 'edit', iconClass: 'icon-sign', icon: '🖊️', nameKey: 'tool_sign', descKey: 'tool_sign_desc' },
        { id: 'watermark', cat: 'edit', iconClass: 'icon-watermark', icon: '💧', nameKey: 'tool_watermark', descKey: 'tool_watermark_desc' },
        { id: 'pagenum', cat: 'edit', iconClass: 'icon-pagenum', icon: '🔢', nameKey: 'tool_page_numbers', descKey: 'tool_page_numbers_desc' },
        { id: 'protect', cat: 'security', iconClass: 'icon-protect', icon: '🔒', nameKey: 'tool_protect', descKey: 'tool_protect_desc' },
        { id: 'unlock', cat: 'security', iconClass: 'icon-unlock', icon: '🔓', nameKey: 'tool_unlock', descKey: 'tool_unlock_desc' },
    ],

    /* ---------- Init ---------- */
    init() {
        I18N.init();
        this.renderToolGrid();
        this.bindCategoryTabs();
        // Close lang dropdown on outside click
        document.addEventListener('click', e => {
            const dd = document.getElementById('lang-dropdown');
            const btn = document.getElementById('lang-btn');
            if (dd.classList.contains('show') && !btn.contains(e.target) && !dd.contains(e.target)) {
                dd.classList.remove('show');
            }
        });
    },

    /* ---------- Render Tool Grid ---------- */
    renderToolGrid() {
        const grid = document.getElementById('tool-grid');
        grid.innerHTML = this.tools.map(t => `
            <div class="tool-card" data-cat="${t.cat}" data-tool="${t.id}" onclick="App.openTool('${t.id}')">
                <div class="tool-icon ${t.iconClass}">${t.icon}</div>
                <h3 data-i18n="${t.nameKey}">${I18N.t(t.nameKey)}</h3>
                <p data-i18n="${t.descKey}">${I18N.t(t.descKey)}</p>
            </div>
        `).join('');
    },

    /* ---------- Category Filter ---------- */
    bindCategoryTabs() {
        const tabs = document.querySelectorAll('.cat-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const cat = tab.dataset.cat;
                document.querySelectorAll('.tool-card').forEach(card => {
                    card.classList.toggle('hidden', cat !== 'all' && card.dataset.cat !== cat);
                });
            });
        });
    },

    /* ---------- Open Tool ---------- */
    openTool(toolId) {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) return;
        this.currentTool = toolId;
        document.getElementById('home-page').style.display = 'none';
        document.getElementById('workspace').classList.add('active');
        document.getElementById('workspace-title').textContent = I18N.t(tool.nameKey);
        const body = document.getElementById('workspace-body');
        body.innerHTML = '';
        // Call tool's init
        const toolModule = this.toolRegistry[toolId];
        if (toolModule) {
            toolModule.init(body);
        } else {
            body.innerHTML = `<p>${I18N.t('error')}</p>`;
        }
    },

    /* ---------- Go Home ---------- */
    goHome() {
        document.getElementById('workspace').classList.remove('active');
        document.getElementById('home-page').style.display = '';
        const body = document.getElementById('workspace-body');
        body.innerHTML = '';
        // Cleanup tool
        if (this.currentTool && this.toolRegistry[this.currentTool]?.cleanup) {
            this.toolRegistry[this.currentTool].cleanup();
        }
        this.currentTool = null;
        this.state = {};
    },

    /* ---------- Register Tool ---------- */
    register(id, module) {
        this.toolRegistry[id] = module;
    },

    /* ---------- Toast ---------- */
    toast(message, type) {
        const container = document.getElementById('toasts');
        type = type || 'info';
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => { el.remove(); }, 3000);
    },

    /* ---------- Helpers ---------- */
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    },

    createUploadZone(accept, hintKey) {
        const acceptStr = accept || '.pdf';
        const hintText = I18N.t(hintKey || 'upload_hint');
        return `
            <div class="upload-zone" id="upload-zone">
                <div class="upload-zone-icon">📂</div>
                <div class="upload-zone-text" data-i18n="${hintKey || 'upload_hint'}">${hintText}</div>
                <div class="upload-zone-hint">${acceptStr.replace(/\./g, ' ').toUpperCase()} ${I18N.t('pdf2word_progress').includes('提取') ? '' : ''}</div>
                <input type="file" id="file-input" accept="${acceptStr}" ${acceptStr === '.pdf' ? '' : 'multiple'}>
            </div>
        `;
    },

    bindUploadZone(onFiles) {
        const zone = document.getElementById('upload-zone');
        const input = document.getElementById('file-input');
        if (!zone || !input) return;
        zone.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            if (input.files.length > 0) onFiles(Array.from(input.files));
            input.value = '';
        });
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) onFiles(Array.from(e.dataTransfer.files));
        });
    },

    setWorkspaceHTML(html) {
        document.getElementById('workspace-body').innerHTML = html;
    },

    /* ---------- Download ---------- */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        this.toast(I18N.t('toast_done'), 'success');
    },

    /* ---------- Shared: Load PDF pages ---------- */
    async loadPdfPages(file, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return { pdfDoc: null, pages: 0 };
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
            const page = await pdfjsDoc.getPage(i);
            const viewport = page.getViewport({ scale: 0.4 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            canvas.dataset.page = i;
            container.appendChild(canvas);
        }
        return { pdfDoc: pdfjsDoc, pages: pdfjsDoc.numPages };
    },

    /* ---------- Shared: PDF page nav ---------- */
    renderPageNav(current, total, onPrev, onNext) {
        return `
            <div class="pdf-nav">
                <button onclick="${onPrev}" ${current <= 1 ? 'disabled' : ''}>← ${I18N.t('btn_back')}</button>
                <span>${current} / ${total}</span>
                <button onclick="${onNext}" ${current >= total ? 'disabled' : ''}>${I18N.t('btn_download')} →</button>
            </div>
        `;
    }
};
