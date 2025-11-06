"""
Tests for Cell model.
"""
import pytest
from src.crossword.cell import Cell


class TestCellBasics:
    """Test basic Cell creation and properties."""
    
    def test_simple_cell(self):
        """Test creating a simple cell with just a letter."""
        cell = Cell(letter='A')
        assert cell.letter == 'A'
        assert cell.is_circled is False
        assert cell.is_shaded is False
        assert cell.rebus is None
        assert cell.is_black is False
    
    def test_letter_uppercase_conversion(self):
        """Test that lowercase letters are converted to uppercase."""
        cell = Cell(letter='a')
        assert cell.letter == 'A'
    
    def test_black_square_hash(self):
        """Test creating a black square with #."""
        cell = Cell(letter='#', is_black=True)
        assert cell.letter == '#'
        assert cell.is_black is True
        assert cell.display_letter == ''
    
    def test_black_square_dot(self):
        """Test creating a black square with . (end-of-line marker)."""
        cell = Cell(letter='.', is_black=True)
        assert cell.letter == '.'
        assert cell.is_black is True
        assert cell.display_letter == ''
    
    def test_circled_cell(self):
        """Test creating a circled cell."""
        cell = Cell(letter='B', is_circled=True)
        assert cell.letter == 'B'
        assert cell.is_circled is True
        assert 'circled' in str(cell)
    
    def test_shaded_cell(self):
        """Test creating a shaded cell."""
        cell = Cell(letter='C', is_shaded=True)
        assert cell.letter == 'C'
        assert cell.is_shaded is True
        assert 'shaded' in str(cell)
    
    def test_rebus_cell(self):
        """Test creating a rebus cell with multiple letters."""
        cell = Cell(letter='A', rebus=['B', 'C'])
        assert cell.letter == 'A'
        assert cell.rebus == ['B', 'C']
        assert cell.full_content == 'ABC'
        assert 'rebus' in str(cell)


class TestCellFromChar:
    """Test Cell.from_char() factory method."""
    
    def test_from_char_letter(self):
        """Test creating cell from single letter."""
        cell = Cell.from_char('X')
        assert cell.letter == 'X'
        assert cell.is_black is False
    
    def test_from_char_lowercase(self):
        """Test that from_char converts to uppercase."""
        cell = Cell.from_char('z')
        assert cell.letter == 'Z'
    
    def test_from_char_black_hash(self):
        """Test creating black square from #."""
        cell = Cell.from_char('#')
        assert cell.letter == '#'
        assert cell.is_black is True
    
    def test_from_char_black_dot(self):
        """Test creating black square from dot."""
        cell = Cell.from_char('.')
        assert cell.letter == '.'
        assert cell.is_black is True


class TestCellFromFormattedString:
    """Test Cell.from_formatted_string() for API parsing."""
    
    def test_parse_simple_letter(self):
        """Test parsing simple letter with no formatting."""
        cell = Cell.from_formatted_string('A')
        assert cell.letter == 'A'
        assert cell.is_circled is False
        assert cell.is_shaded is False
        assert cell.rebus is None
    
    def test_parse_circled(self):
        """Test parsing circled letter (% marker)."""
        cell = Cell.from_formatted_string('B%')
        assert cell.letter == 'B'
        assert cell.is_circled is True
        assert cell.is_shaded is False
    
    def test_parse_shaded(self):
        """Test parsing shaded letter (^ marker)."""
        cell = Cell.from_formatted_string('C^')
        assert cell.letter == 'C'
        assert cell.is_shaded is True
        assert cell.is_circled is False
    
    def test_parse_circled_and_shaded(self):
        """Test parsing letter with both circle and shade."""
        cell = Cell.from_formatted_string('D^%')
        assert cell.letter == 'D'
        assert cell.is_circled is True
        assert cell.is_shaded is True
    
    def test_parse_rebus_simple(self):
        """Test parsing simple rebus (comma-separated)."""
        cell = Cell.from_formatted_string('A,B,C')
        assert cell.letter == 'A'
        assert cell.rebus == ['B', 'C']
        assert cell.full_content == 'ABC'
    
    def test_parse_rebus_with_shading(self):
        """Test parsing rebus with shaded background."""
        cell = Cell.from_formatted_string('H,O,P,E^')
        assert cell.letter == 'H'
        assert cell.rebus == ['O', 'P', 'E']
        assert cell.full_content == 'HOPE'
        assert cell.is_shaded is True
    
    def test_parse_rebus_with_circle(self):
        """Test parsing rebus with circle."""
        cell = Cell.from_formatted_string('X,Y%')
        assert cell.letter == 'X'
        assert cell.rebus == ['Y']
        assert cell.full_content == 'XY'
        assert cell.is_circled is True
    
    def test_parse_black_square_hash(self):
        """Test parsing # as black square."""
        cell = Cell.from_formatted_string('#')
        assert cell.letter == '#'
        assert cell.is_black is True
    
    def test_parse_black_square_dot(self):
        """Test parsing . as black square (end-of-line)."""
        cell = Cell.from_formatted_string('.')
        assert cell.letter == '.'
        assert cell.is_black is True
    
    def test_parse_lowercase_converts(self):
        """Test that lowercase letters are converted to uppercase."""
        cell = Cell.from_formatted_string('q')
        assert cell.letter == 'Q'
    
    def test_parse_empty_string_raises(self):
        """Test that empty string raises ValueError."""
        with pytest.raises(ValueError, match="Empty string"):
            Cell.from_formatted_string('')


