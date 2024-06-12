//write af unciton that strips the last column ,and last row
function unpadCrossword(crossword) {
    // Split the crossword into rows
    const rows = crossword.split('\n');
    // Remove the last row
    rows.pop();
    // Remove the last column from each remaining row
    const updatedRows = rows.map(row => row.slice(0, -1));
    // Join the rows back into a single string
    const updatedCrossword = updatedRows.join('\n');
    return updatedCrossword;
}

function padCrossword(crossword) {
    const lines = crossword.split('\n')
    const padded = lines.map(line => `#${line}#`)
    padded.unshift('#'.repeat(padded[0].length))
    padded.push('#'.repeat(padded[0].length))
    return padded.join('\n')
}
function findHashes(grid) {
    return grid.filter(([char, _]) => char === '#')
}

// write a function that returns a set of coordinates
// were going to calculate the cooridnates by taking all the coordinates of the # characters e.g. (x,y)
// we want to add (x+1,y), (x,y+1) to the result set
function findNeighbors(hashes) {
    const result = new Set()
    for (const [symbol, [x, y]] of hashes) {
        result.add([x + 1, y])
        result.add([x, y + 1])
    }
    return result
}

/**
 * Generate a random date between the given start and end dates.
 * @param {Date} start - The start date.
 * @param {Date} end - The end date.
 * @returns {Date} - A random date between start and end.
 */
function getRandomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
/**
 * Adjust the given date to the nearest specified weekday.
 * @param {Date} date - The original date.
 * @param {number} targetDay - The target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 * @returns {Date} - The adjusted date.
 */
function adjustToWeekday(date, targetDay) {
    const dayOfWeek = date.getDay();
    const difference = (targetDay - dayOfWeek + 7) % 7; // Calculate the difference to the next targetDay
    date.setDate(date.getDate() + difference);
    return date;
}

/**
 * Format a date to YYMMDD.
 * @param {Date} date - The date to format.
 * @returns {string} - The formatted date string.
 */
function formatDateToYYMMDD(date) {
    const year = date.getFullYear().toString().slice(-2); // Last two digits of year
    const month = ('0' + (date.getMonth() + 1)).slice(-2); // Two digit month
    const day = ('0' + date.getDate()).slice(-2); // Two digit day
    return `${year}${month}${day}`;
}

/**
 * Get a random date adjusted to the specified weekday between the given date range.
 * @param {Date} startDate - The start date.
 * @param {Date} endDate - The end date.
 * @param {number} weekday - The target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 * @returns {string} - The formatted date string in YYMMDD.
 */
function getRandomWeekdayDate(startDate, endDate, weekday) {
    let randomDate = getRandomDate(startDate, endDate);
    randomDate = adjustToWeekday(randomDate, weekday);
    return formatDateToYYMMDD(randomDate);
}
/**
 * ndenumerate - Enumerate over a 2d string
 *
 * Example:
 * ndenumerate('abc\ndef\nghi') =>
 * [['a', [0, 0]], ['b', [1, 0]], ['c', [2, 0]], ['d', [0, 1]], ['e', [1, 1]],
 * ['f', [2, 1]], ['g', [0, 2]], ['h', [1, 2]], ['i', [2, 2]]]
 * @param {string} crossword
 * @returns {Array<[string, [number, number]]>}
 */
function ndenumerate(crossword) {
    const lines = crossword.split('\n')
    const result = []
    for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) {
            result.push([lines[y][x], [x, y]])
        }
    }
    return result
}
// write a function that takes a list of functions and applies it to the crossword
function chain(crossword, functions) {
    let result = crossword
    for (const func of functions) {
        result = func(result)
    }
    return result
}

function enumerate(iterable) {
    return iterable.map((item, index) => [index + 1, item])
}
// zip the starting locations with the hints
function zip(starting_locations, hints) {
    return starting_locations.map((location, index) => [location, hints[index]])
}
print = console.log

// write a function that filters the output of ndenumerete to only contain # characters
// create a cell class
class Cell {
    // i want the actual cell as a property, along with x, y coordinates
    constructor(cell, x, y) {
        this.cell = cell; // cell should be a dom element
        this.x = x;
        this.y = y;
    }

    //function isblack that returns true if the cell is black
    isBlack() {
        return this.cell.classList.contains('black-cell');
    }

    //function that returns the contenteditable div inside the cell
    getEditable() {
        return this.cell.querySelector('.input-cell');
    }

}

