(function() {
    'use strict';

    const state = {
        currentFile: null,
        parsedData: null,
        wordBlob: null,
        isConverting: false
    };

    const elements = {
        uploadZone: document.getElementById('uploadZone'),
        fileInput: document.getElementById('fileInput'),
        selectBtn: document.getElementById('selectBtn'),
        fileInfo: document.getElementById('fileInfo'),
        fileName: document.getElementById('fileName'),
        fileSize: document.getElementById('fileSize'),
        filePages: document.getElementById('filePages'),
        removeFile: document.getElementById('removeFile'),
        progressSection: document.getElementById('progressSection'),
        progressText: document.getElementById('progressText'),
        progressPercent: document.getElementById('progressPercent'),
        progressFill: document.getElementById('progressFill'),
        resultSection: document.getElementById('resultSection'),
        resultSummary: document.getElementById('resultSummary'),
        downloadBtn: document.getElementById('downloadBtn'),
        convertMoreBtn: document.getElementById('convertMoreBtn'),
        errorSection: document.getElementById('errorSection'),
        errorMessage: document.getElementById('errorMessage'),
        retryBtn: document.getElementById('retryBtn')
    };

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function showElement(el) {
        el.classList.remove('hidden');
    }

    function hideElement(el) {
        el.classList.add('hidden');
    }

    function showError(message) {
        hideElement(elements.progressSection);
        hideElement(elements.resultSection);
        hideElement(elements.fileInfo);
        elements.errorMessage.textContent = message;
        showElement(elements.errorSection);
    }

    function showFileInfo(file) {
        hideElement(elements.errorSection);
        hideElement(elements.progressSection);
        hideElement(elements.resultSection);

        state.currentFile = file;
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatFileSize(file.size);
        elements.filePages.textContent = '解析中...';
        showElement(elements.fileInfo);
    }

    async function handleFileSelect(file) {
        if (!file) return;

        if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
            showError('请选择PDF格式的文件');
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            showError('文件大小超过20MB限制，请选择较小的文件');
            return;
        }

        showFileInfo(file);
        await startConversion(file);
    }

    async function startConversion(file) {
        if (state.isConverting) return;
        state.isConverting = true;

        hideElement(elements.errorSection);
        hideElement(elements.resultSection);
        showElement(elements.progressSection);

        try {
            updateProgress(10, '正在加载PDF...');

            const parser = new PDFParser();
            updateProgress(30, '正在解析PDF结构...');

            const parsedData = await parser.parseFile(file);
            state.parsedData = parsedData;

            elements.filePages.textContent = parsedData.numPages + ' 页';

            if (parsedData.isScanned) {
                updateProgress(50, '检测到扫描件，尝试基础转换...');
            } else {
                updateProgress(50, '正在提取文本内容...');
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            updateProgress(70, '正在生成Word文档...');

            const generator = new WordGenerator();
            if (!generator.init()) {
                throw new Error('Word生成组件加载失败');
            }

            const blob = await generator.generateDocument(parsedData);
            state.wordBlob = blob;

            updateProgress(95, '正在准备下载...');
            await new Promise(resolve => setTimeout(resolve, 200));

            updateProgress(100, '转换完成！');

            await new Promise(resolve => setTimeout(resolve, 300));

            showResult(parsedData);

        } catch (error) {
            console.error('转换错误:', error);
            showError(error.message || '转换失败，请重试');
        } finally {
            state.isConverting = false;
        }
    }

    function updateProgress(percent, text) {
        elements.progressFill.style.width = percent + '%';
        elements.progressPercent.textContent = percent + '%';
        elements.progressText.textContent = text;

        const steps = document.querySelectorAll('.progress-steps .step');
        const stepIndex = percent <= 33 ? 0 : (percent <= 66 ? 1 : 2);

        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index < stepIndex) {
                step.classList.add('completed');
            } else if (index === stepIndex) {
                step.classList.add('active');
            }
        });
    }

    function showResult(parsedData) {
        hideElement(elements.progressSection);
        hideElement(elements.fileInfo);

        const textStats = calculateTextStats(parsedData);
        elements.resultSummary.textContent =
            `共 ${parsedData.numPages} 页，提取 ${textStats.chars} 字符，${textStats.paragraphs} 个段落`;

        showElement(elements.resultSection);
    }

    function calculateTextStats(parsedData) {
        let totalChars = 0;
        let paragraphCount = 0;

        for (const page of parsedData.pages) {
            const lines = groupIntoLines(page.items);
            paragraphCount += lines.length;
            for (const line of lines) {
                totalChars += line.items.reduce((sum, item) => sum + (item.text ? item.text.length : 0), 0);
            }
        }

        return {
            chars: totalChars,
            paragraphs: paragraphCount
        };
    }

    function groupIntoLines(items) {
        if (!items || items.length === 0) return [];

        const lines = [];
        let currentLine = null;

        for (const item of items) {
            if (!item.text) continue;

            const y = item.transform[5];

            if (!currentLine || Math.abs(y - currentLine.y) > 3) {
                if (currentLine) lines.push(currentLine);
                currentLine = { y: y, items: [item] };
            } else {
                currentLine.items.push(item);
            }
        }

        if (currentLine) lines.push(currentLine);

        return lines.map(line => {
            line.items.sort((a, b) => a.transform[4] - b.transform[4]);
            return line;
        });
    }

    function resetAll() {
        state.currentFile = null;
        state.parsedData = null;
        state.wordBlob = null;

        hideElement(elements.fileInfo);
        hideElement(elements.progressSection);
        hideElement(elements.resultSection);
        hideElement(elements.errorSection);

        elements.fileInput.value = '';
    }

    function setupEventListeners() {
        elements.selectBtn.addEventListener('click', () => {
            elements.fileInput.click();
        });

        elements.uploadZone.addEventListener('click', (e) => {
            if (e.target === elements.selectBtn || e.target.closest('.btn-select')) {
                return;
            }
            elements.fileInput.click();
        });

        elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileSelect(file);
            }
        });

        elements.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadZone.classList.add('dragover');
        });

        elements.uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadZone.classList.remove('dragover');
        });

        elements.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadZone.classList.remove('dragover');

            const file = e.dataTransfer.files[0];
            if (file) {
                handleFileSelect(file);
            }
        });

        ['dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                if (eventName === 'dragover') {
                    e.preventDefault();
                }
            });
        });

        elements.removeFile.addEventListener('click', () => {
            resetAll();
        });

        elements.downloadBtn.addEventListener('click', async () => {
            if (!state.wordBlob || !state.parsedData) return;

            const generator = new WordGenerator();
            const fileName = state.parsedData.title + '.docx';

            try {
                await generator.downloadDocument(state.wordBlob, fileName);
            } catch (error) {
                console.error('下载错误:', error);
                alert('下载失败: ' + error.message);
            }
        });

        elements.convertMoreBtn.addEventListener('click', () => {
            resetAll();
        });

        elements.retryBtn.addEventListener('click', () => {
            resetAll();
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const targetId = link.getAttribute('href');
                if (targetId.startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(targetId);
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }

                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });

        window.addEventListener('scroll', () => {
            const sections = ['converter', 'features', 'how-to'];
            let currentSection = '';

            for (const id of sections) {
                const section = document.getElementById(id);
                if (section) {
                    const rect = section.getBoundingClientRect();
                    if (rect.top <= 100) {
                        currentSection = id;
                    }
                }
            }

            document.querySelectorAll('.nav-link').forEach(link => {
                const href = link.getAttribute('href');
                if (href === '#' + currentSection) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        });
    }

    function checkDependencies() {
        const missing = [];

        if (!window.pdfjsLib) {
            missing.push('PDF.js');
        }

        if (!window.docx) {
            missing.push('docx.js');
        }

        if (!window.saveAs) {
            missing.push('FileSaver.js');
        }

        if (missing.length > 0) {
            console.warn('缺少CDN依赖:', missing.join(', '));
        }
    }

    function init() {
        checkDependencies();
        setupEventListeners();

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
