"""Focused tests for the provider-neutral continuity archive contract."""

from __future__ import annotations

import copy
import json

import pytest

from src.crossword.continuity_export import (
    _manifest_for,
    ContinuityContentError,
    ContinuityIntegrityError,
    ContinuityLimits,
    ContinuitySchemaError,
    ContinuitySizeError,
    UnsupportedContinuityVersion,
    build_archive,
    export_archive,
    import_archive,
    merge_continuity_state,
    preview_import,
    serialize_archive,
    validate_archive,
)


@pytest.fixture
def continuity_state() -> dict:
    return {
        "settings": {
            "theme": "dark",
            "locale": "en-US",
            "sound_enabled": False,
            "layout": {"zoom": 1.1},
        },
        "completions": [
            {
                "completion_id": "completion-1",
                "puzzle_id": "local-original-1",
                "completed_at": "2026-08-29T10:00:00Z",
                "active_seconds": 321,
                "score": 98,
            }
        ],
        "progress": [
            {
                "session_id": "session-1",
                "puzzle_id": "local-original-2",
                "updated_at": "2026-08-29T10:05:00Z",
                "elapsed_seconds": 42,
                "completed_cells": 7,
                "total_cells": 25,
                "selected_cell_index": 8,
                "direction": "across",
            }
        ],
    }


def test_should_round_trip_safe_state_deterministically(continuity_state: dict) -> None:
    first = export_archive(**continuity_state)
    second = export_archive(**continuity_state)

    assert first == second
    parsed = validate_archive(first)
    assert parsed["data"] == continuity_state
    assert serialize_archive(parsed) == first


def test_should_omit_secrets_and_solution_material_when_exporting(continuity_state: dict) -> None:
    state = copy.deepcopy(continuity_state)
    state["settings"].update(
        {
            "api_key": "do-not-export",
            "password": "do-not-export",
            "provider": "legacy-provider",
            "safe_flag": True,
        }
    )
    state["completions"][0].update(
        {
            "clue_text": "must not be copied",
            "answer": "must not be copied",
            "solution_url": "https://example.invalid/solution",
        }
    )
    state["progress"][0]["entered_letters"] = {"8": "A"}

    exported = export_archive(**state)
    assert "do-not-export" not in exported
    assert "must not be copied" not in exported
    assert "entered_letters" not in exported
    restored = validate_archive(exported)["data"]
    assert restored["settings"]["safe_flag"] is True
    assert "api_key" not in restored["settings"]
    assert "clue_text" not in restored["completions"][0]


def test_should_reject_data_modified_without_manifest_update_before_merge(continuity_state: dict) -> None:
    archive = json.loads(export_archive(**continuity_state))
    archive["data"]["settings"]["theme"] = "light"
    current = copy.deepcopy(continuity_state)

    with pytest.raises(ContinuityIntegrityError):
        merge_continuity_state(current, archive)

    assert current == continuity_state


def test_should_reject_unsafe_import_instead_of_partially_accepting_it(
    continuity_state: dict,
) -> None:
    # Start from a valid public archive, then hand-craft a payload and fully
    # recompute its unkeyed hashes.  The private manifest builder is narrowly
    # justified here: the test must isolate content policy from hash mismatch.
    unsafe_archive = build_archive(
        settings=continuity_state["settings"],
        completions=continuity_state["completions"],
        progress=continuity_state["progress"],
    )
    unsafe_archive["data"]["progress"][0]["answers"] = {"0": "A"}
    unsafe_archive["manifest"] = _manifest_for(unsafe_archive["data"])

    # Content policy still rejects it even though the manifest is valid.
    with pytest.raises(ContinuityContentError):
        validate_archive(unsafe_archive)


def test_should_preview_counts_without_exposing_state(continuity_state: dict) -> None:
    preview = preview_import(export_archive(**continuity_state))

    assert preview.schema_version == 1
    assert preview.completion_count == 1
    assert preview.progress_count == 1
    assert preview.settings_keys == ("layout", "locale", "sound_enabled", "theme")
    assert "local-original-1" not in repr(preview.to_dict())


def test_should_overlay_settings_and_dedupe_records_without_mutating_inputs(
    continuity_state: dict,
) -> None:
    current = {
        "settings": {"theme": "light", "font_size": 14},
        "completions": [
            {
                "completion_id": "completion-1",
                "puzzle_id": "local-original-1",
                "score": 12,
            }
        ],
        "progress": [],
    }
    original_current = copy.deepcopy(current)
    incoming = export_archive(**continuity_state)

    merged = merge_continuity_state(current, incoming)

    assert current == original_current
    assert merged["settings"] == {
        "theme": "dark",
        "font_size": 14,
        "locale": "en-US",
        "sound_enabled": False,
        "layout": {"zoom": 1.1},
    }
    assert merged["completions"][0]["score"] == 98
    assert len(merged["completions"]) == 1
    assert len(merged["progress"]) == 1


def test_should_reject_forward_versions_before_reading_data(continuity_state: dict) -> None:
    archive = json.loads(export_archive(**continuity_state))
    archive["schema_version"] = 2

    with pytest.raises(UnsupportedContinuityVersion):
        validate_archive(archive)


def test_should_reject_depth_and_size_limits() -> None:
    nested: dict = {}
    cursor = nested
    for _ in range(5):
        cursor["next"] = {}
        cursor = cursor["next"]
    with pytest.raises(ContinuitySizeError):
        build_archive(settings=nested, limits=ContinuityLimits(max_depth=3))

    with pytest.raises(ContinuitySizeError):
        export_archive(settings={"label": "x" * 100}, limits=ContinuityLimits(max_bytes=20))


def test_should_reject_unknown_progress_fields_and_non_json_values() -> None:
    archive = build_archive(progress=[{"puzzle_id": "p1", "entered_letters": {"1": "A"}}])
    assert archive["data"]["progress"] == [{"puzzle_id": "p1"}]

    with pytest.raises(ContinuitySchemaError):
        build_archive(settings={"when": object()})


def test_should_import_archive_as_detached_data_or_archive() -> None:
    text = export_archive(settings={"theme": "dark"})
    imported_archive = import_archive(text)

    assert imported_archive["schema_version"] == 1
    imported_archive["data"]["settings"]["theme"] = "light"
    assert json.loads(text)["data"]["settings"]["theme"] == "dark"
