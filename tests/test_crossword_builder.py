import pytest
import requests
from crossword.crossword_builder import build_crossword
from crossword.entity import Crossword
from .factories import CrosswordFactory


def test_build_crossword_basic_functionality(simple_crossword):
    """Test basic crossword building"""
    entries = build_crossword(simple_crossword)
    
    assert len(entries) == 6
    
    first_across = next(
        entry for entry in entries 
        if entry.direction == "across" and entry.y == 0
    )
    assert first_across.answer == "CAT"
    assert first_across.x == 0
    assert first_across.y == 0

def test_build_crossword_from_nyt_api():
    """Test reading and building a crossword from NYT API with carets (shaded squares)"""
    # Fetch data from the API - this puzzle has ^ for shaded background squares
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "20200401"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    # Parse the response into a Crossword object
    crossword = Crossword.from_api_response(response.text)
    
    # Verify the crossword was parsed correctly
    assert crossword.date is not None
    assert len(crossword.grid) > 0
    assert len(crossword.across) > 0
    assert len(crossword.down) > 0
    
    # Build the crossword entries
    entries = build_crossword(crossword)
    
    # Verify entries were created
    assert len(entries) > 0
    
    # Verify we have both across and down entries
    across_entries = [e for e in entries if e.direction == "across"]
    down_entries = [e for e in entries if e.direction == "down"]
    
    assert len(across_entries) > 0
    assert len(down_entries) > 0
    
    # Verify entry structure
    for entry in entries:
        assert entry.clue is not None
        assert entry.answer is not None
        assert len(entry.answer) > 0
        assert entry.index > 0
        assert entry.x >= 0
        assert entry.y >= 0
        assert entry.direction in ["across", "down"]


def test_build_crossword_with_rebus():
    """Test reading and building a crossword with actual rebus squares (comma-separated letters)"""
    # Fetch data from the API - this puzzle has commas separating rebus letters
    # Example: JOHNDEEREG,R,E,E,N means "JOHNDEERGREEN" where R,E,E,N are in rebus squares
    url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    params = {"date": "201511"}
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    # Parse the response into a Crossword object
    crossword = Crossword.from_api_response(response.text)
    
    # Verify the crossword was parsed correctly
    assert crossword.date is not None
    assert len(crossword.grid) > 0
    assert len(crossword.across) > 0
    assert len(crossword.down) > 0
    
    # Verify grid contains commas (rebus indicators)
    grid_text = '\n'.join(crossword.grid)
    assert ',' in grid_text, "Expected rebus puzzle to contain comma-separated letters"
    
    # Build the crossword entries
    entries = build_crossword(crossword)
    
    # Verify entries were created
    assert len(entries) > 0
    
    # Verify we have both across and down entries
    across_entries = [e for e in entries if e.direction == "across"]
    down_entries = [e for e in entries if e.direction == "down"]
    
    assert len(across_entries) > 0
    assert len(down_entries) > 0
    
    # Check that some entries contain commas (rebus squares)
    entries_with_rebus = [e for e in entries if ',' in e.answer]
    assert len(entries_with_rebus) > 0, "Expected at least some entries with rebus squares"
    
    # Verify entry structure
    for entry in entries:
        assert entry.clue is not None
        assert entry.answer is not None
        assert len(entry.answer) > 0
        assert entry.index > 0
        assert entry.x >= 0
        assert entry.y >= 0
        assert entry.direction in ["across", "down"]
