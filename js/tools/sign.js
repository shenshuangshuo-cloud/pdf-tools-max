/* ========== Tool: Sign PDF (v5 - Draw + Upload) ========== */

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
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
    };
}

const PREVIEW_SCALE = 2.0;
const THUMB_SCALE = 0.30;

App.register('sign', {
    file: null, pdfBytes: null, pdfDoc: null,
    currentPage: 1, totalPages: 0,
    fullName: '',
    selectedStyle: 0, selectedColor: '#000000',
    signatureImage: null,      // current signature (any source)
    setupDone: false,
    signatures: [],
    activeSigId: null,
    sigOverlayEl: null,
    dragState: null,
    nextSigId: 0,

    // Draw state
    drawCanvas: null, drawCtx: null, isDrawing: false,

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
                    <div class="form-group" id="sign-name-group">
                        <label data-i18n="sign_fullname">${I18N.t('sign_fullname')}</label>
                        <input type="text" id="sign-fullname" placeholder="${I18N.t('sign_fullname')}">
                    </div>
                    <div class="modal-tabs">
                        <button class="modal-tab active" data-tab="signature" data-i18n="sign_tab_signature">${I18N.t('sign_tab_signature')}</button>
                        <button class="modal-tab" data-tab="draw" data-i18n="sign_tab_draw">${I18N.t('sign_tab_draw')}</button>
                        <button class="modal-tab" data-tab="upload" data-i18n="sign_tab_upload">${I18N.t('sign_tab_upload')}</button>
                    </div>
                    <!-- Signature tab: style list + color -->
                    <div id="sign-tab-signature" class="sign-tab-content">
                        <div class="sign-style-list" id="sign-style-list"></div>
                        <div class="sign-color-picker">
                            <span data-i18n="sign_color">${I18N.t('sign_color')}</span>
                            <div class="sign-color-dot black active" data-color="#000000"></div>
                            <div class="sign-color-dot red" data-color="#DC2626"></div>
                            <div class="sign-color-dot blue" data-color="#2563EB"></div>
                            <div class="sign-color-dot green" data-color="#059669"></div>
                        </div>
                    </div>
                    <!-- Draw tab -->
                    <div id="sign-tab-draw" class="sign-tab-content" style="display:none">
                        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 10px" data-i18n="sign_draw_hint">${I18N.t('sign_draw_hint')}</p>
                        <div style="position:relative;width:100%;height:160px;background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden">
                            <canvas id="sign-draw-canvas" style="width:100%;height:100%;cursor:crosshair"></canvas>
                        </div>
                        <button class="btn btn-sm" style="margin-top:10px" onclick="App.toolRegistry['sign'].clearDraw()" data-i18n="sign_clear">${I18N.t('sign_clear')}</button>
                    </div>
                    <!-- Upload tab -->
                    <div id="sign-tab-upload" class="sign-tab-content" style="display:none">
                        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 10px" data-i18n="sign_upload_hint">${I18N.t('sign_upload_hint')}</p>
                        <div id="sign-upload-drop" style="width:100%;height:140px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s">
                            <span style="color:var(--text-muted);font-size:0.9rem">Click or drag image here</span>
                        </div>
                        <div id="sign-upload-preview" style="display:none;margin-top:10px;text-align:center">
                            <img id="sign-upload-img" style="max-width:100%;max-height:180px;border-radius:4px;background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 50%/16px 16px">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="App.toolRegistry['sign'].applySetup()" data-i18n="sign_apply">${I18N.t('sign_apply')}</button>
                </div>
            </div>
        `;
        body.appendChild(modalWrap);

        const self = this;

        // Tab switching
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabName = this.dataset.tab;
                document.querySelectorAll('.sign-tab-content').forEach(el => el.style.display = 'none');
                document.getElementById('sign-tab-' + tabName).style.display = '';
                document.getElementById('sign-name-group').style.display = tabName === 'signature' ? '' : 'none';
                if (tabName === 'signature') self.renderStyleList('signature');
                if (tabName === 'draw') self.initDrawCanvas();
            });
        });

        // Color dots
        document.querySelectorAll('.sign-color-dot').forEach(dot => {
            dot.addEventListener('click', function() {
                document.querySelectorAll('.sign-color-dot').forEach(d => d.classList.remove('active'));
                this.classList.add('active');
                self.selectedColor = this.dataset.color;
                self.renderStyleList('signature');
            });
        });

        document.getElementById('sign-fullname').addEventListener('input', function() {
            self.fullName = this.value;
            self.renderStyleList('signature');
        });

        // Upload drop
        const uploadDrop = document.getElementById('sign-upload-drop');
        uploadDrop.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = () => { if (inp.files[0]) self.handleUpload(inp.files[0]); };
            inp.click();
        });
        uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); uploadDrop.style.borderColor = 'var(--primary)'; });
        uploadDrop.addEventListener('dragleave', () => { uploadDrop.style.borderColor = 'var(--border)'; });
        uploadDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDrop.style.borderColor = 'var(--border)';
            if (e.dataTransfer.files[0]) self.handleUpload(e.dataTransfer.files[0]);
        });

        // Canvas click
        const canvas = document.getElementById('sign-pdf-canvas');
        canvas.addEventListener('click', (e) => this.onCanvasClick(e));

        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    reset() {
        this.file = null; this.pdfBytes = null; this.pdfDoc = null;
        this.currentPage = 1; this.totalPages = 0;
        this.fullName = ''; this.selectedStyle = 0; this.selectedColor = '#000000';
        this.signatureImage = null; this.setupDone = false;
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
        document.querySelectorAll('.sign-color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === this.selectedColor));
        document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        document.querySelectorAll('.sign-tab-content').forEach(el => el.style.display = 'none');
        document.getElementById('sign-tab-signature').style.display = '';
        document.getElementById('sign-name-group').style.display = '';
        document.getElementById('sign-upload-preview').style.display = 'none';
        document.getElementById('sign-upload-drop').style.display = '';
        this.renderStyleList('signature');
        document.getElementById('sign-modal').style.display = '';
    },
    closeModal() { document.getElementById('sign-modal').style.display = 'none'; },

    // ===================== Signature Tab (text-based) =====================
    generateStyles(text) {
        if (!text) return [];
        const color = this.selectedColor;
        const defs = [
            { font: 'italic 38px "Segoe Script","Comic Sans MS",cursive' },
            { font: '36px "Brush Script MT","Segoe Script",cursive' },
            { font: 'bold italic 34px "Georgia","Times New Roman",serif' },
            { font: '32px "Lucida Handwriting","Segoe Script",cursive' },
        ];
        return defs.map(s => {
            const c = document.createElement('canvas');
            c.width = 280; c.height = 60;
            const ctx = c.getContext('2d');
            ctx.fillStyle = color; ctx.font = s.font;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, c.width / 2, c.height / 2);
            return c.toDataURL('image/png');
        });
    },

    renderStyleList(type) {
        const list = document.getElementById('sign-style-list');
        const text = this.fullName || '';
        if (!text) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem">Enter your name above</div>';
            return;
        }
        const urls = this.generateStyles(text);
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

    // ===================== Draw Tab =====================
    initDrawCanvas() {
        const canvas = document.getElementById('sign-draw-canvas');
        if (!canvas || this.drawCanvas === canvas) return;
        this.drawCanvas = canvas;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = 160 * 2;
        this.drawCtx = canvas.getContext('2d');
        this.drawCtx.strokeStyle = '#000';
        this.drawCtx.lineWidth = 4;
        this.drawCtx.lineCap = 'round';
        this.drawCtx.lineJoin = 'round';
        this.clearDraw();

        const self = this;
        const getPos = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
        };

        canvas.onmousedown = (e) => {
            self.isDrawing = true;
            const p = getPos(e);
            self.drawCtx.beginPath();
            self.drawCtx.moveTo(p.x, p.y);
        };
        canvas.onmousemove = (e) => {
            if (!self.isDrawing) return;
            const p = getPos(e);
            self.drawCtx.lineTo(p.x, p.y);
            self.drawCtx.stroke();
        };
        canvas.onmouseup = () => { self.isDrawing = false; };
        canvas.onmouseleave = () => { self.isDrawing = false; };

        // Touch
        canvas.ontouchstart = (e) => {
            e.preventDefault();
            self.isDrawing = true;
            const p = getPos(e.touches[0]);
            self.drawCtx.beginPath();
            self.drawCtx.moveTo(p.x, p.y);
        };
        canvas.ontouchmove = (e) => {
            e.preventDefault();
            if (!self.isDrawing) return;
            const p = getPos(e.touches[0]);
            self.drawCtx.lineTo(p.x, p.y);
            self.drawCtx.stroke();
        };
        canvas.ontouchend = () => { self.isDrawing = false; };
    },

    clearDraw() {
        if (!this.drawCtx) return;
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    },

    // ===================== Upload Tab =====================
    handleUpload(file) {
        if (!file.type.startsWith('image/')) { App.toast('Please upload an image', 'error'); return; }
        const reader = new FileReader();
        const self = this;
        reader.onload = function() {
            const img = new Image();
            img.onload = function() {
                // Process: remove background (make near-white transparent)
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, c.width, c.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    // Invert brightness: dark pixels stay, light pixels become transparent
                    const brightness = (r + g + b) / 3;
                    const alpha = 255 - Math.min(255, Math.max(0, brightness));
                    data[i + 3] = alpha;
                    // Set RGB to black for signature look
                    if (alpha > 50) {
                        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                    }
                }
                ctx.putImageData(imageData, 0, 0);

                self.signatureImage = c.toDataURL('image/png');
                document.getElementById('sign-upload-img').src = self.signatureImage;
                document.getElementById('sign-upload-preview').style.display = '';
                document.getElementById('sign-upload-drop').style.display = 'none';
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    },

    // ===================== Apply Setup =====================
    applySetup() {
        const activeTab = document.querySelector('.modal-tab.active').dataset.tab;
        if (activeTab === 'signature') {
            const name = document.getElementById('sign-fullname').value.trim();
            if (!name) { App.toast('Enter your full name', 'error'); return; }
            this.fullName = name;
            this.signatureImage = this.generateStyles(name)[this.selectedStyle];
        } else if (activeTab === 'draw') {
            if (!this.drawCanvas) { App.toast('Draw your signature first', 'error'); return; }
            this.signatureImage = this.drawCanvas.toDataURL('image/png');
        } else if (activeTab === 'upload') {
            if (!this.signatureImage) { App.toast('Upload an image first', 'error'); return; }
        }

        this.setupDone = true;
        this.closeModal();
        this.renderSigningOptions();
        document.getElementById('sign-setup-banner').style.display = 'none';
        App.toast('Signature ready', 'success');
    },

    // ===================== Right Panel =====================
    renderSigningOptions() {
        const panel = document.getElementById('sign-options');
        panel.style.display = 'flex';
        panel.innerHTML = `
            <h4 style="margin:0;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">${I18N.t('sign_type')}</h4>
            <div class="sign-type-toggle">
                <button class="sign-type-opt active" onclick="App.toolRegistry['sign'].setSignType('simple')"><span>&#9998;</span><span data-i18n="sign_simple">${I18N.t('sign_simple')}</span></button>
                <button class="sign-type-opt" onclick="App.toolRegistry['sign'].setSignType('digital')"><span>&#128274;</span><span data-i18n="sign_digital">${I18N.t('sign_digital')}</span></button>
            </div>
            <h4 style="margin:0;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">${I18N.t('sign_required')}</h4>
            <div class="sign-field-group">
                <div class="sign-field-item">
                    <div class="field-display">${this.signatureImage ? `<img src="${this.signatureImage}" style="max-height:28px;vertical-align:middle">` : I18N.t('sign_field_signature')}</div>
                    <button class="field-edit" onclick="App.toolRegistry['sign'].openModal()" data-i18n="sign_edit">${I18N.t('sign_edit')}</button>
                </div>
            </div>
            <h4 style="margin:0;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">${I18N.t('sign_optional')}</h4>
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
        document.querySelectorAll('.sign-type-opt').forEach((b, i) => b.classList.toggle('active', i === 0 ? type === 'simple' : type === 'digital'));
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
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const committed = this.signatures.filter(s => s.page === num && s.id !== this.activeSigId);
        for (const sig of committed) await this.drawSignatureOnCanvas(ctx, sig);
        this.renderSignatureOverlay();
        document.querySelectorAll('.sign-thumb').forEach((t, i) => t.classList.toggle('active', i + 1 === num));
    },

    async drawSignatureOnCanvas(ctx, sig) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, sig.x, sig.y, sig.w, sig.h); resolve(); };
            img.onerror = resolve;
            img.src = sig.imageData;
        });
    },

    // ===================== Canvas Click =====================
    onCanvasClick(e) {
        const canvas = document.getElementById('sign-pdf-canvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const committed = this.signatures.filter(s => s.page === this.currentPage && s.id !== this.activeSigId);
        for (let i = committed.length - 1; i >= 0; i--) {
            const sig = committed[i];
            if (cx >= sig.x && cx <= sig.x + sig.w && cy >= sig.y && cy <= sig.y + sig.h) {
                this.commitActive();
                this.activeSigId = sig.id;
                this.renderPage(this.currentPage);
                return;
            }
        }
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

        const canvas = document.getElementById('sign-pdf-canvas');
        const displayW = canvas.clientWidth, displayH = canvas.clientHeight;
        const scaleX = displayW / canvas.width, scaleY = displayH / canvas.height;

        const overlay = document.createElement('div');
        overlay.className = 'sign-sig-overlay';
        overlay.style.left = (sig.x * scaleX) + 'px';
        overlay.style.top = (sig.y * scaleY) + 'px';
        overlay.style.width = (sig.w * scaleX) + 'px';
        overlay.style.height = (sig.h * scaleY) + 'px';

        const img = document.createElement('img');
        img.src = sig.imageData; img.draggable = false;
        overlay.appendChild(img);

        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const h = document.createElement('div');
            h.className = 'sign-sig-resize ' + dir;
            h.addEventListener('mousedown', (e) => this.onResizeStart(e, dir));
            overlay.appendChild(h);
        });

        const rm = document.createElement('div');
        rm.className = 'sign-sig-remove'; rm.textContent = '×';
        rm.addEventListener('mousedown', (e) => e.stopPropagation());
        rm.addEventListener('click', () => this.removeActiveSignature());
        overlay.appendChild(rm);

        overlay.addEventListener('mousedown', (e) => this.onDragStart(e));
        document.getElementById('sign-preview-area').appendChild(overlay);
        this.sigOverlayEl = overlay;
    },

    onDragStart(e) {
        if (e.target.classList.contains('sign-sig-resize') || e.target.classList.contains('sign-sig-remove')) return;
        e.preventDefault();
        const overlay = this.sigOverlayEl;
        this.dragState = {
            startX: e.clientX, startY: e.clientY,
            origLeft: parseFloat(overlay.style.left), origTop: parseFloat(overlay.style.top),
            origW: parseFloat(overlay.style.width), origH: parseFloat(overlay.style.height),
        };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState;
            overlay.style.left = (d.origLeft + ev.clientX - d.startX) + 'px';
            overlay.style.top = (d.origTop + ev.clientY - d.startY) + 'px';
            overlay.style.width = d.origW + 'px';
            overlay.style.height = d.origH + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); self.dragState = null; self.syncOverlayToSignature(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    onResizeStart(e, dir) {
        e.preventDefault(); e.stopPropagation();
        const overlay = this.sigOverlayEl;
        this.dragState = {
            startX: e.clientX, startY: e.clientY,
            origLeft: parseFloat(overlay.style.left), origTop: parseFloat(overlay.style.top),
            origW: parseFloat(overlay.style.width), origH: parseFloat(overlay.style.height),
            dir,
        };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState;
            const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
            let l = d.origLeft, t = d.origTop, w = d.origW, h = d.origH;
            if (d.dir.includes('e')) w = Math.max(30, d.origW + dx);
            if (d.dir.includes('w')) { w = Math.max(30, d.origW - dx); l = d.origLeft + d.origW - w; }
            if (d.dir.includes('s')) h = Math.max(20, d.origH + dy);
            if (d.dir.includes('n')) { h = Math.max(20, d.origH - dy); t = d.origTop + d.origH - h; }
            overlay.style.left = l + 'px'; overlay.style.top = t + 'px';
            overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); self.dragState = null; self.syncOverlayToSignature(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    syncOverlayToSignature() {
        if (!this.sigOverlayEl || this.activeSigId === null) return;
        const sig = this.signatures.find(s => s.id === this.activeSigId);
        if (!sig) return;
        const canvas = document.getElementById('sign-pdf-canvas');
        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const o = this.sigOverlayEl;
        sig.x = Math.max(0, parseFloat(o.style.left) * scaleX);
        sig.y = Math.max(0, parseFloat(o.style.top) * scaleY);
        sig.w = parseFloat(o.style.width) * scaleX;
        sig.h = parseFloat(o.style.height) * scaleY;
    },

    removeActiveSignature() {
        if (this.activeSigId === null) return;
        this.signatures = this.signatures.filter(s => s.id !== this.activeSigId);
        this.activeSigId = null;
        if (this.sigOverlayEl) { this.sigOverlayEl.remove(); this.sigOverlayEl = null; }
        this.renderPage(this.currentPage);
    },

    addSignature() {
        if (!this.signatureImage) { App.toast('Set signature first', 'error'); return; }
        this.commitActive();
        const canvas = document.getElementById('sign-pdf-canvas');
        const dw = 180, dh = 48;
        const id = this.nextSigId++;
        this.signatures.push({ id, page: this.currentPage, x: (canvas.width - dw) / 2, y: (canvas.height - dh) / 2, w: dw, h: dh, imageData: this.signatureImage });
        this.activeSigId = id;
        this.renderPage(this.currentPage);
        App.toast('Drag to move, resize corners, click canvas to commit');
    },

    async finalizeSign() {
        this.commitActive();
        if (this.signatures.length === 0) { App.toast('Place at least one signature', 'error'); return; }
        App.toast(I18N.t('processing'), 'info');
        try {
            const doc = await PDFLib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const pages = doc.getPages();
            for (const sig of this.signatures) {
                if (sig.page < 1 || sig.page > pages.length) continue;
                const pdfLibPage = pages[sig.page - 1];
                const pdfJsPage = await this.pdfDoc.getPage(sig.page);
                const vp = pdfJsPage.getViewport({ scale: PREVIEW_SCALE });
                const sX = pdfLibPage.getWidth() / vp.width;
                const sY = pdfLibPage.getHeight() / vp.height;
                const resp = await fetch(sig.imageData);
                const imgBytes = await resp.arrayBuffer();
                const pngImg = await doc.embedPng(imgBytes);
                pdfLibPage.drawImage(pngImg, {
                    x: sig.x * sX,
                    y: pdfLibPage.getHeight() - (sig.y + sig.h) * sY,
                    width: sig.w * sX,
                    height: sig.h * sY,
                });
            }
            const out = await doc.save();
            App.downloadBlob(new Blob([out], { type: 'application/pdf' }), 'signed.pdf');
        } catch (e) {
            console.error('Sign error:', e);
            App.toast('Error signing PDF', 'error');
        }
    },
});
