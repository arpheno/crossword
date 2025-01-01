// Vue app configuration
const CrosswordApp = {
    delimiters: ['[[', ']]'],
    data() {
        return {
            crossword: [],
            grid: [],
            direction: 'across',
            isChecking: false,
            baseUrl: 'http://127.0.0.1:50001',
            completedWords: new Set()  // Track completed words
        }
    },
    created() {
        this.loadCrossword('monday');
    },
    methods: {
        loadCrossword(day) {
            axios.get(`${this.baseUrl}/random_crossword/${day.toLowerCase()}`)
                .then(response => {
                    this.crossword = response.data;
                    this.init();
                })
                .catch(error => {
                    console.error(`Error loading ${day} crossword:`, error);
                });
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
            this.isChecking = true;
            
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
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
                            isWordCorrect = false;
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
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
                            isWordCorrect = false;
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
        }
    }
};

// Initialize Vue app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Vue(CrosswordApp).$mount('#app');
}); 