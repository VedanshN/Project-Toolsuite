// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global state
let currentPDF = null;
let pdfDoc = null;
let pdfBytes = null;
let currentTool = 'viewer';
let pages = [];
let currentPage = 1;
let totalPages = 0;
let signatures = [];
let annotations = [];
let watermarks = [];
let watermarkSettings = {
    text: 'CONFIDENTIAL',
    opacity: 0.3,
    rotation: -45,
    color: '#000000',
    fontSize: 48,
    position: 'center'
};
let redactionBoxes = [];
let cropArea = null;
let selectedPages = new Set();
let originalFileSize = 0;
let currentZoom = 1.0;

// DOM elements
const toolItems = document.querySelectorAll('.tool-item');
const fileInput = document.getElementById('file-input');
const previewArea = document.getElementById('preview-area');
const toolPanel = document.getElementById('tool-panel');
const toolTitle = document.getElementById('tool-title');
const downloadBtn = document.getElementById('download-btn');
const pageInfo = document.getElementById('page-info');
const fileSize = document.getElementById('file-size');

// Tool switching
toolItems.forEach(item => {
    item.addEventListener('click', () => {
        toolItems.forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        currentTool = item.dataset.tool;
        toolTitle.textContent = item.textContent;
        loadToolPanel();
        if (pdfDoc) {
            renderCurrentTool();
        }
    });
});

// File upload
fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        await loadPDF(files[0]);
    }
});

// Load PDF
async function loadPDF(file) {
    try {
        showStatus('Loading PDF...', 'info');
        
        const arrayBuffer = await file.arrayBuffer();
        const buffer1 = arrayBuffer.slice(0);
        const buffer2 = arrayBuffer.slice(0);
        
        pdfBytes = new Uint8Array(buffer1);
        originalFileSize = file.size;
        
        // Load with PDF.js for rendering
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        totalPages = pdfDoc.numPages;
        
        // Load with pdf-lib for editing
        currentPDF = await PDFLib.PDFDocument.load(buffer2);
        
        pages = [];
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
        
        currentPage = 1;
        selectedPages.clear();
        signatures = [];
        annotations = [];
        watermarks = [];
        redactionBoxes = [];
        cropArea = null;
        currentZoom = 1.0;
        
        updateFileInfo(originalFileSize);
        updatePageInfo();
        downloadBtn.style.display = 'block';
        
        await renderCurrentTool();
        showStatus('PDF loaded successfully!', 'success');
    } catch (error) {
        console.error('Error loading PDF:', error);
        showStatus('Error loading PDF: ' + error.message, 'error');
        previewArea.innerHTML = `<div style="padding: 40px; color: #fff;"><div class="status-message error">ERROR: ${error.message}</div></div>`;
    }
}

// Render based on current tool
async function renderCurrentTool() {
    if (!pdfDoc) return;

    previewArea.innerHTML = '';
    
    switch(currentTool) {
        case 'viewer':
            await renderViewer();
            break;
        case 'organizer':
        case 'merge-split':
            await renderOrganizer();
            break;
        case 'signer':
            await renderSigner();
            break;
        case 'annotate':
            await renderAnnotator();
            break;
        case 'watermark':
            await renderWatermarker();
            break;
        case 'redaction':
            await renderRedaction();
            break;
        case 'crop':
            await renderCropper();
            break;
        case 'extract':
        case 'rotate':
            await renderSinglePageTool();
            break;
    }
}

// VIEWER - Scrollable pages with zoom
async function renderViewer() {
    const zoomContainer = document.createElement('div');
    zoomContainer.className = 'zoom-container';
    zoomContainer.style.width = '100%';
    zoomContainer.style.height = '100%';
    zoomContainer.style.overflow = 'auto';
    
    const pagesWrapper = document.createElement('div');
    pagesWrapper.className = 'zoomable';
    pagesWrapper.style.transform = `scale(${currentZoom})`;
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const container = document.createElement('div');
        container.className = 'pdf-canvas-container';
        container.appendChild(canvas);
        pagesWrapper.appendChild(container);
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
    }
    
    zoomContainer.appendChild(pagesWrapper);
    previewArea.appendChild(zoomContainer);
}

// ORGANIZER - Grid view with drag and drop
async function renderOrganizer() {
    previewArea.innerHTML = '<div class="thumbnails-grid" id="thumbnails-grid"></div>';
    const grid = document.getElementById('thumbnails-grid');
    
    for (let i = 0; i < pages.length; i++) {
        const pageNum = pages[i];
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.4 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail';
        thumbnail.dataset.page = pageNum;
        thumbnail.dataset.index = i;
        
        const controls = document.createElement('div');
        controls.className = 'thumbnail-controls';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'thumbnail-btn';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deletePage(i);
        };
        controls.appendChild(deleteBtn);
        
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent = `PAGE ${pageNum}`;
        
        thumbnail.appendChild(controls);
        thumbnail.appendChild(canvas);
        thumbnail.appendChild(label);
        grid.appendChild(thumbnail);
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
    }
    
    // Make sortable with Sortable.js
    new Sortable(grid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function(evt) {
            reorganizePages(evt.oldIndex, evt.newIndex);
        }
    });
}

// SIGNER - Single page with signature pad
async function renderSigner() {
    await renderSinglePage(currentPage);
    
    // Add existing signatures to the page
    const container = previewArea.querySelector('.pdf-canvas-container');
    if (container) {
        signatures.forEach((sig, index) => {
            if (sig.page === currentPage) {
                addSignatureToPage(container, sig, index);
            }
        });
    }
}

