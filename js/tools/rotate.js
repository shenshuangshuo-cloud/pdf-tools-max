/* ========== Tool: Rotate PDF ========== */
App.register('rotate', {
    file: null, rotations: {},

    init(body) {
        this.file = null; this.rotations = {};
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="rotate_desc">${I18N.t('rotate_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="rotate-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="rotate_all">${I18N.t('rotate_all')}</label>
                        <select id="rotate-all" onchange="App.toolRegistry['rotate'].rotateAll()">
                            <option value="">—</option>
                            <option value="90" data-i18n="rotate_90">${I18N.t('rotate_90')}</option>
                            <option value="180" data-i18n="rotate_180">${I18N.t('rotate_180')}</option>
                            <option value="270" data-i18n="rotate_270">${I18N.t('rotate_270')}</option>
                        </select>
                    </div>
                </div>
                <div class="page-grid" id="rotate-page-grid"></div>
                <div class="btn-group" id="rotate-actions" style="display:none">
                    <button class="btn btn-primary btn-block" onclick="App.toolRegistry['rotate'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        document.getElementById('rotate-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPages();
    },

    async renderPages() {
        const grid = document.getElementById('rotate-page-grid');
        grid.innerHTML = '';
        const bytes = await this.file.arrayBuffer();
        const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
            const page = await pdfjsDoc.getPage(i);
            const vp = page.getViewport({ scale: 0.25 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            canvas.style.transform = this.rotations[i] ? `rotate(${this.rotations[i]}deg)` : '';
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';
            thumb.innerHTML = canvas.outerHTML + `<div class="page-thumb-label">${i}</div>`;
            thumb.onclick = () => this.cycleRotation(i, thumb);
            grid.appendChild(thumb);
        }
    },

    cycleRotation(i, thumb) {
        const cur = this.rotations[i] || 0;
        this.rotations[i] = cur === 0 ? 90 : cur === 90 ? 180 : cur === 180 ? 270 : 0;
        const c = thumb.querySelector('canvas');
        c.style.transform = this.rotations[i] ? `rotate(${this.rotations[i]}deg)` : '';
        thumb.classList.toggle('selected', this.rotations[i] > 0);
        document.getElementById('rotate-actions').style.display = Object.values(this.rotations).some(r => r > 0) ? '' : 'none';
    },

    rotateAll() {
        const deg = parseInt(document.getElementById('rotate-all').value) || 0;
        if (!deg) { this.rotations = {}; } else {
            const bytes = this.file._bytes; // will be loaded later
            const grid = document.getElementById('rotate-page-grid');
            const thumbs = grid.querySelectorAll('.page-thumb');
            for (let i = 0; i < thumbs.length; i++) {
                this.rotations[i + 1] = deg;
                thumbs[i].classList.add('selected');
                const c = thumbs[i].querySelector('canvas');
                c.style.transform = `rotate(${deg}deg)`;
            }
        }
        document.getElementById('rotate-actions').style.display = deg ? '' : 'none';
    },

    async process() {
        App.toast(I18N.t('processing'), 'info');
        const bytes = await this.file.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const r = this.rotations[i + 1] || 0;
            if (r > 0) pages[i].setRotation(PDFLib.degrees(r));
        }
        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'rotated.pdf');
    }
});
