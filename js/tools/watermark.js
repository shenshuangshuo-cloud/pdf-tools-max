/* ========== Tool: Watermark ========== */
App.register('watermark', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="watermark_desc">${I18N.t('watermark_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="watermark-content" style="display:none">
                <div class="settings-panel">
                    <div class="setting-group">
                        <label data-i18n="watermark_text">${I18N.t('watermark_text')}</label>
                        <input type="text" id="wm-text" placeholder="${I18N.t('watermark_text_hint')}" value="CONFIDENTIAL">
                    </div>
                    <div class="setting-group">
                        <label data-i18n="watermark_font_size">${I18N.t('watermark_font_size')}</label>
                        <input type="number" id="wm-size" value="48" min="12" max="120" style="width:70px">
                    </div>
                    <div class="setting-group">
                        <label data-i18n="watermark_opacity">${I18N.t('watermark_opacity')}</label>
                        <input type="range" id="wm-opacity" value="0.2" min="0.05" max="1" step="0.05">
                        <span id="wm-opacity-val">20%</span>
                    </div>
                    <div class="setting-group">
                        <label data-i18n="watermark_rotation">${I18N.t('watermark_rotation')}</label>
                        <input type="range" id="wm-rotation" value="45" min="0" max="90" step="5">
                        <span id="wm-rotation-val">45°</span>
                    </div>
                    <div class="setting-group">
                        <label data-i18n="watermark_color">${I18N.t('watermark_color')}</label>
                        <input type="color" id="wm-color" value="#000000">
                    </div>
                </div>
                <div class="pdf-preview-area">
                    <canvas id="wm-canvas" style="display:block;max-width:100%;margin:0 auto"></canvas>
                </div>
                <div id="wm-nav"></div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-block" onclick="App.toolRegistry['watermark'].preview()">Preview</button>
                    <button class="btn btn-primary btn-block" onclick="App.toolRegistry['watermark'].process()" data-i18n="btn_process">${I18N.t('btn_process')}</button>
                </div>
            </div>
        `;
        ['wm-opacity', 'wm-rotation'].forEach(id => {
            document.getElementById(id).addEventListener('input', function () {
                const span = document.getElementById(id + '-val');
                if (id === 'wm-opacity') span.textContent = Math.round(this.value * 100) + '%';
                else span.textContent = this.value + '°';
            });
        });
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        document.getElementById('watermark-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPage(1);
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.0 });
        const canvas = document.getElementById('wm-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        document.getElementById('wm-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['watermark'].renderPage(${num - 1})`,
            `App.toolRegistry['watermark'].renderPage(${num + 1})`
        );
    },

    preview() {
        const canvas = document.getElementById('wm-canvas');
        const ctx = canvas.getContext('2d');
        const text = document.getElementById('wm-text').value;
        const size = parseInt(document.getElementById('wm-size').value);
        const opacity = parseFloat(document.getElementById('wm-opacity').value);
        const rotation = parseInt(document.getElementById('wm-rotation').value);
        const color = document.getElementById('wm-color').value;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.font = `${size}px sans-serif`;

        const rad = (rotation * Math.PI) / 180;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        ctx.fillText(text, -ctx.measureText(text).width / 2, size / 3);
        ctx.restore();
    },

    async process() {
        App.toast(I18N.t('processing'), 'info');
        const text = document.getElementById('wm-text').value;
        const size = parseInt(document.getElementById('wm-size').value);
        const opacity = parseFloat(document.getElementById('wm-opacity').value);
        const rotation = parseInt(document.getElementById('wm-rotation').value);
        const color = document.getElementById('wm-color').value;
        const rgb = {
            r: parseInt(color.slice(1, 3), 16) / 255,
            g: parseInt(color.slice(3, 5), 16) / 255,
            b: parseInt(color.slice(5, 7), 16) / 255
        };

        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const pages = doc.getPages();

        for (const page of pages) {
            const pw = page.getWidth(), ph = page.getHeight();
            // Draw tiled watermarks
            const stepX = pw / 3, stepY = ph / 3;
            for (let x = -pw / 2; x < pw * 1.5; x += stepX) {
                for (let y = -ph / 2; y < ph * 1.5; y += stepY) {
                    page.drawText(text, {
                        x, y,
                        size: size * 0.75,
                        color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                        opacity,
                        rotate: PDFLib.degrees(rotation),
                    });
                }
            }
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'watermarked.pdf');
    }
});
