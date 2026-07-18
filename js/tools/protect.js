/* ========== Tool: Protect PDF ========== */
App.register('protect', {
    file: null, pdfBytes: null,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="protect_desc">${I18N.t('protect_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="protect-content" style="display:none">
                <div class="settings-panel" style="flex-direction:column;align-items:flex-start">
                    <div class="setting-group" style="width:100%;max-width:320px">
                        <label data-i18n="protect_password">${I18N.t('protect_password')}</label>
                        <input type="password" id="protect-pass" placeholder="••••••" style="width:100%">
                    </div>
                    <div class="setting-group" style="width:100%;max-width:320px">
                        <label data-i18n="protect_confirm">${I18N.t('protect_confirm')}</label>
                        <input type="password" id="protect-confirm" placeholder="••••••" style="width:100%">
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['protect'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        document.getElementById('protect-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
    },

    async process() {
        const pass = document.getElementById('protect-pass').value;
        const confirm = document.getElementById('protect-confirm').value;
        if (!pass) { App.toast('Enter password', 'error'); return; }
        if (pass !== confirm) { App.toast(I18N.t('protect_mismatch'), 'error'); return; }
        App.toast(I18N.t('processing'), 'info');

        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        doc.encrypt({
            userPassword: pass,
            ownerPassword: pass + '_owner',
            permissions: { printing: 'highResolution', modifying: false, copying: false }
        });
        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'protected.pdf');
    }
});