class TestCellProperties:
    """Test Cell computed properties."""
    
    def test_display_letter_normal(self):
        """Test display_letter for normal cell."""
        cell = Cell(letter='A')
        assert cell.display_letter == 'A'
    
    def test_display_letter_black(self):
        """Test display_letter for black square returns empty."""
        cell = Cell(letter='#', is_black=True)
        assert cell.display_letter == ''
    
    def test_full_content_normal(self):
        """Test full_content for normal cell."""
        cell = Cell(letter='B')
        assert cell.full_content == 'B'
    
    def test_full_content_rebus(self):
        """Test full_content for rebus cell."""
        cell = Cell(letter='A', rebus=['B', 'C', 'D'])
        assert cell.full_content == 'ABCD'
    
    def test_full_content_black(self):
        """Test full_content for black square returns empty."""
        cell = Cell(letter='#', is_black=True)
        assert cell.full_content == ''
    
    def test_answer_value_normal(self):
        """Test answer_value for normal cell."""
        cell = Cell(letter='X')
        assert cell.answer_value == 'X'
    
    def test_answer_value_rebus(self):
        """Test answer_value for rebus cell returns full content."""
        cell = Cell(letter='H', rebus=['O', 'M', 'E'])
        assert cell.answer_value == 'HOME'


class TestCellToApiFormat:
    """Test converting Cell back to API format string."""
    
    def test_simple_letter_to_api(self):
        """Test converting simple letter to API format."""
        cell = Cell(letter='A')
        assert cell.to_api_format() == 'A'
    
    def test_circled_to_api(self):
        """Test converting circled cell to API format."""
        cell = Cell(letter='B', is_circled=True)
        assert cell.to_api_format() == 'B%'
    
    def test_shaded_to_api(self):
        """Test converting shaded cell to API format."""
        cell = Cell(letter='C', is_shaded=True)
        assert cell.to_api_format() == 'C^'
    
    def test_circled_and_shaded_to_api(self):
        """Test converting cell with both markers to API format."""
        cell = Cell(letter='D', is_circled=True, is_shaded=True)
        assert cell.to_api_format() == 'D^%'
    
    def test_rebus_to_api(self):
        """Test converting rebus cell to API format."""
        cell = Cell(letter='A', rebus=['B', 'C'])
        assert cell.to_api_format() == 'A,B,C'
    
    def test_rebus_with_shading_to_api(self):
        """Test converting rebus with shading to API format."""
        cell = Cell(letter='H', rebus=['O', 'P', 'E'], is_shaded=True)
        assert cell.to_api_format() == 'H,O,P,E^'
    
    def test_black_square_to_api(self):
        """Test converting black square to API format."""
        cell = Cell(letter='#', is_black=True)
        assert cell.to_api_format() == '#'
    
    def test_dot_to_api(self):
        """Test converting dot (end-of-line) to API format."""
        cell = Cell(letter='.', is_black=True)
        assert cell.to_api_format() == '.'


class TestCellRoundTrip:
    """Test round-trip conversion from API format and back."""
    
    @pytest.mark.parametrize("api_string", [
        'A',
        'B%',
        'C^',
        'D^%',
        'X,Y',
        'A,B,C',
        'H,O,P,E^',
        'Z,Y,X%',
        '#',
        '.',
    ])
    def test_roundtrip(self, api_string):
        """Test that parsing and converting back gives the same string."""
        cell = Cell.from_formatted_string(api_string)
        result = cell.to_api_format()
        assert result == api_string


class TestCellStringRepresentation:
    """Test __str__ method for debugging."""
    
    def test_str_simple(self):
        """Test string representation of simple cell."""
        cell = Cell(letter='A')
        assert str(cell) == 'A'
    
    def test_str_circled(self):
        """Test string representation includes 'circled'."""
        cell = Cell(letter='B', is_circled=True)
        result = str(cell)
        assert 'B' in result
        assert 'circled' in result
    
    def test_str_shaded(self):
        """Test string representation includes 'shaded'."""
        cell = Cell(letter='C', is_shaded=True)
        result = str(cell)
        assert 'C' in result
        assert 'shaded' in result
    
    def test_str_rebus(self):
        """Test string representation includes 'rebus'."""
        cell = Cell(letter='A', rebus=['B', 'C'])
        result = str(cell)
        assert 'A' in result
        assert 'rebus' in result
        assert 'ABC' in result
    
    def test_str_black(self):
        """Test string representation of black square."""
        cell = Cell(letter='#', is_black=True)
        assert str(cell) == '#'


class TestCellValidation:
    """Test Pydantic validation."""
    
    def test_multi_char_letter_raises(self):
        """Test that multi-character letter raises error."""
        with pytest.raises(ValueError, match="single character"):
            Cell(letter='AB')
    
    def test_empty_letter_raises(self):
        """Test that empty letter raises error."""
        with pytest.raises(ValueError):
            Cell(letter='')
