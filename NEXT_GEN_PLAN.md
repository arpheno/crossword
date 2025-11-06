# Next-Gen Crossword Implementation Plan

## Problem Statement

Current crossword renderer has issues with:
- **Asymmetrical grids** (using `.` instead of `#`) - creates broken rendering with extra blank/black squares
- **Special characters** (dots on bottom/right) - causes visual issues
- Need to support these without breaking existing functionality

## Solution: Parallel Implementation

Create a complete separate implementation path while keeping current app 100% unchanged.

---

## Architecture Overview

```
Current App (Unchanged)          Next-Gen App (New)
================                 ==================
/                                /new
  └── uses: app.py                 └── uses: app_v2.py
  └── template: newapp.html         └── template: newapp_v2.html  
  └── js: main.js                   └── js: main_v2.js
  └── API: /random_crossword        └── API: /api/v2/random_crossword
  └── builder: crossword_builder    └── builder: crossword_builder_v2
```

---

## Implementation Steps

### Phase 1: Backend Foundation

#### 1. Create `crossword_builder_v2.py`
**Location**: `src/crossword/crossword_builder_v2.py`

**New features**:
```python
def build_crossword_v2(crossword: Crossword) -> Dict:
    """
    Enhanced builder that returns:
    {
        "metadata": {
            "date": str,
            "title": str,
            "authors": List[str],
            "is_asymmetrical": bool,
            "has_rebus": bool,
            "has_shaded": bool,
            "has_circled": bool,
            "grid_width": int,
            "grid_height": int
        },
        "entries": List[CrosswordEntry],
        "grid_features": {
            "rebus_squares": List[{x, y, letters}],
            "shaded_squares": List[{x, y}],
            "circled_squares": List[{x, y}]
        }
    }
    """
```

**Key functions**:
- `detect_grid_features(grid)` - analyze special characters
- `is_grid_symmetrical(grid)` - check for asymmetry
- `clean_answer_for_display(answer)` - strip special chars for text
- `extract_rebus_info(answer)` - parse comma-separated rebus
- `extract_shaded_info(answer)` - parse caret-separated shaded

#### 2. Create `app_v2.py`
**Location**: `src/crossword/app_v2.py`

**New endpoints**:
```python
@app.route('/new')
def index_v2():
    """Next-gen crossword interface"""
    return render_template('newapp_v2.html')

@app.route('/api/v2/random_crossword/<weekday>')
def get_random_crossword_v2(weekday):
    """
    Enhanced endpoint that:
    1. Fetches raw crossword
    2. Uses build_crossword_v2()
    3. Returns enhanced metadata
    4. Flags if puzzle should be skipped (asymmetrical)
    """
```

**Features**:
- Returns `skip_puzzle: true` for asymmetrical grids
- Provides detailed grid features
- Includes special character metadata
- Clean answers for display

### Phase 2: Frontend Foundation

#### 3. Create `newapp_v2.html`
**Location**: `src/crossword/templates/newapp_v2.html`

**Changes from original**:
- Load `main_v2.js` instead of `main.js`
- Add warning banner for asymmetrical puzzles
- Enhanced grid rendering container with feature flags
- Rebus square indicators
- Shaded square styling

#### 4. Create `main_v2.js`
**Location**: `src/crossword/static/main_v2.js`

**Enhanced features**:
```javascript
data() {
    return {
        // ... existing data ...
        gridFeatures: {
            isAsymmetrical: false,
            hasRebus: false,
            hasShaded: false,
            hasCircled: false,
            rebusSquares: [],
            shadedSquares: [],
            circledSquares: []
        },
        showAsymmetricalWarning: false
    }
}

methods: {
    async loadCrossword_v2(day) {
        const response = await axios.get(`/api/v2/random_crossword/${day}`);
        
        // Check if puzzle should be skipped
        if (response.data.metadata.skip_puzzle) {
            console.log('Skipping asymmetrical puzzle, getting another...');
            return this.loadCrossword_v2(day);
        }
        
        // Load enhanced features
        this.gridFeatures = response.data.grid_features;
        
        // ... rest of loading logic ...
    },
    
    renderGridCell_v2(rowIndex, cellIndex) {
        // Enhanced rendering with:
        // - Rebus square indicators
        // - Shaded background
        // - Circled letters
        // - Better black square handling
    }
}
```

#### 5. Create `styles_v2.css`
**Location**: `src/crossword/static/styles_v2.css`

**New styles**:
```css
/* Rebus square indicator */
.grid-cell.rebus {
    font-size: 0.7em;
    background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
}

/* Shaded square */
.grid-cell.shaded {
    background-color: rgba(255, 200, 100, 0.3);
}

/* Circled letter */
.grid-cell input.circled {
    border-radius: 50%;
    border: 2px solid var(--accent-color);
}

/* Asymmetrical warning banner */
.asymmetrical-warning {
    background: #ff6b6b;
    color: white;
    padding: 10px;
    text-align: center;
    display: none;
}

.asymmetrical-warning.show {
    display: block;
}
```

---

## Phase 3: Special Character Handling

