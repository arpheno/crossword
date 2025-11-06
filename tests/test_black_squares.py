import pytest
import requests
from crossword.crossword_builder import build_crossword
from crossword.crossword_builder_v2 import (
    build_crossword_v2,
    is_black_square,
    normalize_grid,
    detect_asymmetry
)
from crossword.entity import Crossword


def test_is_black_square():
    """Test that both # and . are recognized as black squares"""
    assert is_black_square('#') == True
    assert is_black_square('.') == True
    assert is_black_square('A') == False
    assert is_black_square(' ') == False
    assert is_black_square(',') == False


def test_normalize_grid():
    """Test grid normalization removes trailing dots"""
    grid = [
        "CAT#DOG#FOX.",
        "ARE#OWL#BAT.",
        "TEA#HAM#PIG."
    ]
    normalized = normalize_grid(grid)
    
    # Should convert dots to hashes and strip trailing ones
    assert all('.' not in row for row in normalized)
    assert normalized[0] == "CAT#DOG#FOX"
    assert normalized[1] == "ARE#OWL#BAT"
    assert normalized[2] == "TEA#HAM#PIG"


def test_puzzle_with_dots_202033():
    """Test puzzle with dots at end of every row"""
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "202033"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    crossword = Crossword.from_api_response(response.text)
    
    # Verify dots are present
    assert any('.' in row for row in crossword.grid)
    
    # Build with original builder
    entries = build_crossword(crossword)
    
    # Should successfully create entries
    assert len(entries) > 0
    
    # No entry should have a dot in the answer
    for entry in entries:
        assert '.' not in entry.answer, f"Entry {entry.index} has dot in answer: {entry.answer}"


def test_puzzle_with_dots_v2_builder():
    """Test v2 builder handles dots correctly"""
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "202033"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    crossword = Crossword.from_api_response(response.text)
    result = build_crossword_v2(crossword)
    
    # Should not skip this puzzle
    assert result["metadata"]["skip_puzzle"] == False
    
    # Should have entries
    assert len(result["entries"]) > 0
    
    # No entry should have special characters in cleaned answers
    for entry in result["entries"]:
        assert '.' not in entry["answer"]
        assert '#' not in entry["answer"]


def test_puzzle_with_rebus_and_dots():
    """Test rebus puzzle that also has dots"""
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "201511"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    crossword = Crossword.from_api_response(response.text)
    
    # Verify both commas and dots are present
    grid_text = '\n'.join(crossword.grid)
    assert ',' in grid_text
    assert '.' in grid_text
    
    # Build entries
    entries = build_crossword(crossword)
    
    # Should successfully create entries
    assert len(entries) > 0
    
    # Entries should have commas (rebus) but not dots
    comma_count = sum(1 for entry in entries if ',' in entry.answer)
    dot_count = sum(1 for entry in entries if '.' in entry.answer)
    
    assert comma_count > 0, "Should have some rebus entries with commas"
    assert dot_count == 0, "Should not have any entries with dots"


def test_black_square_detection_across():
    """Test that across words stop at both # and ."""
    # Create a simple crossword with dots
    from crossword.entity import Clue
    crossword = Crossword(
        date="test",
        title="Test",
        authors=["Test"],
        size={"rows": 3, "cols": 5},
        grid=[
            "CAT..",
            "ARE..",
            "TEA.."
        ],
        across=[
            Clue(hint="Feline"),
            Clue(hint="To be"),
            Clue(hint="Drink")
        ],
        down=[
            Clue(hint="Vehicle"),
            Clue(hint="Plural"),
            Clue(hint="Plural")
        ]
    )
    
    entries = build_crossword(crossword)
    
    # All across entries should be 3 letters (stop at dot)
    across_entries = [e for e in entries if e.direction == 'across']
    for entry in across_entries:
        assert len(entry.answer) == 3, f"Across entry should be 3 letters, got: {entry.answer}"
        assert '.' not in entry.answer


def test_black_square_detection_down():
    """Test that down words stop at both # and ."""
    from crossword.entity import Clue
    crossword = Crossword(
        date="test",
        title="Test",
        authors=["Test"],
        size={"rows": 5, "cols": 3},
        grid=[
            "CAT",
            "ARE",
            "TEA",
            "...",
            "..."
        ],
        across=[
            Clue(hint="Feline"),
            Clue(hint="To be"),
            Clue(hint="Drink")
        ],
        down=[
            Clue(hint="Vehicle"),
            Clue(hint="Plural"),
            Clue(hint="Plural")
        ]
    )
    
    entries = build_crossword(crossword)
    
    # All down entries should be 3 letters (stop at dot row)
    down_entries = [e for e in entries if e.direction == 'down']
    for entry in down_entries:
        assert len(entry.answer) == 3, f"Down entry should be 3 letters, got: {entry.answer}"
        assert '.' not in entry.answer


def test_mixed_black_squares():
    """Test grid with both # and . as black squares"""
    from crossword.entity import Clue
    crossword = Crossword(
        date="test",
        title="Test",
        authors=["Test"],
        size={"rows": 3, "cols": 7},
        grid=[
            "CAT#DOG.",
            "ARE.OWL.",
            "TEA#BAT."
        ],
        across=[
            Clue(hint="1"),
            Clue(hint="2"),
            Clue(hint="3"),
            Clue(hint="4"),
            Clue(hint="5"),
            Clue(hint="6")
        ],
        down=[]
    )
    
    entries = build_crossword(crossword)
    
    # Check that words are correctly bounded by both # and .
    across_entries = sorted([e for e in entries if e.direction == 'across'], key=lambda x: (x.y, x.x))
    
    # Should have CAT, DOG, ARE, OWL, TEA, BAT
    assert len(across_entries) == 6
    answers = [e.answer for e in across_entries]
    
    # Verify none have black squares in them
    for answer in answers:
        assert '#' not in answer
        assert '.' not in answer


def test_detect_asymmetry_false_for_dots():
    """Test that dots alone don't indicate asymmetry"""
    # Regular grid with trailing dots
    grid = [
        "CAT#DOG.",
        "ARE#OWL.",
        "TEA#BAT."
    ]
    
    # Should not be considered asymmetrical (dots are just padding)
    is_asym = detect_asymmetry(grid)
    assert is_asym == False, "Regular grid with trailing dots should not be asymmetrical"


def test_actual_asymmetry_detection():
    """Test detection of truly asymmetrical grids"""
    # Grid with very different row lengths (actual asymmetry)
    asymmetric_grid = [
        "LONGWORD",
        "SHORT",
        "MEDIUM#X"
    ]
    
    is_asym = detect_asymmetry(asymmetric_grid)
    assert is_asym == True, "Grid with very different row lengths should be asymmetrical"
