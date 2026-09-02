from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class FillResult:
    status: str
    assignments: dict[str, str]
    score: float
    nodes: int


def _matches(word: str, pattern: str | None) -> bool:
    if pattern is None:
        return True
    return len(word) == len(pattern) and all(
        expected == "." or expected == letter
        for expected, letter in zip(pattern, word, strict=True)
    )


def solve_fill(
    slots: Sequence[Mapping[str, Any]],
    intersections: Sequence[Mapping[str, Any]],
    candidates: Sequence[Mapping[str, Any]],
    *,
    excluded_words: Sequence[str] = (),
    max_nodes: int = 50_000,
) -> FillResult:
    slot_by_id: dict[str, Mapping[str, Any]] = {}
    for slot in slots:
        slot_id = slot.get("id")
        length = slot.get("length")
        if not isinstance(slot_id, str) or not slot_id or slot_id in slot_by_id:
            return FillResult("invalid-request", {}, 0, 0)
        if not isinstance(length, int) or length < 1:
            return FillResult("invalid-request", {}, 0, 0)
        slot_by_id[slot_id] = slot
    if not slot_by_id:
        return FillResult("invalid-request", {}, 0, 0)

    excluded = {word.upper() for word in excluded_words}
    candidate_by_index: list[Mapping[str, Any]] = []
    seen_words: set[str] = set()
    for candidate in candidates:
        raw_word = candidate.get("word")
        score = candidate.get("score")
        if not isinstance(raw_word, str) or not isinstance(score, (int, float)):
            continue
        word = raw_word.strip().upper()
        if not re.fullmatch(r"[A-Z]+", word) or word in seen_words or word in excluded:
            continue
        seen_words.add(word)
        candidate_by_index.append({**candidate, "word": word, "score": float(score)})
    if not candidate_by_index:
        return FillResult("unsatisfiable", {}, 0, 0)

    valid_intersections: list[tuple[str, int, str, int]] = []
    neighbors: dict[str, list[tuple[str, int, str, int]]] = {slot_id: [] for slot_id in slot_by_id}
    for intersection in intersections:
        slot_id = intersection.get("slotId")
        other_id = intersection.get("otherSlotId")
        position = intersection.get("position")
        other_position = intersection.get("otherPosition")
        if (
            not isinstance(slot_id, str)
            or not isinstance(other_id, str)
            or slot_id not in slot_by_id
            or other_id not in slot_by_id
            or not isinstance(position, int)
            or not isinstance(other_position, int)
            or position < 0
            or position >= slot_by_id[slot_id]["length"]
            or other_position < 0
            or other_position >= slot_by_id[other_id]["length"]
        ):
            return FillResult("invalid-request", {}, 0, 0)
        relation = (slot_id, position, other_id, other_position)
        valid_intersections.append(relation)
        neighbors[slot_id].append(relation)
        neighbors[other_id].append((other_id, other_position, slot_id, position))

    domains: dict[str, set[int]] = {
        slot_id: {
            index
            for index, candidate in enumerate(candidate_by_index)
            if len(candidate["word"]) == slot["length"]
            and _matches(candidate["word"], slot.get("pattern"))
        }
        for slot_id, slot in slot_by_id.items()
    }
    if any(not domain for domain in domains.values()):
        return FillResult("unsatisfiable", {}, 0, 0)

    def propagate(current: dict[str, set[int]], assignments: dict[str, int]) -> bool:
        changed = True
        while changed:
            changed = False
            for slot_id, position, other_id, other_position in valid_intersections:
                left = current[slot_id]
                right = current[other_id]
                left_next = {
                    index
                    for index in left
                    if any(
                        candidate_by_index[index]["word"][position]
                        == candidate_by_index[other_index]["word"][other_position]
                        for other_index in right
                    )
                }
                right_next = {
                    index
                    for index in right
                    if any(
                        candidate_by_index[index]["word"][position]
                        == candidate_by_index[other_index]["word"][other_position]
                        for other_index in left
                    )
                }
                changed |= left_next != left or right_next != right
                current[slot_id] = left_next
                current[other_id] = right_next
                if not left_next or not right_next:
                    return False
            for assigned_id, assigned_index in assignments.items():
                word = candidate_by_index[assigned_index]["word"]
                for slot_id, domain in current.items():
                    if slot_id == assigned_id:
                        continue
                    next_domain = {index for index in domain if candidate_by_index[index]["word"] != word}
                    changed |= next_domain != domain
                    current[slot_id] = next_domain
                    if not next_domain:
                        return False
        return True

    nodes = 0
    solution: dict[str, int] | None = None
    solution_score = float("-inf")

    def search(current: dict[str, set[int]], assignments: dict[str, int], score: float) -> None:
        nonlocal nodes, solution, solution_score
        if solution is not None or nodes >= max_nodes:
            return
        nodes += 1
        open_slots = [slot_id for slot_id in slot_by_id if slot_id not in assignments]
        if not open_slots:
            solution = dict(assignments)
            solution_score = score
            return
        slot_id = min(
            open_slots,
            key=lambda candidate_id: (len(current[candidate_id]), -len(neighbors[candidate_id]), candidate_id),
        )
        values = sorted(
            current[slot_id],
            key=lambda index: (-candidate_by_index[index]["score"], candidate_by_index[index]["word"]),
        )
        for candidate_index in values:
            next_domains = {key: set(value) for key, value in current.items()}
            next_domains[slot_id] = {candidate_index}
            next_assignments = {**assignments, slot_id: candidate_index}
            if propagate(next_domains, next_assignments):
                search(next_domains, next_assignments, score + candidate_by_index[candidate_index]["score"])
                if solution is not None:
                    return

    if not propagate(domains, {}):
        return FillResult("unsatisfiable", {}, 0, nodes)
    search(domains, {}, 0)
    if solution is None:
        status = "resource-limit" if nodes >= max_nodes else "unsatisfiable"
        return FillResult(status, {}, 0, nodes)
    return FillResult(
        "solved",
        {slot_id: candidate_by_index[index]["word"] for slot_id, index in solution.items()},
        solution_score,
        nodes,
    )