### Rebus Squares (Comma-separated)
**Input**: `JOHNDEEREG,R,E,E,N`
**Processing**:
```python
def parse_rebus(answer, x, y, direction):
    if ',' not in answer:
        return {
            "display_answer": answer,
            "rebus_squares": []
        }
    
    parts = answer.split(',')
    base = parts[0]
    rebus_letters = parts[1:]
    
    rebus_squares = []
    for i, letter in enumerate(rebus_letters):
        square_x = x + len(base) + i if direction == 'across' else x
        square_y = y if direction == 'across' else y + len(base) + i
        rebus_squares.append({
            "x": square_x,
            "y": square_y,
            "letters": letter  # Could be multiple in future
        })
    
    return {
        "display_answer": ''.join(parts),
        "rebus_squares": rebus_squares
    }
```

### Shaded Squares (Caret-separated)
**Input**: `WHOLEBEANCOF^F^E^E`
**Processing**:
```python
def parse_shaded(answer, x, y, direction):
    if '^' not in answer:
        return {
            "display_answer": answer,
            "shaded_squares": []
        }
    
    parts = answer.split('^')
    clean_answer = ''.join(parts)
    
    # Find positions of shaded letters
    shaded_squares = []
    for i in range(1, len(parts)):
        # Shaded letters start after first part
        offset = len(''.join(parts[:i]))
        square_x = x + offset if direction == 'across' else x
        square_y = y if direction == 'across' else y + offset
        shaded_squares.append({"x": square_x, "y": square_y})
    
    return {
        "display_answer": clean_answer,
        "shaded_squares": shaded_squares
    }
```

### Asymmetrical Detection
```python
def is_asymmetrical(grid_lines):
    """Check if grid uses dots (.) instead of hashes (#)"""
    grid_text = '\n'.join(grid_lines)
    return '.' in grid_text

def should_skip_puzzle(crossword):
    """Determine if puzzle should be skipped in rendering"""
    if is_asymmetrical(crossword.grid):
        return True
    
    # Could add other skip criteria here
    return False
```

---

## Phase 4: Testing Strategy

### Unit Tests
**File**: `tests/test_crossword_builder_v2.py`

```python
def test_v2_rebus_parsing():
    """Test parsing comma-separated rebus squares"""
    
def test_v2_shaded_parsing():
    """Test parsing caret-separated shaded squares"""
    
def test_v2_asymmetrical_detection():
    """Test detection of asymmetrical grids"""
    
def test_v2_skip_asymmetrical():
    """Test that asymmetrical puzzles are flagged"""
```

### Integration Tests
**File**: `tests/test_app_v2.py`

```python
def test_v2_api_endpoint():
    """Test new API returns enhanced metadata"""
    
def test_v2_rebus_puzzle():
    """Test full flow with rebus puzzle (date=201511)"""
    
def test_v2_shaded_puzzle():
    """Test full flow with shaded puzzle (date=20200401)"""
```

---

## Phase 5: Rollout Plan

### Step 1: Deploy Backend Only
- Add `crossword_builder_v2.py`
- Add `app_v2.py` with new endpoints
- Test endpoints return correct data
- **No impact on existing app**

### Step 2: Deploy Frontend V2
- Add `/new` route
- Add `newapp_v2.html`
- Add `main_v2.js`
- Add `styles_v2.css`
- **Existing `/` route unchanged**

### Step 3: Testing Phase
- Test `/new` with various puzzle types
- Verify asymmetrical detection works
- Verify special characters render correctly
- Gather feedback

### Step 4: Gradual Migration (Future)
- Once confident in v2, could:
  - Make `/new` the default
  - Keep `/classic` as fallback
  - Or run both indefinitely

---

## File Structure

```
src/crossword/
├── app.py                          # UNCHANGED - current app
├── app_v2.py                       # NEW - next-gen app
├── crossword_builder.py            # UNCHANGED - current builder
├── crossword_builder_v2.py         # NEW - enhanced builder
├── entity.py                       # UNCHANGED - shared models
├── data_reader.py                  # UNCHANGED - shared reader
├── templates/
│   ├── newapp.html                 # UNCHANGED - current frontend
│   └── newapp_v2.html              # NEW - next-gen frontend
└── static/
    ├── main.js                     # UNCHANGED - current JS
    ├── main_v2.js                  # NEW - next-gen JS
    ├── styles.css                  # UNCHANGED - current CSS
    └── styles_v2.css               # NEW - next-gen CSS

tests/
├── test_crossword_builder.py      # UNCHANGED - current tests
├── test_crossword_builder_v2.py   # NEW - v2 builder tests
└── test_app_v2.py                 # NEW - v2 app tests
```

---

## Benefits of This Approach

1. **Zero Risk**: Existing app remains completely unchanged
2. **Parallel Development**: Can iterate on v2 without affecting users
3. **Easy Testing**: Can compare v1 vs v2 side-by-side
4. **Gradual Migration**: Can move users over when ready
5. **Rollback Ready**: Can always fall back to v1
6. **Learn and Iterate**: Discover issues without impacting production

---

## Next Steps

1. Create `crossword_builder_v2.py` with enhanced parsing
2. Add unit tests for special character handling
3. Create `app_v2.py` with new endpoints
4. Test backend thoroughly
5. Create frontend v2 files
6. Deploy to `/new` route
7. Test with problem puzzles
8. Iterate based on findings

---

## Configuration

Add to `pyproject.toml` or config file:
```toml
[crossword.v2]
skip_asymmetrical = true
enable_rebus = true
enable_shaded = true
enable_circled = true
max_retries_for_valid_puzzle = 10
```

This allows easy feature flagging and configuration without code changes.
