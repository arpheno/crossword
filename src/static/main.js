// Vue app configuration
const CrosswordApp = {
    delimiters: ['[[', ']]'],
    data() {
        return {
            crossword: [
                { answer: "BOAT", clue: "What travels on sound waves?", direction: "across", index: 5, x: 0, y: 0 },
                { answer: "CHEST", clue: "Heart's home", direction: "down", index: 9, x: 0, y: 0 }
            ],
            grid: [],
            direction: 'across',
            isChecking: false
        }
    },
    created() {
        // make a request to fetch it from 127.0.0.1:5000/random_crossword/monday
        axios.get('http://127.0.0.1:50001/random_crossword/monday')
            .then(response => {
                this.crossword = response.data;
                this.init();
            })
            .catch(error => {
                console.error("There was an error fetching the crossword data!", error);
            });
    },
    methods: {
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
                if (word.direction === 'across') {
                    for (let i = 0; i < word.answer.length; i++) {
                        const input = this.$refs[`input-${word.y}-${word.x + i}`]?.[0];
                        if (!input) continue;

                        const value = input.value.toLowerCase();
                        const correct = word.answer[i].toLowerCase();

                        if (value === '') {
                            input.classList.remove('red', 'green');
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
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
                        } else if (value === correct) {
                            input.classList.add('green');
                            input.classList.remove('red');
                        } else {
                            input.classList.add('red');
                            input.classList.remove('green');
                        }
                    }
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
        move(rowIndex, cellIndex, direction) {
            const sign = direction === 'forward' ? 1 : -1;
            if (this.direction === 'across' && (cellIndex + 1 * sign < 0 || cellIndex + 1 * sign >= this.grid[0].length)) {
                return;
            } else if (this.direction === 'down' && (rowIndex + 1 * sign < 0 || rowIndex + 1 * sign >= this.grid.length)) {
                return;
            }
            let targetX = cellIndex + sign * (this.direction === 'across');
            let targetY = rowIndex + 1 * sign * (this.direction === 'down');
            let targetCell = this.grid[targetY][targetX]
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
            }
            if (this.isChecking) {
                this.clearChecks();
            }
        },
        clearChecks() {
            this.isChecking = false;
            document.querySelectorAll('.input-cell').forEach(cell => {
                cell.classList.remove('red', 'green');
            });
        }
    }
};

// Initialize Vue app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Vue(CrosswordApp).$mount('#app');
}); 