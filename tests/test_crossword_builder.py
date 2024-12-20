import pytest
from crossword.crossword_builder import build_crossword
from crossword.crossword_builder import process_rebus_grid
from .factories import CrosswordFactory


def test_build_crossword_with_rebus(sample_crossword):
    """Test that rebus entries (comma-separated letters) are handled correctly"""
    entries = build_crossword(sample_crossword)
    
    rebus_entry = next(
        entry for entry in entries 
        if entry.direction == "across" and entry.y == 1 and entry.x == 0
    )
    
    assert rebus_entry.answer == "ABC"
    assert rebus_entry.x == 0
    assert rebus_entry.y == 1


def test_build_crossword_basic_functionality(simple_crossword):
    """Test basic crossword building without rebus entries"""
    entries = build_crossword(simple_crossword)
    
    assert len(entries) == 6
    
    first_across = next(
        entry for entry in entries 
        if entry.direction == "across" and entry.y == 0
    )
    assert first_across.answer == "CAT"
    assert first_across.x == 0
    assert first_across.y == 0


def test_rebus_processing():
    """Test specific rebus processing functionality"""
    crossword = CrosswordFactory(
        grid=[
            "A,B,C#X",
            "D#E,F#Y",
            "G,H,I#Z"
        ],
        across=[
            {'hint': "ABC", 'answer': "ABC"},
            {'hint': "X", 'answer': "X"},
            {'hint': "D", 'answer': "D"},
            {'hint': "EF", 'answer': "EF"},
            {'hint': "Y", 'answer': "Y"},
            {'hint': "GHI", 'answer': "GHI"},
            {'hint': "Z", 'answer': "Z"}
        ],
        down=[
            {'hint': "ADG", 'answer': "ADG"},
            {'hint': "XYZ", 'answer': "XYZ"}
        ]
    )
    
    entries = build_crossword(crossword)
    
    rebus_entries = [
        entry for entry in entries 
        if any(c not in "#XYZ" for c in entry.answer) and len(entry.answer) > 1
    ]
    
    assert any(entry.answer == "ABC" for entry in rebus_entries)
    assert any(entry.answer == "EF" for entry in rebus_entries)
    assert any(entry.answer == "GHI" for entry in rebus_entries)


def test_build_crossword_with_repeated_rebus():
    """Test building a crossword with multiple instances of the same rebus entry"""
    grid = [
        "APP#ARGO#DWELLS",
        "LOU#SEAM#OHLOOK",
        "ALLTHINGSBEINGE,Q,U,A,L",
    ]
    processed_grid, rebus_map = process_rebus_grid(grid)
    print(f"Processed grid: {processed_grid}")
    print(f"Rebus map: {rebus_map}")
    assert processed_grid[-1][-1]=="+"