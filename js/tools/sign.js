/* ========== Tool: Sign PDF ========== */
App.register('sign', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,
    signatureImg: null, signatures: [], placeMode: false,

    init(body) {
        this.file = null; this.signatureImg = null; this.signatures = [];
        this.placeMode = false;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="sign_desc">${I18N.t('sign_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="sign-content" style="display:none">
                <div class="sign-panel">
                    <div class="sign-tools">
                        <div class="sign-canvas-wrap">
                            <canvas id="sign-canvas" width="260" height="100"></canvas>
                            <div id="sign-status" class="sign-status empty" data-i18n="sign_status_empty">${I18N.t('sign_status_empty')}</div>
                        </div>
                        <button class="btn btn-secondary btn-block" onclick="App.toolRegistry['sign'].clearSign()" data-i18n="btn_clear">${I18N.t('btn_clear')}</button>
                        <button class="btn btn-secondary btn-block" id="sign-upload-btn">
                            <input type="file" id="sign-img-input" accept="image/*" style="display:none" onchange="App.toolRegistry['sign'].uploadSign(event)">
                            <span onclick="document.getElementById('sign-img-input').click()" data-i18n="sign_upload_img">${I18N.t('sign_upload_img')}</span>
                        </button>
                        <button class="btn btn-primary btn-block" id="sign-place-btn" style="display:none" onclick="App.toolRegistry['sign'].startPlaceMode()" data-i18n="sign_place">${I18N.t('sign_place')}</button>
                    </div>
                    <div>
                        <div class="pdf-preview-area" id="sign-preview">
                            <canvas id="sign-pdf-canvas" style="display:block;max-width:100%;margin:0 auto;cursor:crosshair"></canvas>
                        </div>
                        <div id="sign-nav"></div>
                    </div>
                </div>
                <div class="btn-group" style="justify-content:center">
                    <button class="btn btn-download visible" id="sign-dl" style="display:none" onclick="App.toolRegistry['sign'].download()" data-i18n="btn_download">${I18N.t('btn_download')}</button>
                </div>
            </div>
        `;
        this.initSignCanvas();
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    initSignCanvas() {
        const canvas = document.getElementById('sign-canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        let drawing = false;
        canvas.addEventListener('mousedown', e => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
        canvas.addEventListener('mousemove', e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
        canvas.addEventListener('mouseup', () => { drawing = false; this.updateSignStatus(); });
        canvas.addEventListener('mouseleave', () => { drawing = false; this.updateSignStatus(); });

        // Touch support
        canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); });
        canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); });
        canvas.addEventListener('touchend', () => { drawing = false; this.updateSignStatus(); });
    },

    updateSignStatus() {
        const canvas = document.getElementById('sign-canvas');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const hasContent = Array.from(data).some((v, i) => i % 4 === 3 && v > 0);
        const status = document.getElementById('sign-status');
        if (hasContent) {
            status.className = 'sign-status ready';
            status.textContent = I18N.t('sign_status_ready');
        }
        this.signatureImg = hasContent ? canvas.toDataURL('image/png') : null;
        document.getElementById('sign-place-btn').style.display = this.signatureImg ? '' : 'none';
    },

    clearSign() {
        const canvas = document.getElementById('sign-canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.signatureImg = null;
        const status = document.getElementById('sign-status');
        status.className = 'sign-status empty';
        status.textContent = I18N.t('sign_status_empty');
        document.getElementById('sign-place-btn').style.display = 'none';
    },

    uploadSign(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.getElementById('sign-canvas');
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
                const w = img.width * scale, h = img.height * scale;
                ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                this.signatureImg = canvas.toDataURL('image/png');
                const status = document.getElementById('sign-status');
                status.className = 'sign-status ready';
                status.textContent = I18N.t('sign_status_uploaded');
                document.getElementById('sign-place-btn').style.display = '';
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    },

    async loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        document.getElementById('sign-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        await this.renderPage(1);
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.2 });
        const canvas = document.getElementById('sign-pdf-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Draw placed signatures
        for (const sig of this.signatures) {
            if (sig.page === num) {
                const img = new Image();
                img.src = sig.dataUrl;
                ctx.drawImage(img, sig.x, sig.y, sig.w, sig.h);
            }
        }

        document.getElementById('sign-nav').innerHTML = App.renderPageNav(
            num, this.totalPages,
            `App.toolRegistry['sign'].renderPage(${num - 1})`,
            `App.toolRegistry['sign'].renderPage(${num + 1})`
        );
    },

    startPlaceMode() {
        if (!this.signatureImg) { App.toast(I18N.t('sign_need'), 'error'); return; }
        this.placeMode = true;
        App.toast(I18N.t('sign_place_hint'), 'info');
        const canvas = document.getElementById('sign-pdf-canvas');
        const handler = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const w = 120, h = 40;
            this.signatures.push({ page: this.currentPage, x: x - w / 2, y: y - h / 2, w, h, dataUrl: this.signatureImg });
            canvas.removeEventListener('click', handler);
            this.placeMode = false;
            this.renderPage(this.currentPage);
            document.getElementById('sign-dl').style.display = '';
            App.toast(I18N.t('sign_placed'), 'success');
        };
        canvas.addEventListener('click', handler);
    },

    async download() {
        App.toast(I18N.t('processing'), 'info');
        const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const pages = doc.getPages();

        for (const sig of this.signatures) {
            const page = pages[sig.page - 1];
            const ph = page.getHeight();
            // Convert canvas coords to PDF coords
            const pdfPage = await this.pdfDoc.getPage(sig.page);
            const vp = pdfPage.getViewport({ scale: 1.2 });
            const pdfW = vp.width / 1.2;
            const pdfH = vp.height / 1.2;
            const scaleX = page.getWidth() / pdfW;
            const scaleY = ph / pdfH;

            const pdfX = sig.x * scaleX;
            const pdfY = ph - (sig.y + sig.h) * scaleY;

            const imgBytes = await (await fetch(sig.dataUrl)).arrayBuffer();
            const pngImg = await doc.embedPng(imgBytes);
            page.drawImage(pngImg, {
                x: pdfX, y: pdfY,
                width: sig.w * scaleX,
                height: sig.h * scaleY,
            });
        }

        const out = await doc.save();
        App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'signed.pdf');
    }
});