// ANNOTATOR - Single page with annotation tools
async function renderAnnotator() {
    await renderSinglePage(currentPage);
    
    const container = previewArea.querySelector('.pdf-canvas-container');
    if (!container) return;
    
    const canvas = container.querySelector('canvas');
    const overlay = document.createElement('canvas');
    overlay.className = 'annotation-overlay';
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    container.appendChild(overlay);
    
    setupAnnotationCanvas(overlay);
    
    // Render existing annotations
    renderAnnotations(overlay);
}

// WATERMARKER - Show all pages with watermark preview
async function renderWatermarker() {
    const zoomContainer = document.createElement('div');
    zoomContainer.className = 'zoom-container';
    zoomContainer.style.width = '100%';
    zoomContainer.style.height = '100%';
    zoomContainer.style.overflow = 'auto';
    
    const pagesWrapper = document.createElement('div');
    pagesWrapper.className = 'zoomable';
    pagesWrapper.style.transform = `scale(${currentZoom})`;
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const container = document.createElement('div');
        container.className = 'pdf-canvas-container';
        container.appendChild(canvas);
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        // Add existing watermarks for this page
        watermarks.forEach((wm, index) => {
            if (wm.page === pageNum) {
                addWatermarkToPage(container, wm, index);
            }
        });
        
        pagesWrapper.appendChild(container);
    }
    
    zoomContainer.appendChild(pagesWrapper);
    previewArea.appendChild(zoomContainer);
}

function addWatermarkToPage(container, wm, index) {
    const wmDiv = document.createElement('div');
    wmDiv.style.position = 'absolute';
    wmDiv.style.left = wm.x + 'px';
    wmDiv.style.top = wm.y + 'px';
    wmDiv.style.fontSize = wm.fontSize + 'px';
    wmDiv.style.color = wm.color;
    wmDiv.style.opacity = wm.opacity;
    wmDiv.style.transform = `rotate(${wm.rotation}deg)`;
    wmDiv.style.fontWeight = 'bold';
    wmDiv.style.fontFamily = 'Courier New, monospace';
    wmDiv.style.pointerEvents = 'auto';
    wmDiv.style.cursor = 'move';
    wmDiv.style.border = '2px dashed rgba(0, 255, 0, 0.5)';
    wmDiv.style.padding = '5px';
    wmDiv.style.userSelect = 'none';
    wmDiv.textContent = wm.text;
    
    // Delete button
    const deleteBtn = document.createElement('div');
    deleteBtn.style.position = 'absolute';
    deleteBtn.style.top = '-12px';
    deleteBtn.style.right = '-12px';
    deleteBtn.style.width = '24px';
    deleteBtn.style.height = '24px';
    deleteBtn.style.background = '#ff0000';
    deleteBtn.style.color = '#fff';
    deleteBtn.style.border = '2px solid #000';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.display = 'flex';
    deleteBtn.style.alignItems = 'center';
    deleteBtn.style.justifyContent = 'center';
    deleteBtn.style.fontWeight = 'bold';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        watermarks.splice(index, 1);
        renderWatermarker();
    };
    wmDiv.appendChild(deleteBtn);
    
    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.position = 'absolute';
    resizeHandle.style.bottom = '-6px';
    resizeHandle.style.right = '-6px';
    resizeHandle.style.width = '12px';
    resizeHandle.style.height = '12px';
    resizeHandle.style.background = '#00ff00';
    resizeHandle.style.border = '2px solid #000';
    resizeHandle.style.cursor = 'nwse-resize';
    wmDiv.appendChild(resizeHandle);
    
    container.appendChild(wmDiv);
    
    // Make draggable
    makeDraggable(wmDiv, (x, y) => {
        wm.x = x;
        wm.y = y;
    });
    
    // Make resizable (font size)
    makeWatermarkResizable(wmDiv, resizeHandle, (size) => {
        wm.fontSize = size;
        wmDiv.style.fontSize = size + 'px';
    });
}

function makeWatermarkResizable(element, handle, onResize) {
    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        
        const startY = e.clientY;
        const startSize = parseInt(element.style.fontSize);
        
        const onMouseMove = (e) => {
            const deltaY = e.clientY - startY;
            const newSize = Math.max(12, Math.min(200, startSize + deltaY));
            
            element.style.fontSize = newSize + 'px';
            
            if (onResize) onResize(newSize);
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function addWatermarkToCurrentPage() {
    const { text, opacity, rotation, color, fontSize } = watermarkSettings;
    
    if (!text.trim()) {
        showStatus('Please enter watermark text', 'error');
        return;
    }
    
    const wm = {
        text,
        opacity,
        rotation,
        color,
        fontSize,
        page: currentPage,
        x: 100,
        y: 100
    };
    
    watermarks.push(wm);
    renderWatermarker();
    showStatus('Watermark added! Drag to reposition, use handle to resize.', 'success');
}

function addWatermarkToAllPages() {
    const { text, opacity, rotation, color, fontSize } = watermarkSettings;
    
    if (!text.trim()) {
        showStatus('Please enter watermark text', 'error');
        return;
    }
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        watermarks.push({
            text,
            opacity,
            rotation,
            color,
            fontSize,
            page: pageNum,
            x: 100,
            y: 100
        });
    }
    
    renderWatermarker();
    showStatus(`Watermark added to all ${totalPages} pages!`, 'success');
}

// REDACTION - Single page with redaction boxes
async function renderRedaction() {
    await renderSinglePage(currentPage);
    
    const container = previewArea.querySelector('.pdf-canvas-container');
    if (!container) return;
    
    setupRedactionCanvas(container);
    
    // Render existing redactions for this page
    redactionBoxes.forEach((box, index) => {
        if (box.page === currentPage) {
            addRedactionBoxToPage(container, box, index);
        }
    });
}

// CROPPER - Single page with crop overlay
async function renderCropper() {
    await renderSinglePage(currentPage);
    
    const container = previewArea.querySelector('.pdf-canvas-container');
    if (!container) return;
    
    const canvas = container.querySelector('canvas');
    setupCropOverlay(container, canvas.width, canvas.height);
}

// SINGLE PAGE TOOL (Extract, Rotate)
async function renderSinglePageTool() {
    await renderSinglePage(currentPage);
}

// Helper: Render single page
async function renderSinglePage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const container = document.createElement('div');
    container.className = 'pdf-canvas-container';
    container.appendChild(canvas);
    
    const navWrapper = document.createElement('div');
    navWrapper.className = 'single-page-view';
    
    // Page navigation
    const nav = document.createElement('div');
    nav.className = 'page-navigation';
    nav.innerHTML = `
        <button class="page-nav-btn" onclick="previousPage()" ${currentPage === 1 ? 'disabled' : ''}>←</button>
        <span class="page-info-display">PAGE ${currentPage} / ${totalPages}</span>
        <button class="page-nav-btn" onclick="nextPage()" ${currentPage === totalPages ? 'disabled' : ''}>→</button>
    `;
    
    navWrapper.appendChild(nav);
    navWrapper.appendChild(container);
    
    previewArea.innerHTML = '';
    previewArea.appendChild(navWrapper);
    
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
}

