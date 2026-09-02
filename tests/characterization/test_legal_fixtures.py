"""Characterization tests for the checked-in synthetic puzzle corpus.

The fixture is provider-neutral JSON.  ``_parser_payload`` is intentionally a
test-only adapter for the legacy parser's section-oriented input shape; it is
not a second production parser or a network client.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.cell import Cell
from src.crossword.parser import NYTFormatParser


FIXTURE_PATH = Path(__file__).parents[1] / "fixtures" / "legal" / "synthetic_mechanics_v1.json"


@pytest.fixture(scope="module")
def fixture() -> dict[str, Any]:
    """Load the legal fixture without touching the network or app state."""

    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def crossword(fixture: dict[str, Any]):
    """Parse the fixture through the current parser compatibility boundary."""

    puzzle = fixture["puzzle"]
    clues = puzzle["clues"]
    payload_sections = [
        "SYNTHETIC",
        puzzle["puzzle_id"],
        puzzle["title"],
        " / ".join(puzzle["authors"]),
        str(puzzle["width"]),
        str(puzzle["height"]),
        str(len(clues["across"])),
        str(len(clues["down"])),
        "\n".join(puzzle["grid"]),
        "\n".join(clues["across"]),
        "\n".join(clues["down"]),
        "SYNTHETIC_END",
    ]
    return NYTFormatParser.parse("\n\n".join(payload_sections))


def _entry(crossword, expectation: dict[str, Any]):
    return crossword.get_entry(expectation["entry"]["number"], expectation["entry"]["direction"])


def test_fixture_is_explicitly_synthetic_and_network_free(fixture: dict[str, Any]):
    provenance = fixture["provenance"]

    assert fixture["content_status"] == "synthetic"
    assert provenance["source_kind"] == "hand-authored"
    assert provenance["source_reference"] is None
    assert provenance["license"] == "CC0-1.0"
    assert provenance["network_required"] is False
    assert provenance["derived_from_protected_content"] is False


def test_normal_cells_and_numbering_survive_parser(crossword, fixture):
    expected = fixture["expected"]
    entry = _entry(crossword, expected["normal"])

    assert entry is not None
    assert entry.answer_text == "".join(expected["normal"]["cells"])
    assert [character.is_rebus for character in entry.characters] == [False] * 5
    assert [character.is_circled for character in entry.characters] == [False] * 5
    assert [character.is_shaded for character in entry.characters] == [False] * 5
    assert [entry.clue_number for entry in crossword.across_entries] == expected["across_numbers"]
    assert [entry.clue_number for entry in crossword.down_entries] == expected["down_numbers"]


def test_circled_cell_is_visible_on_both_crossing_entries(crossword, fixture):
    expected = fixture["expected"]["circled"]
    across = _entry(crossword, expected)
    down = crossword.get_entry(2, "down")

    assert across is not None and down is not None
    circled = across.characters[expected["cell_index"]]
    assert circled.letters == expected["letters"]
    assert circled.is_circled is True
    assert down.characters[expected["crossing_index"]].is_circled is True
    assert down.characters[expected["crossing_index"]].letters == expected["letters"]


def test_shaded_cell_is_visible_on_both_crossing_entries(crossword, fixture):
    expected = fixture["expected"]["shaded"]
    across = _entry(crossword, expected)
    down = crossword.get_entry(2, "down")

    assert across is not None and down is not None
    shaded = across.characters[expected["cell_index"]]
    assert shaded.letters == expected["letters"]
    assert shaded.is_shaded is True
    assert down.characters[expected["crossing_index"]].is_shaded is True
    assert down.characters[expected["crossing_index"]].letters == expected["letters"]


def test_rebus_cell_is_one_grid_position_with_full_answer_value(crossword, fixture):
    expected = fixture["expected"]["rebus"]
    across = _entry(crossword, expected)
    down = crossword.get_entry(1, "down")

    assert across is not None and down is not None
    rebus = across.characters[expected["cell_index"]]
    assert rebus.letters == expected["letters"]
    assert rebus.is_rebus is True
    assert across.length == 4  # PQR, S, T, U occupy four cells.
    assert down.characters[3].letters == expected["letters"]
    assert down.characters[3].is_rebus is True


def test_combined_rebus_circle_and_shade_metadata_is_preserved(crossword, fixture):
    expected = fixture["expected"]["combined"]
    across = _entry(crossword, expected)
    down = crossword.get_entry(1, "down")

    assert across is not None and down is not None
    combined = across.characters[expected["cell_index"]]
    assert combined.letters == expected["letters"]
    assert combined.is_rebus is True
    assert combined.is_circled is expected["is_circled"]
    assert combined.is_shaded is expected["is_shaded"]
    assert down.characters[4].letters == expected["letters"]
    assert down.characters[4].is_circled is True
    assert down.characters[4].is_shaded is True


def test_duplicate_clue_surfaces_remain_distinct_entries(crossword, fixture):
    expected = fixture["expected"]["duplicate_clue"]
    duplicate_entries = [entry for entry in crossword.across_entries if entry.clue_text == expected["text"]]

    assert [(entry.clue_number, entry.direction) for entry in duplicate_entries] == [
        (item["number"], item["direction"]) for item in expected["entries"]
    ]
    assert duplicate_entries[0] is not duplicate_entries[1]
    assert duplicate_entries[0].start_y != duplicate_entries[1].start_y


@pytest.mark.parametrize(
    ("formatted", "expected"),
    [
        ("Q", {"letter": "Q", "rebus": None, "is_circled": False, "is_shaded": False}),
        ("Q%", {"letter": "Q", "rebus": None, "is_circled": True, "is_shaded": False}),
        ("Q^", {"letter": "Q", "rebus": None, "is_circled": False, "is_shaded": True}),
        ("%^Q,R,S", {"letter": "Q", "rebus": ["R", "S"], "is_circled": True, "is_shaded": True}),
    ],
)
def test_cell_domain_round_trip_for_fixture_mechanics(formatted, expected):
    cell = Cell.from_formatted_string(formatted)

    assert cell.letter == expected["letter"]
    assert cell.rebus == expected["rebus"]
    assert cell.is_circled is expected["is_circled"]
    assert cell.is_shaded is expected["is_shaded"]
    assert cell.full_content == expected["letter"] + "".join(expected["rebus"] or [])
    assert Cell.from_formatted_string(cell.to_api_format()).model_dump() == cell.model_dump()
