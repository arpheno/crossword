// import axios from 'axios'; // Remove this import - axios is globally available via script tag

// Vue app configuration
export const CrosswordApp = {
    delimiters: ['[[', ']]'],
    data() {
        return {
            crossword: [],
            grid: [],
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
            currentPuzzleDayCategory: 'monday',
            yearlyHeatmapData: {}, // New structure for yearly heatmaps
            showRawDataModal: false,
            rawPuzzleData: null // To store the full puzzle object {metadata, entries}
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
            if (!puzzleMetadata || !puzzleMetadata.date) {
                console.warn('Invalid puzzle metadata - missing date field');
                return null;
            }
            console.debug(`Generated puzzle ID from metadata: ${puzzleMetadata.date}`);
            return puzzleMetadata.date; // e.g., "231026"
        },
        async loadCrossword(day) {
            day = day.toLowerCase();
            this.currentPuzzleMetadata = null; // Reset metadata on new load
            this.currentPuzzleDayCategory = day; // Store the current day category
            
            if (this.isOffline) {
                this.loadCachedCrossword(day);
                return;
            }

            try {
                const response = await axios.get(`${this.baseUrl}/random_crossword/${day}`);
                // Assuming response.data is now { metadata: {...}, entries: [...] }
                this.currentPuzzleMetadata = response.data.metadata;
                this.crossword = response.data.entries; 
                
                // Use the new metadata for puzzle ID generation
                const puzzleId = this.getPuzzleId(this.currentPuzzleMetadata);
                
                if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                    console.log(`Already solved this puzzle (${puzzleId}), trying another one...`);
                    this.loadCrossword(day); // Try to get another one
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
            const puzzleId = this.getPuzzleId(puzzleData.metadata);
            
            // Don't cache if we've already solved it
            if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                console.log(`[Cache] Puzzle ${puzzleId} for day ${day} is already solved. Not caching.`);
                return;
            }
            
            // Check if we already have this puzzle cached
            const isDuplicate = puzzles.some(p => this.getPuzzleId(p.metadata) === puzzleId);
            
            if (!isDuplicate) {
                console.log(`[Cache] Caching new puzzle ${puzzleId} for day ${day}. Current cache size before add: ${puzzles.length}`);
                puzzles.push(puzzleData);
                if (puzzles.length > 50) {
                    puzzles = puzzles.slice(-50);
                }
                
                try {
                    localStorage.setItem(storageKey, JSON.stringify(puzzles));
                    this.updateCachedCounts();
                    console.log(`[Cache] Successfully cached ${puzzleId}. New count for ${day}: ${this.cachedCrosswordsCount[day]}`);
                } catch (e) {
                    console.error('[Cache] Error caching crossword:', e);
                    // If storage is full, remove the oldest puzzle and try again
                    if (e.name === 'QuotaExceededError') {
                        puzzles.shift(); // Remove the oldest
                        localStorage.setItem(storageKey, JSON.stringify(puzzles));
                        this.updateCachedCounts();
                        console.log(`[Cache] QuotaExceededError: Removed oldest, retried caching. New count for ${day}: ${this.cachedCrosswordsCount[day]}`);
                    }
                }
            } else {
                console.log(`[Cache] Puzzle ${puzzleId} for day ${day} is a duplicate. Not caching.`);
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
            // Clear all input colors when loading new puzzle
            this.grid.forEach((row, y) => {
                row.forEach((_, x) => {
                    const input = this.$refs[`input-${y}-${x}`]?.[0];
                    if (input) {
                        input.classList.remove('red', 'green');
                    }
                });
            });
            this.loadCrossword(day);
        },
        init() {
            this.calculateGridSize();
            this.generateGrid();
            this.placeWords();
        },
        toggle_night_mode() {
            const currentScheme = document.documentElement.style.getPropertyValue('color-scheme');
            if (currentScheme.includes('dark')) {
                document.documentElement.style.setProperty('color-scheme', 'light');
            } else {
                document.documentElement.style.setProperty('color-scheme', 'dark');
            }
        },
        check_all() {
            if (this.isChecking) {
                this.clearChecks();
                return;
            }
            
            this.isChecking = true;
            let allCorrect = true;
            let correctWords = 0;
            let incorrectWords = 0;
            
            this.crossword.forEach(word => {
                let isWordCorrect = true;  // Track if entire word is correct
                
                if (word.direction === 'across') {
                    for (let i = 0; i < word.answer.length; i++) {
                        const input = this.$refs[`input-${word.y}-${word.x + i}`]?.[0];
                        if (!input) continue;

                        const value = input.value.toLowerCase();
                        const correct = word.answer[i].toLowerCase();

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
                        }
                    }
                } else {
                    for (let i = 0; i < word.answer.length; i++) {
                        const input = this.$refs[`input-${word.y + i}-${word.x}`]?.[0];
                        if (!input) continue;

                        const value = input.value.toLowerCase();
                        const correct = word.answer[i].toLowerCase();

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
                        }
                    }
                }
                
                // If word is completely correct, add it to completedWords
                if (isWordCorrect) {
                    this.completedWords.add(word.clue);
                    correctWords++;
                } else {
                    // If word was previously marked as complete but is now incorrect, remove it
                    this.completedWords.delete(word.clue);
                    incorrectWords++;
                }
            });
            
            console.log(`Check results: ${correctWords} words correct, ${incorrectWords} words incorrect`);
            
            // If all words are correct, mark the puzzle as solved
            if (allCorrect) {
                const puzzleId = this.getPuzzleId(this.currentPuzzleMetadata);
                if (puzzleId) {
                    const day = this.getCurrentDay();
                    console.log(`All words correct! Marking puzzle ${puzzleId} as solved for ${day}`);
                    this.markPuzzleSolved(day, puzzleId);
                } else {
                    console.error("Could not get puzzleId from currentPuzzleMetadata in check_all. Puzzle not marked solved.", this.currentPuzzleMetadata);
                }
            } else {
                console.log('Not all words are correct yet. Keep trying!');
            }
        },
        getCurrentDay() {
            // Return the stored day category for the currently loaded puzzle
            return this.currentPuzzleDayCategory || 'monday'; // Fallback to monday if undefined for safety
        },
        find_index(rowIndex, cellIndex) {
            for (const word of this.crossword) {
                if (word.y === rowIndex && cellIndex === word.x) {
                    return word.index;
                }
            }
            return null;
        },
        calculateGridSize() {
            let maxX = 0;
            let maxY = 0;
            this.crossword.forEach(word => {
                if (word.direction === 'across') {
                    maxX = Math.max(maxX, word.x + word.answer.length);
                    maxY = Math.max(maxY, word.y + 1);
                } else {
                    maxX = Math.max(maxX, word.x + 1);
                    maxY = Math.max(maxY, word.y + word.answer.length);
                }
            });
            this.grid = Array(maxY).fill().map(() => Array(maxX).fill(''));
            console.assert(this.grid.length === maxY, 'Grid height is incorrect');
            console.assert(this.grid[0].length === maxX, 'Grid width is incorrect');
        },
        generateGrid() {
            this.grid = this.grid.map(row => row.map(() => null));
        },
        placeWords() {
            this.crossword.forEach(word => {
                if (word.direction === 'across') {
                    for (let i = 0; i < word.answer.length; i++) {
                        this.grid[word.y][word.x + i] = '';
                    }
                } else {
                    for (let i = 0; i < word.answer.length; i++) {
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
            if (word.direction === 'across') {
                for (let i = 0; i < word.answer.length; i++) {
                    const value = this.grid[word.y][word.x + i];
                    answer += (value === null || value === undefined || value === '') ? ' ' : value;
                }
            } else {
                for (let i = 0; i < word.answer.length; i++) {
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
            return answer.trim().length === word.answer.length;
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
        handleCellRightClick(rowIndex, cellIndex) {
            const solution = this.find_solution(rowIndex, cellIndex);
            if (solution) {
                this.grid[rowIndex][cellIndex] = solution.toUpperCase();
                // Optionally, add a class to mark it as revealed and disable further input
                const inputEl = this.$refs[`input-${rowIndex}-${cellIndex}`]?.[0];
                if (inputEl) {
                    inputEl.classList.add('revealed');
                    // inputEl.disabled = true; // Or make it readonly
                }
                this.$forceUpdate(); // Ensure Vue picks up the grid change for display
                 // If isChecking is active, clear current checks as a cell was revealed
                if (this.isChecking) {
                    this.clearChecks();
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
                        const response = await axios.get(`${this.baseUrl}/random_crossword/${day}`);
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
            this.prepareHeatmapData();
            this.showSolvedModal = true;
        },
        closeSolvedModal() {
            this.showSolvedModal = false;
        },
        prepareHeatmapData() {
            console.log("Preparing heatmap data...");
            const allSolvedEntries = [];
            const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            daysOfWeek.forEach(day => {
                const solvedForDay = JSON.parse(localStorage.getItem(`solved_${day}`) || '[]');
                allSolvedEntries.push(...solvedForDay);
            });

            if (allSolvedEntries.length === 0) {
                this.yearlyHeatmapData = {};
                console.log("No solved entries found for heatmap.");
                return;
            }

            const parsePuzzleIDToDate = (idStr) => {
                if (!idStr || typeof idStr !== 'string' || idStr.length !== 6) {
                    console.warn(`Invalid puzzle ID format: ${idStr}`);
                    return null; 
                }
                const year = parseInt("20" + idStr.substring(0, 2)); 
                const month = parseInt(idStr.substring(2, 4)) - 1; // Month is 0-indexed
                const day = parseInt(idStr.substring(4, 6));
                if (isNaN(year) || isNaN(month) || isNaN(day)) {
                    console.warn(`Could not parse date from ID: ${idStr}`);
                    return null;
                }
                return new Date(year, month, day);
            };

            const allSolvedOriginalDates = {}; // Store { isoDateString: puzzleDetails }
            const activeYears = new Set();

            allSolvedEntries.forEach(entry => {
                console.log("[Heatmap Debug] Entry before processing:", JSON.parse(JSON.stringify(entry))); // Log a clone
                const originalDateObj = parsePuzzleIDToDate(entry.id); // entry.id is like "220105"
                if (originalDateObj) {
                    activeYears.add(originalDateObj.getFullYear());
                    const isoDateString = originalDateObj.toISOString().split('T')[0];
                    entry.formattedOriginalDate = originalDateObj.toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                    });
                    allSolvedOriginalDates[isoDateString] = entry;
                    console.log("[Heatmap Debug] Entry after adding formattedOriginalDate:", JSON.parse(JSON.stringify(entry))); // Log a clone
                } else {
                    console.log("[Heatmap Debug] Could not parse date for entry ID:", entry.id);
                }
            });

            const sortedActiveYears = Array.from(activeYears).sort((a, b) => a - b);
            const newYearlyData = {};

            const today = new Date();

            sortedActiveYears.forEach(year => {
                const yearData = {
                    year: year,
                    days: [],
                    monthLabels: [], // Will be static in HTML, but kept for structure if needed later
                    firstDayOffset: 0
                };

                const firstDayOfYear = new Date(year, 0, 1);
                yearData.firstDayOffset = firstDayOfYear.getDay(); // 0 for Sunday, 1 for Monday, etc.

                const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;

                for (let i = 0; i < daysInYear; i++) {
                    const currentDate = new Date(year, 0, i + 1);
                    const dateString = currentDate.toISOString().split('T')[0];
                    const isSolved = !!allSolvedOriginalDates[dateString];
                    let details = null;
                    if (isSolved) {
                        details = allSolvedOriginalDates[dateString];
                        console.log(
                            `[Heatmap Debug] Details for solved date ${dateString}:`,
                            JSON.parse(JSON.stringify(details)), // Log a clone
                            `formattedOriginalDate exists: ${details && details.hasOwnProperty('formattedOriginalDate')}, value: ${details ? details.formattedOriginalDate : 'N/A'}`
                        );
                    }

                    yearData.days.push({
                        date: currentDate,
                        dateString: dateString,
                        isSolved: isSolved,
                        details: details, // This will now include formattedOriginalDate
                        isFuture: currentDate > today
                    });
                }
                newYearlyData[year] = yearData;
            });

            this.yearlyHeatmapData = newYearlyData;
            console.log("Heatmap data prepared:", this.yearlyHeatmapData);
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
        markCurrentPuzzleComplete() {
            if (!this.currentPuzzleMetadata) {
                alert("No puzzle loaded to mark as complete.");
                return;
            }
            const puzzleId = this.getPuzzleId(this.currentPuzzleMetadata);
            const day = this.getCurrentDay();

            if (puzzleId) {
                this.markPuzzleSolved(day, puzzleId); 
                alert(`Puzzle "${this.currentPuzzleMetadata.title || puzzleId}" marked as complete.`);
                // Optionally, load a new puzzle or clear the board
                // For now, just mark as solved. User can click a day to load next.
            } else {
                alert("Could not identify the current puzzle to mark as complete.");
            }
        },
        openRawDataModal() {
            if (!this.currentPuzzleMetadata || !this.crossword) {
                alert("No puzzle data loaded to display.");
                this.rawPuzzleData = null;
                return;
            }
            // Store the full current puzzle data (metadata + entries)
            this.rawPuzzleData = { 
                metadata: this.currentPuzzleMetadata, 
                entries: this.crossword 
            };
            this.showRawDataModal = true;
        },
        closeRawDataModal() {
            this.showRawDataModal = false;
            // this.rawPuzzleData = null; // Clear data when closing if desired
        }
    },
    computed: {
        rawPuzzleDataString() {
            if (!this.rawPuzzleData) {
                return "No data loaded.";
            }
            try {
                return JSON.stringify(this.rawPuzzleData, null, 2);
            } catch (e) {
                console.error("Error stringifying raw puzzle data:", e);
                return "Error displaying data.";
            }
        }
    }
};

// Initialize Vue app when DOM is loaded
// Ensure this only runs in the browser, not during tests
if (typeof document !== 'undefined') { 
    document.addEventListener('DOMContentLoaded', () => {
        new Vue(CrosswordApp).$mount('#app');
    });
} 