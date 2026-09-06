#!/usr/bin/env node
/** Validate the source ledger and optional inventory artifact before release. */
import { readFile } from 'node:fs/promises';

const positionalArgs = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const ledgerPath = positionalArgs[0] ?? new URL('./source-ledger.json', import.meta.url);
const artifactPath = positionalArgs[1];
const releaseMode = process.argv.includes('--release');

const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const errors = [];
const decisions = ledger.inventorySourceDecisions;
if (!decisions || !Array.isArray(decisions.sources)) errors.push('inventorySourceDecisions.sources is missing');
for (const source of decisions?.sources ?? []) {
  for (const field of ['id', 'family', 'version', 'url', 'spdx', 'attribution', 'transformation', 'distribution']) {
    if (typeof source[field] !== 'string' || source[field].trim() === '') errors.push(`${source.id ?? '(unknown)'} missing ${field}`);
  }
  if (releaseMode && (!source.retrievedAt || source.version.includes('required') || source.version.includes('snapshot'))) {
    errors.push(`${source.id ?? '(unknown)'} is not pinned for release`);
  }
}
if (releaseMode && decisions?.status !== 'approved') errors.push(`ledger status is ${decisions?.status ?? '(missing)'}, not approved`);

if (artifactPath) {
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  if (artifact.schemaVersion !== 1 || !artifact.artifactId || !Array.isArray(artifact.records)) errors.push('inventory artifact has invalid envelope');
  for (const [index, record] of (artifact.records ?? []).entries()) {
    if (!record.lexemeId || !record.answerForm || !Array.isArray(record.sources) || record.sources.length === 0) {
      errors.push(`artifact record ${index} has no identity or source receipt`);
    }
    if (releaseMode && record.eligibility !== 'accepted') errors.push(`artifact record ${record.lexemeId ?? index} is not accepted`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`PROVENANCE ERROR ${error}`);
  process.exit(1);
}
console.log(`source ledger ok (${decisions.sources.length} inventory sources${artifactPath ? `; checked ${artifactPath}` : ''})`);
