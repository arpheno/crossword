#!/usr/bin/env python3
"""Quick test script for rebus parsing"""

from src.crossword.parser import NYTFormatParser

# Test the normalization function
test_lines = [
    "JOHNDEEREG,R,E,E,N",
    "CAT#DOG",
    "A%R^E#OWL",
    "WHOLEBEANCOF^F^E^E"
]

print("Testing _normalize_grid_line:")
print("-" * 50)
for line in test_lines:
    normalized = NYTFormatParser._normalize_grid_line(line)
    print(f"Input:      {line}")
    print(f"Normalized: {normalized}")
    print(f"Length:     {len(normalized)}")
    print()

# Now test with actual API call
print("\nTesting with actual puzzle (201511 - rebus puzzle):")
print("-" * 50)

from src.crossword.data_reader import DataReader

reader = DataReader()
api_text = reader._fetch_data("201511")

# Parse the puzzle
crossword = NYTFormatParser.parse(api_text)

print(f"Puzzle: {crossword.metadata.title}")
print(f"Date: {crossword.metadata.date}")
print(f"Dimensions: {crossword.metadata.width}x{crossword.metadata.height}")
print(f"Total entries: {len(crossword.entries)}")
print()

# Find entries with rebus cells
print("Entries with rebus cells:")
for entry in crossword.entries:
    has_rebus = any(len(char.letters) > 1 for char in entry.characters)
    if has_rebus:
        answer = ''.join(char.letters for char in entry.characters)
        rebus_details = [(i, char.letters) for i, char in enumerate(entry.characters) if len(char.letters) > 1]
        print(f"\n{entry.clue_number} {entry.direction}: {entry.clue_text}")
        print(f"  Answer: {answer}")
        print(f"  Rebus positions: {rebus_details}")
        print(f"  Full character breakdown:")
        for i, char in enumerate(entry.characters):
            print(f"    [{i}] '{char.letters}' (circled={char.is_circled}, shaded={char.is_shaded})")
