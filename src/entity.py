from typing import List, Optional
from pydantic import BaseModel, computed_field
from .cell import Cell


class CrosswordEntry(BaseModel):
    """A single entry in a crossword puzzle."""
    clue: str
    answer: str  # Kept for backward compatibility - can be plain string or with special chars
    index: int
    x: int
    y: int
    direction: str
    cells: Optional[List[Cell]] = None  # New: rich cell representation
    
    @computed_field
    @property
    def clean_answer(self) -> str:
        """
        Get the answer stripped of special characters.
        If cells are available, uses them; otherwise strips from answer string.
        """
        if self.cells:
            return ''.join(cell.answer_value for cell in self.cells if not cell.is_black)
        # Fallback: strip special characters from answer string
        return self.answer.replace('#', '').replace('.', '').replace('^', '').replace(',', '').replace('%', '')
    
    @computed_field
    @property
    def answer_length(self) -> int:
        """Get the actual length of the answer (for grid calculations)."""
        return len(self.clean_answer)

    def __str__(self):
        # 1 across (1,2): Computer suffix with soft or hard
        return f"{self.index} {self.direction} ({self.x},{self.y}): {self.clue}"
    
    def toJSON(self):
        return self.model_dump()
    
    @classmethod
    def from_answer_string(cls, clue: str, answer: str, index: int, x: int, y: int, direction: str) -> 'CrosswordEntry':
        """
        Create CrosswordEntry from a formatted answer string (with special characters).
        Automatically parses the answer into Cell objects.
        
        Args:
            clue: Clue text
            answer: Answer string potentially with special characters (^, %, ,)
            index: Clue number
            x: Starting x coordinate
            y: Starting y coordinate
            direction: 'across' or 'down'
            
        Returns:
            CrosswordEntry with cells parsed from answer string
        """
        # Parse each character in the answer into a Cell
        # Note: % and ^ are PREFIX markers that apply to the following letter
        # So %A%B means A is circled, B is circled (not A with trailing %)
        cells = []
        i = 0
        while i < len(answer):
            cell_str = ""
            
            # First, collect any leading formatting markers (^ and %)
            while i < len(answer) and answer[i] in ['^', '%']:
                cell_str += answer[i]
                i += 1
            
            # Then collect the actual letter (required)
            if i < len(answer) and answer[i] not in ['#', '.', ',']:
                cell_str += answer[i]
                i += 1
            elif i < len(answer):
                # Handle black squares and special cases
                cell_str += answer[i]
                i += 1
            
            # Collect comma-separated rebus parts
            while i < len(answer) and answer[i] == ',':
                cell_str += ','
                i += 1
                if i < len(answer) and answer[i] not in ['^', '%']:
                    cell_str += answer[i]
                    i += 1
            
            # Do NOT collect trailing formatting markers - they belong to the next letter!
            # The % and ^ are PREFIX markers, not SUFFIX markers
            
            # Create cell from the collected string
            if cell_str:
                try:
                    cell = Cell.from_formatted_string(cell_str)
                    cells.append(cell)
                except ValueError:
                    # If parsing fails, treat as simple character
                    cell = Cell.from_char(cell_str[0])
                    cells.append(cell)
        
        return cls(
            clue=clue,
            answer=answer,
            index=index,
            x=x,
            y=y,
            direction=direction,
            cells=cells
        )



class Clue(BaseModel):
    hint: str


class Crossword(BaseModel):
    date: str
    title: str
    authors: List[str]
    size: dict
    grid: List[str]  # Normalized grid (without % and ^) for positioning
    raw_grid: List[str] = []  # Original grid with formatting characters for answer extraction
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
        grid_raw_lines = lines[8]
        grid = []
        raw_grid = []
        for line in grid_raw_lines.split('\n'):
            # Store both raw (with formatting) and normalized (without) versions
            raw_grid.append(line)
            # Normalize grid by removing inline formatting characters (% and ^)
            # These are NOT grid positions - they're formatting modifiers for the following character
            # The grid should represent actual cell positions only
            normalized_line = line.replace('%', '').replace('^', '')
            grid.append(normalized_line)

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
            raw_grid=raw_grid,
            across=across_clues,
            down=down_clues
        )
    def __str__(self):
        # Some verticality please
        grid = '\n'.join(self.grid)
        across = '\n'.join([f"{i+1}. {clue.hint}" for i, clue in enumerate(self.across)])
        down = '\n'.join([f"{i+1}. {clue.hint}" for i, clue in enumerate(self.down)])
        return f"Date: {self.date}\nTitle: {self.title}\nAuthors: {', '.join(self.authors)}\n\n{grid}\n\nAcross:\n{across}\n\nDown:\n{down}"

