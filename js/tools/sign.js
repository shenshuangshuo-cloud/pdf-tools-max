/* ========== Tool: Sign PDF (ilovepdf-style) ========== */

// Canvas roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
        this.beginPath();
        this.moveTo(x + r.tl, y);
        this.lineTo(x + w - r.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.lineTo(x + w, y + h - r.br);
        this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.lineTo(x + r.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
    };
}

App.register('sign', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,
    fullName: '', initials: '',
    selectedStyle: 0, selectedColor: '#000000',
    signatureImage: null, initialsImage: null,
    setupDone: false,
    signType: 'simple', // 'simple' | 'digital'
    placedSignature: null, // { page, x, y, w, h }

    init(body) {
        this.reset();
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="sign_desc">${I18N.t('sign_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="sign-main" style="display:none">
                <div id="sign-setup-banner" class="sign-setup-banner">
                    <span data-i18n="sign_setup_btn">${I18N.t('sign_setup_btn')}</span>
                    <button class="btn btn-primary" onclick="App.toolRegistry['sign'].openModal()" data-i18n="sign_setup_btn">${I18N.t('sign_setup_btn')}</button>
                </div>
                <div class="sign-layout">
                    <div class="sign-thumbnails" id="sign-thumbnails"></div>
                    <div class="sign-preview-area">
                        <canvas id="sign-pdf-canvas"></canvas>
                    </div>
                    <div class="sign-options" id="sign-options" style="display:none"></div>
                </div>
            </div>
        `;

        // Append modal to body
        const modalWrap = document.createElement('div');
        modalWrap.id = 'sign-modal';
        modalWrap.className = 'modal-overlay';
        modalWrap.style.display = 'none';
        modalWrap.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 data-i18n="sign_setup_title">${I18N.t('sign_setup_title')}</h3>
                    <button class="modal-close" onclick="App.toolRegistry['sign'].closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label data-i18n="sign_fullname">${I18N.t('sign_fullname')}</label>
                        <input type="text" id="sign-fullname" placeholder="${I18N.t('sign_fullname')}">
                    </div>
                    <div class="form-group">
                        <label data-i18n="sign_initials">${I18N.t('sign_initials')}</label>
                        <input type="text" id="sign-initials" placeholder="${I18N.t('sign_initials')}">
                    </div>
                    <div class="modal-tabs">
                        <button class="modal-tab active" data-tab="signature" data-i18n="sign_tab_signature">${I18N.t('sign_tab_signature')}</button>
                        <button class="modal-tab" data-tab="initials" data-i18n="sign_tab_initials">${I18N.t('sign_tab_initials')}</button>
                        <button class="modal-tab" data-tab="stamp" data-i18n="sign_tab_stamp">${I18N.t('sign_tab_stamp')}</button>
                    </div>
                    <div class="sign-style-list" id="sign-style-list"></div>
                    <div class="sign-color-picker">
                        <span data-i18n="sign_color">${I18N.t('sign_color')}</span>
                        <div class="sign-color-dot black active" data-color="#000000"></div>
                        <div class="sign-color-dot red" data-color="#DC2626"></div>
                        <div class="sign-color-dot blue" data-color="#2563EB"></div>
                        <div class="sign-color-dot green" data-color="#059669"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="App.toolRegistry['sign'].applySetup()" data-i18n="sign_apply">${I18N.t('sign_apply')}</button>
                </div>
            </div>
        `;
        body.appendChild(modalWrap);

        // Bind modal events
        const self = this;
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                self.renderStyleList(this.dataset.tab);
            });
        });
        document.querySelectorAll('.sign-color-dot').forEach(dot => {
            dot.addEventListener('click', function() {
                document.querySelectorAll('.sign-color-dot').forEach(d => d.classList.remove('active'));
                this.classList.add('active');
                self.selectedColor = this.dataset.color;
                self.renderStyleList(document.querySelector('.modal-tab.active').dataset.tab);
            });
        });
        document.getElementById('sign-fullname').addEventListener('input', function() {
            self.fullName = this.value;
            self.renderStyleList(document.querySelector('.modal-tab.active').dataset.tab);
        });
        document.getElementById('sign-initials').addEventListener('input', function() {
            self.initials = this.value;
            self.renderStyleList(document.querySelector('.modal-tab.active').dataset.tab);
        });

        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    reset() {
        this.file = null; this.pdfBytes = null; this.pdfDoc = null;
        this.currentPage = 1; this.totalPages = 0;
        this.fullName = ''; this.initials = '';
        this.selectedStyle = 0; this.selectedColor = '#000000';
        this.signatureImage = null; this.initialsImage = null;
        this.setupDone = false; this.placedSignature = null;
    },

    async loadFile(file) {
        if (!file || file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file; this.pdfBytes = await file.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
        this.totalPages = this.pdfDoc.numPages;
        document.getElementById('sign-main').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        this.renderThumbnails();
        this.renderPage(1);
    },

    // ========== Modal ==========
    openModal() {
        document.getElementById('sign-fullname').value = this.fullName;
        document.getElementById('sign-initials').value = this.initials;
        document.querySelectorAll('.sign-color-dot').forEach(d => {
            d.classList.toggle('active', d.dataset.color === this.selectedColor);
        });
        document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        this.renderStyleList('signature');
        document.getElementById('sign-modal').style.display = '';
    },

    closeModal() {
        document.getElementById('sign-modal').style.display = 'none';
    },

    // Generate 4 signature styles from name text
    generateStyles(text, type) {
        if (!text) return [];
        const color = this.selectedColor;

        const styleDefs = type === 'signature' ? [
            { font: 'italic 38px "Segoe Script","Comic Sans MS",cursive', desc: 'cursive' },
            { font: '36px "Brush Script MT","Segoe Script",cursive', desc: 'brush' },
            { font: 'bold italic 34px "Georgia","Times New Roman",serif', desc: 'serif' },
            { font: '32px "Lucida Handwriting","Segoe Script",cursive', desc: 'handwriting' },
        ] : type === 'initials' ? [
            { font: 'bold 36px "Georgia",serif', desc: 'serif' },
            { font: 'italic 36px "Segoe Script",cursive', desc: 'script' },
            { font: '32px "Courier New",monospace', desc: 'mono' },
            { font: 'bold 34px "Arial",sans-serif', desc: 'sans' },
        ] : [
            { font: 'bold 28px "Georgia",serif', desc: 'stamp1', border: true },
            { font: 'bold 26px "Arial",sans-serif', desc: 'stamp2', border: true },
            { font: 'bold 24px "Times New Roman",serif', desc: 'stamp3', border: true },
            { font: 'bold 30px "Impact",sans-serif', desc: 'stamp4', border: true },
        ];

        return styleDefs.map(s => {
            const canvas = document.createElement('canvas');
            canvas.width = 280; canvas.height = 60;
            const ctx = canvas.getContext('2d');

            if (s.border) {
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.roundRect(20, 5, 240, 50, 6); ctx.stroke();
                ctx.strokeStyle = color; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(26, 11, 228, 38, 3); ctx.stroke();
            }

            ctx.fillStyle = color;
            ctx.font = s.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
            return canvas.toDataURL('image/png');
        });
    },

    renderStyleList(type) {
        const list = document.getElementById('sign-style-list');
        const text = type === 'stamp' ? (this.fullName || 'Company') :
                     type === 'initials' ? (this.initials || '') :
                     (this.fullName || '');

        if (!text) {
            list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem">Enter your name above</div>`;
            return;
        }

        const dataUrls = this.generateStyles(text, type);

        list.innerHTML = dataUrls.map((url, i) => `
            <div class="sign-style-item${i === this.selectedStyle ? ' selected' : ''}" onclick="App.toolRegistry['sign'].selectStyle(${i}, '${type}')">
                <div class="sign-style-radio"></div>
                <div class="sign-style-preview">
                    <img src="${url}" alt="Style ${i+1}" style="max-height:44px">
                </div>
            </div>
        `).join('');
    },

    selectStyle(index) {
        this.selectedStyle = index;
        document.querySelectorAll('.sign-style-item').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    },

    applySetup() {
        const name = document.getElementById('sign-fullname').value.trim();
        const init = document.getElementById('sign-initials').value.trim();
        if (!name && !init) { App.toast('Enter full name or initials', 'error'); return; }

        this.fullName = name;
        this.initials = init;
        this.setupDone = true;

        // Generate final signature images
        if (name) {
            const styles = this.generateStyles(name, 'signature');
            this.signatureImage = styles[this.selectedStyle];
        }
        if (init) {
            this.initialsImage = this.generateInitialsImg(init);
        }

        this.closeModal();
        this.renderSigningOptions();
        document.getElementById('sign-setup-banner').style.display = 'none';
        App.toast('Signature ready', 'success');
    },

    generateInitialsImg(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 120; canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = this.selectedColor;
        ctx.font = 'bold 30px "Georgia",serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return canvas.toDataURL('image/png');
    },

    // ========== Signing Options Panel ==========
    renderSigningOptions() {
        const panel = document.getElementById('sign-options');
        panel.style.display = 'flex';

        panel.innerHTML = `
            <h4 data-i18n="sign_type" style="margin:0">${I18N.t('sign_type')}</h4>
            <div class="sign-type-toggle">
                <button class="sign-type-opt active" id="sign-type-simple" onclick="App.toolRegistry['sign'].setSignType('simple')">
                    <span>&#9998;</span><span data-i18n="sign_simple">${I18N.t('sign_simple')}</span>
                </button>
                <button class="sign-type-opt" id="sign-type-digital" onclick="App.toolRegistry['sign'].setSignType('digital')">
                    <span>&#128274;</span><span data-i18n="sign_digital">${I18N.t('sign_digital')}</span>
                </button>
            </div>

            <h4 data-i18n="sign_required">${I18N.t('sign_required')}</h4>
            <div class="sign-field-group">
                <div class="sign-field-item">
                    <div class="field-display">
                        ${this.signatureImage ? `<img src="${this.signatureImage}" style="max-height:28px;vertical-align:middle">` : I18N.t('sign_field_signature')}
                    </div>
                    <button class="field-edit" onclick="App.toolRegistry['sign'].openModal()" data-i18n="sign_edit">${I18N.t('sign_edit')}</button>
                </div>
            </div>

            <h4 data-i18n="sign_optional">${I18N.t('sign_optional')}</h4>
            <div class="sign-field-group">
                <div class="sign-opt-item">
                    <span class="opt-icon">&#128100;</span>
                    <input type="text" id="sign-opt-name" placeholder="${I18N.t('sign_field_name')}" value="${this.fullName}">
                </div>
                <div class="sign-opt-item">
                    <span class="opt-icon">&#128197;</span>
                    <input type="text" id="sign-opt-date" placeholder="${I18N.t('sign_field_date')}" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="sign-opt-item">
                    <span class="opt-icon">&#9998;</span>
                    <input type="text" id="sign-opt-text" placeholder="${I18N.t('sign_field_text')}">
                </div>
            </div>

            <button class="sign-submit-btn" onclick="App.toolRegistry['sign'].onSignClick()">
                <span data-i18n="sign_btn">${I18N.t('sign_btn')}</span> &rarr;
            </button>
        `;
    },

    setSignType(type) {
        this.signType = type;
        document.getElementById('sign-type-simple').classList.toggle('active', type === 'simple');
        document.getElementById('sign-type-digital').classList.toggle('active', type === 'digital');
    },

    onSignClick() {
        if (this.placedSignature) {
            this.finalizeSign();
        } else {
            this.selectPlacement();
            // Update button text
            const btns = document.querySelectorAll('.sign-submit-btn');
            btns.forEach(b => { b.textContent = 'Download Signed PDF →'; });
        }
    },

    // ========== Thumbnails ==========
    async renderThumbnails() {
        const container = document.getElementById('sign-thumbnails');
        container.innerHTML = '';
        for (let i = 1; i <= this.totalPages; i++) {
            const page = await this.pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 0.18 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

            const div = document.createElement('div');
            div.className = 'sign-thumb' + (i === this.currentPage ? ' active' : '');
            div.appendChild(canvas);
            div.innerHTML += `<div class="sign-thumb-label">${i}</div>`;
            div.addEventListener('click', () => {
                this.currentPage = i;
                this.renderPage(i);
                document.querySelectorAll('.sign-thumb').forEach((t, j) => t.classList.toggle('active', j + 1 === i));
            });
            container.appendChild(div);
        }
    },

    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: 1.1 });
        const canvas = document.getElementById('sign-pdf-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Draw placed signature
        if (this.placedSignature && this.placedSignature.page === num && this.signatureImage) {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = this.signatureImage; });
            const s = this.placedSignature;
            ctx.drawImage(img, s.x, s.y, s.w, s.h);
        }

        document.querySelectorAll('.sign-thumb').forEach((t, i) => t.classList.toggle('active', i + 1 === num));
    },

    // ========== Place Signature ==========
    selectPlacement() {
        if (!this.signatureImage) { App.toast('Set signature first', 'error'); return; }
        App.toast('Click where you want the signature on this page', 'info');

        const canvas = document.getElementById('sign-pdf-canvas');
        const self = this;
        const handler = function(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * scaleX;
            const cy = (e.clientY - rect.top) * scaleY;
            const sw = 180, sh = 48;

            self.placedSignature = {
                page: self.currentPage,
                x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh
            };
            canvas.removeEventListener('click', handler);
            self.renderPage(self.currentPage);
            App.toast('Signature placed. Click Sign to download.', 'success');

            // Update Sign button
            const btn = document.querySelector('.sign-submit-btn');
            if (btn) btn.textContent = 'Download Signed PDF →';
        };
        canvas.addEventListener('click', handler);
    },

    // ========== Finalize & Download ==========
    async finalizeSign() {
        if (!this.placedSignature || !this.signatureImage) {
            App.toast('Place signature on PDF first', 'error'); return;
        }
        App.toast(I18N.t('processing'), 'info');

        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const page = doc.getPages()[this.placedSignature.page - 1];

            // Convert canvas coordinates to PDF coordinates
            const pdfPage = await this.pdfDoc.getPage(this.placedSignature.page);
            const vp = pdfPage.getViewport({ scale: 1.1 });
            const pdfW = vp.width / 1.1;
            const pdfH = vp.height / 1.1;
            const scaleToPdfX = page.getWidth() / pdfW;
            const scaleToPdfY = page.getHeight() / pdfH;

            // Embed signature
            const resp = await fetch(this.signatureImage);
            const imgBytes = await resp.arrayBuffer();
            const pngImg = await doc.embedPng(imgBytes);

            const pdfX = this.placedSignature.x * scaleToPdfX;
            const pdfY = page.getHeight() - (this.placedSignature.y + this.placedSignature.h) * scaleToPdfY;
            const pdfW2 = this.placedSignature.w * scaleToPdfX;
            const pdfH2 = this.placedSignature.h * scaleToPdfY;

            page.drawImage(pngImg, { x: pdfX, y: pdfY, width: pdfW2, height: pdfH2 });

            // Optional: name text below
            const optName = document.getElementById('sign-opt-name')?.value?.trim();
            if (optName) {
                page.drawText(optName, { x: pdfX, y: pdfY - 16, size: 9, color: PDFLib.rgb(0, 0, 0) });
            }

            const out = await doc.save();
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'signed.pdf');
        } catch (e) {
            console.error(e);
            App.toast(I18N.t('toast_error'), 'error');
        }
    }
});
