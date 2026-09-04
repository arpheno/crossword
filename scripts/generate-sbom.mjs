#!/usr/bin/env node
// Generates a CycloneDX-style SBOM inventory for the promoted commit
// (RS-P1-5). Dependency metadata comes from the npm lockfile; this is
// reversible tooling pending the owner's supply-chain policy decisions.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const commit = execSync('git rev-parse HEAD').toString().trim();

const components = [];
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith('node_modules/')) continue;
  const name = key.slice('node_modules/'.length);
  if (name.includes('node_modules/')) continue; // nested copies resolve via their root entry
  components.push({
    type: 'library',
    name,
    version: entry.version ?? 'unknown',
    purl: `pkg:npm/${name}@${entry.version ?? 'unknown'}`,
    resolved: entry.resolved ?? null,
    integrity: entry.integrity ?? null
  });
}

const modelManifestPath = 'apps/web/src/modelConfig.ts';
const modelReceipt = existsSync(modelManifestPath)
  ? { pinnedModel: readFileSync(modelManifestPath, 'utf8').match(/id: '([^']+)'/)?.[1] ?? null, receiptComplete: false, reason: 'license/source/revision receipts pending owner decision (RS-P1-5)' }
  : null;

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  metadata: { component: 'crossword-app', commit, generatedAt: new Date().toISOString() },
  components,
  modelReceipt
};
mkdirSync('reports', { recursive: true });
writeFileSync('reports/sbom.json', JSON.stringify(sbom, null, 2));
console.log(`[sbom] ${components.length} components -> reports/sbom.json (commit ${commit.slice(0, 12)})`);
