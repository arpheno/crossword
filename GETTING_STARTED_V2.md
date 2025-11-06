# Next-Gen Crossword Implementation - Getting Started

## ✅ What's Been Created

### 1. Documentation
- **`SPECIAL_CHARACTERS.md`** - Complete guide to special characters in NYT crossword API
- **`NEXT_GEN_PLAN.md`** - Detailed implementation plan for the next-gen version

### 2. Backend Infrastructure
- **`src/crossword/crossword_builder_v2.py`** - Enhanced crossword builder with:
  - Detection of asymmetrical grids (dots vs hashes)
  - Parsing of rebus squares (comma-separated letters)
  - Parsing of shaded squares (caret-separated letters)
  - Parsing of circled letters (percent-separated)
  - Clean answer extraction
  - Comprehensive metadata generation

### 3. Tests
- **`tests/test_crossword_builder_v2.py`** - Full test suite for v2 builder:
  - ✅ All 7 tests passing
  - Tests for special character parsing
  - Integration tests with real API data
  - Tests for rebus puzzles (date 201511)
  - Tests for shaded puzzles (date 20200401)

---

## 🎯 What It Does

The v2 builder returns enhanced data structure:

```json
{
  "metadata": {
    "date": "20200401",
    "title": "Puzzle Title",
    "authors": ["Author Name"],
    "is_asymmetrical": false,
    "skip_puzzle": false,
    "has_rebus": false,
    "has_shaded": true,
    "has_circled": false,
    "grid_width": 15,
    "grid_height": 15
  },
  "entries": [
    {
      "clue": "Input for a barista's grinder",
      "answer": "WHOLEBEANCOFFEE",  // Clean answer, no special chars
      "index": 17,
      "x": 0,
      "y": 2,
      "direction": "across"
    }
  ],
  "grid_features": {
    "has_rebus": false,
    "has_shaded": true,
    "has_circled": false,
    "rebus_squares": [],
    "shaded_squares": [
      {"x": 12, "y": 2, "letter": "F"},
      {"x": 13, "y": 2, "letter": "E"},
      {"x": 14, "y": 2, "letter": "E"}
    ],
    "circled_squares": []
  }
}
```

---

## 📋 Next Steps

### Immediate Next Steps (Backend)

1. **Create Flask App V2** (`src/crossword/app_v2.py`)
   ```python
   from .crossword_builder_v2 import build_crossword_v2
   
   @app.route('/new')
   def index_v2():
       return render_template('newapp_v2.html')
   
   @app.route('/api/v2/random_crossword/<weekday>')
   def get_random_crossword_v2(weekday):
       # Fetch puzzle
       # Use build_crossword_v2()
       # If skip_puzzle=True, fetch another one
       # Return enhanced data
   ```

2. **Test the API Endpoint**
   ```bash
   # Start server
   python -m flask --app src.crossword.app_v2 run
   
   # Test endpoint
   curl http://localhost:5000/api/v2/random_crossword/monday
   ```

### Frontend Implementation

3. **Create HTML Template** (`src/crossword/templates/newapp_v2.html`)
   - Copy from `newapp.html`
   - Update script src to `main_v2.js`
   - Add warning banner for asymmetrical puzzles
   - Add indicators for rebus/shaded squares

4. **Create JavaScript** (`src/crossword/static/main_v2.js`)
   - Copy from `main.js`
   - Update API endpoint to `/api/v2/random_crossword/`
   - Add handling for `skip_puzzle` flag
   - Add rebus square rendering
   - Add shaded square styling
   - Add circled letter rendering

5. **Create Styles** (`src/crossword/static/styles_v2.css`)
   - Copy from `styles.css`
   - Add rebus square styles
   - Add shaded square styles
   - Add circled letter styles
   - Add asymmetrical warning banner

---

## 🚀 Quick Start Guide

### To Test the V2 Builder

```bash
# Run tests
pytest tests/test_crossword_builder_v2.py -v

# Test with a specific puzzle
python -c "
import requests
from src.crossword.entity import Crossword
from src.crossword.crossword_builder_v2 import build_crossword_v2

# Fetch a rebus puzzle
response = requests.get('https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=201511')
crossword = Crossword.from_api_response(response.text)
result = build_crossword_v2(crossword)

print(f\"Has rebus: {result['metadata']['has_rebus']}\")
print(f\"Rebus squares: {len(result['grid_features']['rebus_squares'])}\")
"
```