function setupUnfocusingForCrossword() {
    const allCells = document.querySelectorAll('.cell');
    const sideLength = Math.sqrt(allCells.length);
    const grid = [];

    allCells.forEach((cell, index) => {
        const x = index % sideLength;
        const y = Math.floor(index / sideLength);

        if (!grid[y]) {
            grid[y] = [];
        }
        grid[y].push(new Cell(cell, x, y));
    });

    grid.forEach(row => {
        row.forEach(cellObj => {
            if (!cellObj.isBlack()) {
                const editableCell = cellObj.getEditable();
                editableCell.addEventListener('keydown', event => handleKeydown(event, cellObj, grid));
            }
        });
    });
}

function handleKeydown(event, cellObj, grid) {
    const keyActions = {
        Backspace: () => handleBackspace(event, cellObj, grid),
        ArrowRight: () => handleArrowKey(event, cellObj, grid, 'ArrowRight'),
        ArrowLeft: () => handleArrowKey(event, cellObj, grid, 'ArrowLeft'),
        ArrowDown: () => handleArrowKey(event, cellObj, grid, 'ArrowDown'),
        ArrowUp: () => handleArrowKey(event, cellObj, grid, 'ArrowUp')

    };

    const key = event.key;
    const isCharacter = key.length === 1 && key.match(/[a-z]/i);
    if (isCharacter) {
        handleCharacterInput(event, cellObj, grid, key);
    } else if (keyActions[key]) {
        keyActions[key]();
    }
}

let direction = 'across';

function handleCharacterInput(event, cellObj, grid, key) {
    event.preventDefault();
    const cell = cellObj.getEditable();

    cell.classList.remove('red');
    cell.classList.remove('green');
    if (cell.textContent.length === 1) {
        cell.textContent = '';
    }

    cell.textContent = key;
    moveToNextCell(cellObj, grid, 1, direction);
}

function handleBackspace(event, cellObj, grid) {
    event.preventDefault();
    const cell = cellObj.getEditable();
    cell.textContent = '';
    moveToNextCell(cellObj, grid, -1, direction);
}

function handleArrowKey(event, cellObj, grid, key) {
    event.preventDefault();
    const directionMap = {
        ArrowRight: 'across',
        ArrowLeft: 'across',
        ArrowDown: 'down',
        ArrowUp: 'down'
    };
    const offset = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    const new_direction = directionMap[key];
    if (new_direction === direction) {
        moveToNextCell(cellObj, grid, offset, direction);
    } else {
        direction = new_direction;
    }
}

function moveToNextCell(cellObj, grid, offset, direction = 'across') {
    const {x, y} = cellObj;
    let nextCell;

    if (direction === 'across') {
        print('moving across')
        nextCell = grid[y][x + offset];
    } else if (direction === 'down') {
        print('moving down')
        nextCell = grid[y + offset]?.[x];
    }

    while (nextCell && nextCell.isBlack()) {
        if (direction === 'across') {
            offset += Math.sign(offset);
            nextCell = grid[y][x + offset];
        } else if (direction === 'down') {
            offset += Math.sign(offset);
            nextCell = grid[y + offset]?.[x];
        }
    }

    if (nextCell && nextCell.getEditable()) {
        nextCell.getEditable().focus();
    }
}

//write a function that takes the set of coordinates and returns an ordered list sorted by y coordinate first and then x
function sortNeighbors(neighbors) {
    return Array.from(neighbors).sort(([x1, y1], [x2, y2]) => {
        if (y1 === y2) {
            return x1 - x2
        }
        return y1 - y2
    })
}

// write a function that removes everything that is (x,0) or (0,y) from the sorted neighbors
function removeEdges(neighbors) {
    return neighbors.filter(([x, y]) => x !== 0 && y !== 0)
}

function deduplicate(neighbors) {
    return Array.from(new Set(neighbors.map(JSON.stringify)), JSON.parse)
}

function asArray(crossword) {
    return crossword.split('\n').map(line => line.split(''))
}

function subtract_one_from_x_and_y(coordinate_list) {
    return coordinate_list.map(([x, y]) => [x - 1, y - 1])
}

function filter_hashtags_out(candidate_coordinates, character_lookup) {
    return candidate_coordinates.filter(([x, y]) => character_lookup[y] && character_lookup[y][x] !== '#');
}


function find_starting_locations_across(starting_locations, character_lookup) {
    // It is a valid across starting location if x==0 or the character to the left is a #
    return starting_locations.filter(([i, [x, y]]) => x === 0 || character_lookup[y][x - 1] === '#')
}

function find_starting_locations_down(starting_locations, character_lookup) {
    // It is a valid down starting location if y==0 or the character above is a #
    return starting_locations.filter(([i, [x, y]]) => y === 0 || character_lookup[y - 1][x] === '#')
}


// give a function that returns the hint for a given coordinate
function get_starting_location(coordinate, starting_locations) {
    for (const [start, [x, y]] of starting_locations) {
        if (x === coordinate[0] && y === coordinate[1]) {
            return start
        }
    }
    return ''
}


