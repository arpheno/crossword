# Frontend Cell Rendering Design

## Transport Format

The backend already serializes cells to clean JSON via Pydantic:

```json
{
  "clue": "Coffee type",
  "answer": "WHOLEBEANCOF^F^E^E",
  "index": 1,
  "x": 0,
  "y": 2,
  "direction": "across",
  "cells": [
    {
      "letter": "W",
      "is_circled": false,
      "is_shaded": false,
      "rebus": null,
      "is_black": false
    },
    {
      "letter": "F",
      "is_circled": false,
      "is_shaded": true,
      "rebus": null,
      "is_black": false
    }
  ],
  "clean_answer": "WHOLEBEANCOFFEE",
  "answer_length": 15
}
```

**Decision: No need to mirror Python class structure.** The JSON is already flat and easy to work with. We'll use plain JavaScript objects.

## Frontend Architecture

### Option 1: Minimal Class Structure (RECOMMENDED)
Keep it simple - use plain objects and functions:

```javascript
// No Cell class needed - just use the JSON objects directly

// Helper functions
function getCellClasses(cell) {
    const classes = ['grid-cell'];
    if (cell.is_circled) classes.push('circled');
    if (cell.is_shaded) classes.push('shaded');
    if (cell.rebus) classes.push('rebus');
    if (cell.is_black) classes.push('black');
    return classes.join(' ');
}

function getCellDisplayValue(cell) {
    if (cell.is_black) return '';
    if (cell.rebus) return cell.letter + cell.rebus.join('');
    return cell.letter;
}
```

**Advantages:**
- Simple, no unnecessary abstraction
- Direct access to properties from JSON
- Easy to debug
- Less code to maintain

### Option 2: Lightweight Cell Class
Only if we need methods/behavior:

```javascript
class Cell {
    constructor(data) {
        Object.assign(this, data);
    }
    
    get displayValue() {
        if (this.is_black) return '';
        if (this.rebus) return this.letter + this.rebus.join('');
        return this.letter;
    }
    
    get cssClasses() {
        // ... same as getCellClasses above
    }
}
```

**Recommendation: Start with Option 1.** Only add a class if we need complex behavior.

## Visual Rendering Strategy

### Grid Structure

Current: 2D array of strings
```javascript
this.grid = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F']
]
```

**New: Grid of cell references** (by position)
```javascript
// Build a map of (x,y) -> cell object
this.cellMap = new Map();

this.crossword.forEach(word => {
    word.cells.forEach((cell, i) => {
        const x = word.direction === 'across' ? word.x + i : word.x;
        const y = word.direction === 'across' ? word.y : word.y + i;
        const key = `${x},${y}`;
        
        // Merge if cell already exists (intersections)
        if (!this.cellMap.has(key)) {
            this.cellMap.set(key, { ...cell, x, y });
        }
    });
});
```

### HTML Template

```html
<div class="crossword-grid">
    <div v-for="(row, y) in gridHeight" :key="y" class="grid-row">
        <div v-for="(col, x) in gridWidth" :key="x" 
             :class="getCellClasses(x, y)"
             @click="selectCell(x, y)">
            
            <!-- Cell number (if starting position) -->
            <span v-if="getCellNumber(x, y)" class="cell-number">
                {{ getCellNumber(x, y) }}
            </span>
            
            <!-- Shaded background (rendered via CSS) -->
            
            <!-- User input or answer -->
            <input v-if="!isCellBlack(x, y)"
                   :value="getUserInput(x, y)"
                   @input="handleInput(x, y, $event)"
                   :class="{ 'rebus': isRebus(x, y) }"
                   maxlength="1">
            
            <!-- Circle overlay (CSS border-radius) -->
            <div v-if="isCellCircled(x, y)" class="circle-overlay"></div>
            
            <!-- Rebus indicator -->
            <div v-if="isRebus(x, y)" class="rebus-indicator">{{ getRebusCount(x, y) }}</div>
        </div>
    </div>
</div>
```

## CSS Styling Strategy

### Shaded Cells
```css
.grid-cell.shaded {
    background-color: #e0e0e0; /* Light gray */
}

.grid-cell.shaded input {
    background-color: transparent;
}
```

### Circled Cells
```css
.grid-cell.circled {
    position: relative;
}

.grid-cell.circled::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    right: 2px;
    bottom: 2px;
    border: 2px solid #333;
    border-radius: 50%;
    pointer-events: none;
}
```

### Rebus Cells
```css
.grid-cell.rebus input {
    font-size: 0.6em; /* Smaller text for multiple letters */
    text-align: center;
}

.rebus-indicator {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 0.5em;
    color: #666;
}
```

### Black Squares
```css
.grid-cell.black {
    background-color: #000;
    pointer-events: none;
}
```

## Data Flow

### 1. Loading Crossword
```javascript
async loadCrossword(day) {
    const response = await axios.get(`/new/api/crossword/${day}`);
    this.crossword = response.data.entries; // Array of CrosswordEntry with cells
    this.buildCellMap();
    this.initializeGrid();
}
```

### 2. Building Cell Map
```javascript
buildCellMap() {
    this.cellMap = new Map();
    
    this.crossword.forEach(word => {
        word.cells.forEach((cell, i) => {
            const x = word.direction === 'across' ? word.x + i : word.x;
            const y = word.direction === 'across' ? word.y : word.y + i;
            const key = `${x},${y}`;
            
            if (!this.cellMap.has(key)) {
                this.cellMap.set(key, {
                    ...cell,
                    x, y,
                    userInput: '',
                    words: []  // Track which words use this cell
                });
            }
            
            // Track word membership
            this.cellMap.get(key).words.push({
                wordIndex: word.index,
                direction: word.direction,
                positionInWord: i
            });
        });
    });
}
```

