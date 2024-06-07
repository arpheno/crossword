// write a function that returns the crossword but i want it padded with the # character on all sides
// so the crossword is the size of the crossword +2 in both x and y dimensions
direction = 'across';
function padCrossword(crossword) {
    const lines = crossword.split('\n')
    const padded = lines.map(line => `#${line}#`)
    padded.unshift('#'.repeat(padded[0].length))
    padded.push('#'.repeat(padded[0].length))
    return padded.join('\n')
}

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

// Given a crossword string, find the coordinates of all characters like [('#',(0,0)),...]
//I want something like ndenumerate from python
//can i alias console.log to print?
print = console.log

function ndenumerate(crossword) {
    print(crossword)
    const lines = crossword.split('\n')
    const result = []
    for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) {
            result.push([lines[y][x], [x, y]])
        }
    }
    return result
}

// write a function that filters the output of ndenumarete to only contain # characters
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
        const cells = document.querySelectorAll('.cell div[contenteditable="true"]');
        // Calculate the side length of the square grid
        const all_cells = document.querySelectorAll('.cell');
        const side_length = Math.sqrt(all_cells.length);
        // pack the all_cells into a 2D array of Cell
        const grid = [];
        let y = 0;
        all_cells.forEach((cell, index) => {
            if (index % side_length === 0) {
                grid.push([]);
            }
            grid[grid.length - 1].push(new Cell(cell, index % side_length, grid.length - 1));
        });

        grid.forEach((row ) => {
            row.forEach(cell_obj => {
            if(!cell_obj.isBlack()) {
                cell = cell_obj.getEditable();
                cell.addEventListener('keydown', (event) => {
                    const key = event.key;
                    const isCharacter = key.length === 1 && key.match(/[a-z]/i); // Check if it's a letter
                    const isArrow = key.startsWith('Arrow');
                    const cell = grid[cell_obj.y][cell_obj.x].getEditable();
                    console.log(key, isCharacter, isArrow);
                    if (isCharacter) {
                        // prevent the default
                        event.preventDefault();
                        // If there's already a character in the cell, delete it then add the new character
                        if (cell.textContent.length === 1) {
                            cell.textContent = '';
                            console.log('Cell already has a character')
                        }
                        //now add the character
                        cell.textContent = key;
                        //move to the next cell
                        if (direction === 'across') {
                            // work with grid instead
                            offset = 1;
                            // while not black and not out of bounds
                            while (grid[cell_obj.y][cell_obj.x + offset] && grid[cell_obj.y][cell_obj.x + offset].isBlack()) {
                                offset += 1;
                            }
                            grid[cell_obj.y][cell_obj.x + offset].getEditable().focus();
                        }else if (direction === 'down') {
                            offset = 1;
                            // while not black and not out of bounds
                            while (grid[cell_obj.y + offset][cell_obj.x] && grid[cell_obj.y + offset][cell_obj.x].isBlack()) {
                                offset += 1;
                            }
                            grid[cell_obj.y + offset][cell_obj.x].getEditable().focus();
                        }
                    }
                    // if key is backspace
                    if (key === 'Backspace') {
                        event.preventDefault();
                        cell.textContent = '';
                        if (direction === 'across') {
                            offset = -1;
                            // while not black and not out of bounds
                            while (grid[cell_obj.y][cell_obj.x + offset] && grid[cell_obj.y][cell_obj.x + offset].isBlack()) {
                                offset -= 1;
                            }
                            grid[cell_obj.y][cell_obj.x + offset].getEditable().focus();
                        }else if (direction === 'down') {
                            offset = -1;
                            // while not black and not out of bounds
                            while (grid[cell_obj.y + offset][cell_obj.x] && grid[cell_obj.y + offset][cell_obj.x].isBlack()) {
                                offset -= 1;
                            }
                            grid[cell_obj.y + offset][cell_obj.x].getEditable().focus();

                        }
                    }
                    if (isArrow) {
                        event.preventDefault();
                        if (direction === 'across') {
                            if (key === 'ArrowRight') {
                                offset=1;
                                // while not black and not out of bounds
                                while (grid[cell_obj.y][cell_obj.x + offset] && grid[cell_obj.y][cell_obj.x + offset].isBlack()) {
                                    offset += 1;
                                }
                                grid[cell_obj.y][cell_obj.x + offset].getEditable().focus();
                            }
                            //implement rest
                            if (key === 'ArrowLeft') {
                                offset=-1;
                                // while black and not out of bounds
                                while (grid[cell_obj.y][cell_obj.x + offset] && grid[cell_obj.y][cell_obj.x + offset].isBlack()) {
                                    offset -= 1;
                                }
                                grid[cell_obj.y][cell_obj.x + offset].getEditable().focus();
                            }
                            if (key === 'ArrowDown') {
                                console.log('changing direction to down')
                                direction = 'down';

                            }
                            if (key === 'ArrowUp') {
                                console.log('changing direction to down')

                                direction = 'down';
                            }

                        } else if (direction === 'down') {
                            //implement rest
                            if (key === 'ArrowDown') {
                                offset=1;
                                // while not black and not out of bounds
                                while (grid[cell_obj.y + offset][cell_obj.x] && grid[cell_obj.y + offset][cell_obj.x].isBlack()) {
                                    offset += 1;
                                }
                                grid[cell_obj.y + offset][cell_obj.x].getEditable().focus();
                            }
                            if (key === 'ArrowUp') {
                                offset=-1;
                                // while not black and not out of bounds
                                while (grid[cell_obj.y + offset][cell_obj.x] && grid[cell_obj.y + offset][cell_obj.x].isBlack()) {
                                    offset -= 1;
                                }
                                grid[cell_obj.y + offset][cell_obj.x].getEditable().focus();
                            }
                            if (key === 'ArrowRight') {
                                direction = 'across';
                                console.log('changing direction to across')
                            }
                            if (key === 'ArrowLeft') {
                                direction = 'across';
                                console.log('changing direction to across')
                            }
                        }
                    }
                });
            }
            });

        });

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