### To Create the Full V2 App

1. Copy `app.py` to `app_v2.py`
2. Update imports to use `crossword_builder_v2`
3. Update endpoints to return v2 data structure
4. Add logic to skip asymmetrical puzzles
5. Create frontend files (HTML, JS, CSS)
6. Test at `/new` route

---

## 🎨 Key Design Decisions

### 1. **Preserve Existing Behavior**
- Current app (`/`) remains completely unchanged
- All existing files untouched
- Zero risk to current users

### 2. **Skip Asymmetrical Puzzles**
- Puzzles with dots (asymmetrical) are automatically skipped
- Frontend will keep fetching until it gets a symmetrical puzzle
- This avoids rendering issues for now

### 3. **Clean Answers for Display**
- All special characters (`,`, `^`, `%`) stripped from answers
- Original answers preserved in grid features metadata
- Makes word checking and display simpler

### 4. **Comprehensive Metadata**
- Frontend can make smart decisions based on features
- Can show appropriate UI indicators (rebus, shaded, etc.)
- Can validate puzzles before rendering

---

## 🧪 Testing Strategy

### Unit Tests (Done ✅)
- `test_clean_answer()` - Special character removal
- `test_detect_asymmetry()` - Asymmetry detection
- `test_parse_rebus_squares()` - Rebus parsing
- `test_parse_shaded_squares()` - Shaded parsing

### Integration Tests (Done ✅)
- `test_build_crossword_v2_with_shaded()` - Real API puzzle with shaded
- `test_build_crossword_v2_with_rebus()` - Real API puzzle with rebus
- `test_v2_skip_asymmetrical()` - Asymmetry flagging

### API Tests (To Do)
- Test `/api/v2/random_crossword/<weekday>` endpoint
- Test retry logic for asymmetrical puzzles
- Test all weekdays return valid puzzles

### Frontend Tests (To Do)
- Test rendering of shaded squares
- Test rendering of rebus squares
- Test skipping of asymmetrical puzzles
- Test user interaction with special features

---

## 📊 Status Summary

**Backend**: 80% Complete
- ✅ Core builder logic
- ✅ Special character parsing
- ✅ Asymmetry detection
- ✅ Tests passing
- ⏳ Flask endpoints
- ⏳ Integration with existing data reader

**Frontend**: 0% Complete
- ⏳ HTML template
- ⏳ JavaScript logic
- ⏳ CSS styles
- ⏳ User testing

**Documentation**: 100% Complete
- ✅ Special characters guide
- ✅ Implementation plan
- ✅ Getting started guide

---

## 🎯 Success Criteria

The v2 implementation will be considered successful when:

1. ✅ Can parse all special characters correctly
2. ✅ Can detect asymmetrical puzzles
3. ⏳ `/new` route loads and displays puzzles
4. ⏳ Asymmetrical puzzles are automatically skipped
5. ⏳ Rebus squares are visually indicated
6. ⏳ Shaded squares have appropriate styling
7. ⏳ All existing `/` functionality remains unchanged
8. ⏳ Users can play puzzles that previously broke

---

## 💡 Future Enhancements

After v2 is stable:

1. **Support Asymmetrical Puzzles**
   - Create special renderer for non-standard grids
   - Handle puzzles with bars and special shapes

2. **Visual Rebus Support**
   - Show multiple letters in single square
   - Handle theme-based rebus content

3. **Theme Detection**
   - Automatically highlight theme answers
   - Show theme explanation

4. **Statistics**
   - Track which special features users encounter
   - Measure success rates on different puzzle types

---

## 📞 Need Help?

Refer to:
- `SPECIAL_CHARACTERS.md` for character meanings
- `NEXT_GEN_PLAN.md` for detailed implementation
- `tests/test_crossword_builder_v2.py` for usage examples
- Existing `app.py` and `main.js` for patterns to follow

---

## 🎉 Ready to Continue!

The foundation is built and tested. You can now:
1. Create the Flask v2 app with new endpoints
2. Build the frontend interface
3. Test with problematic puzzles
4. Iterate and improve

**Zero risk to existing functionality - develop with confidence!**
