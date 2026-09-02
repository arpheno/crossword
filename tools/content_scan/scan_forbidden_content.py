"""Scan selected files for content that cannot enter a public artifact.

This is deliberately a small, dependency-free gate.  It does not decide
whether a source is licensed; it catches known legacy/provider signatures so a
separate source ledger and review can make the positive licensing decision.

Examples::

    python tools/content_scan/scan_forbidden_content.py tests/fixtures/legal
    python tools/content_scan/scan_forbidden_content.py dist --json
    python tools/content_scan/scan_forbidden_content.py src tests --no-allowlist
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


DEFAULT_IGNORED_DIRECTORIES = frozenset(
    {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache"}
)


@dataclass(frozen=True)
class ForbiddenPattern:
    """One policy detector compiled from the allowlist JSON document."""

    identifier: str
    description: str
    regex: re.Pattern[str]


@dataclass(frozen=True)
class Finding:
    """One detector match, with enough context to fix it quickly."""

    path: str
    line: int
    pattern_id: str
    description: str
    excerpt: str


@dataclass(frozen=True)
class ScanReport:
    """Results from one deterministic scan."""

    files_scanned: int
    binary_files_skipped: int
    allowlisted_files_skipped: int
    findings: tuple[Finding, ...]

    @property
    def passed(self) -> bool:
        return not self.findings


def load_policy(path: Path) -> tuple[tuple[ForbiddenPattern, ...], tuple[dict[str, str], ...]]:
    """Load and validate a scanner policy document."""

    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("version") != 1:
        raise ValueError("content policy must declare version 1")

    patterns: list[ForbiddenPattern] = []
    for item in raw.get("forbidden_patterns", []):
        identifier = item.get("id")
        description = item.get("description")
        expression = item.get("regex")
        if not all(isinstance(value, str) and value for value in (identifier, description, expression)):
            raise ValueError("each forbidden pattern needs non-empty id, description, and regex")
        patterns.append(ForbiddenPattern(identifier, description, re.compile(expression)))

    allowlisted_paths: list[dict[str, str]] = []
    for item in raw.get("allowlisted_paths", []):
        path_pattern = item.get("path")
        reason = item.get("reason")
        if not isinstance(path_pattern, str) or not path_pattern:
            raise ValueError("each allowlist rule needs a non-empty path")
        if not isinstance(reason, str) or not reason:
            raise ValueError(f"allowlist rule {path_pattern!r} needs a reason")
        allowlisted_paths.append({"path": path_pattern, "reason": reason})

    return tuple(patterns), tuple(allowlisted_paths)


def _relative_path(path: Path, root: Path) -> str:
    """Return a stable POSIX path used by allowlist rules and reports."""

    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _is_allowlisted(relative_path: str, allowlisted_paths: Sequence[dict[str, str]]) -> bool:
    """Match exact paths and slash-aware ``/**`` directory rules."""

    for rule in allowlisted_paths:
        pattern = rule["path"].replace("\\", "/")
        while pattern.startswith("./"):
            pattern = pattern[2:]
        if pattern.endswith("/**"):
            directory = pattern[:-3].rstrip("/")
            if relative_path == directory or relative_path.startswith(f"{directory}/"):
                return True
        elif fnmatch.fnmatchcase(relative_path, pattern):
            return True
    return False


def _iter_files(paths: Iterable[Path], root: Path) -> Iterable[Path]:
    """Yield regular files once, skipping generated dependency directories."""

    seen: set[Path] = set()
    for requested in paths:
        path = requested if requested.is_absolute() else root / requested
        path = path.resolve()
        if not path.exists():
            raise FileNotFoundError(path)
        candidates = (path,) if path.is_file() else path.rglob("*")
        for candidate in candidates:
            if not candidate.is_file():
                continue
            try:
                relative_parts = candidate.relative_to(path if path.is_dir() else root).parts
            except ValueError:
                relative_parts = candidate.parts
            if any(part in DEFAULT_IGNORED_DIRECTORIES for part in relative_parts):
                continue
            if candidate not in seen:
                seen.add(candidate)
                yield candidate


def scan_paths(
    paths: Sequence[Path],
    *,
    root: Path,
    policy_path: Path | None = None,
    use_allowlist: bool = True,
) -> ScanReport:
    """Scan paths against the versioned content policy.

    ``root`` controls report paths and allowlist matching.  Callers can disable
    the allowlist for a strict audit of a legacy path or generated artifact.
    """

    selected_policy = policy_path or Path(__file__).with_name("allowlist.json")
    patterns, allowlisted_paths = load_policy(selected_policy)
    files_scanned = 0
    binary_files_skipped = 0
    allowlisted_files_skipped = 0
    findings: list[Finding] = []

    for path in _iter_files(paths, root):
        relative = _relative_path(path, root)
        if use_allowlist and _is_allowlisted(relative, allowlisted_paths):
            allowlisted_files_skipped += 1
            continue

        data = path.read_bytes()
        if b"\x00" in data:
            binary_files_skipped += 1
            continue

        files_scanned += 1
        text = data.decode("utf-8", errors="replace")
        for line_number, line in enumerate(text.splitlines(), start=1):
            for pattern in patterns:
                if pattern.regex.search(line):
                    findings.append(
                        Finding(
                            path=relative,
                            line=line_number,
                            pattern_id=pattern.identifier,
                            description=pattern.description,
                            excerpt=line.strip()[:240],
                        )
                    )

    return ScanReport(
        files_scanned=files_scanned,
        binary_files_skipped=binary_files_skipped,
        allowlisted_files_skipped=allowlisted_files_skipped,
        findings=tuple(findings),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="Files or directories to scan (default: repository root)")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Path used for relative reports and allowlist matching")
    parser.add_argument("--policy", type=Path, help="Policy JSON (default: tools/content_scan/allowlist.json)")
    parser.add_argument("--no-allowlist", action="store_true", help="Scan allowlisted files too")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Emit machine-readable JSON")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    root = args.root.resolve()
    paths = args.paths or [root]
    try:
        report = scan_paths(
            paths,
            root=root,
            policy_path=args.policy,
            use_allowlist=not args.no_allowlist,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"content scan configuration/error: {error}", file=sys.stderr)
        return 2

    if args.as_json:
        print(
            json.dumps(
                {
                    "passed": report.passed,
                    "files_scanned": report.files_scanned,
                    "binary_files_skipped": report.binary_files_skipped,
                    "allowlisted_files_skipped": report.allowlisted_files_skipped,
                    "findings": [asdict(finding) for finding in report.findings],
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        for finding in report.findings:
            print(f"{finding.path}:{finding.line}: {finding.pattern_id}: {finding.excerpt}")
        status = "passed" if report.passed else f"failed ({len(report.findings)} finding(s))"
        print(
            f"Forbidden-content scan {status}; scanned {report.files_scanned} file(s), "
            f"skipped {report.allowlisted_files_skipped} allowlisted and "
            f"{report.binary_files_skipped} binary file(s)."
        )
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