// write a function that takes a list of functions and applies it to the crossword
function chain(crossword, functions) {
    let result = crossword
    for (const func of functions) {
        result = func(result)
    }
    return result
}

function filter_hashtags_out(candidate_coordinates, character_lookup) {
    return candidate_coordinates.filter(([x, y]) => character_lookup[y] && character_lookup[y][x] !== '#');
}


// i want python enumerate
function enumerate(iterable) {
    return iterable.map((item, index) => [index + 1, item])
}

// filter out starting locations that have their x coordinate equal to the width of the crossword

function find_starting_locations_across(starting_locations, character_lookup) {
    // It is a valid across starting location if x==0 or the character to the left is a #
    return starting_locations.filter(([i, [x, y]]) => x === 0 || character_lookup[y][x - 1] === '#')
}

function find_starting_locations_down(starting_locations, character_lookup) {
    // It is a valid down starting location if y==0 or the character above is a #
    return starting_locations.filter(([i, [x, y]]) => y === 0 || character_lookup[y - 1][x] === '#')
}


// zip the starting locations with the hints
function zip(starting_locations, hints) {
    return starting_locations.map((location, index) => [location, hints[index]])
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



function make_hints(across,down) {
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
        if(clickedElement.classList.contains('input-cell')) {
            console.log('Clicked element:', clickedElement);
            last_clicked_element= clickedElement;
        }
        // You can add more logic here to handle the clicked element
    });
    return crosswordContainer;
}
function getRandomDate(start, end) {
    // Generate a random timestamp between start and end dates
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date;
}

function adjustToMonday(date) {
    // Get the day of the week as a number (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayOfWeek = date.getDay();
    // Calculate the difference from Monday
    const difference = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, set to move 6 days back, otherwise dayOfWeek - 1
    // Adjust the date to the nearest Monday (subtract the difference)
    date.setDate(date.getDate() - difference);
    return date;
}

