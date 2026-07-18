/* ========== Tool: Page Numbers ========== */
App.register('pagenum', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="pagenum_desc">${I18N.t('pagenum_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="pagenum-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="pagenum_position">${I18N.t('pagenum_position')}</label>
                        <select id="pn-position">
                            <option value="bc" data-i18n="pagenum_bottom_center">${I18N.t('pagenum_bottom_center')}</option>
                            <option value="br" data-i18n="pagenum_bottom_right">${I18N.t('pagenum_bottom_right')}</option>
                            <option value="tc" data-i18n="pagenum_top_center">${I18N.t('pagenum_top_center')}</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label data-i18n="pagenum_format">${I18N.t('pagenum_format')}</label>
                        <select id="pn-format">
                            <option value="num">1, 2, 3...</option>
                            <option value="total">1/5, 2/5...</option>
                            <option value="dash">- 1 -</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label data-i18n="pagenum_start">${I18N.t('pagenum_start')}</label>
                        <input type="number" id="pn-start" value="1" min="1" style="width:80px">
                    </div>
                    <div class="setting-group">
                        <label data-i18n="edit_font_size">${I18N.t('edit_font_size')}</label>
                        <input type="number" id="pn-size" value="10" min="6" max="36" style="width:70px">
                    </div>
                </div>
                <div class="pdf-preview-area">
                    <canvas id="pn-canvas" style="display:block;max-width:100%;margin:0 auto"></canvas>
                </div>
                <div id="pn-nav"></div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-block" onclick="App.toolRegistry['pagenum'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        document.getElementById('pagenum-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPage(1);
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.0 });
        const canvas = document.getElementById('pn-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        document.getElementById('pn-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['pagenum'].renderPage(${num - 1})`,
            `App.toolRegistry['pagenum'].renderPage(${num + 1})`
        );
    },

    async process() {
        App.toast(I18N.t('processing'), 'info');
        const pos = document.getElementById('pn-position').value;
        const fmt = document.getElementById('pn-format').value;
        const start = parseInt(document.getElementById('pn-start').value) || 1;
        const size = parseInt(document.getElementById('pn-size').value) || 10;

        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        const total = pages.length;

        for (let i = 0; i < total; i++) {
            const page = pages[i];
            const pw = page.getWidth(), ph = page.getHeight();
            const num = i + start;

            let text;
            if (fmt === 'total') text = `${num}/${total}`;
            else if (fmt === 'dash') text = `- ${num} -`;
            else text = String(num);

            const textW = size * text.length * 0.6;

            let x, y;
            if (pos === 'bc') { x = pw / 2 - textW / 2; y = 30; }
            else if (pos === 'br') { x = pw - textW - 30; y = 30; }
            else { x = pw / 2 - textW / 2; y = ph - 30; }

            page.drawText(text, { x, y, size });
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'page_numbered.pdf');
    }
});
