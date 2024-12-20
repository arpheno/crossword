from typing import List, Tuple, Set, Dict

from .entity import CrosswordEntry, Crossword


def build_crossword(crossword: Crossword) -> List[CrosswordEntry]:
    """Process crossword into list of entities."""
    processed_grid, rebus_map = process_rebus_grid(crossword.grid)
    crossword_raw = "\n".join(processed_grid)
    across_hints = [clue.hint for clue in crossword.across]
    down_hints = [clue.hint for clue in crossword.down]

    # Process grid
    grid = as_array(crossword_raw)
    candidates = _process_grid(crossword_raw, grid)

    # Find starting locations
    starting_locations = enumerate_list(candidates)

    # Process across and down clues
    across_locations = find_starting_locations_across(starting_locations, grid)
    down_locations = find_starting_locations_down(starting_locations, grid)

    across = zip_lists(across_locations, across_hints)
    down = zip_lists(down_locations, down_hints)

    # Create entities
    entities = []
    entities.extend(_create_across_entities(across, grid, rebus_map))
    entities.extend(_create_down_entities(down, grid, rebus_map))

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
    """Find all hash symbols in the grid."""
    return [item for item in grid if item[0] == "#"]


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
    """Filter out coordinates that contain hashtags."""
    max_y = len(grid)
    max_x = len(grid[0]) if grid else 0
    return [
        (x, y) for x, y in coordinates if y < max_y and x < max_x and grid[y][x] != "#"
    ]


def find_starting_locations_across(
    locations: List[Tuple[int, Tuple[int, int]]], grid: List[List[str]]
) -> List[Tuple[int, Tuple[int, int]]]:
    """Find starting locations for across words."""
    return [
        loc
        for loc in locations
        if loc[1][0] == 0 or grid[loc[1][1]][loc[1][0] - 1] == "#"
    ]


def find_starting_locations_down(
    locations: List[Tuple[int, Tuple[int, int]]], grid: List[List[str]]
) -> List[Tuple[int, Tuple[int, int]]]:
    """Find starting locations for down words."""
    return [
        loc
        for loc in locations
        if loc[1][1] == 0 or grid[loc[1][1] - 1][loc[1][0]] == "#"
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
    across: List[Tuple], grid: List[List[str]], rebus_map: Dict[Tuple[int, int], str]
) -> List[CrosswordEntry]:
    """Create entities for across clues."""
    entities = []
    for clue in across:
        i, (x, y) = clue[0]
        answer = ""
        current_x = x
        while current_x < len(grid[0]) and grid[y][current_x] != "#":
            if grid[y][current_x] == '+':
                answer += rebus_map.get((current_x, y), '+')
            else:
                answer += grid[y][current_x]
            current_x += 1
        entities.append(
            CrosswordEntry(
                clue=clue[1], index=i, answer=answer, x=x, y=y, direction="across"
            )
        )
    return entities


def _create_down_entities(
    down: List[Tuple], grid: List[List[str]], rebus_map: Dict[Tuple[int, int], str]
) -> List[CrosswordEntry]:
    """Create entities for down clues."""
    entities = []
    for clue in down:
        i, (x, y) = clue[0]
        answer = ""
        current_y = y
        while current_y < len(grid) and grid[current_y][x] != "#":
            if grid[current_y][x] == '+':
                answer += rebus_map.get((x, current_y), '+')
            else:
                answer += grid[current_y][x]
            current_y += 1
        entities.append(
            CrosswordEntry(
                clue=clue[1], index=i, answer=answer, x=x, y=y, direction="down"
            )
        )
    return entities


def process_rebus_grid(grid: List[str]) -> Tuple[List[str], Dict[Tuple[int, int], str]]:
    """Process grid and extract rebus entries."""
    processed_grid = []
    rebus_map = {}
    
    for y, row in enumerate(grid):
        processed_row = []
        current_rebus = ''
        
        for x, char in enumerate(row):
            if char == ',':
                continue
            elif current_rebus:
                current_rebus += char
                if x == len(row) - 1 or row[x + 1] != ',':
                    processed_row.append('+')
                    rebus_map[(len(processed_row) - 1, y)] = current_rebus
                    current_rebus = ''
            elif x < len(row) - 1 and row[x + 1] == ',':
                current_rebus = char
            else:
                processed_row.append(char)
                
        processed_grid.append(''.join(processed_row))
    
    return processed_grid, rebus_map
