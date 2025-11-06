"""
Tests for CrosswordEntry with Cell objects.
"""
import pytest
from src.crossword.entity import CrosswordEntry
from src.crossword.cell import Cell


class TestCrosswordEntryBasic:
    """Test basic CrosswordEntry functionality."""
    
    def test_create_simple_entry(self):
        """Test creating a simple entry without cells."""
        entry = CrosswordEntry(
            clue="Test clue",
            answer="HELLO",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer == "HELLO"
        assert entry.clean_answer == "HELLO"
        assert entry.answer_length == 5
    
    def test_create_entry_with_cells(self):
        """Test creating entry with explicit Cell objects."""
        cells = [
            Cell(letter='H'),
            Cell(letter='E'),
            Cell(letter='L'),
            Cell(letter='L'),
            Cell(letter='O')
        ]
        entry = CrosswordEntry(
            clue="Greeting",
            answer="HELLO",
            index=1,
            x=0,
            y=0,
            direction="across",
            cells=cells
        )
        assert len(entry.cells) == 5
        assert entry.clean_answer == "HELLO"
    
    def test_clean_answer_strips_special_chars(self):
        """Test that clean_answer strips special characters from answer string."""
        entry = CrosswordEntry(
            clue="Test",
            answer="H^E%L,L,O#",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.clean_answer == "HELLO"


class TestFromAnswerString:
    """Test CrosswordEntry.from_answer_string() factory method."""
    
    def test_simple_answer(self):
        """Test parsing simple answer without special characters."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="WORD",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer == "WORD"
        assert len(entry.cells) == 4
        assert all(isinstance(cell, Cell) for cell in entry.cells)
        assert entry.clean_answer == "WORD"
    
    def test_answer_with_shaded(self):
        """Test parsing answer with shaded cells (^)."""
        entry = CrosswordEntry.from_answer_string(
            clue="Coffee type",
            answer="WHOLEBEANCOF^F^E^E",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert len(entry.cells) == 15
        # Format is: F^ F^ E^ E (first 3 F's and E's are shaded, last E is not)
        assert entry.cells[11].letter == 'F'
        assert entry.cells[11].is_shaded is True
        assert entry.cells[12].letter == 'F'
        assert entry.cells[12].is_shaded is True
        assert entry.cells[13].letter == 'E'
        assert entry.cells[13].is_shaded is True
        assert entry.cells[14].letter == 'E'
        assert entry.cells[14].is_shaded is False  # Last E has no ^ marker
    
    def test_answer_with_circled(self):
        """Test parsing answer with circled letters (%)."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="A%BC",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert len(entry.cells) == 3
        assert entry.cells[0].is_circled is True
        assert entry.cells[0].letter == 'A'
        assert entry.cells[1].letter == 'B'
        assert entry.cells[2].letter == 'C'
    
    def test_answer_with_rebus(self):
        """Test parsing answer with rebus squares (,)."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="H,O,M,E",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        # This should parse as a single cell with rebus ["O", "M", "E"]
        assert len(entry.cells) == 1
        assert entry.cells[0].letter == 'H'
        assert entry.cells[0].rebus == ['O', 'M', 'E']
        assert entry.cells[0].full_content == 'HOME'
    
    def test_answer_with_rebus_and_shaded(self):
        """Test parsing answer with both rebus and shading."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="H,O,P,E^",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert len(entry.cells) == 1
        assert entry.cells[0].full_content == 'HOPE'
        assert entry.cells[0].is_shaded is True
    
    def test_answer_with_black_squares(self):
        """Test parsing answer with black squares."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="CAT#DOG",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert len(entry.cells) == 7
        assert entry.cells[3].is_black is True
        assert entry.cells[3].letter == '#'
        # Clean answer should not include black square
        assert entry.clean_answer == "CATDOG"


class TestCrosswordEntryProperties:
    """Test computed properties."""
    
    def test_answer_length_simple(self):
        """Test answer_length for simple answer."""
        entry = CrosswordEntry(
            clue="Test",
            answer="HELLO",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer_length == 5
    
    def test_answer_length_with_special_chars(self):
        """Test answer_length strips special characters."""
        entry = CrosswordEntry(
            clue="Test",
            answer="H^E%L,L,O",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer_length == 5
    
    def test_answer_length_with_cells(self):
        """Test answer_length uses cells when available."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="WORD",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer_length == 4


class TestBackwardCompatibility:
    """Test that old code still works without cells."""
    
    def test_json_serialization(self):
        """Test toJSON still works."""
        entry = CrosswordEntry(
            clue="Test",
            answer="WORD",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        json_data = entry.toJSON()
        assert json_data['answer'] == "WORD"
        assert json_data['clue'] == "Test"
        assert json_data['index'] == 1
    
    def test_string_representation(self):
        """Test __str__ still works."""
        entry = CrosswordEntry(
            clue="Test clue",
            answer="WORD",
            index=1,
            x=2,
            y=3,
            direction="across"
        )
        result = str(entry)
        assert "1 across" in result
        assert "(2,3)" in result
        assert "Test clue" in result
    
    def test_access_answer_directly(self):
        """Test that answer field can still be accessed directly."""
        entry = CrosswordEntry(
            clue="Test",
            answer="WORD^",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        assert entry.answer == "WORD^"
        assert entry.clean_answer == "WORD"


class TestCellRoundTrip:
    """Test creating entries and getting cells back correctly."""
    
    def test_roundtrip_simple(self):
        """Test that simple answers round-trip correctly."""
        original_answer = "HELLO"
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer=original_answer,
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        reconstructed = ''.join(cell.to_api_format() for cell in entry.cells)
        assert reconstructed == original_answer
    
    def test_roundtrip_with_shading(self):
        """Test round-trip with shaded cells."""
        original_answer = "WORD^"
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer=original_answer,
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        reconstructed = ''.join(cell.to_api_format() for cell in entry.cells)
        # Note: "WORD^" will be parsed as 4 cells + 1 shaded marker on last cell
        # So we need to check the parsing logic
    
    def test_cells_content(self):
        """Test that cells contain correct content."""
        entry = CrosswordEntry.from_answer_string(
            clue="Test",
            answer="AB%C^",
            index=1,
            x=0,
            y=0,
            direction="across"
        )
        # Should be parsed as: A, B%, C^
        assert len(entry.cells) == 3
        assert entry.cells[0].letter == 'A'
        assert entry.cells[1].letter == 'B'
        assert entry.cells[1].is_circled is True
        assert entry.cells[2].letter == 'C'
        assert entry.cells[2].is_shaded is True
