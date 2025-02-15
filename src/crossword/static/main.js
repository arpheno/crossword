// Vue app configuration
const CrosswordApp = {
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
            isCachingInProgress: false
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
            const solved = JSON.parse(localStorage.getItem(`solved_${day}`) || '[]');
            return solved.includes(puzzleId);
        },
        markPuzzleSolved(day, puzzleId) {
            const solved = JSON.parse(localStorage.getItem(`solved_${day}`) || '[]');
            if (!solved.includes(puzzleId)) {
                solved.push(puzzleId);
                localStorage.setItem(`solved_${day}`, JSON.stringify(solved));
                this.updateSolvedCounts();
            }
        },
        getPuzzleId(puzzleData) {
            // Create a unique identifier for a puzzle based on its first two clues
            if (!puzzleData || puzzleData.length < 2) return null;
            return `${puzzleData[0].clue}-${puzzleData[0].answer}-${puzzleData[1].clue}`;
        },
        async loadCrossword(day) {
            day = day.toLowerCase();
            
            if (this.isOffline) {
                this.loadCachedCrossword(day);
                return;
            }

            try {
                const response = await axios.get(`${this.baseUrl}/random_crossword/${day}`);
                this.crossword = response.data;
                const puzzleId = this.getPuzzleId(response.data);
                
                // If we've already solved this puzzle, try to get another one
                if (puzzleId && this.isPuzzleSolved(day, puzzleId)) {
                    console.log('Already solved this puzzle, trying another one...');
                    this.loadCrossword(day);
                    return;
                }
                
                // Cache the crossword if we have room
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
        loadCachedCrossword(day) {
            const storageKey = `crosswords_${day}`;
            let puzzles = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            if (puzzles.length === 0) {
                alert(`No cached ${day} crosswords available. Please connect to the internet to download new puzzles.`);
                return;
            }
            
            // Get a random puzzle from cache
            const randomIndex = Math.floor(Math.random() * puzzles.length);
            this.crossword = puzzles[randomIndex];
            
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
        }
    }
};

// Initialize Vue app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Vue(CrosswordApp).$mount('#app');
}); 