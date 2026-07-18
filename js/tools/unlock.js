/* ========== Tool: Unlock PDF ========== */
App.register('unlock', {
    file: null, pdfBytes: null,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="unlock_desc">${I18N.t('unlock_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="unlock-content" style="display:none">
                <div class="settings-panel" style="flex-direction:column;align-items:flex-start">
                    <div class="setting-group" style="width:100%;max-width:320px">
                        <label data-i18n="unlock_password">${I18N.t('unlock_password')}</label>
                        <input type="password" id="unlock-pass" placeholder="••••••" style="width:100%">
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['unlock'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        document.getElementById('unlock-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
    },

    async process() {
        const pass = document.getElementById('unlock-pass').value;
        if (!pass) { App.toast('Enter password', 'error'); return; }
        App.toast(I18N.t('processing'), 'info');

        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { password: pass });
            const out = await doc.save({ useObjectStreams: true });
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'unlocked.pdf');
        } catch (e) {
            App.toast(I18N.t('unlock_wrong'), 'error');
        }
    }
});
