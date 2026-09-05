# Commit workflow

The checkout uses repository-managed hooks in `.githooks/`. Enable them once
after cloning:

```sh
make install-hooks
make doctor
```

`make setup` enables them automatically. The pre-commit hook rejects commits
with more than 12 staged paths and runs the fast quality gate for every
checkpoint. The gate always runs the Python, legacy Jest, TypeScript unit and
property suites, the web build, forbidden-content scan, and staged whitespace
checks. It adds package coverage and Playwright for web changes, and package
coverage plus Stryker for construction changes.

Make checkpoint commits after each logical slice and at least every 30 minutes:

```sh
git status --short
git add path/to/owned/files
git commit -m "checkpoint: describe the completed slice"
```

The full promotion gate is still `make qa`. CI runs it as separate reportable
stages, so `--no-verify` cannot turn an invalid change into a releasable one.