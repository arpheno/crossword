import pytest
from .factories import CrosswordFactory


@pytest.fixture
def sample_crossword():
    """Crossword with rebus entries"""
    return CrosswordFactory(
        grid=[
            "CAT#DOG",
            "A,B,C#EXXXX",
            "RED#SKY"
        ],
        across=[
            {'hint': "Feline", 'answer': "CAT"},
            {'hint': "Canine", 'answer': "DOG"},
            {'hint': "Multiple letters", 'answer': "ABC"},
            {'hint': "Letter E", 'answer': "E"},
            {'hint': "Color", 'answer': "RED"},
            {'hint': "Up above", 'answer': "SKY"}
        ],
        down=[
            {'hint': "CAR", 'answer': "CAR"},
            {'hint': "ABC", 'answer': "ABC"},
            {'hint': "TED", 'answer': "TED"},
            {'hint': "DOG", 'answer': "DOG"},
            {'hint': "ESY", 'answer': "ESY"}
        ]
    )


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