function formatMondayDate(startDate, endDate) {
    // Get a random date
    let randomDate = getRandomDate(startDate, endDate);
    // Adjust this date to the nearest Monday
    randomDate = adjustToMonday(randomDate);
    // Format the date to a readable string (e.g., 'Mon, Mar 15 2021')
    return formatDateToYYMMDD(randomDate);
}

function adjustToTuesday(date) {
    // Get the day of the week as a number (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayOfWeek = date.getDay();
    // Calculate the difference from Monday
    const difference = dayOfWeek === 0 ? 5 : dayOfWeek - 2; // If Sunday, set to move 5 days back, otherwise dayOfWeek - 2
    // Adjust the date to the nearest Monday (subtract the difference)
    date.setDate(date.getDate() - difference);
    return date;
}

function formatTuesdayDate(startDate, endDate) {
    // Get a random date
    let randomDate = getRandomDate(startDate, endDate);
    // Adjust this date to the nearest Monday
    randomDate = adjustToTuesday(randomDate);
    // Format the date to a readable string (e.g., 'Mon, Mar 15 2021')
    return formatDateToYYMMDD(randomDate);
}

// Make sure to define CSS for .hint to position it in the top-left corner and potentially style it to be small and unobtrusive.
function setupArrowNavigation() {
}

