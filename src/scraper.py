
from data_reader import DataReader
from entity import Crossword

from datetime import datetime





def main(start_date, end_date):
    reader = DataReader(
        base_url="https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    )
    writer = CSVWriter("crossword_data.csv")
    usecase(reader, writer, start_date, end_date)


def usecase(reader, writer, start_date, end_date):
    print(f"Fetching data from {start_date} to {end_date}...")
    for data in reader.fetch_data(start_date, end_date):
        crossword = Crossword.from_api_response(data)
        print(f"Saving data for date: {crossword.date}")
        writer.save(crossword)
        print(f"Data saved successfully for date: {crossword.date}")

import csv

class CSVWriter:
    def __init__(self, filename):
        self.filename = filename
        # Open the file and write the header
        with open(self.filename, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Date', 'Title', 'Authors', 'Size', 'Across Clues', 'Down Clues', 'Grid'])

    def save(self, crossword: Crossword):
        with open(self.filename, 'a', newline='') as csvfile:
            writer = csv.writer(csvfile)
            # Format crossword details for CSV writing
            authors = ', '.join(crossword.authors)
            size = f"{crossword.size['rows']}x{crossword.size['cols']}"
            across_clues = '; '.join([clue.hint for clue in crossword.across])
            down_clues = '; '.join([clue.hint for clue in crossword.down])
            grid = '; '.join(crossword.grid)
            writer.writerow([crossword.date, crossword.title, authors, size, across_clues, down_clues, grid])

if __name__ == "__main__":
    start_date = datetime.strptime("20180101", "%Y%m%d")
    end_date = datetime.strptime("20240530", "%Y%m%d")
    main(start_date, end_date)
