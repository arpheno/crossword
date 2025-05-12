import pytest
from crossword.crossword_builder import process_rebus_grid


def test_process_rebus_grid_basic():
    """Test basic grid processing without rebus entries"""
    grid = [
        "CAT",
        "ARE",
        "TEA"
    ]
    processed_grid, rebus_map = process_rebus_grid(grid)
    
    assert processed_grid == grid  # Should be unchanged
    assert rebus_map == {}  # Should be empty


def test_process_rebus_grid_with_rebus():
    """Test grid processing with rebus entries"""
    grid = [
        "A,B,C#X",
        "E,F#Y",
        "G,H,I#Z"
    ]
    expected_grid = [
        "+#X",      # ABC becomes +
        "+#Y",    # EF becomes +
        "+#Z"       # GHI becomes +
    ]
    expected_rebus = {
        (0, 0): "ABC",
        (0, 1): "EF",
        (0, 2): "GHI"
    }
    
    processed_grid, rebus_map = process_rebus_grid(grid)
    
    assert processed_grid == expected_grid
    assert rebus_map == expected_rebus




def test_process_rebus_grid_edge_cases():
    """Test edge cases in grid processing"""
    grid = [
        "",               # Empty row
        "A,B",           # Rebus at end
        "#A,B#",         # Rebus between hashtags
        "A,B,C,D,E"      # Multiple consecutive rebus
    ]
    
    processed_grid, rebus_map = process_rebus_grid(grid)
    
    # Verify rebus entries are mapped correctly
    assert (0, 1) in rebus_map  # AB in second row
    assert (1, 2) in rebus_map  # AB in third row
    assert len(rebus_map) > 0   # Should have rebus entries
    
    # Verify empty row is handled
    assert processed_grid[0] == ""