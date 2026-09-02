"""Integration test for the API endpoint and data reader."""

import pytest
from src.crossword.parser import NYTFormatParser
from src.crossword.data_reader import DataReader


pytestmark = pytest.mark.live_provider


@pytest.fixture
def data_reader():
    """Create a DataReader instance for testing."""
    base_url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"
    return DataReader(base_url=base_url)


class TestAPIIntegration:
    """Test integration with the NYT crossword API."""
    
    def test_fetch_and_parse_puzzle(self, data_reader):
        """Test fetching and parsing puzzle 250520 from the API."""
        # Fetch puzzle data
        api_text = data_reader._fetch_data("250520")
        assert api_text is not None
        assert len(api_text) > 0
        
        # Parse with NYTFormatParser
        crossword = NYTFormatParser.parse(api_text)
        
        # Verify metadata
        assert crossword.metadata is not None
        assert crossword.metadata.date is not None
        assert crossword.metadata.title is not None
        assert len(crossword.metadata.authors) > 0
        assert crossword.metadata.width > 0
        assert crossword.metadata.height > 0
        
        # Verify entries
        assert len(crossword.entries) > 0
        assert len(crossword.across_entries) > 0
        assert len(crossword.down_entries) > 0
    
    def test_serialization_structure(self, data_reader):
        """Test that puzzle can be serialized to the expected response format."""
        # Fetch and parse
        api_text = data_reader._fetch_data("250520")
        crossword = NYTFormatParser.parse(api_text)
        
        # Serialize to response format
        response_data = {
            "metadata": crossword.metadata.model_dump(),
            "entries": [entry.model_dump() for entry in crossword.entries]
        }
        
        # Verify response structure
        assert "metadata" in response_data
        assert "entries" in response_data
        
        # Verify metadata keys
        metadata_keys = list(response_data['metadata'].keys())
        assert "date" in metadata_keys
        assert "title" in metadata_keys
        assert "authors" in metadata_keys
        assert "width" in metadata_keys
        assert "height" in metadata_keys
        
        # Verify entries structure
        assert len(response_data['entries']) > 0
        first_entry = response_data['entries'][0]
        
        entry_keys = list(first_entry.keys())
        assert "clue_number" in entry_keys
        assert "clue_text" in entry_keys
        assert "direction" in entry_keys
        assert "start_x" in entry_keys
        assert "start_y" in entry_keys
        assert "characters" in entry_keys
        
        # Verify character structure
        assert len(first_entry['characters']) > 0
        first_char = first_entry['characters'][0]
        assert isinstance(first_char, dict)
