/* ========== Tool: Merge PDF ========== */
App.register('merge', {
    files: [],
    fileData: [],

    init(body) {
        this.files = [];
        this.fileData = [];
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="merge_desc">${I18N.t('merge_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_hint')}
            <div id="merge-file-list" class="file-list"></div>
            <div id="merge-actions" class="btn-group" style="display:none">
                <button class="btn btn-primary btn-lg btn-block" onclick="App.toolRegistry['merge'].process()" data-i18n="tool_merge">${I18N.t('tool_merge')}</button>
            </div>
        `;
        App.bindUploadZone((files) => this.addFiles(files));
    },

    addFiles(newFiles) {
        for (const f of newFiles) {
            if (f.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); continue; }
            this.files.push(f);
            this.fileData.push({ name: f.name, size: f.size });
        }
        this.renderFileList();
    },

    renderFileList() {
        const list = document.getElementById('merge-file-list');
        const actions = document.getElementById('merge-actions');
        list.innerHTML = this.fileData.map((f, i) => `
            <div class="file-item" draggable="true" data-index="${i}"
                 ondragstart="App.toolRegistry['merge'].onDragStart(event, ${i})"
                 ondragover="App.toolRegistry['merge'].onDragOver(event)"
                 ondragleave="App.toolRegistry['merge'].onDragLeave(event)"
                 ondrop="App.toolRegistry['merge'].onDrop(event, ${i})">
                <span class="file-item-grip" data-i18n="drag_reorder">⋮⋮</span>
                <span class="file-item-icon">📄</span>
                <div class="file-item-info">
                    <div class="file-item-name">${f.name}</div>
                    <div class="file-item-size">${App.formatSize(f.size)}</div>
                </div>
                <button class="file-item-remove" onclick="App.toolRegistry['merge'].removeFile(${i})">×</button>
            </div>
        `).join('');
        actions.style.display = this.fileData.length >= 2 ? '' : 'none';
    },

    removeFile(i) { this.files.splice(i, 1); this.fileData.splice(i, 1); this.renderFileList(); },

    onDragStart(e, i) { e.dataTransfer.setData('text/plain', i); e.currentTarget.classList.add('dragging'); },
    onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); },
    onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); },
    onDrop(e, toIdx) {
        e.preventDefault(); e.currentTarget.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromIdx === toIdx) return;
        const [f] = this.files.splice(fromIdx, 1); this.files.splice(toIdx, 0, f);
        const [d] = this.fileData.splice(fromIdx, 1); this.fileData.splice(toIdx, 0, d);
        this.renderFileList();
    },

    async process() {
        App.toast(I18N.t('processing'), 'info');
        const merged = await PDFLib.PDFDocument.create();
        for (const file of this.files) {
            const bytes = await file.arrayBuffer();
            const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            const copied = await merged.copyPages(doc, doc.getPageIndices());
            copied.forEach(p => merged.addPage(p));
        }
        const outBytes = await merged.save();
        App.downloadBlob(new Blob([outBytes], { type: 'application/pdf' }), 'merged.pdf');
    }
});
