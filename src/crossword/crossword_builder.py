from typing import List, Tuple, Set, Dict

from .entity import CrosswordEntry, Crossword


def build_crossword(crossword: Crossword, parse_cells: bool = False) -> List[CrosswordEntry]:
    """
    Process crossword into list of entities.
    
    Args:
        crossword: The crossword data from the API
        parse_cells: If True, parse special characters into Cell objects
        
    Returns:
        List of CrosswordEntry objects (with or without cells populated)
    """
    crossword_raw = "\n".join(crossword.grid)
    across_hints = [clue.hint for clue in crossword.across]
    down_hints = [clue.hint for clue in crossword.down]

    # Process grid (normalized without %)
    grid = as_array(crossword_raw)
    candidates = _process_grid(crossword_raw, grid)
    
    # Also prepare raw grid for answer extraction (with % and ^ for formatting)
    raw_grid = None
    if crossword.raw_grid:
        raw_grid_raw = "\n".join(crossword.raw_grid)
        raw_grid = as_array(raw_grid_raw)

    # Find starting locations
    starting_locations = enumerate_list(candidates)

    # Process across and down clues
    across_locations = find_starting_locations_across(starting_locations, grid)
    down_locations = find_starting_locations_down(starting_locations, grid)

    across = zip_lists(across_locations, across_hints)
    down = zip_lists(down_locations, down_hints)

    # Create entities - pass raw_grid for answer extraction with formatting
    entities = []
    entities.extend(_create_across_entities(across, grid, parse_cells, raw_grid))
    entities.extend(_create_down_entities(down, grid, parse_cells, raw_grid))

    return entities


def unpad_crossword(crossword: str) -> str:
    """Remove padding from crossword grid."""
    rows = crossword.split("\n")
    rows.pop()
    return "\n".join(row[:-1] for row in rows)


def pad_crossword(crossword: str) -> str:
    """Add padding to crossword grid."""
    lines = crossword.split("\n")
    padded = ["#" + line + "#" for line in lines]
    padded.insert(0, "#" * len(padded[0]))
    padded.append("#" * len(padded[0]))
    return "\n".join(padded)


def find_hashes(
    grid: List[Tuple[str, Tuple[int, int]]]
) -> List[Tuple[str, Tuple[int, int]]]:
    """Find all black square symbols in the grid (both # and .)."""
    return [item for item in grid if item[0] in ["#", "."]]


def find_neighbors(hashes: List[Tuple[str, Tuple[int, int]]]) -> Set[Tuple[int, int]]:
    """Find neighbors of hash positions."""
    result = set()
    for _, (x, y) in hashes:
        result.add((x + 1, y))
        result.add((x, y + 1))
    return result


def ndenumerate(crossword: str) -> List[Tuple[str, Tuple[int, int]]]:
    """Enumerate characters in the grid with their coordinates."""
    return [
        (char, (x, y))
        for y, line in enumerate(crossword.split("\n"))
        for x, char in enumerate(line)
    ]


def as_array(crossword: str) -> List[List[str]]:
    """Convert crossword string to 2D array."""
    return [list(line) for line in crossword.split("\n")]


