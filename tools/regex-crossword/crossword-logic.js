const board = document.getElementById('game-board');
const levelSelect = document.getElementById('level-select');
const modal = document.getElementById('victory-modal');

// --- Level Configuration ---
// These levels are manually verified to be solvable.
const verifiedLevels = [
    {
        id: 0, rows: 2, cols: 2,
        name: "1. Tutorial",
        // Solution:
        // H E
        // L P
        // Row 1: HE matches "HE|HI"
        // Row 2: LP matches "LP|LO"
        // Col 1: HL matches "[HL]+" (Any combination of H and L)
        // Col 2: EP matches "[EP]+" (Any combination of E and P)
        rowClues: ["HE|HI", "LP|LO"],
        colClues: ["[HL]+", "[EP]+"] 
    },
    {
        id: 1, rows: 2, cols: 2,
        name: "2. Beginner",
        // Solution:
        // G O
        // O D
        rowClues: ["G[O|A]", "OD|TE"], 
        colClues: ["GO|TO", "OD|AD"] 
    },
    {
        id: 2, rows: 3, cols: 3,
        name: "3. Intermediate",
        // Solution:
        // 1 0 1
        // 0 1 0
        // 1 0 1
        rowClues: ["101", "010", "101"], 
        colClues: ["101", "010", "101"]
    },
    {
        id: 3, rows: 3, cols: 3,
        name: "4. Advanced",
        // Solution:
        // C A T
        // D O G
        // B A T
        rowClues: ["(C|R)AT", "DOG", "B[A-Z]T"],
        colClues: ["[CDB]+", "A.A", "T[G|A]T"] 
    }
];

// State
let currentLevelIdx = 0;

// --- Init ---
levelSelect.addEventListener('change', (e) => {
    currentLevelIdx = parseInt(e.target.value);
    loadLevel();
});

function loadLevel() {
    modal.classList.add('hidden');
    board.innerHTML = '';
    const level = verifiedLevels[currentLevelIdx];

    // Setup Grid Template: Extra row/col for headers
    board.style.gridTemplateColumns = `100px repeat(${level.cols}, 50px)`;
    board.style.gridTemplateRows = `80px repeat(${level.rows}, 50px)`;

    // 1. Top-Left Corner (Empty)
    const corner = document.createElement('div');
    board.appendChild(corner);

    // 2. Column Headers (Top)
    level.colClues.forEach((regex, i) => {
        const div = document.createElement('div');
        div.className = 'clue clue-col';
        div.innerText = `/${regex}/`;
        div.id = `col-clue-${i}`;
        board.appendChild(div);
    });

    // 3. Rows (Loop through rows)
    for (let r = 0; r < level.rows; r++) {
        // Row Header (Left)
        const rowClue = document.createElement('div');
        rowClue.className = 'clue clue-row';
        rowClue.innerText = `/${level.rowClues[r]}/`;
        rowClue.id = `row-clue-${r}`;
        board.appendChild(rowClue);

        // Cells
        for (let c = 0; c < level.cols; c++) {
            const input = document.createElement('input');
            input.className = 'cell';
            input.maxLength = 1;
            input.dataset.r = r;
            input.dataset.c = c;
            
            // Auto-focus next box
            input.addEventListener('input', (e) => {
                validateBoard();
                if(e.target.value && e.target.nextElementSibling && e.target.nextElementSibling.classList.contains('cell')) {
                    e.target.nextElementSibling.focus();
                }
            });
            
            // Backspace navigation
            input.addEventListener('keydown', (e) => {
                if(e.key === 'Backspace' && !e.target.value) {
                     if(e.target.previousElementSibling && e.target.previousElementSibling.classList.contains('cell')) {
                        e.target.previousElementSibling.focus();
                    }
                }
            });

            board.appendChild(input);
        }
    }
    validateBoard();
}

function validateBoard() {
    const level = verifiedLevels[currentLevelIdx];
    let allValid = true;

    // 1. Check Rows
    for (let r = 0; r < level.rows; r++) {
        const clueBox = document.getElementById(`row-clue-${r}`);
        const inputs = document.querySelectorAll(`input[data-r="${r}"]`);
        let str = "";
        inputs.forEach(inp => str += (inp.value || " ").toUpperCase());

        try {
            // Regex check
            const regex = new RegExp(`^${level.rowClues[r]}$`, 'i');
            if (regex.test(str.trim()) && str.length === level.cols) {
                clueBox.classList.add('valid');
                clueBox.classList.remove('invalid');
            } else {
                clueBox.classList.remove('valid');
                // Only mark invalid if user has typed something
                if (str.trim().length === level.cols) clueBox.classList.add('invalid');
                else clueBox.classList.remove('invalid');
                
                allValid = false;
            }
        } catch(e) { console.error("Bad Regex in Level"); }
    }

    // 2. Check Cols
    for (let c = 0; c < level.cols; c++) {
        const clueBox = document.getElementById(`col-clue-${c}`);
        const inputs = document.querySelectorAll(`input[data-c="${c}"]`);
        let str = "";
        inputs.forEach(inp => str += (inp.value || " ").toUpperCase());

        try {
            const regex = new RegExp(`^${level.colClues[c]}$`, 'i');
            if (regex.test(str.trim()) && str.length === level.rows) {
                clueBox.classList.add('valid');
                clueBox.classList.remove('invalid');
            } else {
                clueBox.classList.remove('valid');
                if (str.trim().length === level.rows) clueBox.classList.add('invalid');
                else clueBox.classList.remove('invalid');

                allValid = false;
            }
        } catch(e) {}
    }

    // Check Victory
    const allCells = document.querySelectorAll('.cell');
    let isFilled = true;
    allCells.forEach(cell => { if(!cell.value) isFilled = false; });

    if (allValid && isFilled) {
        showVictory();
    }
}

function showVictory() {
    modal.classList.remove('hidden');
}

function nextLevel() {
    if (currentLevelIdx < verifiedLevels.length - 1) {
        currentLevelIdx++;
        // Update the select dropdown
        levelSelect.value = currentLevelIdx;
        loadLevel();
    } else {
        alert("You have mastered all levels! Great job!");
        modal.classList.add('hidden');
    }
}

function resetLevel() {
    loadLevel();
}

// Start
loadLevel();