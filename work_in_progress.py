from dataclasses import dataclass

from pydantic import BaseModel

from scraper import Crossword


class Entity(BaseModel):
    clue: str
    answer: str
    index: int
    x: int
    y: int
    direction: str

    def __str__(self):
        # 1 across (1,2): Computer suffix with soft or hard
        return f"{self.index} {self.direction} ({self.x},{self.y}): {self.clue}"
    def toJSON(self):
        return self.dict()
def unpad_crossword(crossword):
    rows = crossword.split('\n')
    rows.pop()
    updated_rows = [row[:-1] for row in rows]
    updated_crossword = '\n'.join(updated_rows)
    return updated_crossword

def pad_crossword(crossword):
    lines = crossword.split('\n')
    padded = ['#' + line + '#' for line in lines]
    padded.insert(0, '#' * len(padded[0]))
    padded.append('#' * len(padded[0]))
    return '\n'.join(padded)

def find_hashes(grid):
    return [item for item in grid if item[0] == '#']

def find_neighbors(hashes):
    result = set()
    for symbol, (x, y) in hashes:
        result.add((x + 1, y))
        result.add((x, y + 1))
    return result

def ndenumerate(crossword):
    lines = crossword.split('\n')
    result = []
    for y, line in enumerate(lines):
        for x, char in enumerate(line):
            result.append((char, (x, y)))
    return result

def chain(crossword, functions):
    result = crossword
    for func in functions:
        result = func(result)
    return result

def sort_neighbors(neighbors):
    return sorted(neighbors, key=lambda coord: (coord[1], coord[0]))

def remove_edges(neighbors):
    return [coord for coord in neighbors if coord[0] != 0 and coord[1] != 0]

def deduplicate(neighbors):
    return list(set(neighbors))

def as_array(crossword):
    return [list(line) for line in crossword.split('\n')]

def subtract_one_from_x_and_y(coordinate_list):
    return [(x - 1, y - 1) for x, y in coordinate_list]

def filter_hashtags_out(candidate_coordinates, character_lookup):
    max_y = len(character_lookup)
    max_x = len(character_lookup[0])
    valid_coords = []
    for x, y in candidate_coordinates:
        if y < max_y and x < max_x and character_lookup[y][x] != '#':
            valid_coords.append((x, y))
    return valid_coords

def find_starting_locations_across(starting_locations, character_lookup):
    return [loc for loc in starting_locations if loc[1][0] == 0 or character_lookup[loc[1][1]][loc[1][0] - 1] == '#']

def find_starting_locations_down(starting_locations, character_lookup):
    return [loc for loc in starting_locations if loc[1][1] == 0 or character_lookup[loc[1][1] - 1][loc[1][0]] == '#']

def enumerate_list(iterable):
    return list(enumerate(iterable, 1))

def zip_lists(starting_locations, hints):
    return list(zip(starting_locations, hints))
def process_to_entities(crossword:Crossword):
    #crossword. grid is a list of strings
    crossword_raw = '\n'.join(crossword.grid)
    across_hints = [clue.hint for clue in crossword.across]
    down_hints = [clue.hint for clue in crossword.down]
    character_lookup = as_array(crossword_raw)
    candidates_including_hashtags = chain(crossword_raw, [
        pad_crossword,unpad_crossword, ndenumerate, find_hashes, find_neighbors, deduplicate, sort_neighbors, remove_edges, subtract_one_from_x_and_y
    ])
    starting_locations = filter_hashtags_out(candidates_including_hashtags, character_lookup)
    starting_locations = [(x,y) for (x,y) in starting_locations if x < len(character_lookup[0])]
    starting_locations = enumerate_list(starting_locations)
    starting_locations_across = find_starting_locations_across(starting_locations, character_lookup)
    starting_locations_down = find_starting_locations_down(starting_locations, character_lookup)
    across = zip_lists(starting_locations_across, across_hints)
    down = zip_lists(starting_locations_down, down_hints)
    #For each starting location, we need to find the answer that corresponds to it from character_lookup
    # We follow the direction of the clue to find the answer
    # For across clues, we move right until we hit a '#' character
    # For down clues, we move down until we hit a '#' character
    # We then concatenate the characters we find to get the answer
    entities=[]
    for clue in across:
        _,(x, y) = clue[0]
        answer = ''
        while x < len(character_lookup[0]) and character_lookup[y][x] != '#':
            answer += character_lookup[y][x]
            x += 1
        i,(x, y) = clue[0]
        entities.append(Entity(clue=clue[1],index=i, answer=answer, x=x, y=y, direction='across'))
    for clue in down:
        i,(x, y) = clue[0]
        answer = ''
        while y < len(character_lookup) and character_lookup[y][x] != '#':
            answer += character_lookup[y][x]
            y += 1
        i,(x, y) = clue[0]
        entities.append(Entity(clue=clue[1],index=i, answer=answer, x=x, y=y, direction='down'))
    for entity in entities:
        print(entity)
    return entities