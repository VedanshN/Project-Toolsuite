'use strict';

const imageInput = document.getElementById('imageInput');
const logoInput = document.getElementById('logoInput');
const previewCanvas = document.getElementById('previewCanvas');
const processBtn = document.getElementById('processBtn');
const statusDiv = document.getElementById('status');
const layoutMode = document.getElementById('layoutMode');
const positionSelect = document.getElementById('position');
const opacityInput = document.getElementById('opacity');
const sizeInput = document.getElementById('logoSize');

let images = [];
let logoImg = null;

// Event Listeners for Uploads
document.getElementById('imageDropZone').onclick = () => imageInput.click();
document.getElementById('logoDropZone').onclick = () => logoInput.click();

imageInput.onchange = (e) => {
    images = Array.from(e.target.files);
    document.getElementById('imgLabel').textContent = `${images.length} Images Loaded`;
    updatePreview();
    checkReady();
};

logoInput.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            logoImg = img;
            document.getElementById('logoLabel').textContent = "Logo Loaded Successfully";
            updatePreview();
            checkReady();
        };
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Settings Listeners
[layoutMode, positionSelect, opacityInput, sizeInput].forEach(el => {
    el.oninput = () => {
        document.getElementById('opLabel').textContent = opacityInput.value;
        document.getElementById('sizeLabel').textContent = sizeInput.value + '%';
        updatePreview();
    };
});

function checkReady() {
    processBtn.disabled = !(images.length > 0 && logoImg);
}

function updatePreview() {
    if (images.length === 0) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            renderWatermark(previewCanvas, img, logoImg);
        };
    };
    reader.readAsDataURL(images[0]);
}

function renderWatermark(canvas, baseImg, watermark) {
    const ctx = canvas.getContext('2d');
    canvas.width = baseImg.width;
    canvas.height = baseImg.height;

    // Draw base
    ctx.drawImage(baseImg, 0, 0);

    if (!watermark) return;

    const scale = parseInt(sizeInput.value) / 100;
    const wWidth = canvas.width * scale;
    const wHeight = (watermark.height / watermark.width) * wWidth;
    const margin = canvas.width * 0.02;

    ctx.globalAlpha = parseFloat(opacityInput.value);

    if (layoutMode.value === 'single') {
        let x, y;
        const pos = positionSelect.value;
        if (pos === 'top-left') { x = margin; y = margin; }
        else if (pos === 'top-right') { x = canvas.width - wWidth - margin; y = margin; }
        else if (pos === 'bottom-left') { x = margin; y = canvas.height - wHeight - margin; }
        else if (pos === 'center') { x = (canvas.width - wWidth) / 2; y = (canvas.height - wHeight) / 2; }
        else { x = canvas.width - wWidth - margin; y = canvas.height - wHeight - margin; }
        
        ctx.drawImage(watermark, x, y, wWidth, wHeight);
    } else {
        // Multi-Watermark Mode (Bulk pattern: Top Left, Center, Bottom Right)
        ctx.drawImage(watermark, margin, margin, wWidth, wHeight);
        ctx.drawImage(watermark, (canvas.width - wWidth) / 2, (canvas.height - wHeight) / 2, wWidth, wHeight);
        ctx.drawImage(watermark, canvas.width - wWidth - margin, canvas.height - wHeight - margin, wWidth, wHeight);
    }
    ctx.globalAlpha = 1.0;
}

processBtn.onclick = async () => {
    statusDiv.style.display = 'block';
    statusDiv.textContent = "Processing... Please wait.";
    processBtn.disabled = true;

    const zip = new JSZip();
    const offscreenCanvas = document.createElement('canvas');

    for (let file of images) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    renderWatermark(offscreenCanvas, img, logoImg);
                    offscreenCanvas.toBlob((blob) => {
                        zip.file(`wm_${file.name}`, blob);
                        resolve();
                    }, file.type);
                };
            };
            reader.readAsDataURL(file);
        });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "watermarked_images.zip";
    a.click();
    
    statusDiv.textContent = "Success: All images processed and downloaded.";
    processBtn.disabled = false;
};

document.getElementById('clearBtn').onclick = () => {
    images = [];
    logoImg = null;
    imageInput.value = '';
    logoInput.value = '';
    document.getElementById('imgLabel').textContent = "Step 1: Click to Upload Images";
    document.getElementById('logoLabel').textContent = "Step 2: Upload Logo (Transparent PNG)";
    statusDiv.style.display = 'none';
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    checkReady();
};