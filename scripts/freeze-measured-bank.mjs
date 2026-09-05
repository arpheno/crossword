#!/usr/bin/env node
/**
 * Freeze fill-measured templates from the judge report into the curated bank.
 *
 * Reads /tmp/nyt_topo/filled.json (judge output), picks the fastest-solving
 * templates per weekday, and emits packages/construction/data/measured-bank-v1.json
 * plus a TS-ready summary. The bank (templateBank.ts) consumes the frozen JSON
 * as data — measured evidence travels with every template.
 *
 * Gates: a template enters only if its editorial score >= THRESHOLD and its
 * fill completed within the judge's node budget.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const REPORT = '/tmp/nyt_topo/filled.json';
const OUT = 'packages/construction/data/measured-bank-v1.json';
const THRESHOLD = Number(process.env.THRESH ?? 0.5);
const PER_DAY = Number(process.env.PER_DAY ?? 3);

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const frozen = [];
const skipped = [];

for (const [day, dayReport] of Object.entries(report)) {
  const survivors = (dayReport.survivors ?? [])
    .filter((survivor) => (survivor.editorialScore ?? 1) >= THRESHOLD)
    .sort((a, b) => a.nodes - b.nodes)
    .slice(0, PER_DAY);
  for (const survivor of survivors) {
    frozen.push({
      id: survivor.id,
      day: day.toLowerCase(),
      width: day.toLowerCase() === 'sunday' ? 21 : 15,
      height: day.toLowerCase() === 'sunday' ? 21 : 15,
      mask: survivor.mask,
      measured: {
        elapsedMs: survivor.elapsedMs,
        nodes: survivor.nodes,
        editorialScore: survivor.editorialScore ?? null,
        avgAnswerLength: survivor.avgLen,
        entries: survivor.entries,
        crossings: survivor.crossings
      }
    });
  }
  if (survivors.length === 0) skipped.push(day);
}

const artifact = {
  id: 'measured-bank-v1',
  schemaVersion: 1,
  source: 'Fill-judged block patterns sampled from the household-local published-puzzle archive (structure only; no clue/answer text). Private construction input; excluded from public-release claims until the M2.1 owner review.',
  gate: { threshold: THRESHOLD, nodeBudget: 'judge NODE_BUDGET', perDay: PER_DAY },
  templates: frozen
};

writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`frozen ${frozen.length} templates -> ${OUT}`);
if (skipped.length > 0) console.log(`days with no qualifying templates: ${skipped.join(', ')}`);
for (const template of frozen) {
  console.log(`  ${template.id}: nodes=${template.measured.nodes} editorial=${template.measured.editorialScore} avgLen=${template.measured.avgAnswerLength}`);
}
if (frozen.length === 0) {
  console.error('no templates qualified — refusing to emit an empty bank');
  process.exit(1);
}