def sort_neighbors(neighbors: Set[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """Sort neighbors by y coordinate, then x coordinate."""
    return sorted(neighbors, key=lambda coord: (coord[1], coord[0]))


def remove_edges(neighbors: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """Remove coordinates on edges."""
    return [coord for coord in neighbors if coord[0] != 0 and coord[1] != 0]


def subtract_one_from_coordinates(
    coordinates: List[Tuple[int, int]]
) -> List[Tuple[int, int]]:
    """Subtract one from all coordinates."""
    return [(x - 1, y - 1) for x, y in coordinates]


def filter_hashtags(
    coordinates: List[Tuple[int, int]], grid: List[List[str]]
) -> List[Tuple[int, int]]:
    """Filter out coordinates that contain black squares (# or .)."""
    max_y = len(grid)
    max_x = len(grid[0]) if grid else 0
    return [
        (x, y) for x, y in coordinates if y < max_y and x < max_x and grid[y][x] not in ["#", "."]
    ]


def find_starting_locations_across(
    locations: List[Tuple[int, Tuple[int, int]]], grid: List[List[str]]
) -> List[Tuple[int, Tuple[int, int]]]:
    """Find starting locations for across words."""
    return [
        loc
        for loc in locations
        if loc[1][0] == 0 or grid[loc[1][1]][loc[1][0] - 1] in ["#", "."]
    ]


def find_starting_locations_down(
    locations: List[Tuple[int, Tuple[int, int]]], grid: List[List[str]]
) -> List[Tuple[int, Tuple[int, int]]]:
    """Find starting locations for down words."""
    return [
        loc
        for loc in locations
        if loc[1][1] == 0 or grid[loc[1][1] - 1][loc[1][0]] in ["#", "."]
    ]


def enumerate_list(iterable: List) -> List[Tuple[int, any]]:
    """Enumerate list starting from 1."""
    return list(enumerate(iterable, 1))


def zip_lists(locations: List, hints: List) -> List[Tuple]:
    """Zip locations with hints."""
    return list(zip(locations, hints))


def _process_grid(crossword_raw: str, grid: List[List[str]]) -> List[Tuple[int, int]]:
    """Process grid to find candidate positions."""
    chain_result = _apply_grid_chain(crossword_raw)
    candidates = filter_hashtags(chain_result, grid)
    return [(x, y) for x, y in candidates if x < len(grid[0])]


def _apply_grid_chain(crossword: str) -> List[Tuple[int, int]]:
    """Apply chain of grid processing functions."""
    padded = pad_crossword(crossword)
    unpadded = unpad_crossword(padded)
    enumerated = ndenumerate(unpadded)
    hashes = find_hashes(enumerated)
    neighbors = find_neighbors(hashes)
    sorted_neighbors = sort_neighbors(neighbors)
    no_edges = remove_edges(sorted_neighbors)
    return subtract_one_from_coordinates(no_edges)


def _create_across_entities(
    across: List[Tuple], grid: List[List[str]], parse_cells: bool = False, raw_grid: List[List[str]] = None
) -> List[CrosswordEntry]:
    """Create entities for across clues."""
    entities = []
    
    for clue in across:
        i, (x, y) = clue[0]
        
        # Extract clean answer from normalized grid
        answer_clean = ""
        current_x = x
        while current_x < len(grid[0]) and grid[y][current_x] not in ["#", "."]:
            answer_clean += grid[y][current_x]
            current_x += 1
        
        # If we have raw_grid, extract formatted answer from it
        if raw_grid is not None and answer_clean:
            # Find this answer sequence in the raw grid row and extract with formatting
            raw_row = ''.join(raw_grid[y])
            # Remove % and ^ to search
            raw_row_normalized = raw_row.replace('%', '').replace('^', '')
            
            # Find where the clean answer appears in normalized version
            try:
                start_in_normalized = raw_row_normalized.index(answer_clean, x)
                end_in_normalized = start_in_normalized + len(answer_clean)
                
                # Now map back to raw positions
                # Count actual characters (not % or ^) to find positions in raw
                raw_start = 0
                char_count = 0
                while raw_start < len(raw_row) and char_count < start_in_normalized:
                    if raw_row[raw_start] not in ['%', '^']:
                        char_count += 1
                    raw_start += 1
                
                # Extract until we have all letters
                raw_end = raw_start
                letter_count = 0
                while raw_end < len(raw_row) and letter_count < len(answer_clean):
                    if raw_row[raw_end] not in ['%', '^', '#', '.']:
                        letter_count += 1
                    raw_end += 1
                
                answer = raw_row[raw_start:raw_end]
            except ValueError:
                # Fallback if not found
                answer = answer_clean
        else:
            answer = answer_clean
        
        if parse_cells:
            # Use from_answer_string to parse cells
            entity = CrosswordEntry.from_answer_string(
                clue=clue[1], answer=answer, index=i, x=x, y=y, direction="across"
            )
        else:
            # Old behavior - just store answer string
            entity = CrosswordEntry(
                clue=clue[1], index=i, answer=answer, x=x, y=y, direction="across"
            )
        entities.append(entity)
    return entities


def _create_down_entities(
    down: List[Tuple], grid: List[List[str]], parse_cells: bool = False, raw_grid: List[List[str]] = None
) -> List[CrosswordEntry]:
    """Create entities for down clues."""
    entities = []
    
    for clue in down:
        i, (x, y) = clue[0]
        
        # Extract clean answer from normalized grid
        answer_clean = ""
        current_y = y
        while current_y < len(grid) and grid[current_y][x] not in ["#", "."]:
            answer_clean += grid[current_y][x]
            current_y += 1
        
        # If we have raw_grid, extract formatted answer from it
        if raw_grid is not None and answer_clean:
            # For down clues, collect characters at position x from consecutive rows
            answer = ""
            current_y = y
            for _ in range(len(answer_clean)):
                if current_y >= len(grid):
                    break
                raw_row = ''.join(raw_grid[current_y])
                
                # Find the character at normalized position x in this row
                # by mapping from normalized to raw position
                normalized_row = raw_row.replace('%', '').replace('^', '')
                if x < len(normalized_row) and normalized_row[x] not in ['#', '.']:
                    # Find raw position corresponding to normalized position x
                    norm_count = 0
                    raw_pos = 0
                    while raw_pos < len(raw_row) and norm_count <= x:
                        if raw_row[raw_pos] not in ['%', '^']:
                            if norm_count == x:
                                # Found it - collect with any preceding formatting
                                start_pos = raw_pos
                                while start_pos > 0 and raw_row[start_pos - 1] in ['%', '^']:
                                    start_pos -= 1
                                answer += raw_row[start_pos:raw_pos + 1]
                                break
                            norm_count += 1
                        raw_pos += 1
                current_y += 1
        else:
            answer = answer_clean
        
        if parse_cells:
            # Use from_answer_string to parse cells
            entity = CrosswordEntry.from_answer_string(
                clue=clue[1], answer=answer, index=i, x=x, y=y, direction="down"
            )
        else:
            # Old behavior - just store answer string
            entity = CrosswordEntry(
                clue=clue[1], index=i, answer=answer, x=x, y=y, direction="down"
            )
        entities.append(entity)
    return entities
