from typing import List, Tuple, Set, Dict, Any

from .entity import CrosswordEntry, Crossword
from .crossword_builder import (
    build_crossword,
    as_array,
    pad_crossword,
    unpad_crossword
)


def build_crossword_v2(crossword: Crossword) -> Dict[str, Any]:
    """
    Enhanced crossword builder that returns detailed metadata and features.
    
    This version:
    - Detects asymmetrical grids (using dots instead of hashes)
    - Parses rebus squares (comma-separated letters)
    - Identifies shaded squares (caret-separated letters)
    - Identifies circled letters (percent-separated)
    - Returns clean answers alongside feature metadata
    
    Args:
        crossword: Crossword object from API
        
    Returns:
        Dict containing:
        - metadata: Enhanced puzzle metadata
        - entries: List of CrosswordEntry objects with clean answers
        - grid_features: Special character features
    """
    # Build entries using original builder
    entries = build_crossword(crossword)
    
    # Analyze grid for special features
    grid_features = analyze_grid_features(crossword.grid, entries)
    
    # Determine if puzzle should be skipped
    is_asymmetrical = detect_asymmetry(crossword.grid)
    
    # Clean answers for display
    cleaned_entries = []
    for entry in entries:
        cleaned_entry = entry.model_copy()
        cleaned_entry.answer = clean_answer(entry.answer)
        cleaned_entries.append(cleaned_entry)
    
    return {
        "metadata": {
            "date": crossword.date,
            "title": crossword.title,
            "authors": crossword.authors,
            "is_asymmetrical": is_asymmetrical,
            "skip_puzzle": False,  # Don't skip puzzles - dots are just end-of-line markers
            "has_rebus": grid_features["has_rebus"],
            "has_shaded": grid_features["has_shaded"],
            "has_circled": grid_features["has_circled"],
            "grid_width": len(crossword.grid[0]) if crossword.grid else 0,
            "grid_height": len(crossword.grid)
        },
        "entries": [entry.model_dump() for entry in cleaned_entries],
        "grid_features": grid_features
    }


def is_black_square(char: str) -> bool:
    """
    Check if a character represents a black square.
    
    Both '#' and '.' are black squares:
    - '#' is the standard black square marker
    - '.' appears at end of rows as padding/terminal markers
    
    Args:
        char: Single character from grid
        
    Returns:
        True if character is a black square
    """
    return char in ['#', '.']


def normalize_grid(grid: List[str]) -> List[str]:
    """
    Normalize grid by converting all black squares to '#' and removing trailing dots.
    
    Args:
        grid: List of grid row strings
        
    Returns:
        Normalized grid with consistent black square markers
    """
    normalized = []
    for row in grid:
        # Replace dots with hashes for consistency
        normalized_row = row.replace('.', '#')
        # Strip trailing black squares that are just padding
        normalized_row = normalized_row.rstrip('#')
        normalized.append(normalized_row)
    
    return normalized


def detect_asymmetry(grid: List[str]) -> bool:
    """
    Detect if grid is truly asymmetrical (non-square or irregular shape).
    
    NOTE: Dots (.) are NOT indicators of asymmetry - they're just end-of-line markers.
    This function checks for actual asymmetry like non-standard grid shapes.
    
    Args:
        grid: List of grid row strings
        
    Returns:
        True if grid has irregular dimensions or shape
    """
    if not grid:
        return False
    
    # Check if all rows (minus trailing black squares) have the same effective length
    normalized = normalize_grid(grid)
    lengths = [len(row) for row in normalized if row]
    
    # If there's significant variation in row lengths, it might be asymmetrical
    if lengths:
        max_len = max(lengths)
        min_len = min(lengths)
        # Allow for some variation due to black squares, but flag if very inconsistent
        return (max_len - min_len) > 2
    
    return False