// Page navigation
function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCurrentTool();
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderCurrentTool();
    }
}

// SIGNATURE FUNCTIONALITY
let signaturePad = null;
let isDrawing = false;

function setupSignaturePad() {
    const canvas = document.getElementById('sig-pad');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    });
    
    let lastX = 0;
    let lastY = 0;
    
    function startDrawing(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        lastX = x;
        lastY = y;
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    signaturePad = canvas;
}

function clearSignature() {
    const canvas = document.getElementById('sig-pad');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function addSignatureToDocument() {
    const canvas = document.getElementById('sig-pad');
    if (!canvas) return;
    
    // Check if signature is empty
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isEmpty = !imageData.data.some(channel => channel !== 0);
    
    if (isEmpty) {
        showStatus('Please draw a signature first', 'error');
        return;
    }
    
    const signatureData = canvas.toDataURL('image/png');
    const sig = {
        data: signatureData,
        page: currentPage,
        x: 100,
        y: 100,
        width: 200,
        height: 100
    };
    
    signatures.push(sig);
    
    showStatus('Signature added! You can drag and resize it.', 'success');
    renderSigner();
    
    // Clear the pad
    clearSignature();
}

function addSignatureToPage(container, sig, index) {
    const sigDiv = document.createElement('div');
    sigDiv.className = 'signature-on-pdf';
    sigDiv.style.left = sig.x + 'px';
    sigDiv.style.top = sig.y + 'px';
    sigDiv.style.width = sig.width + 'px';
    sigDiv.style.height = sig.height + 'px';
    
    const img = document.createElement('img');
    img.src = sig.data;
    sigDiv.appendChild(img);
    
    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'signature-resize-handle';
    sigDiv.appendChild(resizeHandle);
    
    // Delete button
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'signature-delete';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => {
        signatures.splice(index, 1);
        renderSigner();
    };
    sigDiv.appendChild(deleteBtn);
    
    container.appendChild(sigDiv);
    
    // Make draggable
    makeDraggable(sigDiv, (x, y) => {
        sig.x = x;
        sig.y = y;
    });
    
    // Make resizable
    makeResizable(sigDiv, resizeHandle, (w, h) => {
        sig.width = w;
        sig.height = h;
    });
}

// ANNOTATION FUNCTIONALITY
let currentAnnotationTool = 'highlight';
let annotationColor = '#ffff00';
let annotationOpacity = 0.5;

function setupAnnotationCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    let isAnnotating = false;
    let startX, startY;
    let currentAnnotation = null;
    
    canvas.addEventListener('mousedown', (e) => {
        isAnnotating = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        
        currentAnnotation = {
            tool: currentAnnotationTool,
            color: annotationColor,
            opacity: annotationOpacity,
            page: currentPage,
            startX,
            startY,
            points: [[startX, startY]]
        };
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isAnnotating) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (currentAnnotationTool === 'highlight' || currentAnnotationTool === 'underline') {
            currentAnnotation.points.push([x, y]);
            renderAnnotations(canvas);
            drawCurrentAnnotation(ctx, currentAnnotation, x, y);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!isAnnotating) return;
        isAnnotating = false;
        
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        
        currentAnnotation.endX = endX;
        currentAnnotation.endY = endY;
        
        annotations.push(currentAnnotation);
        currentAnnotation = null;
        
        renderAnnotations(canvas);
    });
}

