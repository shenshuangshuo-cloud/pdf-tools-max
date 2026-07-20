/* ========== PDF Craft — Application Core ========== */

const App = {
    toolRegistry: {},
    currentTool: null,
    state: {},

    /* ---------- Define tools ---------- */
    tools: [
        { id: 'merge', slug: 'merge-pdf', href: 'merge-pdf.html', cat: 'organize', iconClass: 'icon-merge', icon: '📑', nameKey: 'tool_merge', descKey: 'tool_merge_desc' },
        { id: 'split', slug: 'split-pdf', href: 'split-pdf.html', cat: 'organize', iconClass: 'icon-split', icon: '✂️', nameKey: 'tool_split', descKey: 'tool_split_desc' },
        { id: 'rotate', slug: 'rotate-pdf', href: 'rotate-pdf.html', cat: 'organize', iconClass: 'icon-rotate', icon: '🔄', nameKey: 'tool_rotate', descKey: 'tool_rotate_desc' },
        { id: 'compress', slug: 'compress-pdf', href: 'compress-pdf.html', cat: 'security', iconClass: 'icon-compress', icon: '📦', nameKey: 'tool_compress', descKey: 'tool_compress_desc' },
        { id: 'pdf2word', slug: 'pdf-to-word', href: 'pdf-to-word.html', cat: 'convert', iconClass: 'icon-convert', icon: '📝', nameKey: 'tool_pdf_word', descKey: 'tool_pdf_word_desc' },
        { id: 'pdf2jpg', slug: 'pdf-to-jpg', href: 'pdf-to-jpg.html', cat: 'convert', iconClass: 'icon-image', icon: '🖼️', nameKey: 'tool_pdf_jpg', descKey: 'tool_pdf_jpg_desc' },
        { id: 'jpg2pdf', slug: 'jpg-to-pdf', href: 'jpg-to-pdf.html', cat: 'convert', iconClass: 'icon-image', icon: '📸', nameKey: 'tool_jpg_pdf', descKey: 'tool_jpg_pdf_desc' },
        { id: 'edit', slug: 'edit-pdf', href: 'edit-pdf.html', cat: 'edit', iconClass: 'icon-edit', icon: '✏️', nameKey: 'tool_edit', descKey: 'tool_edit_desc' },
        { id: 'sign', slug: 'sign-pdf', href: 'sign-pdf.html', cat: 'edit', iconClass: 'icon-sign', icon: '🖊️', nameKey: 'tool_sign', descKey: 'tool_sign_desc' },
        { id: 'watermark', slug: 'watermark-pdf', href: 'watermark-pdf.html', cat: 'edit', iconClass: 'icon-watermark', icon: '💧', nameKey: 'tool_watermark', descKey: 'tool_watermark_desc' },
        { id: 'pagenum', slug: 'add-page-numbers', href: 'add-page-numbers.html', cat: 'edit', iconClass: 'icon-pagenum', icon: '🔢', nameKey: 'tool_page_numbers', descKey: 'tool_page_numbers_desc' },
        { id: 'protect', slug: 'protect-pdf', href: 'protect-pdf.html', cat: 'security', iconClass: 'icon-protect', icon: '🔒', nameKey: 'tool_protect', descKey: 'tool_protect_desc' },
        { id: 'unlock', slug: 'unlock-pdf', href: 'unlock-pdf.html', cat: 'security', iconClass: 'icon-unlock', icon: '🔓', nameKey: 'tool_unlock', descKey: 'tool_unlock_desc' },
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
            if (dd && dd.classList.contains('show') && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
                dd.classList.remove('show');
            }
        });
    },

    /* ---------- Render Tool Grid (with <a> links for MPA) ---------- */
    renderToolGrid() {
        const grid = document.getElementById('tool-grid');
        if (!grid) return;
        grid.innerHTML = this.tools.map(t => `
            <a class="tool-card" data-cat="${t.cat}" data-tool="${t.id}" href="${t.href}">
                <div class="tool-icon ${t.iconClass}">${t.icon}</div>
                <h3 data-i18n="${t.nameKey}">${I18N.t(t.nameKey)}</h3>
                <p data-i18n="${t.descKey}">${I18N.t(t.descKey)}</p>
            </a>
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

        const workspace = document.getElementById('workspace');
        const homePage = document.getElementById('home-page');

        // Scenario 1: On a tool page (workspace exists as .workspace-page, no overlay)
        if (workspace && !workspace.classList.contains('workspace-overlay') && !homePage) {
            document.getElementById('workspace-title').textContent = I18N.t(tool.nameKey);
            const body = document.getElementById('workspace-body');
            body.innerHTML = '';
            const toolModule = this.toolRegistry[toolId];
            if (toolModule) {
                toolModule.init(body);
            } else {
                body.innerHTML = `<p>${I18N.t('error')}</p>`;
            }
            return;
        }

        // Scenario 2: On index.html (workspace overlay, homePage visible)
        if (homePage) {
            homePage.style.display = 'none';
        }
        if (workspace) {
            workspace.classList.add('active');
        }
        document.getElementById('workspace-title').textContent = I18N.t(tool.nameKey);
        const body = document.getElementById('workspace-body');
        body.innerHTML = '';
        const toolModule = this.toolRegistry[toolId];
        if (toolModule) {
            toolModule.init(body);
        } else {
            body.innerHTML = `<p>${I18N.t('error')}</p>`;
        }
    },

    /* ---------- Go Home ---------- */
    goHome() {
        window.location.href = 'index.html';
    },

    /* ---------- Register Tool ---------- */
    register(id, module) {
        this.toolRegistry[id] = module;
    },

    /* ---------- Toast ---------- */
    toast(message, type) {
        const container = document.getElementById('toasts');
        if (!container) return;
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
        const body = document.getElementById('workspace-body');
        if (body) body.innerHTML = html;
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
