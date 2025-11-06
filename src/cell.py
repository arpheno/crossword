"""
Cell model for crossword puzzle squares.

Represents individual cells in a crossword grid with their content and formatting.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator


class Cell(BaseModel):
    """
    Represents a single cell in a crossword puzzle.
    
    Attributes:
        letter: The primary letter in the cell (uppercase)
        is_circled: Whether the cell has a circle around it (% marker)
        is_shaded: Whether the cell has a shaded background (^ marker)
        rebus: Additional letters for rebus squares (comma-separated in API)
        is_black: Whether this is a black square (# or .)
    """
    letter: str
    is_circled: bool = False
    is_shaded: bool = False
    rebus: Optional[List[str]] = None
    is_black: bool = False
    
    @field_validator('letter')
    @classmethod
    def validate_letter(cls, v: str) -> str:
        """Ensure letter is uppercase and single character (or black square marker)."""
        if v in ['#', '.']:
            return v
        if len(v) != 1:
            raise ValueError(f"Letter must be single character, got: {v}")
        return v.upper()
    
    @property
    def display_letter(self) -> str:
        """
        Get the letter to display (without special characters).
        For rebus squares, returns the primary letter.
        """
        return self.letter if self.letter not in ['#', '.'] else ''
    
    @property
    def full_content(self) -> str:
        """
        Get the complete cell content including rebus letters.
        For rebus squares: "ABC" for multiple letters in one cell.
        """
        if self.is_black:
            return ''
        if self.rebus:
            return ''.join([self.letter] + self.rebus)
        return self.letter
    
    @property
    def answer_value(self) -> str:
        """
        Get the answer value for validation.
        For non-rebus: single letter
        For rebus: full content
        """
        return self.full_content
    
    def __str__(self) -> str:
        """String representation showing letter and formatting."""
        if self.is_black:
            return '#'
        
        markers = []
        if self.is_circled:
            markers.append('circled')
        if self.is_shaded:
            markers.append('shaded')
        if self.rebus:
            markers.append(f'rebus:{self.full_content}')
        
        if markers:
            return f"{self.letter}({','.join(markers)})"
        return self.letter
    
    @classmethod
    def from_char(cls, char: str) -> 'Cell':
        """
        Create a Cell from a single character (simple case, no special formatting).
        
        Args:
            char: Single character (letter, # or .)
            
        Returns:
            Cell object
        """
        is_black = char in ['#', '.']
        return cls(
            letter=char if char in ['#', '.'] else char.upper(),
            is_black=is_black
        )
    
    @classmethod
    def from_formatted_string(cls, formatted_str: str) -> 'Cell':
        """
        Create a Cell from a formatted API string with special characters.
        
        Examples:
            "A" -> Cell(letter="A")
            "A^" -> Cell(letter="A", is_shaded=True)
            "A%" -> Cell(letter="A", is_circled=True)
            "A,B,C" -> Cell(letter="A", rebus=["B", "C"])
            "A^%" -> Cell(letter="A", is_shaded=True, is_circled=True)
            "H,O,P,E^" -> Cell(letter="H", rebus=["O", "P", "E"], is_shaded=True)
            "#" -> Cell(letter="#", is_black=True)
            "." -> Cell(letter=".", is_black=True)
        
        Args:
            formatted_str: String with possible special characters (^, %, ,)
            
        Returns:
            Cell object with appropriate formatting
        """
        if not formatted_str:
            raise ValueError("Empty string cannot be converted to Cell")
        
        # Check for black squares first
        if formatted_str in ['#', '.']:
            return cls(letter=formatted_str, is_black=True)
        
        # Parse special characters
        is_shaded = '^' in formatted_str
        is_circled = '%' in formatted_str
        
        # Remove special characters to get the content
        content = formatted_str.replace('^', '').replace('%', '')
        
        # Check for rebus (comma-separated)
        if ',' in content:
            parts = content.split(',')
            letter = parts[0].upper()
            rebus = [p.upper() for p in parts[1:]]
            return cls(
                letter=letter,
                is_circled=is_circled,
                is_shaded=is_shaded,
                rebus=rebus,
                is_black=False
            )
        
        # Single letter with possible formatting
        return cls(
            letter=content.upper(),
            is_circled=is_circled,
            is_shaded=is_shaded,
            is_black=False
        )
    
    def to_api_format(self) -> str:
        """
        Convert Cell back to API format string.
        
        Returns:
            String with special characters matching NYT API format
        """
        if self.is_black:
            return self.letter  # Return # or .
        
        # Build the string
        result = self.letter
        if self.rebus:
            result += ',' + ','.join(self.rebus)
        if self.is_shaded:
            result += '^'
        if self.is_circled:
            result += '%'
        
        return result
    
    model_config = ConfigDict(frozen=False)
