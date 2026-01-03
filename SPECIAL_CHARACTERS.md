# NYT Crossword API Special Characters

This document explains the special characters and formatting used in the NYT Crossword Syndicate API responses.

## Overview

The NYT Crossword API returns puzzle data with special characters that indicate visual elements and puzzle features that can't be represented in plain text grids.

## Special Characters

### `#` - Black Squares (Standard)
**Purpose**: Represents standard black squares in the crossword grid.

**Example**:
```
CAT#DOG
ARE#OWL
TEA#HAM
```

**Handling**: These are the normal separator squares in a crossword puzzle. Use them to determine word boundaries.

---

### `.` - Dots (End-of-Line Markers)
**Purpose**: Represents end-of-line padding or terminal black squares. These appear at the end of rows in the API format.

**Example Reference**: `https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=202033`

**Note**: Dots are NOT indicators of asymmetry. They simply mark the end of grid rows and should be treated exactly like `#` (black squares).

**Handling**: Treat identically to `#` for all processing. Strip or ignore them as non-playable squares.

```python
# Dots are just black squares - treat them the same
def is_black_square(char):
    return char in ['#', '.']
```

---

### `^` - Caret (Shaded Background)
**Purpose**: Indicates letters that should have a shaded or highlighted background square.

**Example**: `WHOLEBEANCOF^F^E^E` 
- The letters after `^` should be rendered with shaded backgrounds
- This is NOT a rebus - the grid dimensions still match when you count each letter

**Example Reference**: `https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=20200401`

**Handling**: 
```python
# Option 1: Strip carets to get the full answer
answer = answer.replace('^', '')  # "WHOLEBEANCOF^F^E^E" → "WHOLEBEANCOFFEE"

# Option 2: Parse to identify shaded letters
parts = answer.split('^')
base = parts[0]  # "WHOLEBEANCOF"
shaded_letters = parts[1:]  # ['F', 'E', 'E']
```

---

### `,` - Comma (Rebus Squares)
**Purpose**: Separates individual letters that occupy a SINGLE grid square (true rebus).

**Example**: `JOHNDEEREG,R,E,E,N`
- This represents "JOHNDEERGREEN" 
- The letters `G,R,E,E,N` all fit into rebus squares
- The word "GREEN" is spelled out in the rebus squares

**Example Reference**: `https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=201511`

**Handling**:
```python
# Option 1: Strip commas to get the full answer
answer = answer.replace(',', '')  # "JOHNDEEREG,R,E,E,N" → "JOHNDEERGREEN"

# Option 2: Parse to identify rebus letters
if ',' in answer:
    # This is a rebus square entry
    parts = answer.split(',')
    base = parts[0]  # "JOHNDEEREG"
    rebus_letters = parts[1:]  # ['R', 'E', 'E', 'N']
```

**Important**: Rebus squares affect grid dimensions - one visual square contains multiple letters.

---

### `%` - Percent (Circled Letters)
**Purpose**: Indicates letters that should have a circle drawn around them in the grid.

**Example Reference**: `https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=204451`

**Handling**: Similar to carets - strip for text processing, but preserve metadata for rendering:
```python
answer = answer.replace('%', '')  # Strip for answer text
# Track which letters should be circled for visual rendering
```

---

## Example Puzzles

### Standard Puzzle
- **Date**: `20200401`
- **Features**: Carets for shaded squares
- **Grid**: Symmetrical, standard dimensions

### Rebus Puzzle
- **Date**: `201511`  
- **Features**: Comma-separated rebus letters, dots at end of rows
- **Grid**: Multiple letters per square, rows have varying lengths
- **Theme**: Color words (GREEN, BLACK, WHITE, YELLOW) in rebus squares

### Puzzle with Trailing Dots
- **Date**: `202033`
- **Features**: Dots at end of each row (standard end-of-line markers)
- **Grid**: Standard 15x15 grid, dots are just padding

### Complex Special Characters
- **Date**: `20200403`
- **Features**: Multiple special character types
- **Note**: Very complicated formatting

### Star Wars/Star Trek Theme
- **Date**: `2023133`
- **Features**: Black bar at bottom, commas
- **Theme**: Science fiction references

---

## Best Practices

### For Text Processing
Strip special characters to get clean answers:
```python
clean_answer = answer.replace('^', '').replace(',', '').replace('%', '')
```

### For Grid Rendering
1. Treat both `#` and `.` as black squares (non-playable)
2. Strip trailing black squares from rows/columns for cleaner rendering
3. Parse special characters to preserve visual metadata
4. Account for rebus squares when calculating grid positions

### For Validation
```python
def has_rebus(grid_text):
    """Check if puzzle contains actual rebus squares"""
    return ',' in grid_text

def has_shaded_squares(grid_text):
    """Check if puzzle has shaded background squares"""
    return '^' in grid_text

def has_circled_letters(grid_text):
    """Check if puzzle has circled letters"""
    return '%' in grid_text

def is_black_square(char):
    """Check if character is a black square"""
    return char in ['#', '.']
```

---

## Summary Table

| Character | Meaning | Affects Grid Dimensions | Example Date |
|-----------|---------|------------------------|--------------|
| `#` | Black square | No | All puzzles |
| `.` | Black square (end-of-line) | No | 202033 |
| `^` | Shaded background | No | 20200401 |
| `,` | Rebus square separator | Yes | 201511 |
| `%` | Circled letter | No | 204451 |

---

## Testing

See `tests/test_crossword_builder.py` for test cases covering:
- Standard puzzles with shaded squares (carets)
- Rebus puzzles (commas)
- Validation of special character handling
