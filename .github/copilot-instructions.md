# GitHub Copilot Custom Instructions

## Project Context
This is a Flask-based crossword puzzle application for solving NYT-style puzzles with offline support. The app fetches puzzles from the NYT syndication API, parses them using Pydantic models, and provides an interactive Vue.js frontend.

## Tech Stack & Versions
- **Backend**: Flask 3.x with Flask-SQLAlchemy
- **Frontend**: Vue.js 2.6 (Options API), Axios, vanilla JavaScript
- **Data Validation**: Pydantic 2.x for domain models
- **Database**: SQLite with SQLAlchemy ORM
- **Testing**: pytest with factory-boy
- **Package Manager**: uv (modern Python package manager)
- **Python**: 3.13+

## ⚠️ CRITICAL: Always Use Makefile Commands
**NEVER run commands directly - ALWAYS use the Makefile:**
- `make bootstrap` - First-time setup (installs uv, creates venv, installs deps)
- `make run` - Start development server (DO NOT use `flask run` or `python run.py`)
- `make test` - Run all tests (DO NOT use `pytest` directly)
- `make test-cov` - Run tests with coverage
- `make clean` - Clean cache files

**When the user asks to:**
- "run the app" → use `make run`
- "start the server" → use `make run`
- "run tests" → use `make test`
- "check coverage" → use `make test-cov`

## Dependency Management
**ALWAYS use `uv` and `pyproject.toml` for dependencies:**
- Add dependencies: `uv add <package-name>`
- Add dev dependencies: `uv add --dev <package-name>`
- Update all dependencies: `uv lock --upgrade`
- Sync environment: `uv sync`
- **NEVER** manually edit `pyproject.toml` dependencies - use `uv add` instead
- **NEVER** use `pip install` - always use `uv add`

When suggesting new dependencies, provide the `uv add` command.

## Code Generation Guidelines

### Python Code Style
- Always include type hints for function parameters and return values
- Use Pydantic best practices with `computed_field` decorator for derived properties
- Prefer f-strings for string formatting
- Use descriptive variable names (e.g., `puzzle_date` not `pd`)
- Keep functions focused and single-purpose

### Flask API Patterns
When generating Flask routes:
- Use `/api/` prefix for all API endpoints
- Return appropriate HTTP status codes (200, 201, 400, 404, 500)
- Always use `jsonify()` for JSON responses
- Wrap database operations in try-except blocks with `db.session.rollback()` on errors
- Include error handling with descriptive error messages

**Example API endpoint:**
```python
@app.route('/api/resource/<id>', methods=['GET'])
def get_resource(id: str):
    try:
        resource = Resource.query.get(id)
        if not resource:
            return jsonify({"error": "Resource not found"}), 404
        return jsonify({"data": resource.to_dict()}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
```

### Database Operations
- Use SQLAlchemy ORM with declarative base
- Store JSON data as TEXT columns, serialize with `json.dumps()`/`json.loads()`
- Implement `to_dict()` methods for model serialization
- Always wrap operations in try-except with rollback on errors

### Frontend JavaScript
- Use Vue.js 2.6 Options API (not Composition API)
- Place all JavaScript in `src/crossword/static/main.js`
- Use Axios for HTTP requests
- **Critical**: All external libraries must be downloaded locally to `src/crossword/static/lib/` for offline support (no CDN links)

### Domain Model Structure
The app uses a specific crossword structure:
```
Crossword
├── CrosswordMetadata (date, title, authors, dimensions)
└── List[Entry] (clues and answers)
    └── List[Character] (individual cells with letters, styling)
```

**Key concepts:**
- **Entry**: One clue + answer (across/down), positioned at (start_x, start_y)
- **Character**: One cell (letter, rebus, circled, or shaded)
- No explicit grid - Entry positions define the grid implicitly

### Date Handling Convention
- Always use `YYMMDD` format (e.g., "231026" for October 26, 2023)
- Use `datetime.strftime("%y%m%d")` for formatting
- Use `datetime.strptime(date, "%y%m%d")` for parsing

### Testing Patterns
**CRITICAL: Always use pytest and verify with `make test`**
- Place unit tests in `tests/test_*.py`
- Use pytest fixtures for common setup (define in `conftest.py`)
- Use factory-boy for test data generation
- Integration tests should test full request/response cycle
- **ALWAYS run `make test` after generating or modifying tests**
- **NEVER run `pytest` directly** - use `make test` instead
- Use descriptive test names: `test_should_do_something_when_condition()`
- Each test file should focus on one module or feature

## File Organization
- `src/crossword/app.py` - Flask routes and app configuration
- `src/crossword/models.py` - Pydantic domain models
- `src/crossword/database.py` - SQLAlchemy models
- `src/crossword/parser.py` - NYT format parser
- `src/crossword/data_reader.py` - API client
- `src/crossword/static/` - Frontend assets (JS, CSS)
- `src/crossword/templates/` - Jinja2 templates
- `tests/` - All test files

## Common Code Patterns

### Fetching and Parsing Crosswords
```python
reader = DataReader(base_url=base_url)
api_text = reader._fetch_data(formatted_date)
crossword = NYTFormatParser.parse(api_text)
```

### Serializing Pydantic Models for API Responses
```python
response_data = {
    "metadata": crossword.metadata.model_dump(),
    "entries": [entry.model_dump() for entry in crossword.entries]
}
return jsonify(response_data)
```

### Database CRUD Operations
```python
try:
    puzzle = CompletedPuzzle(puzzle_date=date, title=title)
    db.session.add(puzzle)
    db.session.commit()
    return jsonify({"data": puzzle.to_dict()}), 201
except Exception as e:
    db.session.rollback()
    return jsonify({"error": str(e)}), 500
```

## Special Considerations

### Offline Support Requirement
- All external JavaScript libraries MUST be local files in `static/lib/`
- Never suggest CDN links in production code
- Download and vendor all external dependencies

### Special Puzzle Features
- Puzzles can contain rebuses (multiple letters in one cell)
- Cells can be circled or shaded
- See `SPECIAL_CHARACTERS.md` for implementation details

### RESTful API Conventions
```
GET    /api/resource          # List all
GET    /api/resource/<id>     # Get one
POST   /api/resource          # Create
DELETE /api/resource/<id>     # Delete
```

## When Suggesting New Features
Consider these questions:
1. Does this need database persistence?
2. Is this a new domain concept requiring a Pydantic model?
3. Should this be a RESTful API endpoint?
4. Does this need to work offline?
5. Will existing tests need updates?

## Implementation Order
When adding features, follow this sequence:
1. Add Pydantic domain models (in `models.py`)
2. Add SQLAlchemy database models if persistence needed (in `database.py`)
3. Add Flask API routes following RESTful conventions (in `app.py`)
4. Add Vue.js frontend logic (in `static/main.js`)
5. Add tests for new functionality (in `tests/`)
