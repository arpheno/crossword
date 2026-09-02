"""Versioned, provider-neutral continuity archives.

This module is deliberately independent from Flask, the database, puzzle
parsers, and network clients.  It defines the small part of local state that
is safe to move between application versions:

* user settings;
* completion metadata (never a puzzle or its solution); and
* in-progress session metadata (never entered letters or a puzzle body).

The wire format is ordinary JSON so a person can inspect it, while the
manifest detects accidental corruption during transport or storage.  It is
not an authentication signature and does not protect against an editor who
can recompute the hashes.  Import validation completes before
``merge_continuity_state`` creates a new state, which gives callers a
transactional boundary even when their actual persistence adapter is a
database or IndexedDB repository.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
import copy
import hashlib
import json
import math
import re
from typing import Any, Final, TypeAlias


FORMAT: Final[str] = "crossword-continuity"
SCHEMA_VERSION: Final[int] = 1

# Keep the default deliberately conservative.  An export is a backup, not a
# bulk data channel.  Callers with a known larger local policy can provide a
# ContinuityLimits instance explicitly.
DEFAULT_MAX_ARCHIVE_BYTES: Final[int] = 1_048_576
DEFAULT_MAX_DEPTH: Final[int] = 16
DEFAULT_MAX_ITEMS: Final[int] = 10_000
DEFAULT_MAX_STRING_LENGTH: Final[int] = 8_192
DEFAULT_MAX_KEYS: Final[int] = 10_000

JSONValue: TypeAlias = None | bool | int | float | str | list["JSONValue"] | dict[str, "JSONValue"]
JSONMapping: TypeAlias = dict[str, JSONValue]


class ContinuityError(ValueError):
    """Base class for expected continuity-format failures."""


class ContinuityFormatError(ContinuityError):
    """The input is not a JSON object in the continuity format."""


class ContinuitySchemaError(ContinuityError):
    """The archive shape or a value violates the v1 schema."""


class ContinuityIntegrityError(ContinuityError):
    """An unkeyed manifest hash/count does not match the archive data.

    These checks detect accidental corruption; they are not authentication and
    cannot establish who authored an archive or prevent hash recomputation.
    """


class ContinuitySizeError(ContinuityError):
    """The archive exceeds a configured size or nesting limit."""


class ContinuityContentError(ContinuityError):
    """The archive contains a forbidden body, provider, secret, or model."""


class UnsupportedContinuityVersion(ContinuitySchemaError):
    """The archive version is not understood by this implementation."""


# These fields intentionally describe only continuity, rather than a puzzle.
# Matching is case/punctuation-insensitive so ``api-key`` and ``api_key`` are
# both excluded.  ``puzzle_id`` is explicitly safe and therefore is not
# represented by the broad word ``puzzle`` here.
_FORBIDDEN_KEYS: Final[frozenset[str]] = frozenset(
    {
        "answer",
        "answers",
        "answertext",
        "clue",
        "clues",
        "cluetext",
        "solution",
        "solutions",
        "solutionlink",
        "puzzlebody",
        "puzzledata",
        "puzzlemanifest",
        "puzzle",
        "answerdata",
        "cluedata",
        "solutiondata",
        "grid",
        "griddata",
        "cells",
        "letters",
        "rebus",
        "model",
        "models",
        "modelfile",
        "modelfiles",
        "modelpath",
        "weights",
        "secret",
        "secrets",
        "password",
        "passphrase",
        "token",
        "apikey",
        "apisecret",
        "auth",
        "authorization",
        "credential",
        "credentials",
        "provider",
        "providerid",
        "providerurl",
        "sourceurl",
        "solutionurl",
        "xwordinfo",
        "nyt",
        "nytimes",
        # Session bodies often arrive under one of these names.  They are
        # intentionally not part of the progress metadata contract.
        "enteredletters",
        "enteredvalues",
        "filledcells",
        "userentries",
    }
)

# A provider marker in a string is not useful continuity data.  Catching it
# on import prevents a hand-crafted archive from smuggling legacy material in
# through an innocuous-looking field.  Export sanitisation drops fields with a
# marker rather than copying them to the archive.
_FORBIDDEN_VALUE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:https?://[^\s]*?(?:nytimes|xwordinfo)[^\s]*|\bnytimes\b|\bxword\s*info\b|\bnyt\b)",
    re.IGNORECASE,
)

_COMPLETION_FIELDS: Final[frozenset[str]] = frozenset(
    {
        "id",
        "completion_id",
        "puzzle_id",
        # Kept for importing the legacy bridge's completion metadata.  It is
        # an identity hint, not a puzzle body.
        "puzzle_date",
        "date",
        "title",
        "authors",
        "weekday",
        "day",
        "completed_at",
        "started_at",
        "duration_seconds",
        "time_taken",
        "active_seconds",
        "score",
        "status",
        "checks_used",
        "reveals_used",
        "corrections",
        "hints_used",
        "abandoned",
        "player_id",
        "profile_id",
        "source_kind",
    }
)

_PROGRESS_FIELDS: Final[frozenset[str]] = frozenset(
    {
        "id",
        "session_id",
        "puzzle_id",
        "puzzle_date",
        "date",
        "profile_id",
        "player_id",
        "started_at",
        "updated_at",
        "last_played_at",
        "elapsed_seconds",
        "duration_seconds",
        "active_seconds",
        "completed_cells",
        "total_cells",
        "completed_entries",
        "total_entries",
        "selected_cell_index",
        "selected_entry_id",
        "direction",
        "status",
        "is_complete",
        "abandoned",
        "checks_used",
        "reveals_used",
        "corrections",
        "hints_used",
    }
)


@dataclass(frozen=True, slots=True)
class ContinuityLimits:
    """Resource limits applied at the untrusted import boundary."""

    max_bytes: int = DEFAULT_MAX_ARCHIVE_BYTES
    max_depth: int = DEFAULT_MAX_DEPTH
    max_items: int = DEFAULT_MAX_ITEMS
    max_string_length: int = DEFAULT_MAX_STRING_LENGTH
    max_keys: int = DEFAULT_MAX_KEYS

    def __post_init__(self) -> None:
        for name in ("max_bytes", "max_depth", "max_items", "max_string_length", "max_keys"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer")


@dataclass(frozen=True, slots=True)
class ContinuityPreview:
    """Non-sensitive summary returned before an import is committed."""

    format: str
    schema_version: int
    settings_keys: tuple[str, ...]
    completion_count: int
    progress_count: int
    has_in_progress: bool
    verified: bool = True

    def to_dict(self) -> JSONMapping:
        return {
            "format": self.format,
            "schema_version": self.schema_version,
            "settings_keys": list(self.settings_keys),
            "completion_count": self.completion_count,
            "progress_count": self.progress_count,
            "has_in_progress": self.has_in_progress,
            "verified": self.verified,
        }

def _normalise_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.casefold())


def _is_forbidden_key(key: str) -> bool:
    normalised = _normalise_key(key)
    return normalised in _FORBIDDEN_KEYS


def _contains_forbidden_value(value: str) -> bool:
    return _FORBIDDEN_VALUE_RE.search(value) is not None


def _canonical_bytes(value: JSONValue) -> bytes:
    """Return the one canonical JSON encoding used for hashing and output."""

    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as exc:
        raise ContinuitySchemaError(f"value is not canonical JSON: {exc}") from exc
    return encoded.encode("utf-8")


def _sha256(value: JSONValue) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContinuityFormatError(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def _reject_constant(value: str) -> Any:
    raise ContinuityFormatError(f"non-finite JSON number is not permitted: {value}")


def _decode_json(source: str | bytes | bytearray, limits: ContinuityLimits) -> JSONValue:
    if isinstance(source, str):
        raw = source.encode("utf-8")
    elif isinstance(source, (bytes, bytearray)):
        raw = bytes(source)
    else:
        raise ContinuityFormatError("archive input must be a JSON string or UTF-8 bytes")
    if len(raw) > limits.max_bytes:
        raise ContinuitySizeError(f"archive is larger than {limits.max_bytes} bytes")
    try:
        return json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_constant,
        )
    except ContinuityError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ContinuityFormatError(f"invalid JSON archive: {exc}") from exc


def _walk_limits(value: Any, limits: ContinuityLimits, *, depth: int = 0, seen: set[int] | None = None) -> None:
    """Check resource bounds and JSON types before any schema processing."""

    if seen is None:
        seen = set()
    if depth > limits.max_depth:
        raise ContinuitySizeError(f"archive nesting exceeds depth {limits.max_depth}")
    if isinstance(value, str):
        if len(value) > limits.max_string_length:
            raise ContinuitySizeError(f"string exceeds {limits.max_string_length} characters")
        return
    if value is None or isinstance(value, (bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContinuitySchemaError("non-finite numbers are not permitted")
        return
    if not isinstance(value, (dict, list)):
        raise ContinuitySchemaError(f"unsupported value type: {type(value).__name__}")
    identity = id(value)
    if identity in seen:
        raise ContinuitySchemaError("recursive values are not valid JSON")
    seen.add(identity)
    try:
        if len(value) > limits.max_items:
            raise ContinuitySizeError(f"collection exceeds {limits.max_items} items")
        if isinstance(value, dict):
            if len(value) > limits.max_keys:
                raise ContinuitySizeError(f"object exceeds {limits.max_keys} keys")
            for key, child in value.items():
                if not isinstance(key, str):
                    raise ContinuitySchemaError("object keys must be strings")
                if len(key) > limits.max_string_length:
                    raise ContinuitySizeError(f"object key exceeds {limits.max_string_length} characters")
                _walk_limits(child, limits, depth=depth + 1, seen=seen)
        else:
            for child in value:
                _walk_limits(child, limits, depth=depth + 1, seen=seen)
    finally:
        seen.remove(identity)


def _copy_safe_value(value: Any, limits: ContinuityLimits, *, drop_forbidden: bool) -> JSONValue | None:
    """Copy JSON data while excluding secret/body/provider-shaped keys."""

    if value is None or isinstance(value, (bool, int, str)):
        if isinstance(value, str) and _contains_forbidden_value(value):
            if drop_forbidden:
                return None
            raise ContinuityContentError("provider-specific content is not allowed")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContinuitySchemaError("non-finite numbers are not permitted")
        return value
    if isinstance(value, dict):
        result: JSONMapping = {}
        for key, child in value.items():
            if not isinstance(key, str):
                raise ContinuitySchemaError("object keys must be strings")
            if _is_forbidden_key(key):
                if drop_forbidden:
                    continue
                raise ContinuityContentError(f"forbidden continuity field: {key}")
            copied = _copy_safe_value(child, limits, drop_forbidden=drop_forbidden)
            # ``None`` is a legitimate JSON value.  A forbidden value is only
            # dropped when it occurs in a mapping, where retaining its key
            # could be mistaken for a successful export.
            if copied is None and child is not None and drop_forbidden:
                continue
            result[key] = copied
        return result
    if isinstance(value, list):
        result_list: list[JSONValue] = []
        for child in value:
            copied = _copy_safe_value(child, limits, drop_forbidden=drop_forbidden)
            if copied is None and child is not None and drop_forbidden:
                continue
            result_list.append(copied)
        return result_list
    raise ContinuitySchemaError(f"unsupported value type: {type(value).__name__}")


def _as_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContinuitySchemaError(f"{label} must be an object")
    if any(not isinstance(key, str) for key in value):
        raise ContinuitySchemaError(f"{label} keys must be strings")
    return value


def _normalise_records(
    records: Iterable[Mapping[str, Any]] | None,
    *,
    label: str,
    allowed_fields: frozenset[str],
    limits: ContinuityLimits,
    drop_forbidden: bool,
) -> list[JSONMapping]:
    if records is None:
        return []
    if isinstance(records, (str, bytes, bytearray)) or not isinstance(records, Iterable):
        raise ContinuitySchemaError(f"{label} must be a list of objects")
    result: list[JSONMapping] = []
    for index, record in enumerate(records):
        mapping = _as_mapping(record, f"{label}[{index}]")
        normalised: JSONMapping = {}
        for key, raw_value in mapping.items():
            if _is_forbidden_key(key):
                if drop_forbidden:
                    continue
                raise ContinuityContentError(f"forbidden {label} field: {key}")
            if key not in allowed_fields:
                # Exporting is a sanitising boundary: unknown fields are not
                # allowed to smuggle a puzzle body into a v1 record.  Imports
                # remain strict and reject the same field so callers cannot
                # mistake an omitted value for a successful round trip.
                if drop_forbidden:
                    continue
                raise ContinuitySchemaError(f"unsupported {label} field: {key}")
            value = _copy_safe_value(raw_value, limits, drop_forbidden=drop_forbidden)
            if value is None and raw_value is not None and drop_forbidden:
                continue
            normalised[key] = value
        if not normalised:
            raise ContinuitySchemaError(f"{label}[{index}] must contain metadata")
        result.append(normalised)
    return result


def _normalise_data(
    settings: Mapping[str, Any] | None,
    completions: Iterable[Mapping[str, Any]] | None,
    progress: Iterable[Mapping[str, Any]] | None,
    *,
    limits: ContinuityLimits,
    drop_forbidden: bool,
) -> JSONMapping:
    if settings is None:
        settings = {}
    settings_mapping = _as_mapping(settings, "settings")
    safe_settings = _copy_safe_value(settings_mapping, limits, drop_forbidden=drop_forbidden)
    if not isinstance(safe_settings, dict):  # pragma: no cover - guarded above
        raise ContinuitySchemaError("settings must be an object")
    safe_completions = _normalise_records(
        completions,
        label="completions",
        allowed_fields=_COMPLETION_FIELDS,
        limits=limits,
        drop_forbidden=drop_forbidden,
    )
    safe_progress = _normalise_records(
        progress,
        label="progress",
        allowed_fields=_PROGRESS_FIELDS,
        limits=limits,
        drop_forbidden=drop_forbidden,
    )
    data: JSONMapping = {
        "settings": safe_settings,
        "completions": safe_completions,
        "progress": safe_progress,
    }
    _walk_limits(data, limits)
    return data


def _manifest_for(data: JSONMapping) -> JSONMapping:
    sections = {name: _sha256(data[name]) for name in ("settings", "completions", "progress")}
    return {
        "algorithm": "sha256",
        "data_sha256": _sha256(data),
        "sections": sections,
        "counts": {
            "settings_keys": len(data["settings"]),
            "completions": len(data["completions"]),
            "progress": len(data["progress"]),
        },
    }


def _archive_for(data: JSONMapping) -> JSONMapping:
    return {
        "format": FORMAT,
        "schema_version": SCHEMA_VERSION,
        "manifest": _manifest_for(data),
        "data": data,
    }


def build_archive(
    settings: Mapping[str, Any] | None = None,
    completions: Iterable[Mapping[str, Any]] | None = None,
    progress: Iterable[Mapping[str, Any]] | None = None,
    *,
    limits: ContinuityLimits | None = None,
) -> JSONMapping:
    """Build a validated v1 archive mapping from safe local state.

    Unsafe fields are omitted from an export by design.  Callers should map
    application-specific storage records to the canonical ``completions`` and
    ``progress`` metadata collections before calling this function.
    """

    effective_limits = limits or ContinuityLimits()
    data = _normalise_data(
        settings,
        completions,
        progress,
        limits=effective_limits,
        drop_forbidden=True,
    )
    archive = _archive_for(data)
    _walk_limits(archive, effective_limits)
    # Apply the byte limit to the complete serialized archive as well as to
    # individual values.  This catches a large manifest/count edge case.
    if len(_canonical_bytes(archive)) > effective_limits.max_bytes:
        raise ContinuitySizeError(f"archive is larger than {effective_limits.max_bytes} bytes")
    return archive


def _schema_version(value: Any) -> int:
    if not isinstance(value, dict) or "schema_version" not in value:
        raise ContinuitySchemaError("archive is missing schema_version")
    version = value["schema_version"]
    if isinstance(version, bool) or not isinstance(version, int):
        raise ContinuitySchemaError("schema_version must be an integer")
    if version != SCHEMA_VERSION:
        raise UnsupportedContinuityVersion(
            f"continuity schema version {version} is not supported (current: {SCHEMA_VERSION})"
        )
    return version


def _validate_manifest(manifest: Any, data: JSONMapping) -> JSONMapping:
    manifest_mapping = _as_mapping(manifest, "manifest")
    required = {"algorithm", "data_sha256", "sections", "counts"}
    if set(manifest_mapping) != required:
        raise ContinuitySchemaError("manifest must contain algorithm, data_sha256, sections, and counts")
    if manifest_mapping["algorithm"] != "sha256":
        raise ContinuityIntegrityError("unsupported integrity algorithm")
    data_sha = manifest_mapping["data_sha256"]
    if not isinstance(data_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", data_sha):
        raise ContinuityIntegrityError("manifest data_sha256 is malformed")
    if data_sha != _sha256(data):
        raise ContinuityIntegrityError("manifest data hash does not match archive data")

    sections = _as_mapping(manifest_mapping["sections"], "manifest.sections")
    if set(sections) != {"settings", "completions", "progress"}:
        raise ContinuitySchemaError("manifest.sections must hash all data sections")
    for name in ("settings", "completions", "progress"):
        digest = sections[name]
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ContinuityIntegrityError(f"manifest hash for {name} is malformed")
        if digest != _sha256(data[name]):
            raise ContinuityIntegrityError(f"manifest hash for {name} does not match archive data")

    counts = _as_mapping(manifest_mapping["counts"], "manifest.counts")
    expected_counts = {
        "settings_keys": len(data["settings"]),
        "completions": len(data["completions"]),
        "progress": len(data["progress"]),
    }
    if counts != expected_counts:
        raise ContinuityIntegrityError("manifest counts do not match archive data")
    return copy.deepcopy(dict(manifest_mapping))


def _validate_archive_mapping(value: Any, limits: ContinuityLimits) -> JSONMapping:
    _walk_limits(value, limits)
    archive = _as_mapping(value, "archive")
    required = {"format", "schema_version", "manifest", "data"}
    if set(archive) != required:
        raise ContinuitySchemaError("archive has unexpected or missing top-level fields")
    if archive["format"] != FORMAT:
        raise ContinuityFormatError("archive format is not crossword-continuity")
    _schema_version(dict(archive))
    data_mapping = _as_mapping(archive["data"], "data")
    if set(data_mapping) != {"settings", "completions", "progress"}:
        raise ContinuitySchemaError("data must contain settings, completions, and progress")
    # Imported data is never silently scrubbed: an unsafe payload must be
    # rejected, not partially accepted under the appearance of success.
    data = _normalise_data(
        _as_mapping(data_mapping["settings"], "data.settings"),
        data_mapping["completions"],
        data_mapping["progress"],
        limits=limits,
        drop_forbidden=False,
    )
    manifest = _validate_manifest(archive["manifest"], data)
    canonical = {
        "format": FORMAT,
        "schema_version": SCHEMA_VERSION,
        "manifest": manifest,
        "data": data,
    }
    if len(_canonical_bytes(canonical)) > limits.max_bytes:
        raise ContinuitySizeError(f"archive is larger than {limits.max_bytes} bytes")
    return canonical


def validate_archive(
    source: Mapping[str, Any] | str | bytes | bytearray,
    *,
    limits: ContinuityLimits | None = None,
) -> JSONMapping:
    """Validate and return a detached canonical archive mapping."""

    effective_limits = limits or ContinuityLimits()
    if isinstance(source, Mapping):
        value: Any = copy.deepcopy(dict(source))
    else:
        value = _decode_json(source, effective_limits)
    return _validate_archive_mapping(value, effective_limits)


def serialize_archive(
    archive: Mapping[str, Any], *, limits: ContinuityLimits | None = None
) -> str:
    """Serialize an existing archive with stable key ordering and spacing."""

    validated = validate_archive(archive, limits=limits)
    return _canonical_bytes(validated).decode("utf-8")


def export_archive(
    settings: Mapping[str, Any] | None = None,
    completions: Iterable[Mapping[str, Any]] | None = None,
    progress: Iterable[Mapping[str, Any]] | None = None,
    *,
    limits: ContinuityLimits | None = None,
) -> str:
    """Export state sections as deterministic JSON text."""

    effective_limits = limits or ContinuityLimits()
    archive = build_archive(
        settings=settings,
        completions=completions,
        progress=progress,
        limits=effective_limits,
    )
    return _canonical_bytes(archive).decode("utf-8")


def preview_import(
    source: Mapping[str, Any] | str | bytes | bytearray,
    *,
    limits: ContinuityLimits | None = None,
) -> ContinuityPreview:
    """Validate an archive and return a summary safe to show in a dialog."""

    archive = validate_archive(source, limits=limits)
    data = archive["data"]
    settings = data["settings"]
    completions = data["completions"]
    progress = data["progress"]
    if not isinstance(settings, dict) or not isinstance(completions, list) or not isinstance(progress, list):
        raise ContinuitySchemaError("validated archive has invalid data collections")  # pragma: no cover
    return ContinuityPreview(
        format=FORMAT,
        schema_version=SCHEMA_VERSION,
        settings_keys=tuple(sorted(settings)),
        completion_count=len(completions),
        progress_count=len(progress),
        has_in_progress=bool(progress),
    )


def _state_data(state: Mapping[str, Any], limits: ContinuityLimits) -> JSONMapping:
    """Validate a local state object, accepting either data or archive shape."""

    if not isinstance(state, Mapping):
        raise ContinuitySchemaError("current state must be an object")
    if "data" in state:
        archive = validate_archive(state, limits=limits)
        return copy.deepcopy(archive["data"])
    canonical_state: dict[str, Any] = dict(state)
    if set(canonical_state) != {"settings", "completions", "progress"}:
        raise ContinuitySchemaError("current state must contain settings, completions, and progress")
    return _normalise_data(
        _as_mapping(canonical_state["settings"], "current settings"),
        canonical_state["completions"],
        canonical_state["progress"],
        limits=limits,
        drop_forbidden=False,
    )


def _record_identity(record: Mapping[str, Any], *, kind: str) -> tuple[str, str]:
    for field in (("completion_id", "id", "puzzle_id") if kind == "completion" else ("session_id", "id", "puzzle_id")):
        value = record.get(field)
        if isinstance(value, str) and value:
            return field, value
    # No stable ID is still safe: canonical metadata gives equal records
    # idempotent merge behavior without inventing a puzzle identity.
    return "digest", _sha256(dict(record))


def _merge_records(
    existing: Sequence[Mapping[str, Any]], incoming: Sequence[Mapping[str, Any]], *, kind: str
) -> list[JSONMapping]:
    result = [copy.deepcopy(dict(record)) for record in existing]
    positions: dict[tuple[str, str], int] = {
        _record_identity(record, kind=kind): index for index, record in enumerate(existing)
    }
    for record in incoming:
        detached = copy.deepcopy(dict(record))
        identity = _record_identity(detached, kind=kind)
        if identity in positions:
            # Imported state is the newest representation of that record, but
            # retaining its original position keeps a merge deterministic.
            result[positions[identity]] = detached
        else:
            positions[identity] = len(result)
            result.append(detached)
    return result


def merge_continuity_state(
    current_state: Mapping[str, Any],
    incoming: Mapping[str, Any] | str | bytes | bytearray,
    *,
    limits: ContinuityLimits | None = None,
) -> JSONMapping:
    """Merge validated incoming state without mutating ``current_state``.

    All validation occurs before the first output value is assembled.  A
    caller can therefore treat this function as the transaction preparation
    step and persist the returned object atomically in its own adapter.
    Settings are overlaid by imported values; completion and progress records
    are merged by stable ID (or a metadata digest when no ID is present).
    """

    effective_limits = limits or ContinuityLimits()
    # Validate incoming first: corrupt input must not even cause a read-side
    # normalisation of the caller's object to be observable.
    incoming_archive = validate_archive(incoming, limits=effective_limits)
    current_data = _state_data(current_state, effective_limits)
    incoming_data = incoming_archive["data"]
    if not isinstance(current_data["settings"], dict) or not isinstance(incoming_data["settings"], dict):
        raise ContinuitySchemaError("settings must be objects")  # pragma: no cover
    if not isinstance(current_data["completions"], list) or not isinstance(incoming_data["completions"], list):
        raise ContinuitySchemaError("completions must be lists")  # pragma: no cover
    if not isinstance(current_data["progress"], list) or not isinstance(incoming_data["progress"], list):
        raise ContinuitySchemaError("progress must be lists")  # pragma: no cover

    merged: JSONMapping = {
        "settings": {**copy.deepcopy(current_data["settings"]), **copy.deepcopy(incoming_data["settings"])},
        "completions": _merge_records(current_data["completions"], incoming_data["completions"], kind="completion"),
        "progress": _merge_records(current_data["progress"], incoming_data["progress"], kind="progress"),
    }
    _walk_limits(merged, effective_limits)
    return merged


def import_archive(
    source: Mapping[str, Any] | str | bytes | bytearray,
    current_state: Mapping[str, Any] | None = None,
    *,
    limits: ContinuityLimits | None = None,
) -> JSONMapping:
    """Validate an archive, optionally returning a pure-data merged state."""

    archive = validate_archive(source, limits=limits)
    if current_state is None:
        return archive
    return merge_continuity_state(current_state, archive, limits=limits)


__all__ = [
    "FORMAT",
    "SCHEMA_VERSION",
    "DEFAULT_MAX_ARCHIVE_BYTES",
    "DEFAULT_MAX_DEPTH",
    "DEFAULT_MAX_ITEMS",
    "ContinuityError",
    "ContinuityFormatError",
    "ContinuitySchemaError",
    "ContinuityIntegrityError",
    "ContinuitySizeError",
    "ContinuityContentError",
    "UnsupportedContinuityVersion",
    "ContinuityLimits",
    "ContinuityPreview",
    "build_archive",
    "validate_archive",
    "serialize_archive",
    "export_archive",
    "preview_import",
    "merge_continuity_state",
    "import_archive",
]
