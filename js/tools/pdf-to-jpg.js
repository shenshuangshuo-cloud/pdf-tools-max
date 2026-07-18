/* ========== Tool: PDF to JPG ========== */
App.register('pdf2jpg', {
    file: null, pdfDoc: null, currentPage: 1, totalPages: 0,

    init(body) {
        this.file = null; this.pdfDoc = null; this.currentPage = 1;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="pdf2jpg_desc">${I18N.t('pdf2jpg_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="pdf2jpg-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="pdf2jpg_quality">${I18N.t('pdf2jpg_quality')}</label>
                        <select id="jpg-quality">
                            <option value="0.9">90%</option>
                            <option value="0.95" selected>95%</option>
                            <option value="1.0">100%</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['pdf2jpg'].exportAll()" data-i18n="pdf2jpg_all">${I18N.t('pdf2jpg_all')}</button>
                    <button class="btn btn-secondary" onclick="App.toolRegistry['pdf2jpg'].exportCurrent()" data-i18n="pdf2jpg_current">${I18N.t('pdf2jpg_current')}</button>
                </div>
                <div class="pdf-preview-area" id="pdf2jpg-preview"></div>
                <div id="pdf2jpg-nav"></div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        document.getElementById('pdf2jpg-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        const bytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        this.totalPages = this.pdfDoc.numPages;
        await this.renderPage(1);
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        document.getElementById('pdf2jpg-preview').innerHTML = canvas.outerHTML;
        document.getElementById('pdf2jpg-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['pdf2jpg'].renderPage(${num - 1})`,
            `App.toolRegistry['pdf2jpg'].renderPage(${num + 1})`
        );
    },

    async exportAll() {
        App.toast(I18N.t('processing'), 'info');
        const quality = parseFloat(document.getElementById('jpg-quality').value);
        const zip = new JSZip();
        for (let i = 1; i <= this.totalPages; i++) {
            const page = await this.pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
            zip.file(`page_${i}.jpg`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        App.downloadBlob(zipBlob, 'pdf_pages.zip');
    },

    async exportCurrent() {
        const page = await this.pdfDoc.getPage(this.currentPage);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        canvas.toBlob(blob => {
            App.downloadBlob(blob, `page_${this.currentPage}.jpg`);
        }, 'image/jpeg', parseFloat(document.getElementById('jpg-quality').value));
    }
});
