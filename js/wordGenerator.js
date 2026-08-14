class WordGenerator {
    constructor() {
        this.docx = null;
        this.init();
    }

    init() {
        if (window.docx) {
            this.docx = window.docx;
            return true;
        }
        return false;
    }

    async generateDocument(pdfData) {
        if (!this.docx) {
            throw new Error('Word生成库未加载');
        }

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = this.docx;

        const children = [];
        const title = pdfData.title || 'Document';

        children.push(new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: title,
                    bold: true,
                    size: 36
                })
            ],
            spacing: { after: 400 }
        }));

        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: `页数: ${pdfData.numPages}`,
                    size: 20,
                    color: '666666'
                })
            ],
            spacing: { after: 300 }
        }));

        const paragraphs = this._extractParagraphs(pdfData);
        let currentPage = 0;

        for (const para of paragraphs) {
            if (para.pageNumber !== currentPage) {
                if (currentPage > 0) {
                    children.push(new Paragraph({ children: [] }));
                }
                currentPage = para.pageNumber;

                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: `—— 第 ${currentPage} 页 ——`,
                            alignment: AlignmentType.CENTER,
                            size: 18,
                            color: '999999'
                        })
                    ],
                    spacing: { before: 200, after: 200 }
                }));
            }

            if (!para.content || para.content.trim() === '') continue;

            if (para.isHeading && para.fontSize >= 18) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_1,
                    children: [
                        new TextRun({
                            text: para.content,
                            bold: true,
                            size: Math.min(para.fontSize * 2, 48)
                        })
                    ],
                    spacing: { before: 240, after: 120 }
                }));
            } else if (para.isHeading) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_2,
                    children: [
                        new TextRun({
                            text: para.content,
                            bold: true,
                            size: Math.min(para.fontSize * 2, 36)
                        })
                    ],
                    spacing: { before: 200, after: 100 }
                }));
            } else {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: para.content,
                            size: Math.min(Math.max(para.fontSize * 2, 20), 32)
                        })
                    ],
                    spacing: { after: 120 }
                }));
            }
        }

        const doc = new Document({
            sections: [{
                properties: {},
                children: children
            }],
            creator: 'PDF转Word工具',
            title: title
        });

        const blob = await Packer.toBlob(doc);
        return blob;
    }

    _extractParagraphs(pdfData) {
        const paragraphs = [];

        for (const page of pdfData.pages) {
            const lines = this._groupIntoLines(page.items);

            for (const line of lines) {
                const text = line.items
                    .map(item => item.text)
                    .join(' ')
                    .trim();

                if (!text) continue;

                const fontSize = Math.round(
                    line.items.reduce((sum, item) => sum + (item.fontSize || 12), 0) / line.items.length
                );

                paragraphs.push({
                    pageNumber: page.pageNumber,
                    content: text,
                    fontSize: fontSize,
                    isHeading: fontSize >= 16
                });
            }
        }

        return paragraphs;
    }

    _groupIntoLines(items) {
        if (!items || items.length === 0) return [];

        const lines = [];
        let currentLine = null;

        for (const item of items) {
            const y = item.transform[5];

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

    async downloadDocument(blob, fileName) {
        if (window.saveAs) {
            window.saveAs(blob, fileName);
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }
}

window.WordGenerator = WordGenerator;
