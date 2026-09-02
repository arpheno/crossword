# Mutation testing

Stryker mutation-tests the deterministic TypeScript construction core. Unlike
line coverage, this checks whether the tests fail when constraints, comparisons,
branches, and return values are deliberately changed.

Run the baseline locally:

```sh
make mutation-test
```

The HTML and JSON reports are written under `reports/mutation/` and are ignored
by Git. The initial gate reports scores without failing the build (`break: 0`)
while the surviving mutants are reviewed. Raise `break` toward the plan's 80%
core target as equivalent mutants are excluded narrowly and missing assertions
are added. Never lower a threshold merely to accept a feature change.

The current scope is `packages/construction/src/csp.ts`, because crossing and
eligibility mistakes can silently publish invalid grids. Domain and application
policies should be added after this first campaign is stable and reasonably
fast.
