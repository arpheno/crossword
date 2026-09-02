# npm audit baseline

On 2026-08-29, the pinned legacy dependency graph was audited with:

```bash
npm audit --json > reports/npm-audit.json
```

The audit reported 12 vulnerabilities (8 high, 1 moderate, 3 low). This is a
record of the legacy baseline, not an approval to run `npm audit fix --force`.
Remediation belongs to a reviewed dependency-migration change. `make npm-audit`
reproduces the report locally and preserves the command's non-zero status when
the audit finds advisories.
