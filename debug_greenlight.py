#!/usr/bin/env python3
from src.crossword.data_reader import DataReader
from src.crossword.parser import NYTFormatParser

r = DataReader()
data = r._fetch_data('201511')
crossword = NYTFormatParser.parse(data)

# Get grid lines for reference
lines = data.split('\n\n')
grid_lines = lines[8].split('\n')

# Find the GREENLIGHT entry
for e in crossword.entries:
    if 'GREEN' in e.answer_text and e.direction == 'down':
        print(f'{e.clue_number} {e.direction}: {e.answer_text}')
        print(f'  Start position: ({e.start_x}, {e.start_y})')
        print(f'  Characters:')
        for i, c in enumerate(e.characters):
            y = e.start_y + i
            x = e.start_x
            raw_row = grid_lines[y] if y < len(grid_lines) else "N/A"
            print(f'    [{i}] {repr(c.letters):10s} at ({x}, {y}) (rebus={c.is_rebus}) - raw row: {raw_row}')
        print()
