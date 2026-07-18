/* ========== Tool: Edit PDF ========== */
App.register('edit', {
    file: null, pdfDoc: null, pdfBytes: null,
    currentPage: 1, totalPages: 0,
    textAnnotations: {}, nextId: 0,

    init(body) {
        this.file = null; this.currentPage = 1; this.textAnnotations = {}; this.nextId = 0;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="edit_desc">${I18N.t('edit_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="edit-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="edit_add_text">${I18N.t('edit_add_text')}</label>
                        <input type="text" id="edit-text-input" placeholder="Enter text...">
                    </div>
                    <div class="setting-group">
                        <label data-i18n="edit_font_size">${I18N.t('edit_font_size')}</label>
                        <input type="number" id="edit-font-size" value="14" min="8" max="72" style="width:70px">
                    </div>
                    <div class="setting-group">
                        <label>Color</label>
                        <input type="color" id="edit-color" value="#000000">
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['edit'].startPlaceMode()" data-i18n="edit_add_text">${I18N.t('edit_add_text')}</button>
                    <button class="btn btn-secondary" onclick="App.toolRegistry['edit'].download()" data-i18n="btn_download">${I18N.t('btn_download')}</button>
                </div>
                <div class="pdf-preview-area" id="edit-preview">
                    <canvas id="edit-canvas" style="display:block;max-width:100%;margin:0 auto;cursor:crosshair"></canvas>
                </div>
                <div id="edit-nav"></div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        document.getElementById('edit-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPage(1);
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.2 });
        const canvas = document.getElementById('edit-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Render text annotations
        const anns = this.textAnnotations[num] || [];
        for (const ann of anns) {
            ctx.font = `${ann.size}px sans-serif`;
            ctx.fillStyle = ann.color;
            ctx.fillText(ann.text, ann.x, ann.y);
        }

        document.getElementById('edit-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['edit'].renderPage(${num - 1})`,
            `App.toolRegistry['edit'].renderPage(${num + 1})`
        );
    },

    startPlaceMode() {
        const text = document.getElementById('edit-text-input').value.trim();
        if (!text) { App.toast('Enter text first', 'error'); return; }
        const fontSize = parseInt(document.getElementById('edit-font-size').value) || 14;
        const color = document.getElementById('edit-color').value;
        const canvas = document.getElementById('edit-canvas');

        const handler = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top + fontSize; // baseline offset
            if (!this.textAnnotations[this.currentPage]) this.textAnnotations[this.currentPage] = [];
            this.textAnnotations[this.currentPage].push({
                id: ++this.nextId, text, x, y, size: fontSize, color
            });
            canvas.removeEventListener('click', handler);
            this.renderPage(this.currentPage);
        };
        canvas.addEventListener('click', handler);
        App.toast('Click on the PDF to place text', 'info');
    },

    async download() {
        App.toast(I18N.t('processing'), 'info');
        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        for (const [pgNum, anns] of Object.entries(this.textAnnotations)) {
            const page = pages[parseInt(pgNum) - 1];
            const pw = page.getWidth(), ph = page.getHeight();

            // Get the viewport scale used for rendering (1.2x)
            // We need to map canvas coordinates back to PDF coordinates
            const pdfPage = await this.pdfDoc.getPage(parseInt(pgNum));
            const vp = pdfPage.getViewport({ scale: 1.2 });
            // PDF coords: origin is bottom-left. PDF width = vp.width / 1.2
            const pdfW = vp.width / 1.2;
            const pdfH = vp.height / 1.2;
            const scaleX = pw / pdfW;
            const scaleY = ph / pdfH;

            for (const ann of anns) {
                // Convert canvas y (top-down) to PDF y (bottom-up)
                const pdfX = ann.x * scaleX;
                const pdfY = ph - (ann.y - ann.size) * scaleY;
                const fontSize = ann.size * scaleY * 0.75;

                page.drawText(ann.text, {
                    x: pdfX, y: pdfY,
                    size: Math.max(8, fontSize),
                    color: PDFLib.rgb(
                        parseInt(ann.color.slice(1, 3), 16) / 255,
                        parseInt(ann.color.slice(3, 5), 16) / 255,
                        parseInt(ann.color.slice(5, 7), 16) / 255
                    )
                });
            }
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'edited.pdf');
    }
});
