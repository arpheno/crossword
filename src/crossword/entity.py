from typing import List
from pydantic import BaseModel


class CrosswordEntry(BaseModel):
    """A single entry in a crossword puzzle."""
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

