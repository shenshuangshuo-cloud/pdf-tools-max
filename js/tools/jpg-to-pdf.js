/* ========== Tool: JPG to PDF ========== */
App.register('jpg2pdf', {
    files: [],

    init(body) {
        this.files = [];
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="jpg2pdf_desc">${I18N.t('jpg2pdf_desc')}</p>
            ${App.createUploadZone('image/*', 'upload_hint')}
            <div id="jpg2pdf-list" class="file-list"></div>
            <div id="jpg2pdf-controls" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="jpg2pdf_orientation">${I18N.t('jpg2pdf_orientation')}</label>
                        <select id="jpg2pdf-orient">
                            <option value="portrait" data-i18n="jpg2pdf_portrait">${I18N.t('jpg2pdf_portrait')}</option>
                            <option value="landscape" data-i18n="jpg2pdf_landscape">${I18N.t('jpg2pdf_landscape')}</option>
                            <option value="auto">Auto</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label data-i18n="jpg2pdf_fit">${I18N.t('jpg2pdf_fit')}</label>
                        <select id="jpg2pdf-fit">
                            <option value="page" data-i18n="jpg2pdf_fit_page">${I18N.t('jpg2pdf_fit_page')}</option>
                            <option value="actual" data-i18n="jpg2pdf_fit_actual">${I18N.t('jpg2pdf_fit_actual')}</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label><input type="checkbox" id="jpg2pdf-margin" checked> <span data-i18n="jpg2pdf_margins">${I18N.t('jpg2pdf_margins')}</span></label>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" onclick="App.toolRegistry['jpg2pdf'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
            </div>
        `;
        App.bindUploadZone((files) => this.addFiles(files));
    },

    addFiles(files) {
        for (const f of files) {
            if (!f.type.startsWith('image/')) continue;
            this.files.push(f);
        }
        this.renderList();
    },

    renderList() {
        const list = document.getElementById('jpg2pdf-list');
        list.innerHTML = this.files.map((f, i) => `
            <div class="file-item">
                <span class="file-item-grip">${i + 1}</span>
                <span class="file-item-icon">🖼️</span>
                <div class="file-item-info">
                    <div class="file-item-name">${f.name}</div>
                    <div class="file-item-size">${App.formatSize(f.size)}</div>
                </div>
                <button class="file-item-remove" onclick="App.toolRegistry['jpg2pdf'].removeFile(${i})">×</button>
            </div>
        `).join('');
        document.getElementById('jpg2pdf-controls').style.display = this.files.length > 0 ? '' : 'none';
    },

    removeFile(i) { this.files.splice(i, 1); this.renderList(); },

    async process() {
        if (this.files.length === 0) { App.toast(I18N.t('toast_no_file'), 'error'); return; }
        App.toast(I18N.t('processing'), 'info');

        const doc = await PDFLib.PDFDocument.create();
        const orient = document.getElementById('jpg2pdf-orient').value;
        const fit = document.getElementById('jpg2pdf-fit').value;
        const noMargin = document.getElementById('jpg2pdf-margin').checked;

        const PAGE_W = 595.28, PAGE_H = 841.89; // A4

        for (const file of this.files) {
            const imgBytes = await file.arrayBuffer();
            let img;
            if (file.type === 'image/png') {
                img = await doc.embedPng(imgBytes);
            } else {
                img = await doc.embedJpg(imgBytes);
            }

            let page;
            if (orient === 'auto') {
                page = img.width > img.height
                    ? doc.addPage([PAGE_H, PAGE_W])
                    : doc.addPage([PAGE_W, PAGE_H]);
            } else if (orient === 'landscape') {
                page = doc.addPage([PAGE_H, PAGE_W]);
            } else {
                page = doc.addPage([PAGE_W, PAGE_H]);
            }

            const pw = page.getWidth(), ph = page.getHeight();
            if (fit === 'actual') {
                const w = Math.min(img.width, pw);
                const h = Math.min(img.height, ph);
                page.drawImage(img, { x: 0, y: ph - h, width: w, height: h });
            } else {
                const margin = noMargin ? 0 : 20;
                const scale = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height);
                const w = img.width * scale, h = img.height * scale;
                const x = (pw - w) / 2, y = (ph - h) / 2;
                page.drawImage(img, { x, y, width: w, height: h });
            }
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'images_to_pdf.pdf');
    }
});
