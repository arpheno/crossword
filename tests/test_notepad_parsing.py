"""Test notepad parsing from NYT format."""
import pytest
from src.crossword.parser import NYTFormatParser


class TestNotepadParsing:
    """Test that notepad text is correctly extracted from authors line."""
    
    def test_notepad_with_authors(self):
        """Test parsing when notepad is present in authors line."""
        api_text = """ARCHIVE

150401

NY Times, Wed, Apr 01, 2015

<NOTEPAD>When this puzzle is done, you will find that the ends of the answers to the five starred clues, when in the 15-, 67-Across, comprise a 1-, 71-Across.<, NOTEPAD>Peter A. Collins / Will Shortz

15

15

35

41

ABCDEFGHIJKLMNO.
BCDEFGHIJKLMNOP.
CDEFGHIJKLMNOPQ.
DEFGHIJKLMNOPQR.
EFGHIJKLMNOPQRS.
FGHIJKLMNOPQRST.
GHIJKLMNOPQRSTU.
HIJKLMNOPQRSTUV.
IJKLMNOPQRSTUVW.
JKLMNOPQRSTUVWX.
KLMNOPQRSTUVWXY.
LMNOPQRSTUVWXYZ.
MNOPQRSTUVWXYZA.
NOPQRSTUVWXYZAB.
OPQRSTUVWXYZABC.

1. Test clue across

1. Test clue down

"""
        
        puzzle = NYTFormatParser.parse(api_text)
        
        # Check notepad was extracted
        assert puzzle.metadata.notepad is not None
        assert "When this puzzle is done" in puzzle.metadata.notepad
        assert "five starred clues" in puzzle.metadata.notepad
        
        # Check authors were still extracted correctly
        assert len(puzzle.metadata.authors) == 2
        assert "Peter A. Collins" in puzzle.metadata.authors
        assert "Will Shortz" in puzzle.metadata.authors
    
    def test_no_notepad(self):
        """Test parsing when no notepad is present."""
        api_text = """ARCHIVE

150401

NY Times, Wed, Apr 01, 2015

Peter A. Collins / Will Shortz

15

15

35

41

ABCDEFGHIJKLMNO.
BCDEFGHIJKLMNOP.
CDEFGHIJKLMNOPQ.
DEFGHIJKLMNOPQR.
EFGHIJKLMNOPQRS.
FGHIJKLMNOPQRST.
GHIJKLMNOPQRSTU.
HIJKLMNOPQRSTUV.
IJKLMNOPQRSTUVW.
JKLMNOPQRSTUVWX.
KLMNOPQRSTUVWXY.
LMNOPQRSTUVWXYZ.
MNOPQRSTUVWXYZA.
NOPQRSTUVWXYZAB.
OPQRSTUVWXYZABC.

1. Test clue across

1. Test clue down

"""
        
        puzzle = NYTFormatParser.parse(api_text)
        
        # Check no notepad
        assert puzzle.metadata.notepad is None
        
        # Check authors were still extracted correctly
        assert len(puzzle.metadata.authors) == 2
        assert "Peter A. Collins" in puzzle.metadata.authors
        assert "Will Shortz" in puzzle.metadata.authors
    
    def test_notepad_exact_extraction(self):
        """Test that exact notepad text is extracted without markers."""
        api_text = """ARCHIVE

150401

Test Title

<NOTEPAD>This is a test notepad message.<, NOTEPAD>Test Author

15

15

35

41

ABCDEFGHIJKLMNO.
BCDEFGHIJKLMNOP.
CDEFGHIJKLMNOPQ.
DEFGHIJKLMNOPQR.
EFGHIJKLMNOPQRS.
FGHIJKLMNOPQRST.
GHIJKLMNOPQRSTU.
HIJKLMNOPQRSTUV.
IJKLMNOPQRSTUVW.
JKLMNOPQRSTUVWX.
KLMNOPQRSTUVWXY.
LMNOPQRSTUVWXYZ.
MNOPQRSTUVWXYZA.
NOPQRSTUVWXYZAB.
OPQRSTUVWXYZABC.

1. Test clue

1. Test clue

"""
        
        puzzle = NYTFormatParser.parse(api_text)
        
        # Check exact notepad text
        assert puzzle.metadata.notepad == "This is a test notepad message."
        
        # Check no markers in notepad
        assert "<NOTEPAD>" not in puzzle.metadata.notepad
        assert "<" not in puzzle.metadata.notepad
        
        # Check author
        assert puzzle.metadata.authors == ["Test Author"]
