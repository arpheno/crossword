import pytest
import requests
from crossword.crossword_builder_v2 import (
    build_crossword_v2,
    detect_asymmetry,
    clean_answer,
    parse_rebus_squares,
    parse_shaded_squares,
    parse_circled_squares
)
from crossword.entity import Crossword, CrosswordEntry


def test_clean_answer():
    """Test cleaning special characters from answers"""
    assert clean_answer("WHOLEBEANCOF^F^E^E") == "WHOLEBEANCOFFEE"
    assert clean_answer("JOHNDEEREG,R,E,E,N") == "JOHNDEEREGREEN"
    assert clean_answer("WORD%O%D") == "WORDOD"  # Strips %, not preserves O
    assert clean_answer("NORMAL") == "NORMAL"
    assert clean_answer("MIX^E^D,T,E%S%T") == "MIXEDTEST"


def test_detect_asymmetry():
    """Test detection of asymmetrical grids"""
    symmetrical_grid = ["CAT#DOG", "ARE#OWL", "TEA#HAM"]
    assert detect_asymmetry(symmetrical_grid) == False
    
    # Dots are just end markers, not asymmetry indicators
    grid_with_dots = ["CAT#DOG.", "ARE#OWL.", "TEA#HAM."]
    assert detect_asymmetry(grid_with_dots) == False
    
    # Truly asymmetrical grid has very different row lengths
    truly_asymmetrical = ["LONGWORD", "SHORT", "MED"]
    assert detect_asymmetry(truly_asymmetrical) == True


def test_parse_rebus_squares():
    """Test parsing rebus squares from entries"""
    entry = CrosswordEntry(
        clue="Test clue",
        answer="JOHNDEEREG,R,E,E,N",
        index=1,
        x=0,
        y=0,
        direction="across"
    )
    
    rebus_squares = parse_rebus_squares(entry)
    assert len(rebus_squares) == 4  # G, R, E, E, N
    assert rebus_squares[0]["x"] == 10  # After "JOHNDEEREG"
    assert rebus_squares[0]["y"] == 0
    assert rebus_squares[0]["letters"] == "R"


def test_parse_shaded_squares():
    """Test parsing shaded squares from entries"""
    entry = CrosswordEntry(
        clue="Input for a barista's grinder",
        answer="WHOLEBEANCOF^F^E^E",
        index=17,
        x=0,
        y=2,
        direction="across"
    )
    
    shaded_squares = parse_shaded_squares(entry)
    assert len(shaded_squares) == 3  # F, E, E
    assert shaded_squares[0]["letter"] == "F"
    assert shaded_squares[1]["letter"] == "E"


def test_build_crossword_v2_with_shaded():
    """Test building a crossword with shaded squares from API"""
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "20200401"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    crossword = Crossword.from_api_response(response.text)
    result = build_crossword_v2(crossword)
    
    # Verify structure
    assert "metadata" in result
    assert "entries" in result
    assert "grid_features" in result
    
    # Verify metadata
    assert result["metadata"]["date"] is not None
    assert isinstance(result["metadata"]["is_asymmetrical"], bool)
    assert isinstance(result["metadata"]["has_shaded"], bool)
    
    # This puzzle has shaded squares
    assert result["metadata"]["has_shaded"] == True
    assert len(result["grid_features"]["shaded_squares"]) > 0
    
    # Verify entries have clean answers
    for entry in result["entries"]:
        assert '^' not in entry["answer"]
        assert ',' not in entry["answer"]
        assert '%' not in entry["answer"]


def test_build_crossword_v2_with_rebus():
    """Test building a crossword with rebus squares from API"""
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "201511"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    crossword = Crossword.from_api_response(response.text)
    result = build_crossword_v2(crossword)
    
    # Verify structure
    assert "metadata" in result
    assert "entries" in result
    assert "grid_features" in result
    
    # This puzzle has rebus squares
    assert result["metadata"]["has_rebus"] == True
    assert len(result["grid_features"]["rebus_squares"]) > 0
    
    # Verify rebus square information
    first_rebus = result["grid_features"]["rebus_squares"][0]
    assert "x" in first_rebus
    assert "y" in first_rebus
    assert "letters" in first_rebus
    
    # Verify entries have clean answers
    for entry in result["entries"]:
        assert '^' not in entry["answer"]
        assert ',' not in entry["answer"]
        assert '%' not in entry["answer"]


def test_v2_skip_asymmetrical():
    """Test that truly asymmetrical puzzles are flagged"""
    # Dots are just end markers, should NOT be flagged as asymmetrical
    grid_with_dots = ["CAT#DOG.", "ARE#OWL."]
    assert detect_asymmetry(grid_with_dots) == False
    
    # Truly asymmetrical grid
    truly_asymmetrical = ["VERYLONGWORD", "SHORT"]
    assert detect_asymmetry(truly_asymmetrical) == True
