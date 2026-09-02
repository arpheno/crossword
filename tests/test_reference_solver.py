from tools.reference_solver import solve_fill


def candidate(word: str, score: float) -> dict[str, object]:
    return {"word": word, "score": score, "lexemeId": f"lexeme-{word}", "sourceIds": ["fixture"]}


def test_reference_solver_matches_crossing_fixture() -> None:
    result = solve_fill(
        [
            {"id": "across", "length": 3, "pattern": "C.."},
            {"id": "down", "length": 3, "pattern": "..T"},
        ],
        [{"slotId": "across", "position": 2, "otherSlotId": "down", "otherPosition": 2}],
        [candidate("CAT", 3), candidate("COT", 1), candidate("EAT", 2), candidate("OAT", 0.5)],
    )

    assert result.status == "solved"
    assert result.assignments == {"across": "CAT", "down": "EAT"}
    assert result.score == 5


def test_reference_solver_rejects_unsatisfiable_crossing() -> None:
    result = solve_fill(
        [
            {"id": "left", "length": 3, "pattern": "C.."},
            {"id": "right", "length": 3, "pattern": "D.."},
        ],
        [{"slotId": "left", "position": 0, "otherSlotId": "right", "otherPosition": 0}],
        [candidate("CAT", 1), candidate("DOG", 1)],
    )

    assert result.status == "unsatisfiable"
