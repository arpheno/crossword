#!/usr/bin/env python3
from src.crossword.data_reader import DataReader
from src.crossword.parser import NYTFormatParser

r = DataReader()
data = r._fetch_data('201511')
crossword = NYTFormatParser.parse(data)

# Find entries with GREEN in them
for entry in crossword.entries:
    if 'GREEN' in entry.answer_text:
        print(f'{entry.clue_number} {entry.direction}: {entry.answer_text}')
        for i, char in enumerate(entry.characters):
            print(f'  [{i}] {repr(char.letters)} (rebus={char.is_rebus})')
        if len([c for c in entry.characters if len(c.letters) > 1]) > 0:
            print()
