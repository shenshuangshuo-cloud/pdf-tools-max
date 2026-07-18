/* ========== Tool: Sign PDF (v7 – Preserve Color + Crop Resize + Calligraphy Fonts) ========== */

// ── Load custom fonts ──────────────────────────────────────────────
(function loadFonts() {
    const s = document.createElement('style');
    s.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Italianno&family=Ma+Shan+Zheng&family=Liu+Jian+Mao+Cao&family=Great+Vibes&family=Rochester&display=swap');
        @import url('https://fonts.cdnfonts.com/css/la-paloma');
        @import url('https://fonts.cdnfonts.com/css/cervanttis');
    `;
    document.head.appendChild(s);
})();

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
    signatureImage: null,
    setupDone: false,
    signatures: [],
    activeSigId: null,
    sigOverlayEl: null,
    dragState: null,
    nextSigId: 0,

    // Draw state
    drawCanvas: null, drawCtx: null, isDrawing: false,

    // Upload state
    uploadOriginal: null,
    uploadRotation: 0,
    uploadCrop: null,

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
            <div class="modal-dialog" style="width:560px">
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
                    <!-- Signature tab -->
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
                        <div id="sign-upload-drop" style="width:100%;height:120px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s">
                            <span style="color:var(--text-muted);font-size:0.9rem">${I18N.t('upload_drop_hint')}</span>
                        </div>
                        <div id="sign-upload-editor" style="display:none">
                            <div style="position:relative;display:inline-block;margin-top:10px;user-select:none" id="sign-upload-crop-container">
                                <canvas id="sign-upload-canvas" style="display:block;max-width:100%;max-height:220px;border-radius:4px"></canvas>
                                <div id="sign-crop-overlay" style="display:none;position:absolute;inset:0">
                                    <!-- dark areas around crop -->
                                    <div id="crop-dark-top" style="position:absolute;background:rgba(0,0,0,0.45);pointer-events:none"></div>
                                    <div id="crop-dark-bottom" style="position:absolute;background:rgba(0,0,0,0.45);pointer-events:none"></div>
                                    <div id="crop-dark-left" style="position:absolute;background:rgba(0,0,0,0.45);pointer-events:none"></div>
                                    <div id="crop-dark-right" style="position:absolute;background:rgba(0,0,0,0.45);pointer-events:none"></div>
                                    <!-- crop border + handles -->
                                    <div id="crop-border" style="position:absolute;border:2px dashed #fff;cursor:move">
                                        <div class="crop-handle nw" data-dir="nw"></div>
                                        <div class="crop-handle ne" data-dir="ne"></div>
                                        <div class="crop-handle sw" data-dir="sw"></div>
                                        <div class="crop-handle se" data-dir="se"></div>
                                        <div class="crop-handle n"  data-dir="n"></div>
                                        <div class="crop-handle s"  data-dir="s"></div>
                                        <div class="crop-handle e"  data-dir="e"></div>
                                        <div class="crop-handle w"  data-dir="w"></div>
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;align-items:center">
                                <button class="btn btn-sm" onclick="App.toolRegistry['sign'].rotateUpload(-90)">↺</button>
                                <button class="btn btn-sm" onclick="App.toolRegistry['sign'].rotateUpload(90)">↻</button>
                                <button class="btn btn-sm" id="sign-crop-btn" onclick="App.toolRegistry['sign'].toggleCrop()">✂ Crop</button>
                                <button class="btn btn-sm btn-primary" id="sign-crop-apply" style="display:none" onclick="App.toolRegistry['sign'].applyCrop()">Apply</button>
                                <button class="btn btn-sm" id="sign-crop-cancel" style="display:none" onclick="App.toolRegistry['sign'].cancelCrop()">Cancel</button>
                            </div>
                        </div>
                        <div id="sign-upload-result" style="display:none;margin-top:12px;text-align:center">
                            <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 8px">${I18N.t('upload_preview_label')}</p>
                            <img id="sign-upload-result-img" style="max-width:100%;max-height:100px;border-radius:4px;background:repeating-conic-gradient(#e5e5e5 0% 25%,#fff 0% 50%) 50%/14px 14px">
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

        // Tabs
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tn = this.dataset.tab;
                document.querySelectorAll('.sign-tab-content').forEach(el => el.style.display = 'none');
                document.getElementById('sign-tab-' + tn).style.display = '';
                document.getElementById('sign-name-group').style.display = tn === 'signature' ? '' : 'none';
                if (tn === 'signature') self.renderStyleList();
                if (tn === 'draw') self.initDrawCanvas();
            });
        });

        // Color
        document.querySelectorAll('.sign-color-dot').forEach(dot => {
            dot.addEventListener('click', function() {
                document.querySelectorAll('.sign-color-dot').forEach(d => d.classList.remove('active'));
                this.classList.add('active');
                self.selectedColor = this.dataset.color;
                self.renderStyleList();
            });
        });
        document.getElementById('sign-fullname').addEventListener('input', function() {
            self.fullName = this.value;
            self.renderStyleList();
        });

        // Upload drop
        const uploadDrop = document.getElementById('sign-upload-drop');
        uploadDrop.addEventListener('click', () => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = () => { if (inp.files[0]) self.handleUploadFile(inp.files[0]); };
            inp.click();
        });
        uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); uploadDrop.style.borderColor = 'var(--primary)'; });
        uploadDrop.addEventListener('dragleave', () => { uploadDrop.style.borderColor = 'var(--border)'; });
        uploadDrop.addEventListener('drop', (e) => {
            e.preventDefault(); uploadDrop.style.borderColor = 'var(--border)';
            if (e.dataTransfer.files[0]) self.handleUploadFile(e.dataTransfer.files[0]);
        });

        // Canvas click
        document.getElementById('sign-pdf-canvas').addEventListener('click', (e) => this.onCanvasClick(e));
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    reset() {
        this.file = null; this.pdfBytes = null; this.pdfDoc = null;
        this.currentPage = 1; this.totalPages = 0;
        this.fullName = ''; this.selectedStyle = 0; this.selectedColor = '#000000';
        this.signatureImage = null; this.setupDone = false;
        this.signatures = []; this.activeSigId = null;
        this.sigOverlayEl = null; this.dragState = null; this.nextSigId = 0;
        this.uploadOriginal = null; this.uploadRotation = 0; this.uploadCrop = null;
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
        document.getElementById('sign-upload-editor').style.display = 'none';
        document.getElementById('sign-upload-drop').style.display = '';
        document.getElementById('sign-upload-result').style.display = 'none';
        this.renderStyleList();
        document.getElementById('sign-modal').style.display = '';
    },
    closeModal() { document.getElementById('sign-modal').style.display = 'none'; },

    // ===================== SIGNATURE TAB: calligraphy fonts =====================
    renderStyleList() {
        const list = document.getElementById('sign-style-list');
        const text = this.fullName || '';
        if (!text) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem">Enter your name above</div>';
            return;
        }
        const urls = this.generateSignatures(text);
        list.innerHTML = urls.map((url, i) => `
            <div class="sign-style-item${i === this.selectedStyle ? ' selected' : ''}" onclick="App.toolRegistry['sign'].selectStyle(${i})">
                <div class="sign-style-radio"></div>
                <div class="sign-style-preview"><img src="${url}" style="max-height:56px"></div>
            </div>
        `).join('');
    },
    selectStyle(index) { this.selectedStyle = index;
        document.querySelectorAll('.sign-style-item').forEach((el, i) => el.classList.toggle('selected', i === index)); },

    generateSignatures(text) {
        const color = this.selectedColor;
        // 6 calligraphy / script fonts as requested
        const profiles = [
            { font: '44px "Ma Shan Zheng","STKaiti","KaiTi",serif',       slant: -0.02, wobble: 3, spacing: 2, label: '马善政楷书' },
            { font: '46px "Liu Jian Mao Cao","STXingkai","Xingkai SC",cursive', slant: -0.05, wobble: 7, spacing: 1, label: '叶根友签名体' },
            { font: 'italic 42px "Italianno","Great Vibes","Segoe Script",cursive', slant: -0.05, wobble: 5, spacing: 1, label: 'Italianno' },
            { font: '42px "La Paloma","Alex Brush","Tangerine",cursive',       slant: -0.04, wobble: 4, spacing: 2, label: 'La Paloma' },
            { font: '40px "Cervanttis","Rochester","Rouge Script",cursive',    slant: -0.03, wobble: 5, spacing: 1, label: 'Cervanttis' },
            { font: 'bold 40px "STXingkai","Xingkai SC","KaiTi",cursive',      slant: -0.01, wobble: 3, spacing: 3, label: '行书' },
        ];
        return profiles.map(p => this.renderTextVariation(text, color, p));
    },

    renderTextVariation(text, color, profile) {
        const c = document.createElement('canvas');
        const padX = 36, padY = 24;

        // Measure first
        const measureCtx = c.getContext('2d');
        measureCtx.font = profile.font;
        let totalW = 0;
        for (let i = 0; i < text.length; i++) {
            totalW += measureCtx.measureText(text[i]).width + profile.spacing;
        }

        c.width = totalW + padX * 2;
        c.height = 80;
        const ctx = c.getContext('2d');
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        let seed = text.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) + profile.label.length;
        let x = padX;

        for (let i = 0; i < text.length; i++) {
            seed = (seed * 16807) % 2147483647;
            const r1 = (seed % 1000) / 1000 - 0.5;
            seed = (seed * 16807) % 2147483647;
            const r2 = (seed % 1000) / 1000 - 0.5;

            ctx.font = profile.font;
            const chW = ctx.measureText(text[i]).width;
            const angle = r1 * profile.slant * 2 + (profile.slant * 2);
            const yOff = r2 * profile.wobble;

            ctx.save();
            ctx.translate(x + chW / 2, c.height / 2 + yOff);
            ctx.rotate(angle);
            ctx.fillText(text[i], 0, 0);
            ctx.restore();
            x += chW + profile.spacing;
        }

        // Trim
        const finalW = x + 20;
        const fc = document.createElement('canvas');
        fc.width = finalW; fc.height = 80;
        fc.getContext('2d').drawImage(c, 0, 0, finalW, 80, 0, 0, finalW, 80);
        return fc.toDataURL('image/png');
    },

    // ===================== DRAW TAB =====================
    initDrawCanvas() {
        const canvas = document.getElementById('sign-draw-canvas');
        if (!canvas || this.drawCanvas === canvas) return;
        this.drawCanvas = canvas;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = 160 * 2;
        this.drawCtx = canvas.getContext('2d');
        this.drawCtx.strokeStyle = '#000';
        this.drawCtx.lineWidth = 5;
        this.drawCtx.lineCap = 'round';
        this.drawCtx.lineJoin = 'round';
        this.clearDraw();

        const self = this;
        const getPos = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
        };
        canvas.onmousedown = (e) => { self.isDrawing = true; const p = getPos(e); self.drawCtx.beginPath(); self.drawCtx.moveTo(p.x, p.y); };
        canvas.onmousemove = (e) => { if (!self.isDrawing) return; const p = getPos(e); self.drawCtx.lineTo(p.x, p.y); self.drawCtx.stroke(); };
        canvas.onmouseup = () => { self.isDrawing = false; };
        canvas.onmouseleave = () => { self.isDrawing = false; };
        canvas.ontouchstart = (e) => { e.preventDefault(); self.isDrawing = true; const p = getPos(e.touches[0]); self.drawCtx.beginPath(); self.drawCtx.moveTo(p.x, p.y); };
        canvas.ontouchmove = (e) => { e.preventDefault(); if (!self.isDrawing) return; const p = getPos(e.touches[0]); self.drawCtx.lineTo(p.x, p.y); self.drawCtx.stroke(); };
        canvas.ontouchend = () => { self.isDrawing = false; };
    },
    clearDraw() { if (this.drawCtx) this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height); },

    // ===================== UPLOAD TAB =====================
    handleUploadFile(file) {
        if (!file.type.startsWith('image/')) { App.toast('Please upload an image', 'error'); return; }
        const reader = new FileReader();
        const self = this;
        reader.onload = function() {
            const img = new Image();
            img.onload = function() {
                self.uploadOriginal = img;
                self.uploadRotation = 0;
                self.uploadCrop = null;
                document.getElementById('sign-upload-drop').style.display = 'none';
                document.getElementById('sign-upload-editor').style.display = '';
                document.getElementById('sign-upload-result').style.display = 'none';
                self.renderUploadCanvas();
                self.processAndPreview();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    },

    renderUploadCanvas() {
        const canvas = document.getElementById('sign-upload-canvas');
        const img = this.uploadOriginal;
        const angle = this.uploadRotation % 360;
        const rad = (angle * Math.PI) / 180;
        const absCos = Math.abs(Math.cos(rad)), absSin = Math.abs(Math.sin(rad));
        const rw = img.width * absCos + img.height * absSin;
        const rh = img.width * absSin + img.height * absCos;
        canvas.width = rw; canvas.height = rh;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, rw, rh);
        ctx.save();
        ctx.translate(rw / 2, rh / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    },

    rotateUpload(deg) {
        this.uploadRotation = (this.uploadRotation + deg) % 360;
        this.uploadCrop = null; this.cancelCrop();
        this.renderUploadCanvas(); this.processAndPreview();
    },

    // ===================== Crop WITH resize handles =====================
    toggleCrop() {
        const overlay = document.getElementById('sign-crop-overlay');
        if (overlay.style.display === 'none' || !overlay.style.display) {
            this.startCrop();
        } else {
            this.cancelCrop();
        }
    },

    startCrop() {
        const canvas = document.getElementById('sign-upload-canvas');
        const overlay = document.getElementById('sign-crop-overlay');
        overlay.style.display = '';
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        const cropW = cw * 0.6, cropH = ch * 0.6;
        const cropX = (cw - cropW) / 2, cropY = (ch - cropH) / 2;
        this.updateCropDark(cropX, cropY, cropW, cropH);

        const border = document.getElementById('crop-border');
        border.style.left = cropX + 'px'; border.style.top = cropY + 'px';
        border.style.width = cropW + 'px'; border.style.height = cropH + 'px';

        // Drag to move crop area
        const self = this;
        border.addEventListener('mousedown', function(e) {
            if (e.target.classList.contains('crop-handle')) return; // handles handle themselves
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const origLeft = parseFloat(border.style.left), origTop = parseFloat(border.style.top);
            const bW = parseFloat(border.style.width), bH = parseFloat(border.style.height);
            const onMove = (ev) => {
                const nl = Math.max(0, Math.min(cw - bW, origLeft + ev.clientX - startX));
                const nt = Math.max(0, Math.min(ch - bH, origTop + ev.clientY - startY));
                border.style.left = nl + 'px'; border.style.top = nt + 'px';
                self.updateCropDark(nl, nt, bW, bH);
            };
            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        });

        // Resize handles
        document.querySelectorAll('.crop-handle').forEach(h => {
            h.addEventListener('mousedown', function(e) {
                e.preventDefault(); e.stopPropagation();
                const dir = this.dataset.dir;
                const startX = e.clientX, startY = e.clientY;
                const origLeft = parseFloat(border.style.left), origTop = parseFloat(border.style.top);
                const origW = parseFloat(border.style.width), origH = parseFloat(border.style.height);
                const minW = 30, minH = 20;

                const onMove = (ev) => {
                    let dx = ev.clientX - startX, dy = ev.clientY - startY;
                    let l = origLeft, t = origTop, w = origW, h = origH;

                    if (dir.includes('e')) { w = Math.max(minW, origW + dx); }
                    if (dir.includes('w')) { w = Math.max(minW, origW - dx); l = origLeft + origW - w; }
                    if (dir.includes('s')) { h = Math.max(minH, origH + dy); }
                    if (dir.includes('n')) { h = Math.max(minH, origH - dy); t = origTop + origH - h; }

                    // Clamp
                    l = Math.max(0, l); t = Math.max(0, t);
                    if (l + w > cw) w = cw - l;
                    if (t + h > ch) h = ch - t;

                    border.style.left = l + 'px'; border.style.top = t + 'px';
                    border.style.width = w + 'px'; border.style.height = h + 'px';
                    self.updateCropDark(l, t, w, h);
                };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            });
        });

        document.getElementById('sign-crop-btn').style.display = 'none';
        document.getElementById('sign-crop-apply').style.display = '';
        document.getElementById('sign-crop-cancel').style.display = '';
    },

    updateCropDark(x, y, w, h) {
        const cw = document.getElementById('sign-upload-canvas').clientWidth;
        const ch = document.getElementById('sign-upload-canvas').clientHeight;
        document.getElementById('crop-dark-top').style.cssText = `left:0;top:0;width:100%;height:${y}px`;
        document.getElementById('crop-dark-bottom').style.cssText = `left:0;top:${y + h}px;width:100%;height:${Math.max(0, ch - y - h)}px`;
        document.getElementById('crop-dark-left').style.cssText = `left:0;top:${y}px;width:${x}px;height:${h}px`;
        document.getElementById('crop-dark-right').style.cssText = `left:${x + w}px;top:${y}px;width:${Math.max(0, cw - x - w)}px;height:${h}px`;
    },

    applyCrop() {
        const canvas = document.getElementById('sign-upload-canvas');
        const border = document.getElementById('crop-border');
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        const caw = canvas.width, cah = canvas.height;
        const sx = parseFloat(border.style.left) / cw * caw;
        const sy = parseFloat(border.style.top) / ch * cah;
        const sw = parseFloat(border.style.width) / cw * caw;
        const sh = parseFloat(border.style.height) / ch * cah;
        this.uploadCrop = { x: sx, y: sy, w: sw, h: sh };
        this.cancelCrop();
        document.getElementById('sign-crop-btn').textContent = '✂ Re-crop';
        this.processAndPreview();
    },

    cancelCrop() {
        document.getElementById('sign-crop-overlay').style.display = 'none';
        document.getElementById('sign-crop-btn').style.display = '';
        document.getElementById('sign-crop-apply').style.display = 'none';
        document.getElementById('sign-crop-cancel').style.display = 'none';
    },

    // ===================== BG Removal: preserve original color =====================
    processAndPreview() {
        const canvas = document.getElementById('sign-upload-canvas');
        const c2 = document.createElement('canvas');
        let srcX = 0, srcY = 0, srcW = canvas.width, srcH = canvas.height;

        if (this.uploadCrop) {
            srcX = this.uploadCrop.x; srcY = this.uploadCrop.y;
            srcW = this.uploadCrop.w; srcH = this.uploadCrop.h;
        }

        c2.width = srcW; c2.height = srcH;
        const ctx = c2.getContext('2d');
        ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

        const imageData = ctx.getImageData(0, 0, c2.width, c2.height);
        const data = imageData.data;
        const w = c2.width, h = c2.height, total = w * h;

        // Step 1: Build binary mask (1=keep as signature, 0=background)
        const mask = new Uint8Array(total);
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            mask[i >> 2] = brightness < 200 ? 1 : 0;
        }

        // Step 2: Clean isolated noise — any "dark" pixel with < 3 dark neighbors → discard
        const cleaned = new Uint8Array(mask);
        for (let y = 1; y < h - 1; y++) {
            const rowBase = y * w;
            for (let x = 1; x < w - 1; x++) {
                const idx = rowBase + x;
                if (mask[idx] === 0) continue;
                let n = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        n += mask[(y + dy) * w + (x + dx)];
                if (n < 3) cleaned[idx] = 0;
            }
        }

        // Step 3: Apply cleaned mask; preserve original color for kept pixels
        for (let i = 0; i < data.length; i += 4) {
            if (cleaned[i >> 2]) {
                data[i + 3] = 255;
            } else {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);

        this.signatureImage = c2.toDataURL('image/png');
        document.getElementById('sign-upload-result-img').src = this.signatureImage;
        document.getElementById('sign-upload-result').style.display = '';
    },

    // ===================== Apply =====================
    applySetup() {
        const activeTab = document.querySelector('.modal-tab.active').dataset.tab;
        if (activeTab === 'signature') {
            const name = document.getElementById('sign-fullname').value.trim();
            if (!name) { App.toast('Enter your full name', 'error'); return; }
            this.fullName = name;
            this.signatureImage = this.generateSignatures(name)[this.selectedStyle];
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
                this.currentPage = i; this.renderPage(i);
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
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, sig.x, sig.y, sig.w, sig.h); resolve(); };
            img.onerror = resolve;
            img.src = sig.imageData;
        });
    },

    onCanvasClick(e) {
        const canvas = document.getElementById('sign-pdf-canvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX, cy = (e.clientY - rect.top) * scaleY;
        const committed = this.signatures.filter(s => s.page === this.currentPage && s.id !== this.activeSigId);
        for (let i = committed.length - 1; i >= 0; i--) {
            const sig = committed[i];
            if (cx >= sig.x && cx <= sig.x + sig.w && cy >= sig.y && cy <= sig.y + sig.h) {
                this.commitActive(); this.activeSigId = sig.id; this.renderPage(this.currentPage); return;
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

    renderSignatureOverlay() {
        if (this.sigOverlayEl) { this.sigOverlayEl.remove(); this.sigOverlayEl = null; }
        if (this.activeSigId === null) return;
        const sig = this.signatures.find(s => s.id === this.activeSigId);
        if (!sig || sig.page !== this.currentPage) return;
        const canvas = document.getElementById('sign-pdf-canvas');
        const scaleX = canvas.clientWidth / canvas.width, scaleY = canvas.clientHeight / canvas.height;
        const overlay = document.createElement('div');
        overlay.className = 'sign-sig-overlay';
        overlay.style.left = (sig.x * scaleX) + 'px';
        overlay.style.top = (sig.y * scaleY) + 'px';
        overlay.style.width = (sig.w * scaleX) + 'px';
        overlay.style.height = (sig.h * scaleY) + 'px';
        const img = document.createElement('img'); img.src = sig.imageData; img.draggable = false;
        overlay.appendChild(img);
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const h = document.createElement('div'); h.className = 'sign-sig-resize ' + dir;
            h.addEventListener('mousedown', (e) => this.onResizeStart(e, dir));
            overlay.appendChild(h);
        });
        const rm = document.createElement('div'); rm.className = 'sign-sig-remove'; rm.textContent = '×';
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
        this.dragState = { startX: e.clientX, startY: e.clientY, origLeft: parseFloat(overlay.style.left), origTop: parseFloat(overlay.style.top), origW: parseFloat(overlay.style.width), origH: parseFloat(overlay.style.height) };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState;
            overlay.style.left = (d.origLeft + ev.clientX - d.startX) + 'px';
            overlay.style.top = (d.origTop + ev.clientY - d.startY) + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); self.dragState = null; self.syncOverlayToSignature(); };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    },
    onResizeStart(e, dir) {
        e.preventDefault(); e.stopPropagation();
        const overlay = this.sigOverlayEl;
        this.dragState = { startX: e.clientX, startY: e.clientY, origLeft: parseFloat(overlay.style.left), origTop: parseFloat(overlay.style.top), origW: parseFloat(overlay.style.width), origH: parseFloat(overlay.style.height), dir };
        const self = this;
        const onMove = (ev) => {
            if (!self.dragState) return;
            const d = self.dragState, dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
            let l = d.origLeft, t = d.origTop, w = d.origW, h = d.origH;
            if (d.dir.includes('e')) w = Math.max(30, d.origW + dx);
            if (d.dir.includes('w')) { w = Math.max(30, d.origW - dx); l = d.origLeft + d.origW - w; }
            if (d.dir.includes('s')) h = Math.max(20, d.origH + dy);
            if (d.dir.includes('n')) { h = Math.max(20, d.origH - dy); t = d.origTop + d.origH - h; }
            overlay.style.left = l + 'px'; overlay.style.top = t + 'px';
            overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); self.dragState = null; self.syncOverlayToSignature(); };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    },
    syncOverlayToSignature() {
        if (!this.sigOverlayEl || this.activeSigId === null) return;
        const sig = this.signatures.find(s => s.id === this.activeSigId);
        if (!sig) return;
        const canvas = document.getElementById('sign-pdf-canvas');
        const scaleX = canvas.width / canvas.clientWidth, scaleY = canvas.height / canvas.clientHeight;
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
        const id = this.nextSigId++;
        this.signatures.push({ id, page: this.currentPage, x: (canvas.width - 200) / 2, y: (canvas.height - 60) / 2, w: 200, h: 60, imageData: this.signatureImage });
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
                const pngImg = await doc.embedPng(await resp.arrayBuffer());
                pdfLibPage.drawImage(pngImg, {
                    x: sig.x * sX, y: pdfLibPage.getHeight() - (sig.y + sig.h) * sY,
                    width: sig.w * sX, height: sig.h * sY,
                });
            }
            App.downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), 'signed.pdf');
        } catch (e) { console.error('Sign error:', e); App.toast('Error signing PDF', 'error'); }
    },
});
