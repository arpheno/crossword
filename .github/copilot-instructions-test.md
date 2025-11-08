# GitHub Copilot Test Instructions

**This file applies when working with any `test_*.py` files or files in the `tests/` directory.**

## Testing Framework
- **Framework**: pytest (NEVER use unittest)
- **Execution**: ALWAYS use `make test` (NEVER run `pytest` directly)
- **Verification**: ALWAYS run `make test` after creating or modifying any test

## Test File Structure

### Naming Conventions
- Test files: `test_<feature>.py` (e.g., `test_parser.py`, `test_integration.py`)
- Test functions: `test_should_<expected_behavior>_when_<condition>()`
- Test classes: `Test<Feature>` (e.g., `TestParser`, `TestCrosswordAPI`)

### Standard Test Template
```python
"""Tests for <feature description>."""
import pytest
from src.crossword import <module>

@pytest.fixture
def sample_data():
    """Fixture description."""
    return <test_data>

def test_should_parse_valid_input_when_format_correct(sample_data):
    """Test that parser handles valid input correctly."""
    # Arrange
    expected = <expected_result>
    
    # Act
    result = function_under_test(sample_data)
    
    # Assert
    assert result == expected
```

## Fixture Guidelines

### Where to Define Fixtures
- **Project-wide fixtures**: `conftest.py` in root directory
- **Module-specific fixtures**: Within the test file itself
- **Shared test data**: Use factory-boy factories

### Fixture Patterns
```python
@pytest.fixture
def app():
    """Create Flask app for testing."""
    from src.crossword.app import app as flask_app
    flask_app.config['TESTING'] = True
    yield flask_app

@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()

@pytest.fixture
def db_session():
    """Create database session for testing."""
    from src.crossword.database import db
    db.create_all()
    yield db.session
    db.session.rollback()
    db.drop_all()
```

## Testing Best Practices

### Arrange-Act-Assert Pattern
Always structure tests with clear sections:
```python
def test_should_return_404_when_puzzle_not_found(client):
    # Arrange
    invalid_date = "999999"
    
    # Act
    response = client.get(f'/api/crossword/{invalid_date}')
    
    # Assert
    assert response.status_code == 404
    assert "error" in response.json
```

### Parametrize for Multiple Cases
```python
@pytest.mark.parametrize("date,expected", [
    ("231026", True),
    ("invalid", False),
    ("", False),
])
def test_date_validation(date, expected):
    result = validate_date(date)
    assert result == expected
```

### Mock External Dependencies
```python
from unittest.mock import patch, Mock

def test_should_fetch_crossword_from_api():
    with patch('src.crossword.data_reader.requests.get') as mock_get:
        mock_get.return_value = Mock(status_code=200, text="puzzle_data")
        reader = DataReader()
        result = reader._fetch_data("231026")
        assert result == "puzzle_data"
        mock_get.assert_called_once()
```

## Test Categories

### Unit Tests
- Test individual functions/methods in isolation
- Mock all external dependencies
- Fast execution (< 1 second per test)
- File pattern: `test_<module>.py`

### Integration Tests
- Test multiple components working together
- May use real database (with cleanup)
- Test full request/response cycles
- File pattern: `test_integration.py` or `test_<feature>_integration.py`

### API Tests
```python
def test_api_get_crossword_success(client):
    """Test successful crossword retrieval."""
    response = client.get('/api/crossword/231026')
    assert response.status_code == 200
    data = response.json
    assert "metadata" in data
    assert "entries" in data
```

## Factory-Boy Usage

### Define Factories
```python
import factory
from src.crossword.models import Character, Entry

class CharacterFactory(factory.Factory):
    class Meta:
        model = Character
    
    letter = "A"
    is_circled = False
    is_shaded = False

class EntryFactory(factory.Factory):
    class Meta:
        model = Entry
    
    clue = factory.Faker('sentence')
    answer = factory.Faker('word')
    direction = "across"
```

### Use in Tests
```python
def test_entry_creation():
    entry = EntryFactory(answer="HELLO", clue="Greeting")
    assert entry.answer == "HELLO"
    assert entry.clue == "Greeting"
```

## Running Tests

### Standard Commands
```bash
make test              # Run all tests (ALWAYS use this)
make test-cov          # Run with coverage report
```

### NEVER Use These Directly
❌ `pytest`
❌ `python -m pytest`
❌ `pytest tests/`
❌ `pytest -v`

### After Every Test Change
1. Save the test file
2. Run `make test`
3. Verify all tests pass
4. If any fail, fix them before committing

## Common Test Patterns for This Project

### Testing Pydantic Models
```python
def test_crossword_metadata_validation():
    """Test that metadata validates correctly."""
    from src.crossword.models import CrosswordMetadata
    
    metadata = CrosswordMetadata(
        date="231026",
        title="Test Puzzle",
        authors=["John Doe"],
        width=15,
        height=15
    )
    assert metadata.date == "231026"
    assert metadata.title == "Test Puzzle"
```

### Testing Flask Routes
```python
def test_post_completed_puzzle(client):
    """Test saving a completed puzzle."""
    data = {
        "puzzle_date": "231026",
        "title": "Monday Puzzle",
        "solve_time": 300
    }
    response = client.post('/api/completed', json=data)
    assert response.status_code == 201
    assert response.json["data"]["puzzle_date"] == "231026"
```

### Testing Database Operations
```python
def test_save_and_retrieve_puzzle(db_session):
    """Test database persistence."""
    from src.crossword.database import CompletedPuzzle
    
    puzzle = CompletedPuzzle(
        puzzle_date="231026",
        title="Test",
        solve_time=300
    )
    db_session.add(puzzle)
    db_session.commit()
    
    retrieved = CompletedPuzzle.query.filter_by(puzzle_date="231026").first()
    assert retrieved is not None
    assert retrieved.title == "Test"
```

### Testing Parser
```python
def test_parser_handles_rebus():
    """Test that parser correctly handles rebus cells."""
    from src.crossword.parser import NYTFormatParser
    
    raw_data = "..."  # NYT format data
    crossword = NYTFormatParser.parse(raw_data)
    
    # Find rebus cell
    rebus_char = crossword.entries[0].characters[0]
    assert len(rebus_char.letter) > 1  # Rebus has multiple letters
```

## Debugging Failed Tests

### Add Debug Output
```python
def test_complex_operation():
    result = complex_operation()
    print(f"Debug: result = {result}")  # Will show in pytest output
    assert result == expected
```

### Use pytest flags (via make test)
The Makefile handles appropriate flags. If you need verbose output temporarily, modify the test to be more explicit with assertions.

## Remember
- ✅ ALWAYS use `make test`
- ✅ ALWAYS verify tests pass after changes
- ✅ Use descriptive test names
- ✅ Follow Arrange-Act-Assert pattern
- ✅ Use fixtures for common setup
- ✅ Mock external dependencies
- ❌ NEVER run `pytest` directly
- ❌ NEVER skip running tests after changes