function check_cell() {
    if (last_clicked_element) {
        const character = last_clicked_element.getAttribute('data-character').toLowerCase();
        const input = last_clicked_element.textContent.toLowerCase();
        if (character === input) {
            last_clicked_element.style.color = 'green';
        } else {
            last_clicked_element.style.color = 'red';
        }
    }
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
        } else
        if (character === input) {
            cell.classList.add('green');
        } else {
            cell.classList.add('red');
        }
    });
    //play a sound of success when all cells are correct
}
function usecase(crossword_raw,hints){
    last_clicked_element = null;
    character_lookup = asArray(crossword_raw)
    candidates_including_hashtags = chain(crossword_raw, [padCrossword, unpadCrossword,
        ndenumerate, findHashes, findNeighbors,
        sortNeighbors, removeEdges, deduplicate, subtract_one_from_x_and_y])
    starting_locations = filter_hashtags_out(candidates_including_hashtags, character_lookup)
    starting_locations = starting_locations.filter(([x, y]) => x < character_lookup[0].length)
    starting_locations = enumerate(starting_locations)
    starting_locations_across = find_starting_locations_across(starting_locations, character_lookup)
    starting_locations_down = find_starting_locations_down(starting_locations, character_lookup)
    across_hints = hints.split('\n\n')[0].split('\n')
    down_hints = hints.split('\n\n')[1].split('\n')
    across = zip(starting_locations_across, across_hints)
    down = zip(starting_locations_down, down_hints)
    crossword_container = make_grid(character_lookup)
    setupUnfocusingForCrossword();
    //how do u destructre across and down correctly
    [across_html,down_html] =make_hints(across,down)
    connect_hints_and_cells(crossword_container,across,down,across_html,down_html)
    setup_keybinds();

}
function setup_keybinds() {
    // enter should check all cells
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            check_all();
        }
    });
}
function connect_hints_and_cells(crossword_container,across,down,across_html,down_html) {
    //When i click on a hint, the corresponding cell should be focused
    // Let's find the hint element by id for each hint
    console.log(across_html);
    across_html.childNodes.forEach((hint) => {
        hint.addEventListener('click', function() {
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
        hint.addEventListener('click', function() {
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
    usecase(crossword_raw,hints)
}
function load_crossword() {
    last_clicked_element = null;
    const input_text = document.getElementById('crossword-input').value;
    // call the app endpoint /crossword/<date> and pass the input_text
    // the response should be the a text blob which we will parse
    content = fetch(`/crossword/${input_text}`).then(response => response.text()).then(data => {
        parts = data.split('\n\n')
        console.log(parts)
        //Crossword is the 3rd from the end
        crossword = parts[parts.length - 3]
        //Hints is the two last ones combined by \n\n
        hints = parts.slice(-2).join('\n\n')
        usecase(crossword,hints)
    })
}
function formatDateToYYMMDD(date) {
    console.log(date);
     if (!(date instanceof Date)) {
        throw new Error("The input must be a Date object.");
    }
    const year = date.getFullYear().toString().slice(-2); // Get last two digits of year
    const month = ('0' + (date.getMonth() + 1)).slice(-2); // Format month as two digits
    const day = ('0' + date.getDate()).slice(-2); // Format day as two digits
    return year + month + day; // Concatenate to form YYMMDD
}
document.getElementById('toggle-night-mode').addEventListener('click', function() {
    document.body.classList.toggle('night-mode');
});
function load_monday() {
    last_clicked_element = null;
    //input text should be a random monday date from 2019 until today
    // it should be dynamically generated and not hardcoded
    const startDate = new Date('2019-01-01');
    const endDate = new Date(); // Current date
    const randomMonday = formatMondayDate(startDate, endDate);
    console.log(randomMonday); // Outputs: Mon, <Month> <Day> <Year>
    // call the app endpoint /crossword/<date> and pass the input_text
    // the response should be the a text blob which we will parse
    content = fetch(`/crossword/${randomMonday}`).then(response => response.text()).then(data => {
        parts = data.split('\n\n')
        console.log(parts)
        //Crossword is the 3rd from the end
        crossword = parts[parts.length - 3]
        //Hints is the two last ones combined by \n\n
        hints = parts.slice(-2).join('\n\n')
        usecase(crossword,hints)
    })
}
function load_thursday() {
    last_clicked_element = null;
    //input text should be a random monday date from 2019 until today
    // it should be dynamically generated and not hardcoded
    const startDate = new Date('2019-01-01');
    const endDate = new Date(); // Current date
    const randomThursday = formatThursdayDate(startDate, endDate);
    console.log(randomThursday); // Outputs: Mon, <Month> <Day> <Year>
    // call the app endpoint /crossword/<date> and pass the input_text
    // the response should be the a text blob which we will parse
    content = fetch(`/crossword/${randomThursday}`).then(response => response.text()).then(data => {
        parts = data.split('\n\n')
        console.log(parts)
        //Crossword is the 3rd from the end
        crossword = parts[parts.length - 3]
        //Hints is the two last ones combined by \n\n
        hints = parts.slice(-2).join('\n\n')
        usecase(crossword, hints)
    })
}
function formatThursdayDate(startDate, endDate) {
    // Get a random date
    let randomDate = getRandomDate(startDate, endDate);
    // Adjust this date to the nearest Monday
    randomDate = adjustToThursday(randomDate);
    // Format the date to a readable string (e.g., 'Mon, Mar 15 2021')
    return formatDateToYYMMDD(randomDate);
}
function adjustToThursday(date) {
    // Get the day of the week as a number (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayOfWeek = date.getDay();
    // Calculate the difference from Monday
    const difference = dayOfWeek === 0 ? 3 : dayOfWeek - 4; // If Sunday, set to move 4 days back, otherwise dayOfWeek - 3
    // Adjust the date to the nearest Monday (subtract the difference)
    date.setDate(date.getDate() - difference);
    return date;
}
function load_tuesday() {
    last_clicked_element = null;
    //input text should be a random monday date from 2019 until today
    // it should be dynamically generated and not hardcoded
    const startDate = new Date('2019-01-01');
    const endDate = new Date(); // Current date
    const randomTuesday = formatTuesdayDate(startDate, endDate);
    console.log(randomTuesday); // Outputs: Mon, <Month> <Day> <Year>
    // call the app endpoint /crossword/<date> and pass the input_text
    // the response should be the a text blob which we will parse
    content = fetch(`/crossword/${randomTuesday}`).then(response => response.text()).then(data => {
        parts = data.split('\n\n')
        console.log(parts)
        //Crossword is the 3rd from the end
        crossword = parts[parts.length - 3]
        //Hints is the two last ones combined by \n\n
        hints = parts.slice(-2).join('\n\n')
        usecase(crossword,hints)
    })
}
