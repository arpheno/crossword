import pytest
from crossword.crossword_builder import build_crossword
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
