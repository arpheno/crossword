#!/usr/bin/env node
// Forbidden-content scanner (docs/plans/04 §Content and legal release gate;
// FULL_REVIEW_PASS_2026-09-04_03 RS-P0-1 / RS-P1-1 / RS-P1-2).
//
// Two named gates:
//   --scope source   scan apps/ + packages/ source (dist excluded); the
//                    documented development exemptions apply.
//   --scope release  scan the exact built artifact apps/web/dist ONLY, with
//                    ZERO exemptions. A green release gate therefore proves
//                    the promoted artifact is clean — no waivers.
// With no --scope both gates run. Exit 1 on any non-exempt hit or on the
// seeded negative self-test failing.
//
// Patterns and exemptions live in scripts/forbidden-content.json so the list
// grows without code edits. src/crossword (the private Flask continuity
// bridge) is out of scope for the source gate by design: it is never a
// release artifact.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const configPath = join(repoRoot, 'scripts', 'forbidden-content.json');

const args = process.argv.slice(2);
const reportIndex = args.indexOf('--report');
const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : undefined;
const scopeIndex = args.indexOf('--scope');
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'both';
if (!['source', 'release', 'both'].includes(scope)) {
  console.error(`Unknown scope: ${scope}. Use source, release, or both.`);
  process.exit(2);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const patterns = config.patterns.map((pattern) => ({
  ...pattern,
  matcher: new RegExp(pattern.regex, pattern.flags ?? '')
}));

const SKIP_DIRS = new Set(['node_modules', '.git', '.vite', '.npm-cache', '__pycache__', '.pytest_cache', 'coverage', 'test-results', 'playwright-report']);
const MAX_BYTES = 12 * 1024 * 1024;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(full);
    } else if (stats.isFile() && stats.size <= MAX_BYTES) {
      yield full;
    }
  }
}

function isExempt(relativePath, patternId, exemptions) {
  return (exemptions ?? []).some((exemption) => {
    const applies = relativePath === exemption.path || relativePath.startsWith(`${exemption.path}/`);
    return applies && (exemption.patterns ?? []).includes(patternId);
  });
}

/** Pure line scan used by both gates and the seeded self-test. */
export function scanText(relativePath, text, compiledPatterns, exemptions) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (const pattern of compiledPatterns) {
    lines.forEach((line, index) => {
      if (!pattern.matcher.test(line)) return;
      hits.push({
        file: relativePath,
        line: index + 1,
        patternId: pattern.id,
        excerpt: line.trim().slice(0, 160),
        exempt: isExempt(relativePath, pattern.id, exemptions)
      });
    });
  }
  return hits;
}

function scanRoot(rootDir, useExemptions) {
  const hits = [];
  let scanned = 0;
  const absoluteRoot = join(repoRoot, rootDir);
  if (!existsSync(absoluteRoot)) return { hits, scanned };
  for (const filePath of walk(absoluteRoot)) {
    const buffer = readFileSync(filePath);
    if (buffer.includes(0)) continue; // binary: allowlisted via receipts elsewhere
    scanned += 1;
    const relativePath = relative(repoRoot, filePath);
    hits.push(...scanText(relativePath, buffer.toString('utf8'), patterns, useExemptions ? config.exemptions : []));
  }
  return { hits, scanned };
}

/** One seeded fixture per forbidden policy class (RS-P1-2). */
export function seededNegativeFixtures() {
  return [
    { patternId: 'nyt-host', text: 'fetch("https://www.nytimes.com/svc/crosswords")' },
    { patternId: 'nyt-syndication', text: 'const url = "/syndication/endpoint";' },
    { patternId: 'xwordinfo', text: 'import data from "https://www.xwordinfo.com/JSON";' },
    { patternId: 'local-inference-server', text: 'const backend = "OLLAMA";' },
    { patternId: 'loopback-inference-port', text: 'const port = "127.0.0.1:11434";' },
    { patternId: 'legacy-provider-route', text: 'client.loadRandom("/random_crossword/monday")' }
  ];
}

function selfTest() {
  const failures = [];
  for (const fixture of seededNegativeFixtures()) {
    const hits = scanText('fixture.ts', fixture.text, patterns, config.exemptions);
    const violations = hits.filter((hit) => !hit.exempt && hit.patternId === fixture.patternId);
    if (violations.length === 0) failures.push(`seeded fixture for ${fixture.patternId} produced no violation`);
  }
  const clean = scanText('clean.ts', 'const answer = "ARGENTINA";\nexport { answer };', patterns, config.exemptions);
  if (clean.length !== 0) failures.push('clean fixture produced a false violation');
  // The release gate must ignore exemptions entirely: a file that would be
  // exempt in source still violates the release artifact gate.
  const exemptedText = seededNegativeFixtures().at(-1).text;
  const releaseHits = scanText('apps/web/dist/fixture.js', exemptedText, patterns, config.exemptions);
  if (releaseHits.some((hit) => hit.exempt)) failures.push('release scope must not honor exemptions');
  for (const failure of failures) console.error(`SELF-TEST FAILURE ${failure}`);
  return failures.length === 0;
}

const gates = scope === 'both' ? ['source', 'release'] : [scope];
const results = [];
let failed = false;

for (const gate of gates) {
  const useExemptions = gate === 'source';
  const rootDir = gate === 'source' ? null : join('apps', 'web', 'dist');
  let hits;
  let scanned;
  if (gate === 'source') {
    // Source gate: apps/ + packages/ but NOT the built artifact (the release
    // gate owns dist) and not the private Flask bridge (never an artifact).
    hits = [];
    scanned = 0;
    for (const root of ['apps', 'packages']) {
      const absoluteRoot = join(repoRoot, root);
      if (!existsSync(absoluteRoot)) continue;
      for (const filePath of walk(absoluteRoot)) {
        const relativePath = relative(repoRoot, filePath);
        if (relativePath.startsWith(join('apps', 'web', 'dist'))) continue;
        const buffer = readFileSync(filePath);
        if (buffer.includes(0)) continue;
        scanned += 1;
        hits.push(...scanText(relativePath, buffer.toString('utf8'), patterns, config.exemptions));
      }
    }
  } else {
    ({ hits, scanned } = scanRoot(rootDir, false));
  }
  const violations = hits.filter((hit) => !hit.exempt);
  const exemptHits = hits.filter((hit) => hit.exempt);
  for (const hit of violations) console.log(`VIOLATION[${gate}] ${hit.file}:${hit.line} [${hit.patternId}] ${hit.excerpt}`);
  for (const hit of exemptHits) console.log(`exempt[${gate}]    ${hit.file}:${hit.line} [${hit.patternId}] ${hit.excerpt}`);
  console.log(`[scan:${gate}] scanned ${scanned} file(s); ${violations.length} violation(s); ${exemptHits.length} exempt`);
  results.push({ gate, scanned, violations: violations.length, exempt: exemptHits.length });
  if (violations.length > 0) failed = true;
}

if (!selfTest()) failed = true;

if (reportPath) {
  writeFileSync(reportPath, JSON.stringify({ scope, gates: results, selfTest: !failed ? 'pass' : 'fail' }, null, 2));
}

process.exit(failed ? 1 : 0);
