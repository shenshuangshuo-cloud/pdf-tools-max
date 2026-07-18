/* ========== Tool: PDF to Word ========== */
App.register('pdf2word', {
    file: null,

    init(body) {
        this.file = null;
        body.innerHTML = `
            <p class="workspace-desc" data-i18n="pdf2word_desc">${I18N.t('pdf2word_desc')}</p>
            ${App.createUploadZone('.pdf', 'upload_pdf_hint')}
            <div id="pdf2word-content" style="display:none">
                <div class="progress-text" id="pdf2word-progress"></div>
                <div class="progress-bar"><div class="progress-fill" id="pdf2word-bar"></div></div>
                <div class="pdf-preview-area" id="pdf2word-preview"></div>
                <div class="btn-group" style="justify-content:center">
                    <button class="btn btn-download visible" id="pdf2word-dl" style="display:none" onclick="App.toolRegistry['pdf2word'].download()" data-i18n="btn_download">${I18N.t('btn_download')}</button>
                </div>
            </div>
        `;
        App.bindUploadZone((files) => this.loadFile(files[0]));
    },

    loadFile(file) {
        if (file.type !== 'application/pdf') { App.toast(I18N.t('toast_pdf_only'), 'error'); return; }
        this.file = file;
        document.getElementById('pdf2word-content').style.display = '';
        document.getElementById('upload-zone').style.display = 'none';
        this.process();
    },

    async process() {
        const progress = document.getElementById('pdf2word-progress');
        const bar = document.getElementById('pdf2word-bar');
        const preview = document.getElementById('pdf2word-preview');

        progress.textContent = I18N.t('pdf2word_progress');
        bar.style.width = '20%';

        const bytes = await this.file.arrayBuffer();
        const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
        const totalPages = pdfjsDoc.numPages;

        progress.textContent = I18N.t('pdf2word_analyze');
        bar.style.width = '50%';

        // Build docx document
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

        const children = [
            new Paragraph({
                children: [new TextRun({ text: this.file.name.replace('.pdf', ''), bold: true, size: 32 })],
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 300 }
            })
        ];

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfjsDoc.getPage(i);
            const content = await page.getTextContent();
            const textItems = content.items
                .map(it => it.str.trim())
                .filter(s => s.length > 0);

            if (textItems.length > 0) {
                const pageText = textItems.join(' ');
                children.push(new Paragraph({
                    children: [new TextRun({ text: pageText, size: 22 })],
                    spacing: { after: 200 }
                }));
            }

            if (i < totalPages) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: '', break: 1 })],
                }));
            }

            bar.style.width = `${50 + (i / totalPages) * 30}%`;
        }

        progress.textContent = I18N.t('pdf2word_generate');
        bar.style.width = '90%';

        const doc = new Document({ sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        this._blob = blob;

        progress.textContent = I18N.t('pdf2word_done');
        bar.style.width = '100%';

        const firstPage = await pdfjsDoc.getPage(1);
        const vp = firstPage.getViewport({ scale: 0.6 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await firstPage.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        preview.innerHTML = canvas.outerHTML;

        document.getElementById('pdf2word-dl').style.display = '';
    },

    download() {
        if (this._blob) App.downloadBlob(this._blob, this.file.name.replace('.pdf', '.docx'));
    }
});
