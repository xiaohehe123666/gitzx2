class PDFParser {
    constructor() {
        this.pdfDocument = null;
        this.fileData = null;
    }

    async parseFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.pdfDocument = await loadingTask.promise;

            const documentInfo = await this.pdfDocument.getMetadata();
            const numPages = this.pdfDocument.numPages;

            const pages = [];
            let totalTextLength = 0;

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await this.pdfDocument.getPage(pageNum);
                const textContent = await page.getTextContent();

                const textItems = textContent.items.map(item => {
                    if (item.str) {
                        return {
                            text: item.str,
                            transform: item.transform,
                            fontSize: item.fontSize || 12
                        };
                    }
                    return null;
                }).filter(item => item !== null);

                const pageText = textItems.map(item => item.text).join(' ');
                totalTextLength += pageText.length;

                pages.push({
                    pageNumber: pageNum,
                    text: pageText,
                    items: textItems
                });
            }

            this.fileData = {
                fileName: file.name,
                fileSize: file.size,
                numPages: numPages,
                title: documentInfo.info.Title || file.name.replace('.pdf', ''),
                author: documentInfo.info.Author || 'Unknown',
                pages: pages,
                totalTextLength: totalTextLength,
                isScanned: totalTextLength < numPages * 10
            };

            return this.fileData;
        } catch (error) {
            console.error('PDF解析错误:', error);
            throw new Error('PDF解析失败: ' + error.message);
        }
    }

    getTextBlocks() {
        if (!this.fileData) return [];

        const blocks = [];
        for (const page of this.fileData.pages) {
            const lines = this._groupIntoLines(page.items);
            for (const line of lines) {
                const paragraph = this._groupIntoParagraphs(line);
                blocks.push({
                    pageNumber: page.pageNumber,
                    content: paragraph.text,
                    fontSize: paragraph.fontSize,
                    isHeading: paragraph.isHeading
                });
            }
        }

        return blocks;
    }

    _groupIntoLines(items) {
        if (!items || items.length === 0) return [];

        const lines = [];
        let currentLine = null;

        for (const item of items) {
            const y = item.transform[5];
            const x = item.transform[4];

            if (!currentLine || Math.abs(y - currentLine.y) > 3) {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = {
                    y: y,
                    items: [item]
                };
            } else {
                currentLine.items.push(item);
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.map(line => {
            line.items.sort((a, b) => a.transform[4] - b.transform[4]);
            return line;
        });
    }

    _groupIntoParagraphs(line) {
        if (!line || !line.items || line.items.length === 0) {
            return { text: '', fontSize: 12, isHeading: false };
        }

        const text = line.items.map(item => item.text).join(' ').trim();
        const fontSize = Math.round(line.items.reduce((sum, item) => sum + (item.fontSize || 12), 0) / line.items.length);

        const isHeading = fontSize >= 16;

        return {
            text: text,
            fontSize: fontSize,
            isHeading: isHeading
        };
    }

    getMetadata() {
        if (!this.fileData) return null;

        return {
            title: this.fileData.title,
            author: this.fileData.author,
            numPages: this.fileData.numPages,
            fileSize: this.fileData.fileSize,
            isScanned: this.fileData.isScanned
        };
    }

    destroy() {
        if (this.pdfDocument) {
            this.pdfDocument.destroy();
            this.pdfDocument = null;
        }
        this.fileData = null;
    }
}

window.PDFParser = PDFParser;
