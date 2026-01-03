"""
Clean domain models for crossword puzzles.

A crossword consists of:
- Metadata (date, title, authors, dimensions)
- A list of Entry objects (clues with their answers)

Each Entry has:
- A clue text
- A starting position (x, y)
- A direction (across/down)
- A list of Character objects

Each Character represents one cell and can be:
- A letter (possibly circled, shaded)
- A rebus (multiple letters in one cell, possibly circled/shaded)
- A black square (though these aren't typically stored in entries)
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, computed_field


class Character(BaseModel):
    """
    Represents one cell in a crossword puzzle.
    
    A character is the atomic unit - it's what goes in one square.
    It can be a single letter, or multiple letters (rebus).
    It can have visual styling (circled, shaded).
    """
    letters: str = Field(..., min_length=1, description="The letter(s) in this cell. Usually 1 char, but can be multiple for rebus.")
    is_circled: bool = Field(default=False, description="Whether this cell has a circle around it")
    is_shaded: bool = Field(default=False, description="Whether this cell has a shaded background")
    
    @computed_field
    @property
    def is_rebus(self) -> bool:
        """A rebus cell contains multiple letters."""
        return len(self.letters) > 1
    
    @computed_field
    @property
    def display_value(self) -> str:
        """The text to display in this cell (uppercase)."""
        return self.letters.upper()
    
    def __str__(self) -> str:
        decorations = []
        if self.is_circled:
            decorations.append("circled")
        if self.is_shaded:
            decorations.append("shaded")
        if self.is_rebus:
            decorations.append("rebus")
        
        if decorations:
            return f"{self.letters} ({', '.join(decorations)})"
        return self.letters


class Entry(BaseModel):
    """
    Represents one clue and its answer in the crossword.
    
    Each entry is a word or phrase that goes across or down.
    It has a starting position and consists of a sequence of characters.
    """
    clue_number: int = Field(..., description="The number shown in the grid (1, 2, 3, ...)")
    clue_text: str = Field(..., description="The clue text shown to the user")
    direction: Literal["across", "down"] = Field(..., description="Whether this entry goes across or down")
    
    # Position in grid
    start_x: int = Field(..., ge=0, description="Starting column (0-indexed)")
    start_y: int = Field(..., ge=0, description="Starting row (0-indexed)")
    
    # The answer as a sequence of characters
    characters: List[Character] = Field(..., min_length=1, description="The letters/cells that make up this answer")
    
    @computed_field
    @property
    def length(self) -> int:
        """Number of cells this entry occupies."""
        return len(self.characters)
    
    @computed_field
    @property
    def answer_text(self) -> str:
        """The complete answer as a plain string (for validation)."""
        return ''.join(char.letters for char in self.characters).upper()
    
    def __str__(self) -> str:
        return f"{self.clue_number} {self.direction}: {self.clue_text} ({self.answer_text})"


class CrosswordMetadata(BaseModel):
    """Metadata about the puzzle."""
    date: str = Field(..., description="Date in YYMMDD format (e.g., '170627')")
    title: str = Field(..., description="Puzzle title")
    authors: List[str] = Field(default_factory=list, description="List of author names")
    width: int = Field(..., ge=1, description="Grid width (number of columns)")
    height: int = Field(..., ge=1, description="Grid height (number of rows)")
    notepad: Optional[str] = Field(default=None, description="Special note or message about the puzzle")
    
    def __str__(self) -> str:
        author_str = ", ".join(self.authors) if self.authors else "Unknown"
        return f"{self.title} by {author_str} ({self.width}x{self.height})"


class Crossword(BaseModel):
    """
    Complete crossword puzzle.
    
    This is the main model - everything you need to render and play a crossword.
    No grid representation needed - the entries contain all positioning information.
    """
    metadata: CrosswordMetadata
    entries: List[Entry] = Field(..., min_length=1, description="All clues and answers in the puzzle")
    
    @computed_field
    @property
    def across_entries(self) -> List[Entry]:
        """All across clues, sorted by clue number."""
        return sorted([e for e in self.entries if e.direction == "across"], key=lambda e: e.clue_number)
    
    @computed_field
    @property
    def down_entries(self) -> List[Entry]:
        """All down clues, sorted by clue number."""
        return sorted([e for e in self.entries if e.direction == "down"], key=lambda e: e.clue_number)
    
    def get_entry(self, clue_number: int, direction: Literal["across", "down"]) -> Optional[Entry]:
        """Get a specific entry by its clue number and direction."""
        for entry in self.entries:
            if entry.clue_number == clue_number and entry.direction == direction:
                return entry
        return None
    
    def __str__(self) -> str:
        return f"{self.metadata}\n{len(self.entries)} entries ({len(self.across_entries)} across, {len(self.down_entries)} down)"