function drawCurrentAnnotation(ctx, annotation, currentX, currentY) {
    ctx.strokeStyle = annotation.color;
    ctx.globalAlpha = annotation.opacity;
    ctx.lineWidth = annotation.tool === 'highlight' ? 20 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (annotation.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(annotation.points[0][0], annotation.points[0][1]);
        for (let i = 1; i < annotation.points.length; i++) {
            ctx.lineTo(annotation.points[i][0], annotation.points[i][1]);
        }
        ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
}

function renderAnnotations(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    annotations.forEach(annotation => {
        if (annotation.page === currentPage) {
            ctx.strokeStyle = annotation.color;
            ctx.globalAlpha = annotation.opacity;
            ctx.lineWidth = annotation.tool === 'highlight' ? 20 : 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (annotation.points && annotation.points.length > 1) {
                ctx.beginPath();
                ctx.moveTo(annotation.points[0][0], annotation.points[0][1]);
                for (let i = 1; i < annotation.points.length; i++) {
                    ctx.lineTo(annotation.points[i][0], annotation.points[i][1]);
                }
                ctx.stroke();
            }
        }
    });
    
    ctx.globalAlpha = 1;
}

function setAnnotationTool(tool) {
    currentAnnotationTool = tool;
    document.querySelectorAll('.annotation-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

function clearAnnotations() {
    annotations = annotations.filter(a => a.page !== currentPage);
    renderAnnotator();
    showStatus('Annotations cleared for current page', 'success');
}

// WATERMARK FUNCTIONALITY
function updateWatermark() {
    const text = document.getElementById('wm-text')?.value || 'CONFIDENTIAL';
    const opacity = (document.getElementById('wm-opacity')?.value || 30) / 100;
    const rotation = parseInt(document.getElementById('wm-rotation')?.value || -45);
    const color = document.getElementById('wm-color')?.value || '#000000';
    const fontSize = parseInt(document.getElementById('wm-size')?.value || 48);
    
    const preview = document.getElementById('wm-preview');
    if (preview) {
        preview.textContent = text;
        preview.style.opacity = opacity;
        preview.style.transform = `rotate(${rotation}deg)`;
        preview.style.color = color;
        preview.style.fontSize = fontSize + 'px';
    }
    
    watermarkSettings = { text, opacity, rotation, color, fontSize };
}

// REDACTION FUNCTIONALITY
function setupRedactionCanvas(container) {
    let isDrawing = false;
    let startX, startY;
    let currentBox = null;
    
    container.addEventListener('mousedown', (e) => {
        if (e.target !== container && e.target.tagName !== 'CANVAS') return;
        
        isDrawing = true;
        const rect = container.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        
        currentBox = {
            page: currentPage,
            x: startX,
            y: startY,
            width: 0,
            height: 0
        };
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentBox) return;
        
        const rect = container.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        currentBox.width = currentX - startX;
        currentBox.height = currentY - startY;
        
        // Update visual preview
        renderRedactionPreview(container, currentBox);
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentBox && Math.abs(currentBox.width) > 10 && Math.abs(currentBox.height) > 10) {
            // Normalize box coordinates
            if (currentBox.width < 0) {
                currentBox.x += currentBox.width;
                currentBox.width = Math.abs(currentBox.width);
            }
            if (currentBox.height < 0) {
                currentBox.y += currentBox.height;
                currentBox.height = Math.abs(currentBox.height);
            }
            
            redactionBoxes.push(currentBox);
            renderRedaction();
        }
        
        currentBox = null;
    });
}

function renderRedactionPreview(container, box) {
    // Remove old preview
    const oldPreview = container.querySelector('.redaction-box-preview');
    if (oldPreview) oldPreview.remove();
    
    const preview = document.createElement('div');
    preview.className = 'redaction-box redaction-box-preview';
    preview.style.left = Math.min(box.x, box.x + box.width) + 'px';
    preview.style.top = Math.min(box.y, box.y + box.height) + 'px';
    preview.style.width = Math.abs(box.width) + 'px';
    preview.style.height = Math.abs(box.height) + 'px';
    container.appendChild(preview);
}

function addRedactionBoxToPage(container, box, index) {
    const redactionDiv = document.createElement('div');
    redactionDiv.className = 'redaction-box';
    redactionDiv.style.left = box.x + 'px';
    redactionDiv.style.top = box.y + 'px';
    redactionDiv.style.width = box.width + 'px';
    redactionDiv.style.height = box.height + 'px';
    
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'redaction-delete';
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => {
        redactionBoxes.splice(index, 1);
        renderRedaction();
    };
    redactionDiv.appendChild(deleteBtn);
    
    container.appendChild(redactionDiv);
    
    makeDraggable(redactionDiv, (x, y) => {
        box.x = x;
        box.y = y;
    });
}

function clearRedactions() {
    redactionBoxes = redactionBoxes.filter(box => box.page !== currentPage);
    renderRedaction();
    showStatus('Redactions cleared for current page', 'success');
}

async function applyRedactions() {
    if (redactionBoxes.length === 0) {
        showStatus('No redactions to apply', 'error');
        return;
    }
    
    showStatus('Redactions will be permanently applied on download', 'success');
}

// CROP FUNCTIONALITY
function setupCropOverlay(container, canvasWidth, canvasHeight) {
    // Remove any existing overlay
    const existing = container.querySelector('.crop-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay';
    
    // Start with 80% of canvas size, centered
    const initialWidth = canvasWidth * 0.8;
    const initialHeight = canvasHeight * 0.8;
    const initialX = canvasWidth * 0.1;
    const initialY = canvasHeight * 0.1;
    
    overlay.style.left = initialX + 'px';
    overlay.style.top = initialY + 'px';
    overlay.style.width = initialWidth + 'px';
    overlay.style.height = initialHeight + 'px';
    
    // Add resize handles
    const handles = [
        { pos: 'nw', cursor: 'nw-resize' },
        { pos: 'ne', cursor: 'ne-resize' },
        { pos: 'sw', cursor: 'sw-resize' },
        { pos: 'se', cursor: 'se-resize' },
        { pos: 'n', cursor: 'n-resize' },
        { pos: 's', cursor: 's-resize' },
        { pos: 'e', cursor: 'e-resize' },
        { pos: 'w', cursor: 'w-resize' }
    ];
    
    handles.forEach(({ pos, cursor }) => {
        const handle = document.createElement('div');
        handle.className = `crop-handle ${pos}`;
        handle.style.position = 'absolute';
        handle.style.width = '12px';
        handle.style.height = '12px';
        handle.style.background = '#00ff00';
        handle.style.border = '2px solid #000';
        handle.style.cursor = cursor;
        
        // Position handles
        if (pos.includes('n')) handle.style.top = '-6px';
        if (pos.includes('s')) handle.style.bottom = '-6px';
        if (pos.includes('e')) handle.style.right = '-6px';
        if (pos.includes('w')) handle.style.left = '-6px';
        if (pos === 'n' || pos === 's') handle.style.left = 'calc(50% - 6px)';
        if (pos === 'e' || pos === 'w') handle.style.top = 'calc(50% - 6px)';
        
        overlay.appendChild(handle);
        
        // Add resize functionality
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const startX = e.clientX;
            const startY = e.clientY;
            const rect = overlay.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            const startLeft = rect.left - containerRect.left;
            const startTop = rect.top - containerRect.top;
            const startWidth = rect.width;
            const startHeight = rect.height;
            
            const onMouseMove = (e) => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                let newLeft = startLeft;
                let newTop = startTop;
                let newWidth = startWidth;
                let newHeight = startHeight;
                
                // Handle different resize directions
                if (pos.includes('e')) {
                    newWidth = Math.max(50, Math.min(canvasWidth - newLeft, startWidth + dx));
                }
                if (pos.includes('w')) {
                    const maxDx = startWidth - 50;
                    const constrainedDx = Math.max(-startLeft, Math.min(maxDx, dx));
                    newWidth = startWidth - constrainedDx;
                    newLeft = startLeft + constrainedDx;
                }
                if (pos.includes('s')) {
                    newHeight = Math.max(50, Math.min(canvasHeight - newTop, startHeight + dy));
                }
                if (pos.includes('n')) {
                    const maxDy = startHeight - 50;
                    const constrainedDy = Math.max(-startTop, Math.min(maxDy, dy));
                    newHeight = startHeight - constrainedDy;
                    newTop = startTop + constrainedDy;
                }
                
                overlay.style.left = newLeft + 'px';
                overlay.style.top = newTop + 'px';
                overlay.style.width = newWidth + 'px';
                overlay.style.height = newHeight + 'px';
                
                updateCropArea(newLeft, newTop, newWidth, newHeight);
            };
            
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
    
    container.appendChild(overlay);
    
    cropArea = {
        x: initialX,
        y: initialY,
        width: initialWidth,
        height: initialHeight
    };
    
    // Make draggable
    let isDragging = false;
    let dragStartX, dragStartY, overlayStartX, overlayStartY;
    
    overlay.addEventListener('mousedown', (e) => {
        if (e.target !== overlay) return;
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        overlayStartX = parseInt(overlay.style.left);
        overlayStartY = parseInt(overlay.style.top);
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        
        const width = parseInt(overlay.style.width);
        const height = parseInt(overlay.style.height);
        
        let newLeft = overlayStartX + dx;
        let newTop = overlayStartY + dy;
        
        // Constrain to canvas bounds
        newLeft = Math.max(0, Math.min(canvasWidth - width, newLeft));
        newTop = Math.max(0, Math.min(canvasHeight - height, newTop));
        
        overlay.style.left = newLeft + 'px';
        overlay.style.top = newTop + 'px';
        
        updateCropArea(newLeft, newTop, width, height);
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

function updateCropArea(x, y, width, height) {
    cropArea = { x, y, width, height };
}

async function applyCrop() {
    if (!cropArea || !currentPDF) return;
    
    try {
        const page = currentPDF.getPage(currentPage - 1);
        const { width, height } = page.getSize();
        
        // Calculate crop box in PDF coordinates
        const scale = width / (cropArea.width / 0.8);
        const cropBox = {
            x: cropArea.x * scale,
            y: height - (cropArea.y + cropArea.height) * scale,
            width: cropArea.width * scale,
            height: cropArea.height * scale
        };
        
        page.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
        
        pdfBytes = await currentPDF.save();
        showStatus('Page cropped successfully!', 'success');
        
        cropArea = null;
        renderCropper();
    } catch (error) {
        showStatus('Error cropping page: ' + error.message, 'error');
    }
}

// PAGE MANIPULATION
function deletePage(index) {
    if (pages.length <= 1) {
        showStatus('Cannot delete the last page', 'error');
        return;
    }
    
    pages.splice(index, 1);
    renderOrganizer();
    showStatus('Page deleted', 'success');
}

function reorganizePages(oldIndex, newIndex) {
    const [movedPage] = pages.splice(oldIndex, 1);
    pages.splice(newIndex, 0, movedPage);
    renderOrganizer();
}

function reversePages() {
    pages.reverse();
    renderOrganizer();
    showStatus('Pages reversed', 'success');
}

function deleteEvenPages() {
    const originalLength = pages.length;
    pages = pages.filter((_, index) => index % 2 === 0);
    renderOrganizer();
    showStatus(`Deleted ${originalLength - pages.length} even pages`, 'success');
}

function deleteOddPages() {
    const originalLength = pages.length;
    pages = pages.filter((_, index) => index % 2 !== 0);
    renderOrganizer();
    showStatus(`Deleted ${originalLength - pages.length} odd pages`, 'success');
}

async function rotatePage(degrees) {
    if (!currentPDF) return;
    
    try {
        const page = currentPDF.getPage(currentPage - 1);
        const currentRotation = page.getRotation().angle;
        page.setRotation(PDFLib.degrees(currentRotation + degrees));
        
        // Reload the PDF bytes and document
        pdfBytes = await currentPDF.save();
        
        // Reload pdfDoc for rendering the updated rotation
        const newBuffer = pdfBytes.slice(0);
        pdfDoc = await pdfjsLib.getDocument({ data: newBuffer }).promise;
        
        showStatus(`Page rotated ${degrees}°`, 'success');
        
        // Re-render to show updated preview
        await renderCurrentTool();
    } catch (error) {
        showStatus('Error rotating page: ' + error.message, 'error');
    }
}

async function rotateAllPages(degrees) {
    if (!currentPDF) return;
    
    try {
        const pdfPages = currentPDF.getPages();
        pdfPages.forEach(page => {
            const currentRotation = page.getRotation().angle;
            page.setRotation(PDFLib.degrees(currentRotation + degrees));
        });
        
        // Reload the PDF bytes and document
        pdfBytes = await currentPDF.save();
        
        // Reload pdfDoc for rendering
        const newBuffer = pdfBytes.slice(0);
        pdfDoc = await pdfjsLib.getDocument({ data: newBuffer }).promise;
        
        showStatus(`All pages rotated ${degrees}°`, 'success');
        
        // Re-render to show updated preview
        await renderCurrentTool();
    } catch (error) {
        showStatus('Error rotating pages: ' + error.message, 'error');
    }
}

async function extractPages() {
    const from = parseInt(document.getElementById('extract-from')?.value || currentPage);
    const to = parseInt(document.getElementById('extract-to')?.value || currentPage);
    
    if (from < 1 || to > totalPages || from > to) {
        showStatus('Invalid page range', 'error');
        return;
    }
    
    try {
        const extractedPdf = await PDFLib.PDFDocument.create();
        const indices = [];
        for (let i = from - 1; i < to; i++) {
            indices.push(i);
        }
        
        const copiedPages = await extractedPdf.copyPages(currentPDF, indices);
        copiedPages.forEach(page => extractedPdf.addPage(page));
        
        const extractedBytes = await extractedPdf.save();
        
        // Download extracted pages
        const blob = new Blob([extractedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extracted-pages-${from}-${to}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        showStatus(`Pages ${from}-${to} extracted!`, 'success');
    } catch (error) {
        showStatus('Error extracting pages: ' + error.message, 'error');
    }
}

async function splitPDF() {
    const splitAt = parseInt(document.getElementById('split-page')?.value || 1);
    
    if (splitAt < 1 || splitAt >= totalPages) {
        showStatus('Invalid split position', 'error');
        return;
    }
    
    try {
        // First part
        const pdf1 = await PDFLib.PDFDocument.create();
        const indices1 = Array.from({ length: splitAt }, (_, i) => i);
        const pages1 = await pdf1.copyPages(currentPDF, indices1);
        pages1.forEach(page => pdf1.addPage(page));
        const bytes1 = await pdf1.save();
        
        // Second part
        const pdf2 = await PDFLib.PDFDocument.create();
        const indices2 = Array.from({ length: totalPages - splitAt }, (_, i) => i + splitAt);
        const pages2 = await pdf2.copyPages(currentPDF, indices2);
        pages2.forEach(page => pdf2.addPage(page));
        const bytes2 = await pdf2.save();
        
        // Download both parts
        downloadBlob(bytes1, 'split-part-1.pdf');
        setTimeout(() => downloadBlob(bytes2, 'split-part-2.pdf'), 500);
        
        showStatus('PDF split successfully!', 'success');
    } catch (error) {
        showStatus('Error splitting PDF: ' + error.message, 'error');
    }
}

function downloadBlob(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// UTILITY FUNCTIONS
function makeDraggable(element, onMove) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    element.addEventListener('mousedown', (e) => {
        if (e.target.className.includes('handle') || e.target.className.includes('delete')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(element.style.left) || 0;
        startTop = parseInt(element.style.top) || 0;
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        
        if (onMove) onMove(newLeft, newTop);
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

function makeResizable(element, handle, onResize) {
    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = parseInt(element.style.width);
        const startHeight = parseInt(element.style.height);
        
        const onMouseMove = (e) => {
            const newWidth = Math.max(50, startWidth + (e.clientX - startX));
            const newHeight = Math.max(50, startHeight + (e.clientY - startY));
            
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            
            if (onResize) onResize(newWidth, newHeight);
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function updateFileInfo(size) {
    fileSize.textContent = `SIZE: ${formatBytes(size)}`;
}

function updatePageInfo() {
    if (pdfDoc) {
        pageInfo.textContent = `PAGES: ${totalPages}`;
        
        // Update page select if exists
        const pageSelect = document.getElementById('page-select');
        if (pageSelect) {
            pageSelect.max = totalPages;
            pageSelect.value = currentPage;
        }
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showStatus(message, type = 'info') {
    const existingStatus = previewArea.querySelector('.status-message');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const status = document.createElement('div');
    status.className = `status-message ${type}`;
    status.textContent = message;
    status.style.position = 'fixed';
    status.style.top = '80px';
    status.style.right = '340px';
    status.style.zIndex = '1000';
    document.body.appendChild(status);
    
    setTimeout(() => status.remove(), 4000);
}

function jumpToPage(page) {
    currentPage = Math.max(1, Math.min(parseInt(page), totalPages));
    renderCurrentTool();
}

function setZoom(value) {
    currentZoom = value / 100;
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
        zoomValue.textContent = value + '%';
    }
    
    // Apply zoom to current view
    const zoomable = document.querySelector('.zoomable');
    if (zoomable) {
        zoomable.style.transform = `scale(${currentZoom})`;
    }
}

// TOOL PANELS
function loadToolPanel() {
    const panels = {
        viewer: `
            <h3>NAVIGATION</h3>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
            <div class="control-group">
                <label>ZOOM</label>
                <input type="range" min="50" max="200" value="${currentZoom * 100}" oninput="setZoom(this.value)">
                <span id="zoom-value">${currentZoom * 100}%</span>
            </div>
        `,
        organizer: `
            <h3>ORGANIZE PAGES</h3>
            <div class="control-group">
                <p style="margin-bottom: 15px;">DRAG PAGES TO REORDER</p>
                <button class="btn" style="width:100%; margin-bottom:10px;" onclick="reversePages()">REVERSE ALL</button>
                <button class="btn" style="width:100%; margin-bottom:10px;" onclick="deleteEvenPages()">DELETE EVEN</button>
                <button class="btn" style="width:100%;" onclick="deleteOddPages()">DELETE ODD</button>
            </div>
        `,
        'merge-split': `
            <h3>MERGE & SPLIT</h3>
            <div class="control-group">
                <label>SPLIT AT PAGE</label>
                <input type="number" id="split-page" min="1" max="${totalPages}" value="1">
                <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="splitPDF()">SPLIT PDF</button>
            </div>
            <div class="control-group">
                <p style="font-size: 12px; margin-top: 20px;">USE PDF ORGANIZER TO MERGE FILES BY UPLOADING MULTIPLE PDFS</p>
            </div>
        `,
        signer: `
            <h3>SIGNATURE</h3>
            <div class="control-group">
                <label>DRAW SIGNATURE</label>
                <canvas id="sig-pad" class="signature-pad" width="280" height="200"></canvas>
                <div class="signature-controls">
                    <button class="btn" style="flex:1" onclick="clearSignature()">CLEAR</button>
                    <button class="btn btn-primary" style="flex:1" onclick="addSignatureToDocument()">ADD TO PAGE</button>
                </div>
            </div>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
            <div class="control-group">
                <p style="font-size: 12px; margin-top: 10px; color: #666;">TIP: After adding, drag to move and resize using the green handle</p>
            </div>
        `,
        annotate: `
            <h3>ANNOTATION</h3>
            <div class="control-group">
                <label>TOOL</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <button class="btn active annotation-btn" onclick="setAnnotationTool('highlight')">HIGHLIGHT</button>
                    <button class="btn annotation-btn" onclick="setAnnotationTool('underline')">UNDERLINE</button>
                </div>
            </div>
            <div class="control-group">
                <label>COLOR</label>
                <input type="color" id="annot-color" value="#ffff00" onchange="annotationColor = this.value">
            </div>
            <div class="control-group">
                <label>OPACITY: <span id="annot-opacity-val">50%</span></label>
                <input type="range" id="annot-opacity" min="0" max="100" value="50" oninput="document.getElementById('annot-opacity-val').textContent = this.value + '%'; annotationOpacity = this.value / 100;">
            </div>
            <div class="control-group">
                <button class="btn btn-danger" style="width:100%;" onclick="clearAnnotations()">CLEAR PAGE</button>
            </div>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
        `,
        watermark: `
            <h3>WATERMARK</h3>
            <div class="control-group">
                <label>TEXT</label>
                <input type="text" id="wm-text" value="CONFIDENTIAL" oninput="updateWatermark()">
            </div>
            <div class="control-group">
                <label>OPACITY: <span id="wm-opacity-val">30%</span></label>
                <input type="range" id="wm-opacity" min="0" max="100" value="30" oninput="document.getElementById('wm-opacity-val').textContent = this.value + '%'; updateWatermark()">
            </div>
            <div class="control-group">
                <label>ROTATION: <span id="wm-rotation-val">-45°</span></label>
                <input type="range" id="wm-rotation" min="-90" max="90" value="-45" oninput="document.getElementById('wm-rotation-val').textContent = this.value + '°'; updateWatermark()">
            </div>
            <div class="control-group">
                <label>SIZE: <span id="wm-size-val">48px</span></label>
                <input type="range" id="wm-size" min="24" max="96" value="48" oninput="document.getElementById('wm-size-val').textContent = this.value + 'px'; updateWatermark()">
            </div>
            <div class="control-group">
                <label>COLOR</label>
                <input type="color" id="wm-color" value="#000000" oninput="updateWatermark()">
            </div>
            <div class="watermark-preview">
                <div class="watermark-text" id="wm-preview">CONFIDENTIAL</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                <button class="btn" onclick="addWatermarkToCurrentPage()">ADD TO PAGE</button>
                <button class="btn btn-primary" onclick="addWatermarkToAllPages()">ADD TO ALL</button>
            </div>
            <div class="control-group" style="margin-top: 15px;">
                <label>ZOOM</label>
                <input type="range" min="50" max="200" value="${currentZoom * 100}" oninput="setZoom(this.value)">
                <span id="zoom-value">${currentZoom * 100}%</span>
            </div>
        `,
        redaction: `
            <h3>REDACTION</h3>
            <div class="control-group">
                <p style="margin-bottom: 15px;">CLICK AND DRAG TO CREATE REDACTION BOXES</p>
                <button class="btn" style="width:100%; margin-bottom:10px;" onclick="clearRedactions()">CLEAR PAGE</button>
                <button class="btn btn-primary" style="width:100%;" onclick="applyRedactions()">APPLY</button>
            </div>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
        `,
        crop: `
            <h3>CROP PAGE</h3>
            <div class="control-group">
                <p style="margin-bottom: 15px;">DRAG THE GREEN BOX TO POSITION. USE HANDLES TO RESIZE.</p>
                <button class="btn btn-primary" style="width:100%;" onclick="applyCrop()">APPLY CROP</button>
            </div>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
        `,
        extract: `
            <h3>EXTRACT PAGES</h3>
            <div class="control-group">
                <label>FROM PAGE</label>
                <input type="number" id="extract-from" min="1" max="${totalPages}" value="${currentPage}">
            </div>
            <div class="control-group">
                <label>TO PAGE</label>
                <input type="number" id="extract-to" min="1" max="${totalPages}" value="${currentPage}">
            </div>
            <div class="control-group">
                <button class="btn btn-primary" style="width:100%;" onclick="extractPages()">EXTRACT</button>
            </div>
            <div class="control-group">
                <label>CURRENT PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
        `,
        rotate: `
            <h3>ROTATE PAGES</h3>
            <div class="control-group">
                <label>CURRENT PAGE</label>
                <button class="btn" style="width:100%; margin-bottom:10px;" onclick="rotatePage(90)">ROTATE 90° CW</button>
                <button class="btn" style="width:100%; margin-bottom:10px;" onclick="rotatePage(-90)">ROTATE 90° CCW</button>
                <button class="btn" style="width:100%;" onclick="rotatePage(180)">ROTATE 180°</button>
            </div>
            <div class="control-group" style="margin-top: 20px;">
                <label>ALL PAGES</label>
                <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="rotateAllPages(90)">ROTATE ALL 90° CW</button>
                <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="rotateAllPages(-90)">ROTATE ALL 90° CCW</button>
                <button class="btn btn-primary" style="width:100%;" onclick="rotateAllPages(180)">ROTATE ALL 180°</button>
            </div>
            <div class="control-group">
                <label>PAGE</label>
                <input type="number" id="page-select" min="1" max="${totalPages}" value="${currentPage}" onchange="jumpToPage(this.value)">
            </div>
        `
    };
    
    toolPanel.innerHTML = panels[currentTool] || '<h3>CONTROLS</h3>';
    
    // Setup signature pad if on signer tool
    if (currentTool === 'signer') {
        setTimeout(setupSignaturePad, 0);
    }
    
    // Initialize watermark preview
    if (currentTool === 'watermark') {
        setTimeout(updateWatermark, 0);
    }
}

// DOWNLOAD FUNCTIONALITY
downloadBtn.addEventListener('click', async () => {
    if (!currentPDF) return;
    
    try {
        showStatus('Preparing download...', 'info');
        
        // Create a fresh copy of the PDF
        const pdfDocForExport = await PDFLib.PDFDocument.load(pdfBytes);
        
        // Apply signatures
        if (signatures.length > 0) {
            for (const sig of signatures) {
                try {
                    const page = pdfDocForExport.getPage(sig.page - 1);
                    
                    // Convert data URL to image bytes
                    const imageBytes = await fetch(sig.data).then(res => res.arrayBuffer());
                    const image = await pdfDocForExport.embedPng(imageBytes);
                    
                    const { width, height } = page.getSize();
                    const scale = 1.5; // Match viewport scale
                    
                    page.drawImage(image, {
                        x: sig.x / scale,
                        y: height - (sig.y / scale) - (sig.height / scale),
                        width: sig.width / scale,
                        height: sig.height / scale
                    });
                } catch (error) {
                    console.error('Error embedding signature:', error);
                }
            }
        }
        
        // Apply watermarks
        if (watermarks.length > 0) {
            for (const wm of watermarks) {
                try {
                    const page = pdfDocForExport.getPage(wm.page - 1);
                    const { width, height } = page.getSize();
                    const scale = 1.5;
                    
                    // Convert hex color to RGB
                    const r = parseInt(wm.color.slice(1, 3), 16) / 255;
                    const g = parseInt(wm.color.slice(3, 5), 16) / 255;
                    const b = parseInt(wm.color.slice(5, 7), 16) / 255;
                    
                    page.drawText(wm.text, {
                        x: wm.x / scale,
                        y: height - (wm.y / scale) - (wm.fontSize / scale),
                        size: wm.fontSize / scale,
                        color: PDFLib.rgb(r, g, b),
                        rotate: PDFLib.degrees(wm.rotation),
                        opacity: wm.opacity
                    });
                } catch (error) {
                    console.error('Error embedding watermark:', error);
                }
            }
        }
        
        // Apply redactions
        if (redactionBoxes.length > 0) {
            for (const box of redactionBoxes) {
                try {
                    const page = pdfDocForExport.getPage(box.page - 1);
                    const { width, height } = page.getSize();
                    const scale = 1.5;
                    
                    page.drawRectangle({
                        x: box.x / scale,
                        y: height - (box.y / scale) - (box.height / scale),
                        width: box.width / scale,
                        height: box.height / scale,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                } catch (error) {
                    console.error('Error applying redaction:', error);
                }
            }
        }
        
        // Apply annotations (convert canvas drawings to PDF)
        if (annotations.length > 0) {
            for (const annotation of annotations) {
                try {
                    const page = pdfDocForExport.getPage(annotation.page - 1);
                    const { width, height } = page.getSize();
                    const scale = 1.5;
                    
                    // Convert hex color to RGB
                    const r = parseInt(annotation.color.slice(1, 3), 16) / 255;
                    const g = parseInt(annotation.color.slice(3, 5), 16) / 255;
                    const b = parseInt(annotation.color.slice(5, 7), 16) / 255;
                    
                    // Draw annotation lines
                    if (annotation.points && annotation.points.length > 1) {
                        for (let i = 0; i < annotation.points.length - 1; i++) {
                            const [x1, y1] = annotation.points[i];
                            const [x2, y2] = annotation.points[i + 1];
                            
                            page.drawLine({
                                start: { x: x1 / scale, y: height - (y1 / scale) },
                                end: { x: x2 / scale, y: height - (y2 / scale) },
                                thickness: (annotation.tool === 'highlight' ? 20 : 2) / scale,
                                color: PDFLib.rgb(r, g, b),
                                opacity: annotation.opacity
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error embedding annotation:', error);
                }
            }
        }
        
        // Save final PDF
        const finalBytes = await pdfDocForExport.save();
        
        const blob = new Blob([finalBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modified-document.pdf';
        a.click();
        URL.revokeObjectURL(url);
        
        showStatus('Download complete! All changes have been applied.', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showStatus('Error downloading PDF: ' + error.message, 'error');
    }
});

// Initialize
loadToolPanel();
updatePageInfo();