function make_hints(across, down) {
    const across_html = document.getElementById('across');
    const down_html = document.getElementById('down');
    // for each hint in across_hints, add a new item to across
    //Destructure across correclty
    across.forEach(([[index, _], hint]) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${index}. ${hint}`;
        across_html.appendChild(listItem);
    });
    // Same for down
    down.forEach(([[index, _], hint]) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${index}. ${hint}`;
        down_html.appendChild(listItem);
    });
    return [across_html, down_html];
}

function make_grid(grid) {
    const crosswordContainer = document.getElementById('crossword-container');
    let y = 0;

    grid.forEach(row => {
        let x = 0;
        const html_row = document.createElement('div');
        html_row.classList.add('row');

        row.forEach(char => {
            const cell = document.createElement('div');
            cell.classList.add('cell');

            if (char === '#') {
                cell.classList.add('black-cell');
            } else {
                const inputElement = document.createElement('div'); // Consider using <input type="text"> for better form handling
                inputElement.contentEditable = true;
                inputElement.classList.add('input-cell');
                inputElement.setAttribute('data-character', char);

                // Add a small character in the top left corner of the cell as a hint
                const hint = get_starting_location([x, y], starting_locations); // Ensure this function is defined and returns a valid result
                if (hint) {
                    const hintElement = document.createElement('div');
                    hintElement.classList.add('hint');
                    //set id to hint-hintid
                    hintElement.id = `hint-${hint}`;
                    hintElement.textContent = hint;
                    cell.appendChild(hintElement);
                }

                cell.appendChild(inputElement);
            }

            html_row.appendChild(cell);
            x += 1;
        });

        crosswordContainer.appendChild(html_row);
        y += 1;
    });

    crosswordContainer.addEventListener('click', function (event) {
        const clickedElement = event.target;
        if (clickedElement.classList.contains('input-cell')) {
            console.log('Clicked element:', clickedElement);
        }
        // You can add more logic here to handle the clicked element
    });
    return crosswordContainer;
}

function check_all() {
    //Check all cells by finding all celsl with class input-cell and then checking them
    const input_cells = document.querySelectorAll('.input-cell');
    input_cells.forEach(cell => {
        const character = cell.getAttribute('data-character').toLowerCase();
        const input = cell.textContent.toLowerCase();
        // can we do this with css classes instead?

        if (input === '') {
            cell.classList.remove('red');
            cell.classList.remove('green');
        } else if (character === input) {
            cell.classList.add('green');
            cell.classList.remove('red');
        } else {
            cell.classList.add('red');
            cell.classList.remove('green');
        }
    });
    //play a sound of success when all cells are correct
}

function usecase(crossword_raw, hints) {
    let last_clicked_element = null;
    //clear the crossword container
    document.getElementById('crossword-container').innerHTML = '';
    //clear the hints
    document.getElementById('across').innerHTML = '';
    document.getElementById('down').innerHTML = '';
    let character_lookup = asArray(crossword_raw)
    let candidates_including_hashtags = chain(crossword_raw, [padCrossword, unpadCrossword,
        ndenumerate, findHashes, findNeighbors,
        sortNeighbors, removeEdges, deduplicate, subtract_one_from_x_and_y])
    starting_locations = filter_hashtags_out(candidates_including_hashtags, character_lookup)
    starting_locations = starting_locations.filter(([x, y]) => x < character_lookup[0].length)
    starting_locations = enumerate(starting_locations)
    let starting_locations_across = find_starting_locations_across(starting_locations, character_lookup)
    let starting_locations_down = find_starting_locations_down(starting_locations, character_lookup)
    let across_hints = hints.split('\n\n')[0].split('\n')
    let down_hints = hints.split('\n\n')[1].split('\n')
    let across = zip(starting_locations_across, across_hints)
    let down = zip(starting_locations_down, down_hints)
    let crossword_container = make_grid(character_lookup)
    setupUnfocusingForCrossword();
    //how do u destructre across and down correctly
    [across_html, down_html] = make_hints(across, down)
    connect_hints_and_cells(crossword_container, across, down, across_html, down_html)
    setup_keybinds();

}

function setup_keybinds() {
    // enter should check all cells
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            check_all();
        }
    });
}

