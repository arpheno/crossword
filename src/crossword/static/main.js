// Vue app configuration
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
            currentPuzzleMetadata: null // To store metadata of the currently loaded puzzle
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
            if (!puzzleMetadata || !puzzleMetadata.date) return null;
            return puzzleMetadata.date; // e.g., "231026"
        },
        async loadCrossword(day) {
            day = day.toLowerCase();
            this.currentPuzzleMetadata = null; // Reset metadata on new load
            
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
            const puzzleId = this.getPuzzleId(puzzleData);
            
            // Don't cache if we've already solved it
            if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                return;
            }
            
            // Check if we already have this puzzle cached
            const isDuplicate = puzzles.some(p => this.getPuzzleId(p) === puzzleId);
            
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
            this.calculateGridSize();
            this.generateGrid();
            this.placeWords();
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
                } else {
                    // If word was previously marked as complete but is now incorrect, remove it
                    this.completedWords.delete(word.clue);
                }
            });
            
            // If all words are correct, mark the puzzle as solved
            if (allCorrect) {
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
        }
    }
};

// Initialize Vue app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Vue(CrosswordApp).$mount('#app');
}); 