"""Tests for the standalone forbidden-content scanner."""

from __future__ import annotations

from pathlib import Path

from tools.content_scan.scan_forbidden_content import scan_paths


REPO_ROOT = Path(__file__).parents[2]
LEGAL_FIXTURES = REPO_ROOT / "tests" / "fixtures" / "legal"


def test_legal_fixture_tree_is_clean():
    report = scan_paths([LEGAL_FIXTURES], root=REPO_ROOT)

    assert report.passed
    assert report.findings == ()
    assert report.files_scanned == 2
    assert report.allowlisted_files_skipped == 0


def test_scanner_reports_forbidden_provider_link(tmp_path):
    artifact = tmp_path / "bundle.txt"
    artifact.write_text("https://www." + "xwordinfo.com/Crossword", encoding="utf-8")

    report = scan_paths([artifact], root=tmp_path)

    assert not report.passed
    assert len(report.findings) == 1
    assert report.findings[0].path == "bundle.txt"
    assert report.findings[0].pattern_id == "solution-link"
    assert report.findings[0].line == 1


def test_scanner_reports_known_legacy_answer_sample(tmp_path):
    artifact = tmp_path / "fixture.txt"
    artifact.write_text("TRAGI" + "COMIC", encoding="utf-8")

    report = scan_paths([artifact], root=tmp_path)

    assert not report.passed
    assert [finding.pattern_id for finding in report.findings] == [
        "legacy-answer-sample-tragicomic"
    ]


def test_scanner_reports_known_legacy_clue_sample(tmp_path):
    artifact = tmp_path / "clue.txt"
    artifact.write_text("A " + "not quite " + "right", encoding="utf-8")

    report = scan_paths([artifact], root=tmp_path)

    assert not report.passed
    assert [finding.pattern_id for finding in report.findings] == [
        "legacy-clue-sample-not-quite-right"
    ]


def test_allowlist_is_explicit_and_strict_mode_can_audit_it():
    legacy_file = REPO_ROOT / "src" / "crossword" / "app.py"

    allowlisted = scan_paths([legacy_file], root=REPO_ROOT)
    strict = scan_paths([legacy_file], root=REPO_ROOT, use_allowlist=False)

    assert allowlisted.passed
    assert allowlisted.files_scanned == 0
    assert allowlisted.allowlisted_files_skipped == 1
    assert not strict.passed
    assert strict.files_scanned == 1


def test_binary_files_are_skipped(tmp_path):
    artifact = tmp_path / "font.bin"
    artifact.write_bytes(b"\x00" + b"NYT")

    report = scan_paths([artifact], root=tmp_path)

    assert report.passed
    assert report.files_scanned == 0
    assert report.binary_files_skipped == 1