function connect_hints_and_cells(crossword_container, across, down, across_html, down_html) {
    //When i click on a hint, the corresponding cell should be focused
    // Let's find the hint element by id for each hint
    console.log(across_html);
    across_html.childNodes.forEach((hint) => {
        hint.addEventListener('click', function () {
            //parse the hint id from the hint element like "9. Computer suffix with soft or hard"
            // i think u split the text content by '.' and then get the first element
            const hint_id = hint.textContent.split('.')[0];

            console.log(`Hint ID: ${hint_id}`)
            const cell = crossword_container.querySelector(`#hint-${hint_id}`).parentNode;
            cell.querySelector('.input-cell').focus();
            direction = 'across';
        });
    });
    //same for down
    down_html.childNodes.forEach((hint) => {
        hint.addEventListener('click', function () {
            //parse the hint id from the hint element like "9. Computer suffix with soft or hard"
            // i think u split the text content by '.' and then get the first element
            const hint_id = hint.textContent.split('.')[0];

            console.log(`Hint ID: ${hint_id}`)
            const cell = crossword_container.querySelector(`#hint-${hint_id}`).parentNode;
            cell.querySelector('.input-cell').focus();
            direction = 'down';
        });
    });


}

function load_crossword() {
    const input_text = document.getElementById('crossword-input').value;
    //assert that the input text is a valid date

    let content = fetch(`/crossword/${input_text}`).then(
        response => response.text()).then(
        data => parse_and_run_crossword(data)
    )

}

document.getElementById('toggle-night-mode').addEventListener('click', function () {
    document.body.classList.toggle('night-mode');
});

function parse_and_run_crossword(raw_crossword) {
    const parts = raw_crossword.split('\n\n')
    console.log(parts)
    //Crossword is the 3rd from the end
    const parsed_crossword = parts[parts.length - 3]
    //Hints is the two last ones combined by \n\n
    const hints = parts.slice(-2).join('\n\n')
    usecase(parsed_crossword, hints)
}

/**
 * Load the crossword for a specific weekday.
 * @param {number} day_of_the_week - The target weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
function load_weekday(day_of_the_week) {
    const from = new Date('2019-01-01');
    const till = new Date();
    const randomDate = getRandomWeekdayDate(from, till, day_of_the_week);

    fetch(`/crossword/${randomDate}`).then(
        response => response.text()).then(
        data => parse_and_run_crossword(data)
    );

}

function load_sample_crossword() {
    const crossword_raw = `WARE#ABBA#OUSTS
EBAY#SOAR#UBOAT
BLUEWHALE#TEMPE
SELFIE#DOGTREAT
###ULNA#LEA####
#TALC#BLACKBALL
BET#OGRE#KEENLY
REAR#RATIO#DOOR
ETRADE#ITSY#DYE
WHITEWINE#OWED#
####LOT#MAUI###
AUDIENCE#MISAIM
BRUNT#HUEANDCRY
USAGE#EROS#OMIT
TALES#SONS#MESH`
    const hints = `Computer suffix with soft or hard
"Dancing Queen" band
Boots from office
Online alternative to a garage sale
Fly high
German sub in W.W. II fighting
Marine creature that can weigh over 400,000 pounds
City that's home to Arizona State University
Picture taken with an outstretched arm, perhaps
Product from Milk-Bone or Pup-Peroni
Forearm bone
Meadow, in poetry
Soft mineral powder
Bar from joining a private club, e.g.
Make a wager
Shrek, e.g.
___ aware (paying close attention)
Caboose's location
Pi is one, for the circumference of a circle to its diameter
It might be open and shut
Big online brokerage
Teeny-tiny
Purchase for purple hair
Chardonnay or pinot grigio, e.g.
Had to pay back
Parking area
Closest island to the Big Island
What Nielsen ratings measure
Point at an off-target spot
Impact that one might "bear"
Public uproar ... or a phonetic hint to the two words in 17-, 28- and 48-Across?
Way in which a word is employed
Cupid's Greek counterpart
Fail to include
"Tall" stories
Mamas' boys
Fit well together

Some Halloween decorations
Ready, willing and ___
One of Cuba's Castros
Quite a sight to behold
Pale as a ghost
Snake that constricts
Hairless
Ring surrounding a nipple
Scene that doesn't make it into the movie
Lyft competitor
A few
Spanish appetizer
"Ignore that change," to a proofreader
Radio reply after "Roger"
Lizards with sticky toe pads
Start of a magic spell
Canines, e.g.
Pioneering video game company
Admit
Unorthodox spot from which to take a meeting while working from home
One end of a battery
Architect Frank ____ Wright
Bard's instrument
Make, as coffee
Slowly became appealing to
One who snitches
Tabloid twosome
Backspaces over
Dealer's "Wanna play?"
Reasons to scratch one's head, say
"Conventional ___ says ..."
Accumulate
Be up against
Bear in constellation names
Two-part
"Picnic" playwright William
Multinational currency
High point
Colored part of the eye
"We only use 10% of our brain," e.g.
Long stretch of time`
    usecase(crossword_raw, hints)
}

