from pydantic import BaseModel, Field
from typing import List
import requests
from time import sleep
from requests.exceptions import RequestException

base_url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"


class DataReader:
    def __init__(self, base_url=base_url, max_retries=5, backoff_factor=1):
        self.base_url = base_url
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

    def fetch_data(self, start_date, end_date):
        for date in self.daterange(start_date, end_date):
            if not already_fetched(date):
                data = self._fetch_data(date)
                yield data

    def daterange(self, start_date, end_date):
        for n in range(int((end_date - start_date).days) + 1):
            yield (start_date + timedelta(n)).strftime("%Y%m%d")
    def _fetch_data(self, date):
        params = {"date": date}
        for i in range(self.max_retries):
            try:
                response = requests.get(self.base_url, params=params)
                response.raise_for_status()
                return response.text
            except RequestException as e:
                print(f"Request failed: {e}, retrying in {self.backoff_factor} seconds...")
                sleep(self.backoff_factor)
                self.backoff_factor *= 2



from pydantic import BaseModel
from typing import List


class Clue(BaseModel):
    hint: str


class Crossword(BaseModel):
    date: str
    title: str
    authors: List[str]
    size: dict
    grid: List[str]
    across: List[Clue]
    down: List[Clue]

    @classmethod
    def from_api_response(cls, data):
        lines = data.strip().split('\n\n')

        date = lines[1].strip()
        title = lines[2].strip()
        authors = [author.strip() for author in lines[3].split('/')]
        size = {'rows': int(lines[4].strip()), 'cols': int(lines[5].strip())}

        # Determine the index where the grid starts and ends
        grid_raw= lines[8]
        grid = []
        for line in grid_raw.split('\n'):
            grid.append(line)

        # Separate the clues into Across and Down
        clue_text = data.split('org.apache')[0]  # To remove any trailing server logs or irrelevant text
        clue_parts = clue_text.split('\n\n')
        across_text = clue_parts[-2].strip()  # Assuming the third last part after grid contains Across clues
        down_text = clue_parts[-1].strip()  # Assuming the second last part contains Down clues

        across_clues = [Clue(hint=hint) for hint in across_text.split('\n') if hint.strip()]
        down_clues = [Clue(hint=hint) for hint in down_text.split('\n') if hint.strip()]

        return cls(
            date=date,
            title=title,
            authors=authors,
            size=size,
            grid=grid,
            across=across_clues,
            down=down_clues
        )
    def __str__(self):
        # Some verticality please
        grid = '\n'.join(self.grid)
        across = '\n'.join([f"{i+1}. {clue.hint}" for i, clue in enumerate(self.across)])
        down = '\n'.join([f"{i+1}. {clue.hint}" for i, clue in enumerate(self.down)])
        return f"Date: {self.date}\nTitle: {self.title}\nAuthors: {', '.join(self.authors)}\n\n{grid}\n\nAcross:\n{across}\n\nDown:\n{down}"



def parse_clues(clue_data):
    # This function would parse the clues into the structured Clue model
    # Assuming each clue is separated by a newline in the response
    clues = []
    for line in clue_data.split('\n'):
        if line.strip():
            hint, answer = line.split('...')
            clues.append(Clue(hint=hint.strip(), answer=answer.strip()))
    return clues


from datetime import datetime, timedelta


def already_fetched(date):
    return False  # Placeholder implementation; check if data already exists for the given date


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
