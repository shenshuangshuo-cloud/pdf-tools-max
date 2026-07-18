/* ========== Tool: Split PDF ========== */
App.register('split', {
    file: null, pdfDoc: null, totalPages: 0,
    selectedPages: new Set(), mode: 'extract',

    init(body) {
        this.file = null; this.pdfDoc = null; this.selectedPages = new Set();
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="split_desc">${I18N.t('split_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="split-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="split_range">${I18N.t('split_range')}</label>
                        <input type="text" id="split-range" placeholder="${I18N.t('split_range_hint')}" style="width:200px">
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['split'].splitByRange()" data-i18n="split_extract">${I18N.t('split_extract')}</button>
                    <button class="btn btn-secondary" onclick="App.toolRegistry['split'].splitAll()" data-i18n="split_all_pages">${I18N.t('split_all_pages')}</button>
                </div>
                <div class="page-grid" id="split-page-grid"></div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-block" id="split-extract-btn" onclick="App.toolRegistry['split'].extractSelected()" style="display:none" data-i18n="split_extract">${I18N.t('split_extract')}</button>
                </div>
            </div>
            <div id="split-result"></div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        document.getElementById('split-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPages();
    },

    async renderPages() {
        const grid = document.getElementById('split-page-grid');
        grid.innerHTML = '';
        this.selectedPages = new Set();
        const bytes = await this.file.arrayBuffer();
        const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        this.totalPages = pdfjsDoc.numPages;
        for (let i = 1; i <= this.totalPages; i++) {
            const page = await pdfjsDoc.getPage(i);
            const vp = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';
            thumb.innerHTML = canvas.outerHTML + `<div class="page-thumb-label">${i}</div>`;
            thumb.onclick = () => {
                thumb.classList.toggle('selected');
                thumb.classList.contains('selected') ? this.selectedPages.add(i) : this.selectedPages.delete(i);
                document.getElementById('split-extract-btn').style.display = this.selectedPages.size > 0 ? '' : 'none';
            };
            grid.appendChild(thumb);
        }
    },

    parseRanges(input) {
        const pages = new Set();
        const parts = input.replace(/\s/g, '').split(',');
        for (const part of parts) {
            if (part.includes('-')) {
                const [s, e] = part.split('-').map(Number);
                if (isNaN(s) || isNaN(e) || s < 1 || e > this.totalPages) continue;
                for (let i = Math.min(s, e); i <= Math.max(s, e); i++) pages.add(i);
            } else {
                const n = Number(part);
                if (!isNaN(n) && n >= 1 && n <= this.totalPages) pages.add(n);
            }
        }
        return [...pages].sort((a, b) => a - b);
    },

    async splitByRange() {
        const input = document.getElementById('split-range').value.trim();
        if (!input) { App.toast(I18N.t('toast_no_file'), 'error'); return; }
        const sel = this.parseRanges(input);
        if (sel.length === 0) { App.toast('Invalid range', 'error'); return; }
        await this.extractPages(sel);
    },

    async splitAll() {
        await this.extractPages(Array.from({ length: this.totalPages }, (_, i) => i + 1), 'split');
    },

    async extractSelected() {
        if (this.selectedPages.size === 0) { App.toast('No pages selected', 'error'); return; }
        await this.extractPages([...this.selectedPages].sort((a, b) => a - b));
    },

    async extractPages(pages, mode) {
        App.toast(I18N.t('processing'), 'info');
        const bytes = await this.file.arrayBuffer();
        const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const result = document.getElementById('split-result');
        result.innerHTML = '';

        if (mode === 'split') {
            const zip = new JSZip();
            for (const p of pages) {
                const doc = await PDFLib.PDFDocument.create();
                const [pg] = await doc.copyPages(src, [p - 1]);
                doc.addPage(pg);
                zip.file(`page_${p}.pdf`, await doc.save());
            }
            const blob = await zip.generateAsync({ type: 'blob' });
            App.downloadBlob(blob, 'split_pages.zip');
        } else {
            const doc = await PDFLib.PDFDocument.create();
            for (const p of pages) {
                const [pg] = await doc.copyPages(src, [p - 1]);
                doc.addPage(pg);
            }
            const out = await doc.save();
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), `extracted_pages.pdf`);
        }
    }
});
