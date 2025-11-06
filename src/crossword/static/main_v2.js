// Vue app configuration - V2 with Cell object support
// This version handles cells with formatting: shaded (^), circled (%), rebus (,)
const CrosswordApp = {
    delimiters: ['[[', ']]'],
    data() {
        // Check initial color scheme preference
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        // Set initial scheme if not already set (e.g., by server-side rendering or previous visit)
        if (!document.documentElement.style.getPropertyValue('color-scheme')) {
            document.documentElement.style.setProperty('color-scheme', prefersDark ? 'dark' : 'light');
        }

        return {
            crossword: [],
            grid: [],
            cellMap: new Map(),  // V2: Map of (x,y) -> cell object with formatting
            direction: 'across',
            isChecking: false,
            baseUrl: window.location.origin,
            completedWords: new Set(),  // Track completed words
            isOffline: false,
            cachedCrosswordsCount: {
                monday: 0,
                tuesday: 0,
                wednesday: 0,
                thursday: 0,
                friday: 0
            },
            solvedPuzzlesCount: {
                monday: 0,
                tuesday: 0,
                wednesday: 0,
                thursday: 0,
                friday: 0,
                saturday: 0,
                sunday: 0
            },
            activeCaching: {
                monday: false,
                tuesday: false,
                wednesday: false,
                thursday: false,
                friday: false
            },
            cachingErrors: {
                monday: 0,
                tuesday: 0,
                wednesday: 0,
                thursday: 0,
                friday: 0
            },
            isCachingInProgress: false,
            isDarkMode: document.documentElement.style.getPropertyValue('color-scheme') === 'dark',
            showSolvedModal: false, // For the solved puzzles modal
            solvedPuzzlesList: {},   // To store { day: [id1, id2], ... }
            currentPuzzleMetadata: null, // To store metadata of the currently loaded puzzle
            score: 100, // Starting score
            timer: 0, // Time in seconds
            timerInterval: null, // Timer interval reference
            showFireworks: false, // Display fireworks overlay
            fireworks: [], // Array of active fireworks
            fireworksAnimationId: null // Animation frame ID
        }
    },
    created() {
        // Check online status
        window.addEventListener('online', this.handleOnlineStatus);
        window.addEventListener('offline', this.handleOnlineStatus);
        this.isOffline = !navigator.onLine;

        // Initialize cached counts
        this.updateCachedCounts();

        // Only start caching if we're online and any day needs more puzzles
        if (!this.isOffline) {
            this.checkAndStartCaching();
        }

        this.loadCrossword('monday');
    },
    beforeUnmount() {
        // Clean up timer when component is destroyed
        this.stopTimer();
    },
    methods: {
        async checkAndStartCaching() {
            const needsMore = Object.values(this.cachedCrosswordsCount).some(count => count < 50);
            if (!needsMore || this.isCachingInProgress) return;

            this.isCachingInProgress = true;
            try {
                await this.ensureCachesFilled();
            } finally {
                this.isCachingInProgress = false;
                // Reset all active flags to be sure
                Object.keys(this.activeCaching).forEach(day => {
                    this.activeCaching[day] = false;
                });
            }
        },
        handleOnlineStatus() {
            const wasOffline = this.isOffline;
            this.isOffline = !navigator.onLine;

            // If we just came online, check if we need more puzzles
            if (wasOffline && !this.isOffline) {
                this.checkAndStartCaching();
            }
        },
        updateCachedCounts() {
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
            days.forEach(day => {
                const puzzles = JSON.parse(localStorage.getItem(`crosswords_${day}`) || '[]');
                this.cachedCrosswordsCount[day] = puzzles.length;
            });
        },
        updateSolvedCounts() {
            Object.keys(this.solvedPuzzlesCount).forEach(day => {
                const solved = JSON.parse(localStorage.getItem(`solved_${day}`) || '[]');
                this.solvedPuzzlesCount[day] = solved.length;
            });
        },
        isPuzzleSolved(day, puzzleId) {
            // puzzleId is expected to be metadata.date
            const solvedPuzzles = JSON.parse(localStorage.getItem(`solved_${day}`) || '[]');
            return solvedPuzzles.some(p => p.id === puzzleId);
        },
        markPuzzleSolved(day, puzzleId) {
            // puzzleId is now the metadata.date from the current puzzle
            // We need this.currentPuzzleMetadata to get title and authors
            if (!this.currentPuzzleMetadata || this.currentPuzzleMetadata.date !== puzzleId) {
                console.error("Mismatch or missing metadata when marking puzzle solved.", puzzleId, this.currentPuzzleMetadata);
                return; // Safety check
            }

            const storageKey = `solved_${day}`;
            let solvedPuzzles = JSON.parse(localStorage.getItem(storageKey) || '[]');

            // Check if this puzzle ID already exists
            const existingEntry = solvedPuzzles.find(p => p.id === puzzleId);
            if (!existingEntry) {
                const solvedEntry = {
                    id: puzzleId, // Original puzzle date from NYT
                    title: this.currentPuzzleMetadata.title,
                    authors: this.currentPuzzleMetadata.authors,
                    dayOfWeekSolved: day, // The day category it was solved under (e.g., 'monday')
                    dateSolved: new Date().toISOString() // When the user solved it
                };
                solvedPuzzles.push(solvedEntry);
                localStorage.setItem(storageKey, JSON.stringify(solvedPuzzles));
                this.updateSolvedCounts(); // This might need adjustment if it just counts length
            }
        },
        getPuzzleId(puzzleMetadata) {
            // Use the unique date from metadata as the puzzle ID
            if (!puzzleMetadata || !puzzleMetadata.date) return null;
            return puzzleMetadata.date; // e.g., "231026"
        },
        isValidPuzzle(puzzleData) {
            // Validate that puzzle has required structure and data
            if (!puzzleData) {
                console.error('Puzzle data is null or undefined');
                return false;
            }

            // Check for metadata
            if (!puzzleData.metadata) {
                console.error('Puzzle is missing metadata');
                return false;
            }

            // Check for entries (the actual crossword data)
            if (!puzzleData.entries || !Array.isArray(puzzleData.entries)) {
                console.error('Puzzle is missing entries or entries is not an array');
                return false;
            }

            // Check that entries array is not empty
            if (puzzleData.entries.length === 0) {
                console.error('Puzzle has no entries (empty crossword)');
                return false;
            }

            // Validate that entries have required fields
            const hasValidEntries = puzzleData.entries.every(entry => {
                return entry.hasOwnProperty('clue') &&
                    entry.hasOwnProperty('answer') &&
                    entry.hasOwnProperty('x') &&
                    entry.hasOwnProperty('y') &&
                    entry.hasOwnProperty('direction') &&
                    entry.answer && entry.answer.length > 0;
            });

            if (!hasValidEntries) {
                console.error('Puzzle has invalid entries (missing required fields)');
                return false;
            }

            return true;
        },
        async loadCrossword(day, attempt = 1) {
            day = day.toLowerCase();
            this.currentPuzzleMetadata = null; // Reset metadata on new load

            if (this.isOffline) {
                this.loadCachedCrossword(day);
                return;
            }

            // Safety check to prevent infinite recursion
            if (attempt > 10) {
                alert(`Could not find a valid unsolved ${day} puzzle after multiple attempts. Please try again later or choose a different day.`);
                return;
            }

            try {
                const response = await axios.get(`${this.baseUrl}/new/random_crossword/${day}`);
                // Response includes cells array with formatting
                this.currentPuzzleMetadata = response.data.metadata;
                this.crossword = response.data.entries;

                // Validate puzzle data
                if (!this.isValidPuzzle(response.data)) {
                    console.error('Invalid puzzle received, trying another one...');
                    await this.loadCrossword(day, attempt + 1); // Try to get another one
                    return;
                }

                // Use the new metadata for puzzle ID generation
                const puzzleId = this.getPuzzleId(this.currentPuzzleMetadata);

                if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                    console.log(`Already solved this puzzle (${puzzleId}), trying another one...`);
                    await this.loadCrossword(day, attempt + 1); // Try to get another one
                    return;
                }

                // Cache the whole puzzle object (metadata + entries)
                this.cacheCrossword(day, response.data);

                this.init();
            } catch (error) {
                console.error(`Error loading ${day} crossword:`, error);
                // If fetch fails, try to load from cache
                this.loadCachedCrossword(day);
            }
        },
        cacheCrossword(day, puzzleData) {
            const storageKey = `crosswords_${day}`;
            let puzzles = JSON.parse(localStorage.getItem(storageKey) || '[]');

            // Don't cache invalid puzzles
            if (!this.isValidPuzzle(puzzleData)) {
                console.error('Attempting to cache invalid puzzle, skipping...');
                return;
            }

            const puzzleId = this.getPuzzleId(puzzleData.metadata);

            // Don't cache if we've already solved it
            if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                return;
            }

            // Check if we already have this puzzle cached
            const isDuplicate = puzzles.some(p => this.getPuzzleId(p.metadata) === puzzleId);

            if (!isDuplicate) {
                // Add new puzzle and keep only the latest 50
                puzzles.push(puzzleData);
                if (puzzles.length > 50) {
                    puzzles = puzzles.slice(-50);
                }

                try {
                    localStorage.setItem(storageKey, JSON.stringify(puzzles));
                    this.updateCachedCounts();
                } catch (e) {
                    console.error('Error caching crossword:', e);
                    // If storage is full, remove the oldest puzzle and try again
                    if (e.name === 'QuotaExceededError') {
                        puzzles.shift();
                        localStorage.setItem(storageKey, JSON.stringify(puzzles));
                        this.updateCachedCounts();
                    }
                }
            }
        },
        loadCachedCrossword(day, attempt = 1) { // Add attempt counter for safety
            const storageKey = `crosswords_${day}`;
            let puzzles = JSON.parse(localStorage.getItem(storageKey) || '[]');

            if (puzzles.length === 0) {
                alert(`No cached ${day} crosswords available. Please connect to the internet to download new puzzles.`);
                return;
            }

            if (attempt > puzzles.length + 1 || attempt > 10) { // Safety break for recursion
                alert(`Could not find an unsolved ${day} crossword in the cache.`);
                return;
            }

            // Get a random puzzle index
            const randomIndex = Math.floor(Math.random() * puzzles.length);
            const selectedPuzzle = puzzles[randomIndex]; // This is the full {metadata, entries} object

            // Validate puzzle data
            if (!this.isValidPuzzle(selectedPuzzle)) {
                console.error(`Invalid puzzle in cache for ${day}. Removing and trying another.`);
                // Remove the invalid puzzle from the cached list
                puzzles.splice(randomIndex, 1);
                localStorage.setItem(storageKey, JSON.stringify(puzzles));
                this.updateCachedCounts();
                // Try loading another one from the cache
                this.loadCachedCrossword(day, attempt + 1);
                return;
            }

            // Use metadata for puzzle ID
            const puzzleId = this.getPuzzleId(selectedPuzzle.metadata);

            // Check if this puzzle is already solved
            if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                console.log(`Cached puzzle (${puzzleId}) for ${day} is already solved. Removing and trying another.`);
                // Remove the solved puzzle from the cached list
                puzzles.splice(randomIndex, 1);
                localStorage.setItem(storageKey, JSON.stringify(puzzles));
                this.updateCachedCounts();

                // Try loading another one from the cache
                this.loadCachedCrossword(day, attempt + 1);
                return; // Stop execution for this attempt
            }

            // --- If puzzle is NOT solved, proceed as before ---
            this.currentPuzzleMetadata = selectedPuzzle.metadata; // Set metadata for the loaded puzzle
            this.crossword = selectedPuzzle.entries; // Set entries

            // Remove the used puzzle from cache
            puzzles.splice(randomIndex, 1);
            localStorage.setItem(storageKey, JSON.stringify(puzzles));
            this.updateCachedCounts();

            // If we're online and cache is getting low, fill it up
            if (!this.isOffline && puzzles.length < 25) {
                this.fillCache(day, 50 - puzzles.length);
            }

            this.init();
        },
        handleWeekdayClick(day) {
            // Check if there's any progress in the current puzzle
            const hasProgress = this.grid.some(row =>
                row.some(cell => cell !== null && cell !== '')
            );

            if (hasProgress) {
                if (!confirm('Loading a new puzzle will erase your current progress. Are you sure you want to continue?')) {
                    return; // User clicked Cancel, so don't load new puzzle
                }
            }

            this.isChecking = false;
            this.completedWords.clear(); // Clear completed words when loading new puzzle
            this.loadCrossword(day);
        },
        init() {
            this.buildCellMap();  // V2: Build cell map from crossword entries
            this.calculateGridSize();
            this.generateGrid();
            this.placeWords();
            this.startTimer();
            this.score = 100; // Reset score for new puzzle
        },
        buildCellMap() {
            // V2: Build a map of (x,y) -> cell object with formatting info
            this.cellMap.clear();

            this.crossword.forEach(word => {
                // If word has cells array, use it; otherwise create simple cells
                let cells;
                if (word.cells && word.cells.length > 0) {
                    cells = word.cells;
                } else if (word.clean_answer) {
                    cells = this.createSimpleCells(word.clean_answer);
                } else {
                    cells = this.createSimpleCells(this.cleanAnswer(word.answer));
                }

                cells.forEach((cell, i) => {
                    if (cell.is_black) return;  // Skip black squares

                    const x = word.direction === 'across' ? word.x + i : word.x;
                    const y = word.direction === 'across' ? word.y : word.y + i;
                    const key = `${x},${y}`;

                    if (!this.cellMap.has(key)) {
                        this.cellMap.set(key, {
                            ...cell,
                            x, y,
                            userInput: '',
                            words: []
                        });
                    }

                    // Track which words use this cell
                    this.cellMap.get(key).words.push({
                        wordIndex: word.index,
                        direction: word.direction,
                        positionInWord: i
                    });
                });
            });
            console.log(`CellMap built with ${this.cellMap.size} cells`);
        },
        createSimpleCells(answer) {
            // Helper: create simple cells from answer string (backward compatibility)
            // This should only receive clean answers without special characters
            return answer.split('').map(letter => ({
                letter: letter.toUpperCase(),
                is_circled: false,
                is_shaded: false,
                rebus: null,
                is_black: false  // Should never be black since we pass clean answers
            }));
        },
        startTimer() {
            // Clear existing timer if any
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            // Reset timer to 0
            this.timer = 0;
            // Start new timer
            this.timerInterval = setInterval(() => {
                this.timer++;
            }, 1000);
        },
        stopTimer() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        },
        formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },
        toggle_night_mode() {
            const currentScheme = document.documentElement.style.getPropertyValue('color-scheme');
            if (currentScheme.includes('dark')) {
                document.documentElement.style.setProperty('color-scheme', 'light');
                this.isDarkMode = false;
            } else {
                document.documentElement.style.setProperty('color-scheme', 'dark');
                this.isDarkMode = true;
            }
        },
        check_all() {
            if (this.isChecking) {
                this.clearChecks();
                return;
            }

            this.isChecking = true;
            let allCorrect = true;
            let hasErrors = false; // Track if any incorrect letters found

            this.crossword.forEach(word => {
                let isWordCorrect = true;  // Track if entire word is correct
                const cleanAnswer = this.cleanAnswer(word.answer);

                if (word.direction === 'across') {
                    for (let i = 0; i < cleanAnswer.length; i++) {
                        const input = this.$refs[`input-${word.y}-${word.x + i}`]?.[0];
                        if (!input) continue;

                        const value = input.value.toLowerCase();
                        const correct = cleanAnswer[i].toLowerCase();

                        if (value === '') {
                            input.classList.remove('red', 'green');
                            isWordCorrect = false;
                            allCorrect = false;
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
                            isWordCorrect = false;
                            allCorrect = false;
                            hasErrors = true;
                        }
                    }
                } else {
                    for (let i = 0; i < cleanAnswer.length; i++) {
                        const input = this.$refs[`input-${word.y + i}-${word.x}`]?.[0];
                        if (!input) continue;

                        const value = input.value.toLowerCase();
                        const correct = cleanAnswer[i].toLowerCase();

                        if (value === '') {
                            input.classList.remove('red', 'green');
                            isWordCorrect = false;
                            allCorrect = false;
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
                            isWordCorrect = false;
                            allCorrect = false;
                            hasErrors = true;
                        }
                    }
                }

                // If word is completely correct, add it to completedWords
                if (isWordCorrect) {
                    this.completedWords.add(word.clue);
                } else {
                    // If word was previously marked as complete but is now incorrect, remove it
                    this.completedWords.delete(word.clue);
                }
            });

            // Deduct points if there were errors (but keep score >= 0)
            if (hasErrors) {
                this.score = Math.max(0, this.score - 10);
            }

            // If all words are correct, mark the puzzle as solved
            if (allCorrect) {
                this.stopTimer(); // Stop the timer when puzzle is complete

                // Celebrate with fireworks and sounds!
                this.celebrateCompletion();

                const puzzleId = this.getPuzzleId(this.crossword);
                if (puzzleId) {
                    const day = this.getCurrentDay();
                    this.markPuzzleSolved(day, puzzleId);
                }
            }
        },
        getCurrentDay() {
            // Helper to get current day from the active puzzle
            const firstWord = this.crossword[0];
            if (!firstWord) return 'monday';

            // Try to determine the day based on the puzzle's properties
            // This is a simplified example - you might need to adjust based on your data
            const difficulty = firstWord.answer.length + this.crossword.length;
            if (difficulty < 20) return 'monday';
            if (difficulty < 25) return 'tuesday';
            if (difficulty < 30) return 'wednesday';
            if (difficulty < 35) return 'thursday';
            return 'friday';
        },
        find_index(rowIndex, cellIndex) {
            for (const word of this.crossword) {
                if (word.y === rowIndex && cellIndex === word.x) {
                    return word.index;
                }
            }
            return null;
        },
        // V2: Cell helper methods
        getCell(x, y) {
            return this.cellMap.get(`${x},${y}`);
        },
        getCellClasses(rowIndex, cellIndex) {
            const cell = this.getCell(cellIndex, rowIndex);
            if (!cell) return 'black-cell';

            const classes = [];
            if (cell.is_black) classes.push('black-cell');
            if (cell.is_shaded) classes.push('shaded');
            if (cell.is_circled) classes.push('circled');
            if (cell.rebus && cell.rebus.length > 0) classes.push('rebus');

            return classes.join(' ');
        },
        isRebus(x, y) {
            const cell = this.getCell(x, y);
            return cell && cell.rebus && cell.rebus.length > 0;
        },
        getRebusCount(x, y) {
            const cell = this.getCell(x, y);
            if (!cell || !cell.rebus) return '';
            return cell.rebus.length + 1;  // +1 for primary letter
        },
        calculateGridSize() {
            // Calculate grid dimensions based on word positions
            // V2: Use clean_answer or answer_length from backend, or count non-black cells
            let maxX = 0;
            let maxY = 0;
            this.crossword.forEach(word => {
                // Use backend's clean_answer or answer_length if available, otherwise clean manually
                let wordLength;
                if (word.answer_length) {
                    wordLength = word.answer_length;
                } else if (word.clean_answer) {
                    wordLength = word.clean_answer.length;
                } else if (word.cells) {
                    wordLength = word.cells.filter(c => !c.is_black).length;
                } else {
                    wordLength = this.cleanAnswer(word.answer).length;
                }

                if (word.direction === 'across') {
                    maxX = Math.max(maxX, word.x + wordLength);
                    maxY = Math.max(maxY, word.y + 1);
                } else {
                    maxX = Math.max(maxX, word.x + 1);
                    maxY = Math.max(maxY, word.y + wordLength);
                }
            });
            this.grid = Array(maxY).fill().map(() => Array(maxX).fill(''));
            console.log(`Grid size calculated: ${maxX} x ${maxY}`);
        },
        cleanAnswer(answer) {
            // Remove special characters from answers
            // # and . are black squares
            // ^ are shaded square markers
            // , are rebus square separators
            // % are circled letter markers
            if (typeof answer !== 'string') return answer;
            return answer.replace(/[#.^,%]/g, '');
        },
        generateGrid() {
            this.grid = this.grid.map(row => row.map(() => null));
        },
        placeWords() {
            this.crossword.forEach(word => {
                // V2: Use cells to get actual length, excluding black squares
                let wordLength;
                if (word.answer_length) {
                    wordLength = word.answer_length;
                } else if (word.cells) {
                    wordLength = word.cells.filter(c => !c.is_black).length;
                } else {
                    wordLength = this.cleanAnswer(word.answer).length;
                }

                if (word.direction === 'across') {
                    for (let i = 0; i < wordLength; i++) {
                        this.grid[word.y][word.x + i] = '';
                    }
                } else {
                    for (let i = 0; i < wordLength; i++) {
                        this.grid[word.y + i][word.x] = '';
                    }
                }
            });
        },
        handle_clue_click(event, word) {
            this.direction = word.direction;
            this.$nextTick(() => {
                const input = this.$refs[`input-${word.y}-${word.x}`];
                if (input) {
                    input[0].focus();
                }
            });
        },
        getCurrentAnswer(word) {
            let answer = '';
            const cleanAnswer = this.cleanAnswer(word.answer);

            if (word.direction === 'across') {
                for (let i = 0; i < cleanAnswer.length; i++) {
                    const value = this.grid[word.y][word.x + i];
                    answer += (value === null || value === undefined || value === '') ? ' ' : value;
                }
            } else {
                for (let i = 0; i < cleanAnswer.length; i++) {
                    const value = this.grid[word.y + i][word.x];
                    answer += (value === null || value === undefined || value === '') ? ' ' : value;
                }
            }
            return answer.split('');  // Convert string to array of characters
        },
        find_solution(rowIndex, cellIndex) {
            for (const word of this.crossword) {
                if (word.direction === 'across' && word.y === rowIndex &&
                    cellIndex >= word.x && cellIndex < word.x + word.answer.length) {
                    return word.answer[cellIndex - word.x];
                }
            }
            return null;
        },
        findCurrentWord(rowIndex, cellIndex) {
            for (const word of this.crossword) {
                if (word.direction === this.direction) {
                    if (word.direction === 'across') {
                        if (word.y === rowIndex &&
                            cellIndex >= word.x &&
                            cellIndex < word.x + word.answer.length) {
                            return word;
                        }
                    } else {
                        if (word.x === cellIndex &&
                            rowIndex >= word.y &&
                            rowIndex < word.y + word.answer.length) {
                            return word;
                        }
                    }
                }
            }
            return null;
        },
        findNextWord(currentWord) {
            if (!currentWord) return null;

            // Sort words by clue number for the current direction
            const directionWords = this.crossword
                .filter(w => w.direction === currentWord.direction)
                .sort((a, b) => {
                    // Extract numeric part from clue text
                    const aNum = parseInt(a.clue.split('.')[0]);
                    const bNum = parseInt(b.clue.split('.')[0]);
                    return aNum - bNum;
                });

            // Find the next word
            const currentIndex = directionWords.findIndex(w => w.clue.split('.')[0] === currentWord.clue.split('.')[0]);
            if (currentIndex < directionWords.length - 1) {
                return directionWords[currentIndex + 1];
            }
            return null;
        },
        isWordComplete(word) {
            if (!word) return false;
            const answer = this.getCurrentAnswer(word).join('');
            const cleanAnswer = this.cleanAnswer(word.answer);
            return answer.trim().length === cleanAnswer.length;
        },
        move(rowIndex, cellIndex, direction) {
            const sign = direction === 'forward' ? 1 : -1;
            const currentWord = this.findCurrentWord(rowIndex, cellIndex);

            // Check if we're at the end of a word or about to hit a black square
            if (currentWord && direction === 'forward') {
                const nextCell = this.direction === 'across' ?
                    this.grid[rowIndex]?.[cellIndex + 1] :
                    this.grid[rowIndex + 1]?.[cellIndex];

                const isLastCell = (this.direction === 'across' &&
                    cellIndex === currentWord.x + currentWord.answer.length - 1) ||
                    (this.direction === 'down' &&
                        rowIndex === currentWord.y + currentWord.answer.length - 1);

                const isBlackSquareNext = nextCell === null;

                if ((isLastCell || isBlackSquareNext) && this.isWordComplete(currentWord)) {
                    const nextWord = this.findNextWord(currentWord);
                    if (nextWord) {
                        this.$nextTick(() => {
                            const nextInput = this.$refs[`input-${nextWord.y}-${nextWord.x}`];
                            if (nextInput) {
                                nextInput[0].focus();
                                return;
                            }
                        });
                        return;
                    }
                }
            }

            // Existing movement logic
            if (this.direction === 'across' && (cellIndex + 1 * sign < 0 || cellIndex + 1 * sign >= this.grid[0].length)) {
                return;
            } else if (this.direction === 'down' && (rowIndex + 1 * sign < 0 || rowIndex + 1 * sign >= this.grid.length)) {
                return;
            }
            let targetX = cellIndex + sign * (this.direction === 'across');
            let targetY = rowIndex + sign * (this.direction === 'down');
            let targetCell = this.grid[targetY][targetX];
            if (targetCell !== null) {
                this.$nextTick(() => {
                    const nextInput = this.$refs[`input-${targetY}-${targetX}`];
                    if (nextInput) {
                        nextInput[0].focus();
                    }
                });
            } else {
                this.move(targetY, targetX, direction);
            }
        },
        handle_crossword_cell_keydown(event, rowIndex, cellIndex) {
            if (event.key === "ArrowRight") {
                if (this.direction === 'across')
                    this.move(rowIndex, cellIndex, 'forward');
                else
                    this.direction = 'across';
            } else if (event.key === "ArrowLeft") {
                if (this.direction === 'across')
                    this.move(rowIndex, cellIndex, 'backward');
                else
                    this.direction = 'across';
            } else if (event.key === "ArrowDown") {
                if (this.direction === 'down')
                    this.move(rowIndex, cellIndex, 'forward');
                else
                    this.direction = 'down';
            } else if (event.key === "ArrowUp") {
                if (this.direction === 'down')
                    this.move(rowIndex, cellIndex, 'backward');
                else
                    this.direction = 'down';
            } else if (event.key === "Backspace") {
                this.grid[rowIndex][cellIndex] = '';
                this.$forceUpdate();
                event.preventDefault();
                this.move(rowIndex, cellIndex, 'backward');
            } else if (event.key.length === 1 && /^[a-zA-Z]$/.test(event.key)) {
                this.grid[rowIndex][cellIndex] = event.key.toUpperCase();
                this.$forceUpdate();
                event.preventDefault();
                this.move(rowIndex, cellIndex, 'forward');
                if (this.isChecking) {
                    this.clearChecks();
                }
            }
        },
        handle_crossword_cell_contextmenu(event, rowIndex, cellIndex) {
            event.preventDefault(); // Prevent the default context menu from appearing

            // Only reveal if the cell is empty
            const currentValue = this.grid[rowIndex][cellIndex];
            if (currentValue === '' || currentValue === null || currentValue === undefined) {
                // Find the correct letter for this cell
                const correctLetter = this.find_solution(rowIndex, cellIndex);
                if (correctLetter) {
                    this.grid[rowIndex][cellIndex] = correctLetter.toUpperCase();
                    this.$forceUpdate();

                    // Deduct points for revealing a letter (but keep score >= 0)
                    this.score = Math.max(0, this.score - 20);

                    // Clear any check marks if they're showing
                    if (this.isChecking) {
                        this.clearChecks();
                    }
                }
            }
        },
        clearChecks() {
            this.isChecking = false;
            document.querySelectorAll('.grid-cell input').forEach(input => {
                input.classList.remove('red', 'green');
            });
        },
        async fillCache(day, count) {
            // Don't start caching if we already have 50 puzzles
            const currentCount = this.cachedCrosswordsCount[day];
            if (currentCount >= 50 || this.activeCaching[day] || this.cachingErrors[day] > 3) {
                return;
            }

            this.activeCaching[day] = true;
            let successfulCaches = 0;

            try {
                for (let i = 0; i < count && this.cachedCrosswordsCount[day] < 50; i++) {
                    try {
                        const response = await axios.get(`${this.baseUrl}/new/random_crossword/${day}`);
                        await this.cacheCrossword(day, response.data);
                        successfulCaches++;
                        this.cachingErrors[day] = 0;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.error(`Error caching ${day} crossword:`, error);
                        this.cachingErrors[day]++;
                        if (this.cachingErrors[day] > 3) break;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } finally {
                this.activeCaching[day] = false;

                // Only retry if we need more and haven't hit error limit
                if (this.cachedCrosswordsCount[day] < 50 &&
                    successfulCaches > 0 &&
                    this.cachingErrors[day] <= 3 &&
                    !this.isOffline) {
                    setTimeout(() => this.checkAndStartCaching(), 5000);
                }
            }
        },
        async ensureCachesFilled() {
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
            let needsCaching = false;

            // First check if any days need caching
            for (const day of days) {
                if (this.cachedCrosswordsCount[day] < 50 && this.cachingErrors[day] <= 3) {
                    needsCaching = true;
                    break;
                }
            }

            // If no days need caching, don't proceed
            if (!needsCaching) return;

            // Otherwise, start caching for days that need it
            for (const day of days) {
                if (this.cachedCrosswordsCount[day] < 50 && this.cachingErrors[day] <= 3) {
                    await this.fillCache(day, 50 - this.cachedCrosswordsCount[day]);
                }
            }
        },
        // New methods for solved puzzles modal
        openSolvedModal() {
            this.populateSolvedPuzzlesList();
            this.showSolvedModal = true;
        },
        closeSolvedModal() {
            this.showSolvedModal = false;
        },
        populateSolvedPuzzlesList() {
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            const allSolvedCleaned = {};
            let cleanupOccurred = false;

            days.forEach(day => {
                const storageKey = `solved_${day}`;
                const solvedForDayRaw = JSON.parse(localStorage.getItem(storageKey) || '[]');

                // Filter out legacy string IDs, keeping only objects
                const solvedForDayCleaned = solvedForDayRaw.filter(entry => {
                    return typeof entry === 'object' && entry !== null && entry.id !== undefined;
                });

                // If cleanup happened for this day, update localStorage
                if (solvedForDayCleaned.length !== solvedForDayRaw.length) {
                    localStorage.setItem(storageKey, JSON.stringify(solvedForDayCleaned));
                    cleanupOccurred = true;
                    console.log(`Cleaned up legacy solved puzzle IDs for ${day}.`);
                }

                allSolvedCleaned[day] = solvedForDayCleaned;
            });

            this.solvedPuzzlesList = allSolvedCleaned;

            if (cleanupOccurred) {
                this.updateSolvedCounts(); // Update counts if any legacy data was removed
            }
        },

        // Export/Import functionality
        exportUserData() {
            try {
                const exportData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    data: {}
                };

                // Export cached crosswords
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
                days.forEach(day => {
                    const cachedCrosswords = localStorage.getItem(`crosswords_${day}`);
                    if (cachedCrosswords) {
                        exportData.data[`crosswords_${day}`] = JSON.parse(cachedCrosswords);
                    }
                });

                // Export solved puzzles
                const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                allDays.forEach(day => {
                    const solvedPuzzles = localStorage.getItem(`solved_${day}`);
                    if (solvedPuzzles) {
                        exportData.data[`solved_${day}`] = JSON.parse(solvedPuzzles);
                    }
                });

                // Export theme preference
                const colorScheme = document.documentElement.style.getPropertyValue('color-scheme');
                if (colorScheme) {
                    exportData.data.colorScheme = colorScheme;
                }

                // Create and download the file
                const dataStr = JSON.stringify(exportData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);

                const link = document.createElement('a');
                link.href = url;
                link.download = `crossword-data-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                URL.revokeObjectURL(url);

                alert('Your crossword data has been exported successfully!');
            } catch (error) {
                console.error('Error exporting data:', error);
                alert('Error exporting data. Please try again.');
            }
        },

        importUserData() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importData = JSON.parse(e.target.result);

                        // Validate the import format
                        if (!importData.version || !importData.data) {
                            throw new Error('Invalid file format');
                        }

                        // Confirm import with user
                        const confirmMessage = `This will replace your current data with data from ${importData.exportDate ? new Date(importData.exportDate).toLocaleDateString() : 'unknown date'}. Are you sure you want to continue?`;
                        if (!confirm(confirmMessage)) {
                            return;
                        }

                        // Import the data
                        Object.keys(importData.data).forEach(key => {
                            if (key === 'colorScheme') {
                                // Handle theme preference
                                document.documentElement.style.setProperty('color-scheme', importData.data[key]);
                                this.isDarkMode = importData.data[key] === 'dark';
                            } else {
                                // Handle localStorage data
                                localStorage.setItem(key, JSON.stringify(importData.data[key]));
                            }
                        });

                        // Update counts and UI
                        this.updateCachedCounts();
                        this.updateSolvedCounts();

                        alert('Your data has been imported successfully!');

                        // Optionally reload the current puzzle to reflect any changes
                        if (this.crossword.length > 0) {
                            location.reload();
                        }

                    } catch (error) {
                        console.error('Error importing data:', error);
                        alert('Error importing data. Please check that you selected a valid crossword export file.');
                    }
                };
                reader.readAsText(file);
            };

            input.click();
        },

        clearAllData() {
            const confirmMessage = 'This will permanently delete all your cached puzzles, solved puzzle history, and reset your settings. This action cannot be undone. Are you sure you want to continue?';
            if (!confirm(confirmMessage)) {
                return;
            }

            const secondConfirm = 'Are you absolutely sure? This will erase everything and cannot be undone.';
            if (!confirm(secondConfirm)) {
                return;
            }

            try {
                // Clear all crossword-related localStorage
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                days.forEach(day => {
                    localStorage.removeItem(`crosswords_${day}`);
                    localStorage.removeItem(`solved_${day}`);
                });

                // Reset theme to default
                document.documentElement.style.setProperty('color-scheme', 'light');
                this.isDarkMode = false;

                // Update counts
                this.updateCachedCounts();
                this.updateSolvedCounts();

                // Clear current puzzle
                this.crossword = [];
                this.grid = [];
                this.completedWords.clear();
                this.currentPuzzleMetadata = null;

                alert('All data has been cleared successfully.');

            } catch (error) {
                console.error('Error clearing data:', error);
                alert('Error clearing data. Please try again.');
            }
        },

        // Celebration and Fireworks Methods
        celebrateCompletion() {
            // Determine celebration level based on score
            let celebrationLevel = 'basic';
            let fireworkCount = 3;
            let soundCount = 1;

            if (this.score >= 90) {
                celebrationLevel = 'spectacular';
                fireworkCount = 20;
                soundCount = 5;
            } else if (this.score >= 70) {
                celebrationLevel = 'great';
                fireworkCount = 12;
                soundCount = 3;
            } else if (this.score >= 50) {
                celebrationLevel = 'good';
                fireworkCount = 7;
                soundCount = 2;
            }

            console.log(`Celebrating with ${celebrationLevel} level! Score: ${this.score}`);

            // Show fireworks
            this.showFireworks = true;
            this.launchFireworksSequence(fireworkCount);

            // Play sounds
            this.playCelebrationSounds(soundCount, celebrationLevel);

            // Auto-hide after celebration
            setTimeout(() => {
                this.stopFireworks();
            }, celebrationLevel === 'spectacular' ? 8000 : celebrationLevel === 'great' ? 6000 : 4000);
        },

        launchFireworksSequence(count) {
            const canvas = document.getElementById('fireworks-canvas');
            if (!canvas) return;

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');

            this.fireworks = [];

            // Launch fireworks with delays
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.launchFirework(canvas);
                }, i * (3000 / count)); // Spread launches over 3 seconds
            }

            // Start animation loop
            this.animateFireworks(canvas, ctx);
        },

        launchFirework(canvas) {
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#ff0088'];
            const firework = {
                x: Math.random() * canvas.width,
                y: canvas.height,
                targetY: Math.random() * canvas.height * 0.5 + 50,
                color: colors[Math.floor(Math.random() * colors.length)],
                phase: 'launch',
                particles: []
            };
            this.fireworks.push(firework);
        },

        animateFireworks(canvas, ctx) {
            if (!this.showFireworks) return;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            this.fireworks = this.fireworks.filter(firework => {
                if (firework.phase === 'launch') {
                    // Launch phase - rocket going up
                    firework.y -= 5;
                    ctx.fillStyle = firework.color;
                    ctx.beginPath();
                    ctx.arc(firework.x, firework.y, 3, 0, Math.PI * 2);
                    ctx.fill();

                    // Check if reached target
                    if (firework.y <= firework.targetY) {
                        firework.phase = 'explode';
                        this.createExplosion(firework);
                    }
                    return true;
                } else if (firework.phase === 'explode') {
                    // Explosion phase
                    let aliveParticles = 0;
                    firework.particles.forEach(particle => {
                        if (particle.life > 0) {
                            particle.x += particle.vx;
                            particle.y += particle.vy;
                            particle.vy += 0.1; // Gravity
                            particle.life -= 1;

                            ctx.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${particle.life / 100})`;
                            ctx.beginPath();
                            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                            ctx.fill();

                            aliveParticles++;
                        }
                    });
                    return aliveParticles > 0;
                }
                return false;
            });

            this.fireworksAnimationId = requestAnimationFrame(() => this.animateFireworks(canvas, ctx));
        },

        createExplosion(firework) {
            const particleCount = 50 + Math.random() * 50;
            const color = this.hexToRgb(firework.color);

            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const velocity = 2 + Math.random() * 3;

                firework.particles.push({
                    x: firework.x,
                    y: firework.y,
                    vx: Math.cos(angle) * velocity,
                    vy: Math.sin(angle) * velocity,
                    r: color.r,
                    g: color.g,
                    b: color.b,
                    life: 100,
                    size: 2 + Math.random() * 2
                });
            }
        },

        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        },

        stopFireworks() {
            this.showFireworks = false;
            this.fireworks = [];
            if (this.fireworksAnimationId) {
                cancelAnimationFrame(this.fireworksAnimationId);
                this.fireworksAnimationId = null;
            }
        },

        playCelebrationSounds(count, level) {
            // Create AudioContext for sound generation
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const audioContext = new AudioContext();

            // Play multiple ascending tones
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.playVictoryTone(audioContext, i, level);
                }, i * 300);
            }

            // Grand finale sound for spectacular
            if (level === 'spectacular') {
                setTimeout(() => {
                    this.playGrandFinale(audioContext);
                }, count * 300 + 200);
            }
        },

        playVictoryTone(audioContext, index, level) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Ascending scale frequencies
            const frequencies = [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50];
            oscillator.frequency.value = frequencies[index % frequencies.length];
            oscillator.type = level === 'spectacular' ? 'sine' : 'triangle';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        },

        playGrandFinale(audioContext) {
            // Play a triumphant chord
            const frequencies = [523.25, 659.25, 783.99]; // C major chord

            frequencies.forEach((freq, i) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = freq;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 1.5);
            });
        }
    }
};

// Initialize Vue app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Vue(CrosswordApp).$mount('#app');
}); 