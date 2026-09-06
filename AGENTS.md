# Working Agreement

## User communication

- Acknowledge new user messages immediately, before continuing long-running
  work.

## Checkpoint commits

- Activate the repository hooks before editing with `make install-hooks` (or
  `make setup` on a fresh checkout). `make doctor` must pass before handoff.
- Work in small checkpoint commits. Commit after each logical QA slice and at
  least every 30 minutes; never carry a completed slice into an unrelated
  change or handoff.
- Keep each ordinary commit to 12 or fewer staged paths. Split larger work by
  ownership or behavior so the pre-commit gate can stay fast and diagnostic.
- Before pausing or handing work to another agent, run `git status --short`,
  stage only files owned by that slice, and create a commit with a clear
  message such as `checkpoint: add CSP property coverage`.
- Do not use `git commit --no-verify`, disable `core.hooksPath`, or weaken a
  failing test to get a checkpoint through. CI runs the full `make qa` gate as
  the backstop for any hook bypass.
- Every commit runs the unit/property, build/type, content, and staged-diff
  checks. Changes under `apps/web/` additionally run coverage and Playwright;
  changes under `packages/construction/` additionally run coverage and Stryker.

