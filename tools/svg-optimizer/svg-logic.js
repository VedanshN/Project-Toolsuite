document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const inputArea = document.getElementById('input-svg');
    const outputArea = document.getElementById('output-svg');
    const fileInput = document.getElementById('file-input');
    
    const previewOrig = document.getElementById('preview-original');
    const previewOpt = document.getElementById('preview-optimized');
    
    const statOrig = document.getElementById('stat-original');
    const statOpt = document.getElementById('stat-optimized');

    const btnOptimize = document.getElementById('btn-optimize');
    const btnCopy = document.getElementById('btn-copy');

    // Options
    const optComments = document.getElementById('opt-comments');
    const optMetadata = document.getElementById('opt-metadata');
    const optEmpty = document.getElementById('opt-empty');
    const optMinify = document.getElementById('opt-minify');

    // Event Listeners
    btnOptimize.addEventListener('click', processSVG);
    fileInput.addEventListener('change', handleFileUpload);
    
    btnCopy.addEventListener('click', () => {
        if (!outputArea.value) return;
        navigator.clipboard.writeText(outputArea.value);
        const originalText = btnCopy.innerText;
        btnCopy.innerText = "Copied!";
        setTimeout(() => btnCopy.innerText = originalText, 2000);
    });

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            inputArea.value = event.target.result;
            processSVG();
        };
        reader.readAsText(file);
    }

    function processSVG() {
        const source = inputArea.value.trim();
        if (!source) return;

        // 1. Parse string to DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(source, "image/svg+xml");
        
        // Check for parse errors
        if (doc.querySelector("parsererror")) {
            outputArea.value = "Error: Invalid SVG XML";
            return;
        }

        // 2. Optimization Logic
        
        // Remove Comments
        if (optComments.checked) {
            const walker = document.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
            const comments = [];
            while(walker.nextNode()) comments.push(walker.currentNode);
            comments.forEach(c => c.remove());
        }

        // Remove Metadata tags
        if (optMetadata.checked) {
            const tagsToRemove = ['metadata', 'title', 'desc', 'defs:style']; // Be careful with defs
            tagsToRemove.forEach(tag => {
                const elements = doc.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });
            // Also remove empty defs if created by metadata removal
            doc.querySelectorAll('defs').forEach(d => {
                if (d.childNodes.length === 0) d.remove();
            });
        }

        // Remove Empty Groups <g>
        if (optEmpty.checked) {
            // Run loop twice to catch nested empty groups
            for (let i = 0; i < 2; i++) {
                doc.querySelectorAll('g').forEach(g => {
                    // Check if group has no child elements (ignore whitespace text nodes)
                    const children = Array.from(g.childNodes).filter(n => 
                        n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim().length > 0)
                    );
                    
                    // If no valid children and no critical attributes (like id for linking), remove
                    if (children.length === 0 && !g.hasAttribute('id')) {
                        g.remove();
                    }
                });
            }
        }

        // 3. Serialize back to String
        const serializer = new XMLSerializer();
        let result = serializer.serializeToString(doc);

        // 4. Minification (Regex based)
        if (optMinify.checked) {
            result = result
                .replace(/\n/g, ' ')       // Newlines to space
                .replace(/\s{2,}/g, ' ')   // Multiple spaces to single
                .replace(/>\s+</g, '><')   // Remove space between tags
                .trim();
        }

        // 5. Update UI
        outputArea.value = result;
        
        // Update Stats
        const origSize = new Blob([source]).size;
        const optSize = new Blob([result]).size;
        const saved = origSize - optSize;
        const percent = origSize > 0 ? ((saved / origSize) * 100).toFixed(1) : 0;

        statOrig.innerText = formatBytes(origSize);
        statOpt.innerText = `${formatBytes(optSize)} (Saved ${percent}%)`;

        // Render Previews (inject as Data URI to be safe)
        const encodedOrig = encodeURIComponent(source);
        const encodedOpt = encodeURIComponent(result);
        
        previewOrig.innerHTML = `<img src="data:image/svg+xml,${encodedOrig}" style="max-height:100%; max-width:100%">`;
        previewOpt.innerHTML = `<img src="data:image/svg+xml,${encodedOpt}" style="max-height:100%; max-width:100%">`;
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }
});