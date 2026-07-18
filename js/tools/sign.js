/* ========== Tool: Sign PDF (ilovepdf-style v4) ========== */

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
        this.beginPath();
        this.moveTo(x + r.tl, y); this.lineTo(x + w - r.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.lineTo(x + w, y + h - r.br);
        this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.lineTo(x + r.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x, y + r.tl);
        this.closePath();
    };
}

const PREVIEW_SCALE = 2.0;
const THUMB_SCALE = 0.30;

App.register('sign', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,
    fullName: '', initials: '',
    selectedStyle: 0, selectedColor: '#000000',
    signatureImage: null, initialsImage: null,
    setupDone: false,
    signatures: [],        // [{ id, page, x, y, w, h, imageData }]
    activeSigId: null,     // id of the signature currently being edited
    sigOverlayEl: null,
    dragState: null,
    nextSigId: 0,

    init(body) {
        this.reset();
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="sign_desc">${I18N.t('sign_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="sign-main" style="display:none">
                <div id="sign-setup-banner" class="sign-setup-banner">
                    <span data-i18n="sign_setup_prompt">${I18N.t('sign_setup_btn')}</span>
                    <button class="btn btn-primary" onclick="App.toolRegistry['sign'].openModal()" data-i18n="sign_setup_btn">${I18N.t('sign_setup_btn')}</button>
                </div>
                <div class="sign-layout">
                    <div class="sign-thumbnails" id="sign-thumbnails"></div>
                    <div class="sign-preview-area" id="sign-preview-area">
                        <canvas id="sign-pdf-canvas"></canvas>
                    </div>
                    <div class="sign-options" id="sign-options" style="display:none"></div>
                </div>
            </div>
        `;

        // Modal
        const modalWrap = document.createElement('div');
        modalWrap.id = 'sign-modal';
        modalWrap.className = 'modal-overlay';
        modalWrap.style.display = 'none';
        modalWrap.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 data-i18n="sign_setup_title">${I18N.t('sign_setup_title')}</h3>
                    <button class="modal-close" onclick="App.toolRegistry['sign'].closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group"><label data-i18n="sign_fullname">${I18N.t('sign_fullname')}</label><input type="text" id="sign-fullname" placeholder="${I18N.t('sign_fullname')}"></div>
                    <div class="form-group"><label data-i18n="sign_initials">${I18N.t('sign_initials')}</label><input type="text" id="sign-initials" placeholder="${I18N.t('sign_initials')}"></div>
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

        const self = this;

        // Modal tab/color events
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

        // Canvas click handler (commit signature / activate embedded)
        const canvas = document.getElementById('sign-pdf-canvas');
        canvas.addEventListener('click', (e) => this.onCanvasClick(e));

        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    reset() {
        this.file = null; this.pdfBytes = null; this.pdfDoc = null;
        this.currentPage = 1; this.totalPages = 0;
        this.fullName = ''; this.initials = '';
        this.selectedStyle = 0; this.selectedColor = '#000000';
        this.signatureImage = null; this.initialsImage = null;
        this.setupDone = false;
        this.signatures = []; this.activeSigId = null;
        this.sigOverlayEl = null; this.dragState = null;
        this.nextSigId = 0;
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

    // ===================== Modal =====================
    openModal() {
        document.getElementById('sign-fullname').value = this.fullName;
        document.getElementById('sign-initials').value = this.initials;
        document.querySelectorAll('.sign-color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === this.selectedColor));
        document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        this.renderStyleList('signature');
        document.getElementById('sign-modal').style.display = '';
    },
    closeModal() { document.getElementById('sign-modal').style.display = 'none'; },

    generateStyles(text, type) {
        if (!text) return [];
        const color = this.selectedColor;
        const defs = type === 'signature' ? [
            { font: 'italic 38px "Segoe Script","Comic Sans MS",cursive' },
            { font: '36px "Brush Script MT","Segoe Script",cursive' },
            { font: 'bold italic 34px "Georgia","Times New Roman",serif' },
            { font: '32px "Lucida Handwriting","Segoe Script",cursive' },
        ] : type === 'initials' ? [
            { font: 'bold 36px "Georgia",serif' },
            { font: 'italic 36px "Segoe Script",cursive' },
            { font: '32px "Courier New",monospace' },
            { font: 'bold 34px "Arial",sans-serif' },
        ] : [
            { font: 'bold 28px "Georgia",serif', border: true },
            { font: 'bold 26px "Arial",sans-serif', border: true },
            { font: 'bold 24px "Times New Roman",serif', border: true },
            { font: 'bold 30px "Impact",sans-serif', border: true },
        ];
        return defs.map(s => {
            const c = document.createElement('canvas');
            c.width = 280; c.height = 60;
            const ctx = c.getContext('2d');
            if (s.border) {
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.roundRect(20, 5, 240, 50, 6); ctx.stroke();
                ctx.strokeStyle = color; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(26, 11, 228, 38, 3); ctx.stroke();
            }
            ctx.fillStyle = color; ctx.font = s.font;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, c.width / 2, c.height / 2);
            return c.toDataURL('image/png');
        });
    },

    renderStyleList(type) {
        const list = document.getElementById('sign-style-list');
        const text = type === 'stamp' ? (this.fullName || 'Company') :
                     type === 'initials' ? (this.initials || '') : (this.fullName || '');
        if (!text) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem">Enter your name above</div>';
            return;
        }
        const urls = this.generateStyles(text, type);
        list.innerHTML = urls.map((url, i) => `
            <div class="sign-style-item${i === this.selectedStyle ? ' selected' : ''}" onclick="App.toolRegistry['sign'].selectStyle(${i})">
                <div class="sign-style-radio"></div>
                <div class="sign-style-preview"><img src="${url}" style="max-height:44px"></div>
            </div>
        `).join('');
    },
    selectStyle(index) {
        this.selectedStyle = index;
        document.querySelectorAll('.sign-style-item').forEach((el, i) => el.classList.toggle('selected', i === index));
    },

    applySetup() {
        const name = document.getElementById('sign-fullname').value.trim();
        const init = document.getElementById('sign-initials').value.trim();
        if (!name && !init) { App.toast('Enter full name or initials', 'error'); return; }
        this.fullName = name; this.initials = init; this.setupDone = true;
        if (name) { this.signatureImage = this.generateStyles(name, 'signature')[this.selectedStyle]; }
        if (init) { this.initialsImage = this.generateInitialsImg(init); }
        this.closeModal();
        this.renderSigningOptions();
        document.getElementById('sign-setup-banner').style.display = 'none';
        App.toast('Signature ready', 'success');
    },

    generateInitialsImg(text) {
        const c = document.createElement('canvas'); c.width = 120; c.height = 50;
        const ctx = c.getContext('2d');
        ctx.fillStyle = this.selectedColor; ctx.font = 'bold 30px "Georgia",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, c.width / 2, c.height / 2);
        return c.toDataURL('image/png');
    },

    // ===================== Right Panel =====================
    renderSigningOptions() {
        const panel = document.getElementById('sign-options');
        panel.style.display = 'flex';
        panel.innerHTML = `
            <h4 data-i18n="sign_type" style="margin:0">${I18N.t('sign_type')}</h4>
            <div class="sign-type-toggle">
                <button class="sign-type-opt active" id="st-simple" onclick="App.toolRegistry['sign'].setSignType('simple')"><span>&#9998;</span><span data-i18n="sign_simple">${I18N.t('sign_simple')}</span></button>
                <button class="sign-type-opt" id="st-digital" onclick="App.toolRegistry['sign'].setSignType('digital')"><span>&#128274;</span><span data-i18n="sign_digital">${I18N.t('sign_digital')}</span></button>
            </div>
            <h4 data-i18n="sign_required">${I18N.t('sign_required')}</h4>
            <div class="sign-field-group">
                <div class="sign-field-item">
                    <div class="field-display">${this.signatureImage ? `<img src="${this.signatureImage}" style="max-height:28px;vertical-align:middle">` : I18N.t('sign_field_signature')}</div>
                    <button class="field-edit" onclick="App.toolRegistry['sign'].openModal()" data-i18n="sign_edit">${I18N.t('sign_edit')}</button>
                </div>
            </div>
            <h4 data-i18n="sign_optional">${I18N.t('sign_optional')}</h4>
            <div class="sign-field-group">
                <div class="sign-opt-item"><span class="opt-icon">&#128100;</span><input id="sign-opt-name" placeholder="${I18N.t('sign_field_name')}" value="${this.fullName}"></div>
                <div class="sign-opt-item"><span class="opt-icon">&#128197;</span><input id="sign-opt-date" placeholder="${I18N.t('sign_field_date')}" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="sign-opt-item"><span class="opt-icon">&#9998;</span><input id="sign-opt-text" placeholder="${I18N.t('sign_field_text')}"></div>
            </div>
            <button class="sign-submit-btn" onclick="App.toolRegistry['sign'].addSignature()"><span>+ Place Signature</span></button>
            <button class="btn btn-primary btn-block" onclick="App.toolRegistry['sign'].finalizeSign()">Download Signed PDF</button>
        `;
    },

    setSignType(type) {
        this.signType = type;
        document.getElementById('st-simple').classList.toggle('active', type === 'simple');
        document.getElementById('st-digital').classList.toggle('active', type === 'digital');
    },

    // ===================== Thumbnails =====================
    async renderThumbnails() {
        const container = document.getElementById('sign-thumbnails');
        container.innerHTML = '';
        const self = this;
        for (let i = 1; i <= this.totalPages; i++) {
            const page = await this.pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: THUMB_SCALE });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            canvas.style.width = '100%'; canvas.style.display = 'block';
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

            const div = document.createElement('div');
            div.className = 'sign-thumb' + (i === this.currentPage ? ' active' : '');
            div.style.width = '90px';
            div.appendChild(canvas);
            const label = document.createElement('div');
            label.className = 'sign-thumb-label'; label.textContent = i;
            div.appendChild(label);
            div.addEventListener('click', () => {
                self.currentPage = i;
                self.renderPage(i);
                document.querySelectorAll('.sign-thumb').forEach((t, j) => t.classList.toggle('active', j + 1 === i));
            });
            container.appendChild(div);
        }
    },

    // ===================== Page Rendering =====================
    async renderPage(num) {
        this.currentPage = num;
        const page = await this.pdfDoc.getPage(num);
        const vp = page.getViewport({ scale: PREVIEW_SCALE });
        const canvas = document.getElementById('sign-pdf-canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');

        // Draw PDF
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Draw all committed signatures for this page (non-active, drawn inline)
        const committed = this.signatures.filter(s => s.page === num && s.id !== this.activeSigId);
        for (const sig of committed) {
            await this.drawSignatureOnCanvas(ctx, sig);
        }

        // Show overlay for active signature on this page
        this.renderSignatureOverlay();

        document.querySelectorAll('.sign-thumb').forEach((t, i) => t.classList.toggle('active', i + 1 === num));
    },

    async drawSignatureOnCanvas(ctx, sig) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, sig.x, sig.y, sig.w, sig.h);
                resolve();
            };
            img.onerror = resolve;
            img.src = sig.imageData;
        });
    },

    // ===================== Canvas Click (commit / activate) =====================
    onCanvasClick(e) {
        const canvas = document.getElementById('sign-pdf-canvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;

        // Check if click is within any committed signature on current page (reverse = topmost first)
        const committed = this.signatures.filter(s => s.page === this.currentPage && s.id !== this.activeSigId);
        for (let i = committed.length - 1; i >= 0; i--) {
            const sig = committed[i];
            if (cx >= sig.x && cx <= sig.x + sig.w && cy >= sig.y && cy <= sig.y + sig.h) {
                // Activate this signature, commit current active first
                this.commitActive();
                this.activeSigId = sig.id;
                this.renderPage(this.currentPage);
                return;
            }
        }

        // Clicked elsewhere → commit current active
        this.commitActive();
    },

    commitActive() {
        if (this.activeSigId === null) return;
        this.activeSigId = null;
        if (this.sigOverlayEl) { this.sigOverlayEl.remove(); this.sigOverlayEl = null; }
        this.renderPage(this.currentPage);
    },

    // ===================== Signature Overlay =====================
    renderSignatureOverlay() {
        if (this.sigOverlayEl) { this.sigOverlayEl.remove(); this.sigOverlayEl = null; }

        if (this.activeSigId === null) return;
        const sig = this.signatures.find(s => s.id === this.activeSigId);
        if (!sig || sig.page !== this.currentPage) return;

        const container = document.getElementById('sign-preview-area');
        const canvas = document.getElementById('sign-pdf-canvas');
        const displayW = canvas.clientWidth;
        const displayH = canvas.clientHeight;
        const scaleX = displayW / canvas.width;
        const scaleY = displayH / canvas.height;

        const left = sig.x * scaleX;
        const top = sig.y * scaleY;
        const width = sig.w * scaleX;
        const height = sig.h * scaleY;

        const overlay = document.createElement('div');
        overlay.className = 'sign-sig-overlay';
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

        const img = document.createElement('img');
        img.src = sig.imageData;
        img.draggable = false;
        overlay.appendChild(img);

        // Resize handles
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = 'sign-sig-resize ' + dir;
            handle.addEventListener('mousedown', (e) => this.onResizeStart(e, dir));
            overlay.appendChild(handle);
        });

        // Remove button
        const removeBtn = document.createElement('div');
        removeBtn.className = 'sign-sig-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        removeBtn.addEventListener('click', () => this.removeActiveSignature());
        overlay.appendChild(removeBtn);

        // Drag to move
        overlay.addEventListener('mousedown', (e) => this.onDragStart(e));

        container.appendChild(overlay);
        this.sigOverlayEl = overlay;
    },

    onDragStart(e) {
        if (e.target.classList.contains('sign-sig-resize') || e.target.classList.contains('sign-sig-remove')) return;
        e.preventDefault();
        const overlay = this.sigOverlayEl;
        this.dragState = {
            startX: e.clientX, startY: e.clientY,
            origLeft: parseFloat(overlay.style.left),
            origTop: parseFloat(overlay.style.top),
            origW: parseFloat(overlay.style.width),
            origH: parseFloat(overlay.style.height),
        };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState;
            const dx = ev.clientX - d.startX;
            const dy = ev.clientY - d.startY;
            overlay.style.left = (d.origLeft + dx) + 'px';
            overlay.style.top = (d.origTop + dy) + 'px';
            overlay.style.width = d.origW + 'px';
            overlay.style.height = d.origH + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            self.dragState = null;
            self.syncOverlayToSignature();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    onResizeStart(e, dir) {
        e.preventDefault(); e.stopPropagation();
        const overlay = this.sigOverlayEl;
        this.dragState = {
            startX: e.clientX, startY: e.clientY,
            origLeft: parseFloat(overlay.style.left),
            origTop: parseFloat(overlay.style.top),
            origW: parseFloat(overlay.style.width),
            origH: parseFloat(overlay.style.height),
            dir: dir,
        };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState;
            const dx = ev.clientX - d.startX;
            const dy = ev.clientY - d.startY;
            let left = d.origLeft, top = d.origTop, w = d.origW, h = d.origH;
            if (d.dir.includes('e')) w = Math.max(30, d.origW + dx);
            if (d.dir.includes('w')) { w = Math.max(30, d.origW - dx); left = d.origLeft + d.origW - w; }
            if (d.dir.includes('s')) h = Math.max(20, d.origH + dy);
            if (d.dir.includes('n')) { h = Math.max(20, d.origH - dy); top = d.origTop + d.origH - h; }
            overlay.style.left = left + 'px';
            overlay.style.top = top + 'px';
            overlay.style.width = w + 'px';
            overlay.style.height = h + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            self.dragState = null;
            self.syncOverlayToSignature();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    syncOverlayToSignature() {
        if (!this.sigOverlayEl || this.activeSigId === null) return;
        const sig = this.signatures.find(s => s.id === this.activeSigId);
        if (!sig) return;

        const canvas = document.getElementById('sign-pdf-canvas');
        const displayW = canvas.clientWidth;
        const displayH = canvas.clientHeight;
        const scaleX = canvas.width / displayW;
        const scaleY = canvas.height / displayH;

        const overlay = this.sigOverlayEl;
        sig.x = Math.max(0, parseFloat(overlay.style.left) * scaleX);
        sig.y = Math.max(0, parseFloat(overlay.style.top) * scaleY);
        sig.w = parseFloat(overlay.style.width) * scaleX;
        sig.h = parseFloat(overlay.style.height) * scaleY;
    },

    removeActiveSignature() {
        if (this.activeSigId === null) return;
        this.signatures = this.signatures.filter(s => s.id !== this.activeSigId);
        this.activeSigId = null;
        if (this.sigOverlayEl) { this.sigOverlayEl.remove(); this.sigOverlayEl = null; }
        this.renderPage(this.currentPage);
        App.toast('Signature removed');
    },

    // ===================== Add / Finalize =====================
    addSignature() {
        if (!this.signatureImage) { App.toast('Set signature first', 'error'); return; }

        // Commit current active first
        this.commitActive();

        const canvas = document.getElementById('sign-pdf-canvas');
        const dw = 180, dh = 48;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;

        const id = this.nextSigId++;
        this.signatures.push({
            id, page: this.currentPage,
            x: dx, y: dy, w: dw, h: dh,
            imageData: this.signatureImage,
        });
        this.activeSigId = id;
        this.renderPage(this.currentPage);
        App.toast('Drag to move, resize corners, click canvas to commit');
    },

    async finalizeSign() {
        this.commitActive();
        if (this.signatures.length === 0) {
            App.toast('Place at least one signature', 'error'); return;
        }
        App.toast(I18N.t('processing'), 'info');

        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const pages = doc.getPages();

            for (const sig of this.signatures) {
                if (sig.page < 1 || sig.page > pages.length) continue;
                const pdfLibPage = pages[sig.page - 1];

                // Get the pdf.js viewport for this page to compute coordinate ratios
                const pdfJsPage = await this.pdfDoc.getPage(sig.page);
                const vp = pdfJsPage.getViewport({ scale: PREVIEW_SCALE });

                // Direct ratio: canvas coords → PDF points
                const sX = pdfLibPage.getWidth() / vp.width;
                const sY = pdfLibPage.getHeight() / vp.height;
                const pdfX = sig.x * sX;
                const pdfY = pdfLibPage.getHeight() - (sig.y + sig.h) * sY;
                const pdfW = sig.w * sX;
                const pdfH = sig.h * sY;

                const resp = await fetch(sig.imageData);
                const imgBytes = await resp.arrayBuffer();
                const pngImg = await doc.embedPng(imgBytes);
                pdfLibPage.drawImage(pngImg, { x: pdfX, y: pdfY, width: pdfW, height: pdfH });
            }

            const out = await doc.save();
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'signed.pdf');
        } catch (e) {
            console.error('Sign error:', e);
            App.toast('Error signing PDF', 'error');
        }
    },
});