### 3. Rendering Helpers
```javascript
methods: {
    getCell(x, y) {
        return this.cellMap.get(`${x},${y}`);
    },
    
    getCellClasses(x, y) {
        const cell = this.getCell(x, y);
        if (!cell) return 'grid-cell empty';
        
        const classes = ['grid-cell'];
        if (cell.is_black) classes.push('black');
        if (cell.is_circled) classes.push('circled');
        if (cell.is_shaded) classes.push('shaded');
        if (cell.rebus) classes.push('rebus');
        if (this.isSelected(x, y)) classes.push('selected');
        
        return classes.join(' ');
    },
    
    isCellCircled(x, y) {
        const cell = this.getCell(x, y);
        return cell && cell.is_circled;
    },
    
    isRebus(x, y) {
        const cell = this.getCell(x, y);
        return cell && cell.rebus && cell.rebus.length > 0;
    },
    
    getRebusCount(x, y) {
        const cell = this.getCell(x, y);
        if (!cell || !cell.rebus) return '';
        return cell.rebus.length + 1; // +1 for primary letter
    }
}
```

### 4. Input Handling
```javascript
handleInput(x, y, event) {
    const cell = this.getCell(x, y);
    if (!cell || cell.is_black) return;
    
    const input = event.target.value.toUpperCase();
    
    if (cell.rebus) {
        // For rebus: allow multiple characters
        cell.userInput = input.substring(0, cell.rebus.length + 1);
    } else {
        // For normal: single character
        cell.userInput = input.substring(0, 1);
    }
    
    // Auto-advance if cell is complete
    if (this.isCellComplete(cell)) {
        this.moveToNextCell(x, y);
    }
}

isCellComplete(cell) {
    if (!cell || cell.is_black) return false;
    
    const expectedLength = cell.rebus ? cell.rebus.length + 1 : 1;
    return cell.userInput.length === expectedLength;
}
```

### 5. Validation
```javascript
checkAnswer(x, y) {
    const cell = this.getCell(x, y);
    if (!cell || cell.is_black) return false;
    
    // Build expected answer
    let expectedAnswer = cell.letter;
    if (cell.rebus) {
        expectedAnswer += cell.rebus.join('');
    }
    
    return cell.userInput.toUpperCase() === expectedAnswer;
}

checkAllAnswers() {
    let allCorrect = true;
    
    this.cellMap.forEach((cell, key) => {
        if (cell.is_black) return;
        
        const [x, y] = key.split(',').map(Number);
        const correct = this.checkAnswer(x, y);
        
        if (!correct) allCorrect = false;
        
        // Visual feedback
        const element = this.$refs[`cell-${x}-${y}`];
        if (element) {
            element.classList.toggle('correct', correct);
            element.classList.toggle('incorrect', !correct);
        }
    });
    
    return allCorrect;
}
```

## Implementation Plan

### Phase 1: New Endpoint
1. Create `/new` route in Flask
2. Create `newapp.html` template (copy from existing)
3. Create `/new/api/crossword/<day>` that returns cell-enriched data

### Phase 2: Basic Grid Rendering
1. Update Vue component to use cellMap approach
2. Render grid with proper CSS classes
3. Basic styling for shaded/circled cells

### Phase 3: Input Handling
1. Support single-letter input (existing behavior)
2. Add rebus input support (multiple letters per cell)
3. Validation against cell.answer_value

### Phase 4: Polish
1. Visual indicators for rebus cells
2. Better styling for circles/shading
3. Mobile support
4. Testing with real puzzles

## Example: Complete Cell Rendering

```vue
<template>
  <div class="grid-cell" 
       :class="getCellClasses(cell)"
       :data-x="cell.x"
       :data-y="cell.y">
    
    <!-- Cell number -->
    <span v-if="cellNumber" class="cell-number">{{ cellNumber }}</span>
    
    <!-- Input for non-black cells -->
    <input v-if="!cell.is_black"
           v-model="cell.userInput"
           @input="handleCellInput"
           @keydown="handleKeydown"
           :maxlength="cell.rebus ? cell.rebus.length + 1 : 1"
           class="cell-input">
    
    <!-- Rebus indicator -->
    <span v-if="cell.rebus" class="rebus-count">
      {{ cell.rebus.length + 1 }}
    </span>
  </div>
</template>

<style scoped>
.grid-cell {
  position: relative;
  width: 40px;
  height: 40px;
  border: 1px solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-cell.shaded {
  background-color: #d3d3d3;
}

.grid-cell.circled::after {
  content: '';
  position: absolute;
  inset: 3px;
  border: 2px solid #000;
  border-radius: 50%;
  pointer-events: none;
}

.grid-cell.black {
  background-color: #000;
}

.cell-input {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 20px;
  text-transform: uppercase;
}

.grid-cell.rebus .cell-input {
  font-size: 12px;
}

.rebus-count {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 10px;
  color: #666;
}

.cell-number {
  position: absolute;
  top: 1px;
  left: 2px;
  font-size: 10px;
  font-weight: bold;
}
</style>
```

## Summary

**Transport:** Use Pydantic's JSON serialization (already perfect)

**Frontend Structure:** Plain objects + helper functions (no need for Cell class)

**Rendering:** cellMap approach with CSS classes for formatting

**Key Insight:** Keep frontend simple. The complexity is in the backend parsing. Frontend just renders what it receives.
