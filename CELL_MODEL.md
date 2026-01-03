# Cell Object Model

## Overview

The `Cell` class provides a proper object-oriented representation of individual crossword puzzle squares, replacing the previous string-based approach. This enables proper handling of formatting features like circled letters, shaded backgrounds, and rebus squares.

## Motivation

Previously, crossword answers were stored as simple strings with special characters embedded:
- `WORD^` - shaded letters marked with ^
- `WORD%` - circled letters marked with %
- `A,B,C` - rebus squares with comma separators

This approach had limitations:
1. **No separation of concerns**: Content and formatting were mixed in strings
2. **Difficult frontend rendering**: Had to parse strings to extract formatting
3. **Poor rebus support**: Multiple letters in one cell were hard to represent
4. **No type safety**: Easy to make mistakes with special character handling

The Cell model solves these problems with proper object orientation.

## Architecture

### Cell Class

Located in: `src/crossword/cell.py`

```python
class Cell(BaseModel):
    letter: str              # Primary letter (uppercase)
    is_circled: bool = False # Has circle around it (% marker)
    is_shaded: bool = False  # Has shaded background (^ marker)
    rebus: Optional[List[str]] = None  # Additional letters for rebus
    is_black: bool = False   # Is a black square (# or .)
```

**Key Properties:**
- `display_letter` - Letter to show (empty for black squares)
- `full_content` - Complete cell content including rebus letters
- `answer_value` - Value for answer validation (single letter or rebus content)

**Factory Methods:**
- `Cell.from_char(char)` - Create from single character
- `Cell.from_formatted_string(s)` - Parse from API format with special chars
- `to_api_format()` - Convert back to API format string

### CrosswordEntry Updates

Located in: `src/crossword/entity.py`

```python
class CrosswordEntry(BaseModel):
    clue: str
    answer: str  # Kept for backward compatibility
    index: int
    x: int
    y: int
    direction: str
    cells: Optional[List[Cell]] = None  # New: rich representation
```

**New Properties:**
- `clean_answer` - Answer stripped of special characters
- `answer_length` - Actual length for grid calculations

**New Factory Method:**
- `CrosswordEntry.from_answer_string(...)` - Parse answer into Cell objects

## Examples

### Simple Letter
```python
cell = Cell(letter='A')
# or
cell = Cell.from_char('A')
```

### Circled Letter
```python
cell = Cell.from_formatted_string('B%')
assert cell.is_circled == True
assert cell.to_api_format() == 'B%'
```

### Shaded Letter
```python
cell = Cell.from_formatted_string('C^')
assert cell.is_shaded == True
assert cell.to_api_format() == 'C^'
```

### Both Circled and Shaded
```python
cell = Cell.from_formatted_string('D^%')
assert cell.is_circled == True
assert cell.is_shaded == True
```

### Rebus Square (Multiple Letters)
```python
cell = Cell.from_formatted_string('H,O,M,E')
assert cell.letter == 'H'
assert cell.rebus == ['O', 'M', 'E']
assert cell.full_content == 'HOME'
```

### Rebus with Formatting
```python
cell = Cell.from_formatted_string('H,O,P,E^')
assert cell.full_content == 'HOPE'
assert cell.is_shaded == True
```

### Black Square
```python
cell = Cell.from_char('#')
assert cell.is_black == True
assert cell.display_letter == ''
```

### Creating CrosswordEntry with Cells
```python
entry = CrosswordEntry.from_answer_string(
    clue="Coffee type",
    answer="WHOLEBEANCOF^F^E^E",
    index=1,
    x=0,
    y=0,
    direction="across"
)

# Access cells
for cell in entry.cells:
    print(f"{cell.letter} - shaded: {cell.is_shaded}")

# Get clean answer for validation
assert entry.clean_answer == "WHOLEBEANCOFFEE"
```

## API Format Reference

NYT Crossword API uses these special characters:

| Character | Meaning | Example | Cell Representation |
|-----------|---------|---------|---------------------|
| `^` | Shaded background | `A^` | `Cell(letter='A', is_shaded=True)` |
| `%` | Circled letter | `B%` | `Cell(letter='B', is_circled=True)` |
| `,` | Rebus separator | `A,B,C` | `Cell(letter='A', rebus=['B','C'])` |
| `#` | Black square | `#` | `Cell(letter='#', is_black=True)` |
| `.` | End-of-line marker | `.` | `Cell(letter='.', is_black=True)` |

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **answer field preserved**: Old code can still access `entry.answer`
2. **cells optional**: Works without cells populated
3. **clean_answer fallback**: Strips special chars from answer string if no cells
4. **toJSON() unchanged**: Serialization works as before

Example of old code still working:
```python
# Old approach - still works
entry = CrosswordEntry(
    clue="Test",
    answer="WORD",
    index=1,
    x=0,
    y=0,
    direction="across"
)
assert entry.answer == "WORD"
assert entry.clean_answer == "WORD"
```

## Testing

**Test Coverage:**
- `tests/test_cell.py` - 54 tests for Cell model
- `tests/test_crossword_entry_cells.py` - 18 tests for CrosswordEntry integration
- **Total: 72 new tests, all passing**

Tests cover:
- Basic cell creation and validation
- Parsing from API format strings
- Round-trip conversion (API → Cell → API)
- CrosswordEntry integration
- Backward compatibility
- Edge cases (empty strings, multi-char validation, etc.)

## Usage in Builders

The crossword builders should be updated to use `CrosswordEntry.from_answer_string()`:

```python
# Instead of:
entry = CrosswordEntry(
    clue=clue_text,
    answer=answer_with_special_chars,
    index=1,
    x=0,
    y=0,
    direction="across"
)

# Use:
entry = CrosswordEntry.from_answer_string(
    clue=clue_text,
    answer=answer_with_special_chars,
    index=1,
    x=0,
    y=0,
    direction="across"
)
# This automatically parses cells
```

## Frontend Integration (Planned)

The frontend should be updated to use Cell objects:

1. **API Response**: Include cells in JSON response
2. **Grid Rendering**: Use cell.is_circled, cell.is_shaded for CSS classes
3. **Rebus Display**: Show cell.full_content for rebus squares
4. **Validation**: Use cell.answer_value for checking answers

Example frontend cell rendering:
```javascript
const cell = {
  letter: 'A',
  is_circled: true,
  is_shaded: false,
  rebus: null
};

// Apply CSS classes based on formatting
const classes = [
  cell.is_circled ? 'circled' : '',
  cell.is_shaded ? 'shaded' : ''
].filter(Boolean).join(' ');
```

## Benefits

1. **Type Safety**: Pydantic validation catches errors at creation time
2. **Separation of Concerns**: Content and formatting are separate fields
3. **Extensibility**: Easy to add new formatting types (e.g., bold, italic)
4. **Testability**: Each aspect can be tested independently
5. **Clarity**: Code intent is clear - `cell.is_circled` vs parsing `%` from strings
6. **Reusability**: Cell objects can be used across different contexts

## Migration Path

For existing code:

1. **Phase 1** (Current): Cell and CrosswordEntry models exist, old code still works
2. **Phase 2**: Update builders to populate cells field using `from_answer_string()`
3. **Phase 3**: Update frontend to render cells with formatting
4. **Phase 4** (Optional): Remove answer string fallback once all code uses cells

No breaking changes required - fully opt-in migration.
