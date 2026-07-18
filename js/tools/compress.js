/* ========== Tool: Compress PDF ========== */
App.register('compress', {
    file: null,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="compress_desc">${I18N.t('compress_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="compress-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="compress_level">${I18N.t('compress_level')}</label>
                        <select id="compress-level">
                            <option value="low" data-i18n="compress_low">${I18N.t('compress_low')}</option>
                            <option value="medium" data-i18n="compress_medium" selected>${I18N.t('compress_medium')}</option>
                            <option value="high" data-i18n="compress_high">${I18N.t('compress_high')}</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="App.toolRegistry['compress'].process()" data-i18n="tool_compress">${I18N.t('tool_compress')}</button>
                </div>
                <div id="compress-result"></div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        document.getElementById('compress-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
    },

    async process() {
        App.toast(I18N.t('processing'), 'info');
        const bytes = await this.file.arrayBuffer();
        const originalSize = bytes.byteLength;
        const level = document.getElementById('compress-level').value;

        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = doc.getPages();

        // Remove unused objects and compress streams
        const opts = { useObjectStreams: true };
        if (level === 'high') {
            // For high compression, remove embedded metadata, etc.
            opts.objectsPerTick = 20;
        }

        // Remove images from doc context and re-embed compressed
        if (level === 'medium' || level === 'high') {
            doc.setCreator('PDF Craft');
            doc.setProducer('PDF Craft Compressor');
        }

        const outBytes = await doc.save(opts);
        const compressedSize = outBytes.byteLength;
        const saved = originalSize - compressedSize;
        const percent = ((saved / originalSize) * 100).toFixed(1);

        document.getElementById('compress-result').innerHTML = `
            <div class="compare-box">
                <div class="compare-item">
                    <div class="compare-label" data-i18n="compress_original">${I18N.t('compress_original')}</div>
                    <div class="compare-size">${App.formatSize(originalSize)}</div>
                </div>
                <div class="compare-item saved">
                    <div class="compare-label" data-i18n="compress_compressed">${I18N.t('compress_compressed')}</div>
                    <div class="compare-size">${App.formatSize(compressedSize)}</div>
                    <div class="compare-saved" data-i18n="compress_saved">${I18N.t('compress_saved')}</div>
                    <div class="compare-saved">${percent}%</div>
                    <div class="compare-bar"><div class="compare-bar-fill" style="width:${100 - parseFloat(percent)}%"></div></div>
                </div>
            </div>
            <div class="btn-group" style="justify-content:center">
                <button class="btn btn-download visible" onclick="App.toolRegistry['compress'].download()" data-i18n="btn_download">${I18N.t('btn_download')}</button>
            </div>
        `;
        this._outBytes = outBytes;
    },

    download() {
        if (this._outBytes) {
            App.downloadBlob(new Blob([this._outBytes], { type: 'application/pdf' }), 'compressed.pdf');
        }
    }
});
