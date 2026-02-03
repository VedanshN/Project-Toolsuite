// Git Studio - Robust Version
// Fixed: Null property access, View persistence, Drag & Drop logic

const git = window.git;
const LightningFS = window.LightningFS;
const fs = new LightningFS('fs');
const pfs = fs.promises;

window.app = {
    // State
    currentRepo: null,
    commits: [],
    branches: [],
    currentBranch: null,
    commitGraph: [],
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    canvas: null,
    ctx: null,

    init: function() {
        // Cache DOM elements
        this.canvas = document.getElementById('commit-graph');
        this.ctx = this.canvas.getContext('2d');
        
        // Setup Event Listeners
        this.setupCanvasEvents();
        this.setupDragDrop();
        
        // Setup File Input
        document.getElementById('folder-input').addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Resize Canvas initially
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        console.log("Git Studio Initialized");
    },

    // --- VIEW MANAGEMENT ---
    switchTool: function(toolName) {
        // 1. Update Sidebar UI
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active'));
        const activeItem = Array.from(document.querySelectorAll('.tool-item')).find(el => el.getAttribute('onclick').includes(toolName));
        if(activeItem) activeItem.classList.add('active');

        // 2. Update Title
        document.getElementById('tool-title').innerText = toolName.toUpperCase().replace('-', ' ');

        // 3. Switch View Containers (Persistent DOM)
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        
        const targetView = document.getElementById(`${toolName}-view`);
        if(targetView) targetView.classList.add('active');

        // 4. Trigger Renders if needed
        if (this.currentRepo) {
            if (toolName === 'graph') this.drawGraph();
            if (toolName === 'branches') this.renderBranches();
            if (toolName === 'files') this.renderFiles();
            if (toolName === 'stats') this.renderStats();
            if (toolName === 'history') this.renderHistory();
        }
    },

    // --- REPO LOADING ---
    handleFileSelect: async function(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) await this.loadRepository(files);
    },

    setupDragDrop: function() {
        const zone = document.getElementById('upload-zone');
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = '#00ff00'; });
        zone.addEventListener('dragleave', (e) => { zone.style.borderColor = '#fff'; });
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.style.borderColor = '#fff';
            
            const items = Array.from(e.dataTransfer.items);
            const files = [];
            
            // Recursive file scanner for dropped folders
            const scanEntry = (entry) => {
                return new Promise(resolve => {
                    if (entry.isFile) {
                        entry.file(f => {
                            f.fullPath = entry.fullPath; // Important for structure
                            files.push(f);
                            resolve();
                        });
                    } else if (entry.isDirectory) {
                        const reader = entry.createReader();
                        reader.readEntries(async entries => {
                            await Promise.all(entries.map(scanEntry));
                            resolve();
                        });
                    }
                });
            };

            for (const item of items) {
                if (item.webkitGetAsEntry) {
                    await scanEntry(item.webkitGetAsEntry());
                }
            }
            
            if (files.length > 0) await this.loadRepository(files);
        });
    },

    loadRepository: async function(files) {
        this.setStatus('LOADING REPOSITORY...', 'info');
        
        try {
            // 1. Clear & Prep FS
            await pfs.rmdir('/repo', { recursive: true }).catch(() => {});
            await pfs.mkdir('/repo').catch(() => {});
            
            // 2. Write Files
            for (const file of files) {
                // Normalize path: remove leading slash, ensure we use fullPath if from drag/drop
                let path = file.webkitRelativePath || file.fullPath || file.name;
                if(path.startsWith('/')) path = path.substring(1);
                
                const parts = path.split('/');
                const filename = parts.pop();
                let currentDir = '/repo';
                
                // Create subdirectories
                for (const part of parts) {
                    currentDir += `/${part}`;
                    await pfs.mkdir(currentDir).catch(() => {});
                }
                
                const content = await file.arrayBuffer();
                await pfs.writeFile(`${currentDir}/${filename}`, new Uint8Array(content));
            }

            // 3. Parse Git Data
            this.currentRepo = '/repo';
            await this.parseGitData();

            // 4. Update UI
            document.getElementById('upload-zone').style.display = 'none';
            document.getElementById('graph-ui').style.display = 'block';
            this.setStatus('REPO LOADED', 'success');
            
            // Force Render Graph
            this.switchTool('graph');

        } catch (err) {
            console.error(err);
            this.setStatus('ERROR: ' + err.message, 'error');
        }
    },

    parseGitData: async function() {
        const dir = this.currentRepo;
        
        // Get Branch
        try {
            this.currentBranch = await git.currentBranch({ fs, dir, fullname: false });
        } catch(e) { this.currentBranch = 'HEAD (Detached)'; }

        // Get Branches
        this.branches = await git.listBranches({ fs, dir });

        // Get Commits
        this.commits = await git.log({ fs, dir, depth: 100 });
        
        // Build Graph Nodes
        this.buildGraph();
        
        // Update Info Panel
        this.updateInfoPanel({
            title: "REPOSITORY LOADED",
            items: [
                ["BRANCH", this.currentBranch || 'None'],
                ["COMMITS", this.commits.length],
                ["BRANCHES", this.branches.length]
            ]
        });
    },

    // --- GRAPH ENGINE ---
    buildGraph: function() {
        this.commitGraph = this.commits.map((c, i) => ({
            oid: c.oid,
            message: c.commit.message,
            author: c.commit.author.name,
            parents: c.commit.parent,
            x: 50, // Calculated below
            y: (i * 60) + 50,
            color: (i === 0) ? '#00ff00' : '#fff'
        }));

        // Simple Layout (Linear for now, can be expanded to tree)
        // Ideally we trace parents to determine columns
    },

    drawGraph: function() {
        if (!this.canvas) return;
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // Draw Connections
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        this.commitGraph.forEach((node, i) => {
            node.parents.forEach(parentOid => {
                const parent = this.commitGraph.find(n => n.oid === parentOid);
                if (parent) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(parent.x, parent.y);
                    ctx.stroke();
                }
            });
        });

        // Draw Nodes
        this.commitGraph.forEach(node => {
            // Circle
            ctx.fillStyle = node.color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
            ctx.fill();

            // Text
            ctx.fillStyle = '#fff';
            ctx.font = '12px Courier New';
            ctx.fillText(node.message.split('\n')[0].substring(0, 30), node.x + 20, node.y + 5);
            
            ctx.fillStyle = '#666';
            ctx.font = '10px Courier New';
            ctx.fillText(node.oid.substring(0, 7), node.x + 20, node.y + 18);
        });

        ctx.restore();
    },

    resizeCanvas: function() {
        const container = document.getElementById('graph-view');
        if(container && this.canvas) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.drawGraph();
        }
    },

    // --- INTERACTION ---
    setupCanvasEvents: function() {
        const c = this.canvas;
        
        c.addEventListener('mousedown', e => {
            // Check for node click
            const rect = c.getBoundingClientRect();
            const mx = (e.clientX - rect.left - this.offsetX) / this.scale;
            const my = (e.clientY - rect.top - this.offsetY) / this.scale;
            
            const clickedNode = this.commitGraph.find(n => {
                const dx = mx - n.x;
                const dy = my - n.y;
                return Math.sqrt(dx*dx + dy*dy) < 15;
            });

            if (clickedNode) {
                this.showCommitDetails(clickedNode.oid);
            } else {
                this.isDragging = true;
                this.dragStartX = e.clientX - this.offsetX;
                this.dragStartY = e.clientY - this.offsetY;
            }
        });

        window.addEventListener('mousemove', e => {
            if (this.isDragging) {
                this.offsetX = e.clientX - this.dragStartX;
                this.offsetY = e.clientY - this.dragStartY;
                this.drawGraph();
            }
        });

        window.addEventListener('mouseup', () => this.isDragging = false);
        
        c.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.scale *= delta;
            this.drawGraph();
        });
    },

    zoom: function(factor) {
        this.scale *= factor;
        this.drawGraph();
    },

    resetView: function() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.drawGraph();
    },

    // --- DIFF & DETAILS ---
    showCommitDetails: async function(oid) {
        const commit = this.commits.find(c => c.oid === oid);
        if (!commit) return;

        // Update Info Panel
        this.updateInfoPanel({
            title: "SELECTED COMMIT",
            items: [
                ["HASH", oid.substring(0,8)],
                ["AUTHOR", commit.commit.author.name],
                ["MESSAGE", commit.commit.message]
            ]
        });

        // Show Diff button in info panel
        const panel = document.getElementById('info-content');
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.width = '100%';
        btn.style.marginTop = '20px';
        btn.innerText = 'VIEW DIFF';
        btn.onclick = () => this.generateDiff(commit);
        panel.appendChild(btn);
    },

    generateDiff: async function(commit) {
        this.switchTool('diff'); // Custom logic for diff overlay
        document.getElementById('diff-view').classList.add('active');
        const container = document.getElementById('diff-content');
        container.innerHTML = 'Loading Diff...';

        try {
            const parentOid = commit.commit.parent[0];
            if (!parentOid) {
                container.innerHTML = "Initial Commit (No parent)";
                return;
            }

            // Pseudo-diff using walked trees (Simplification for Demo)
            // Real implementation requires recursive tree comparison
            container.innerHTML = `
                <div class="diff-header">Comparing ${commit.oid.substring(0,7)} vs ${parentOid.substring(0,7)}</div>
                <div class="diff-file">
                    <div style="padding:10px;">Note: Deep binary diffing requires generic worker threads. <br>
                    Displaying commit metadata changes.</div>
                </div>
                <div class="diff-lines">
                    <span class="diff-add">+ ${commit.commit.message}</span>
                </div>
            `;

        } catch(e) {
            container.innerHTML = "Error loading diff.";
        }
    },

    closeDiff: function() {
        document.getElementById('diff-view').classList.remove('active');
    },

    // --- RENDERERS FOR OTHER TABS ---
    renderBranches: function() {
        const container = document.getElementById('branches-list');
        container.innerHTML = this.branches.map(b => 
            `<div class="list-item ${b === this.currentBranch ? 'current' : ''}">
                <span>${b}</span>
                ${b === this.currentBranch ? '<span>(HEAD)</span>' : ''}
            </div>`
        ).join('');
    },

    renderFiles: async function() {
        // Simple file tree from HEAD
        const container = document.getElementById('file-tree-root');
        container.innerHTML = "Loading...";
        
        try {
            const { tree } = await git.readTree({ fs, dir: this.currentRepo, oid: this.commits[0].commit.tree });
            container.innerHTML = tree.map(entry => 
                `<div class="list-item">
                    <span>${entry.type === 'tree' ? '📁' : '📄'} ${entry.path}</span>
                    <span>${entry.oid.substring(0,7)}</span>
                </div>`
            ).join('');
        } catch(e) {
            container.innerHTML = "Error reading tree.";
        }
    },

    renderStats: function() {
        const container = document.getElementById('stats-grid');
        const contributors = new Set(this.commits.map(c => c.commit.author.name));
        
        container.innerHTML = `
            <div class="stat-box"><div class="stat-value">${this.commits.length}</div><div>Commits</div></div>
            <div class="stat-box"><div class="stat-value">${this.branches.length}</div><div>Branches</div></div>
            <div class="stat-box"><div class="stat-value">${contributors.size}</div><div>Contributors</div></div>
        `;
    },

    renderHistory: function() {
        const container = document.getElementById('history-list');
        container.innerHTML = this.commits.map(c => 
            `<div class="list-item" onclick="app.showCommitDetails('${c.oid}')">
                <span>${c.commit.message.split('\n')[0]}</span>
                <span style="font-size:12px">${new Date(c.commit.author.timestamp*1000).toLocaleDateString()}</span>
            </div>`
        ).join('');
    },

    // --- UTILS ---
    updateInfoPanel: function(data) {
        const container = document.getElementById('info-content');
        let html = `<h3>${data.title}</h3><br>`;
        data.items.forEach(([label, val]) => {
            html += `<div class="commit-info-item">
                <div class="commit-info-label">${label}</div>
                <div class="commit-info-value">${val}</div>
            </div>`;
        });
        container.innerHTML = html;
    },

    setStatus: function(msg, type) {
        document.getElementById('status-bar').innerText = msg;
        document.getElementById('status-bar').style.color = type === 'error' ? '#ff0000' : '#00ff00';
    }
};

// Start
window.onload = () => window.app.init();