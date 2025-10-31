import pytest
from .factories import CrosswordFactory


@pytest.fixture
def simple_crossword():
    """Simple 3x3 crossword"""
    return CrosswordFactory(
        grid=[
            "CAT",
            "ARE",
            "TEA"
        ],
        across=[
            {'hint': "Feline", 'answer': "CAT"},
            {'hint': "To be", 'answer': "ARE"},
            {'hint': "Hot drink", 'answer': "TEA"}
        ],
        down=[
            {'hint': "Vehicle", 'answer': "CAT"},
            {'hint': "Pirate", 'answer': "ARE"},
            {'hint': "Consume", 'answer': "TEA"}
        ]
    )
 