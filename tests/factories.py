import factory
from crossword.entity import Crossword, Clue


class ClueFactory(factory.Factory):
    class Meta:
        model = Clue

    hint = factory.Sequence(lambda n: f'Hint {n}')
    answer = factory.Sequence(lambda n: f'ANS{n}')


class CrosswordFactory(factory.Factory):
    class Meta:
        model = Crossword

    # Default minimal values
    grid = []
    across = []
    down = []
    date = ""
    title = ""
    authors = []
    size = {}