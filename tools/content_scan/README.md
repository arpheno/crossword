# Forbidden-content scan

`scan_forbidden_content.py` is a small, dependency-free release-gate skeleton.
It detects known legacy/provider signatures and known historical answer samples
in a selected source or artifact tree. It is not a substitute for a source
ledger, license review, or counsel/owner approval.

The checked-in policy is in `allowlist.json`. Every allowlisted path has a
reason and represents private continuity material that must be excluded from a
public build. New legal fixtures are intentionally not allowlisted.

Examples:

```sh
python tools/content_scan/scan_forbidden_content.py tests/fixtures/legal
python tools/content_scan/scan_forbidden_content.py dist --json
python tools/content_scan/scan_forbidden_content.py src tests --no-allowlist
```

The command exits `0` when no detector matches, `1` when forbidden content is
found, and `2` for a missing path or invalid policy. Binary files are skipped
and generated dependency directories are ignored.