def analyze_grid_features(grid: List[str], entries: List[CrosswordEntry]) -> Dict[str, Any]:
    """
    Analyze grid and entries for special features.
    
    Args:
        grid: List of grid row strings
        entries: List of crossword entries
        
    Returns:
        Dict containing feature information
    """
    grid_text = '\n'.join(grid)
    
    rebus_squares = []
    shaded_squares = []
    circled_squares = []
    
    # Check each entry for special characters
    for entry in entries:
        if ',' in entry.answer:
            # Parse rebus squares
            rebus_info = parse_rebus_squares(entry)
            rebus_squares.extend(rebus_info)
            
        if '^' in entry.answer:
            # Parse shaded squares
            shaded_info = parse_shaded_squares(entry)
            shaded_squares.extend(shaded_info)
            
        if '%' in entry.answer:
            # Parse circled squares
            circled_info = parse_circled_squares(entry)
            circled_squares.extend(circled_info)
    
    return {
        "has_rebus": len(rebus_squares) > 0,
        "has_shaded": len(shaded_squares) > 0,
        "has_circled": len(circled_squares) > 0,
        "rebus_squares": rebus_squares,
        "shaded_squares": shaded_squares,
        "circled_squares": circled_squares
    }


def parse_rebus_squares(entry: CrosswordEntry) -> List[Dict[str, Any]]:
    """
    Parse comma-separated rebus squares from an entry.
    
    Example: "JOHNDEEREG,R,E,E,N" -> rebus squares at positions for G,R,E,E,N
    
    Args:
        entry: CrosswordEntry with potential rebus squares
        
    Returns:
        List of dicts with x, y, letters for each rebus square
    """
    if ',' not in entry.answer:
        return []
    
    parts = entry.answer.split(',')
    base = parts[0]
    rebus_letters = parts[1:]
    
    rebus_squares = []
    for i, letters in enumerate(rebus_letters):
        if entry.direction == 'across':
            square_x = entry.x + len(base) + i
            square_y = entry.y
        else:  # down
            square_x = entry.x
            square_y = entry.y + len(base) + i
        
        rebus_squares.append({
            "x": square_x,
            "y": square_y,
            "letters": letters,
            "entry_index": entry.index,
            "direction": entry.direction
        })
    
    return rebus_squares


def parse_shaded_squares(entry: CrosswordEntry) -> List[Dict[str, Any]]:
    """
    Parse caret-separated shaded squares from an entry.
    
    Example: "WHOLEBEANCOF^F^E^E" -> shaded squares at positions for the letters after ^
    
    Args:
        entry: CrosswordEntry with potential shaded squares
        
    Returns:
        List of dicts with x, y for each shaded square
    """
    if '^' not in entry.answer:
        return []
    
    parts = entry.answer.split('^')
    base = parts[0]
    
    shaded_squares = []
    for i in range(1, len(parts)):
        # Calculate position of this shaded letter
        # It starts after all previous parts (excluding carets)
        offset = len(''.join(parts[:i]))
        
        if entry.direction == 'across':
            square_x = entry.x + offset
            square_y = entry.y
        else:  # down
            square_x = entry.x
            square_y = entry.y + offset
        
        shaded_squares.append({
            "x": square_x,
            "y": square_y,
            "letter": parts[i],
            "entry_index": entry.index,
            "direction": entry.direction
        })
    
    return shaded_squares


def parse_circled_squares(entry: CrosswordEntry) -> List[Dict[str, Any]]:
    """
    Parse percent-separated circled squares from an entry.
    
    Example: "WORD%O%D" -> circled letters at positions for letters after %
    
    Args:
        entry: CrosswordEntry with potential circled squares
        
    Returns:
        List of dicts with x, y for each circled square
    """
    if '%' not in entry.answer:
        return []
    
    parts = entry.answer.split('%')
    
    circled_squares = []
    for i in range(1, len(parts)):
        offset = len(''.join(parts[:i]))
        
        if entry.direction == 'across':
            square_x = entry.x + offset
            square_y = entry.y
        else:  # down
            square_x = entry.x
            square_y = entry.y + offset
        
        circled_squares.append({
            "x": square_x,
            "y": square_y,
            "letter": parts[i],
            "entry_index": entry.index,
            "direction": entry.direction
        })
    
    return circled_squares


def clean_answer(answer: str) -> str:
    """
    Remove special characters from answer for display.
    
    Args:
        answer: Raw answer string with potential special characters
        
    Returns:
        Cleaned answer string
    """
    return answer.replace('^', '').replace(',', '').replace('%', '')


def get_grid_dimensions(grid: List[str]) -> Tuple[int, int]:
    """
    Get width and height of grid.
    
    Args:
        grid: List of grid row strings
        
    Returns:
        Tuple of (width, height)
    """
    if not grid:
        return (0, 0)
    return (len(grid[0]), len(grid))
