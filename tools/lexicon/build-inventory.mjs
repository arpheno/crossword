#!/usr/bin/env node
/**
 * Build a reviewable lexical/semantic inventory from pinned source files.
 *
 * This tool intentionally emits records in `review` status. It proves source
 * parsing and provenance, but never turns a parsed dictionary entry into a
 * publishable answer without an explicit editorial decision file.
 *
 * Supported inputs are deliberately boring, streamable formats:
 *   --cwl <word;score file>
 *   --esdb <one-word-per-line file>
 *   --wiktextract <JSONL file>
 *   --out <inventory JSON path>
 *   --decisions <JSON object keyed by answer form>
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

const ANSWER_RE = /^[A-Z]+(?:[\s'-]+[A-Z]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 15;

export function normalizeSurface(value) {
  const displayForm = String(value ?? '').trim();
  if (!displayForm) return undefined;
  const folded = displayForm.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
  if (!ANSWER_RE.test(folded)) return undefined;
  const answerForm = folded.replace(/[\s'-]+/g, '');
  if (answerForm.length < MIN_LENGTH || answerForm.length > MAX_LENGTH) return undefined;
  return { answerForm, displayForm, length: answerForm.length };
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sourceReceipt(source, locator = 'file') {
  if (!/^[a-f0-9]{64}$/i.test(source.sha256 ?? '')) {
    throw new Error(`Source ${source.id} must provide a pinned 64-character sha256`);
  }
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceVersion: source.version,
    artifactUrl: source.url,
    artifactSha256: source.sha256,
    license: source.license,
    attribution: source.attribution,
    recordLocator: locator,
    transformVersion: 'inventory-build-v1'
  };
}

function emptyAccumulator(surface) {
  return {
    answerForm: surface.answerForm,
    displayForm: surface.displayForm,
    length: surface.length,
    categories: new Set(),
    relations: [],
    cwlScore: undefined,
    esdbSize: undefined,
    spellingEvidence: 'none',
    wordfreqZipf: undefined,
    phraseEvidence: 'none',
    entityEvidence: 'none',
    diagnosticFlags: new Set(),
    senses: new Map(),
    facts: new Map(),
    sources: new Map()
  };
}

function addSource(acc, receipt) {
  acc.sources.set(receipt.sourceId, receipt);
}

function addSense(acc, sense) {
  if (!acc.senses.has(sense.senseId)) acc.senses.set(sense.senseId, sense);
  for (const receipt of sense.source) addSource(acc, receipt);
}

function addFact(acc, fact) {
  if (!acc.facts.has(fact.factId)) acc.facts.set(fact.factId, fact);
  addSource(acc, fact.source);
}

export async function readLines(filePath, onLine) {
  const input = createReadStream(filePath, 'utf8');
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      await onLine(line, lineNumber);
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function parseCwl(filePath, source, byAnswer) {
  await readLines(filePath, (line, lineNumber) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const separator = line.lastIndexOf(';');
    if (separator < 1) return;
    const surface = normalizeSurface(line.slice(0, separator));
    const score = Number(line.slice(separator + 1).trim());
    if (!surface || !Number.isFinite(score)) return;
    const acc = byAnswer.get(surface.answerForm) ?? emptyAccumulator(surface);
    acc.displayForm = acc.displayForm || surface.displayForm;
    acc.cwlScore = Math.max(acc.cwlScore ?? Number.NEGATIVE_INFINITY, score);
    acc.spellingEvidence = acc.esdbSize === undefined ? 'cwl' : 'both';
    acc.categories.add(surface.displayForm.includes(' ') ? 'MULTIWORD_PHRASE' : 'STANDARD_WORD');
    addSource(acc, sourceReceipt(source, `line:${lineNumber}`));
    byAnswer.set(surface.answerForm, acc);
  });
}

export async function parseEsdb(filePath, source, byAnswer, size = 60) {
  await readLines(filePath, (line, lineNumber) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    const surface = normalizeSurface(raw.split(/\s+/)[0]);
    if (!surface) return;
    const acc = byAnswer.get(surface.answerForm) ?? emptyAccumulator(surface);
    acc.spellingEvidence = acc.cwlScore === undefined ? 'esdb' : 'both';
    acc.esdbSize = Math.min(acc.esdbSize ?? size, size);
    acc.categories.add(surface.displayForm.includes(' ') ? 'MULTIWORD_PHRASE' : 'STANDARD_WORD');
    addSource(acc, sourceReceipt(source, `line:${lineNumber}`));
    byAnswer.set(surface.answerForm, acc);
  });
}

function glossesFor(entry) {
  return (entry.senses ?? [])
    .flatMap((sense) => sense.glosses ?? (sense.gloss ? [sense.gloss] : []))
    .map((gloss) => String(gloss).trim())
    .filter(Boolean);
}

export async function parseWiktextract(filePath, source, byAnswer) {
  await readLines(filePath, (line, lineNumber) => {
    if (!line.trim()) return;
    let entry;
    try { entry = JSON.parse(line); } catch { return; }
    const language = String(entry.lang_code ?? entry.lang ?? '').toLowerCase();
    if (language && language !== 'en' && language !== 'eng' && language !== 'english') return;
    const surface = normalizeSurface(entry.word);
    if (!surface) return;
    const acc = byAnswer.get(surface.answerForm) ?? emptyAccumulator(surface);
    const receipt = sourceReceipt(source, `line:${lineNumber}`);
    addSource(acc, receipt);
    const pos = typeof entry.pos === 'string' ? entry.pos : undefined;
    if (pos === 'proper noun') acc.categories.add('PROPER_NAME');
    else if (pos === 'phrase' || surface.displayForm.includes(' ')) acc.categories.add('MULTIWORD_PHRASE');
    else acc.categories.add('STANDARD_WORD');
    for (const [senseIndex, gloss] of glossesFor(entry).entries()) {
      const senseId = `${source.id}:${entry.senseid?.[senseIndex] ?? `${lineNumber}:${senseIndex}`}`;
      addSense(acc, {
        senseId,
        lexemeId: `lex:${surface.answerForm}`,
        gloss,
        ...(pos ? { partOfSpeech: pos } : {}),
        registerTags: [...new Set((entry.senses?.[senseIndex]?.tags ?? []).map(String))].sort(),
        localeTags: ['en'],
        factIds: [],
        source: [receipt],
        status: 'limited'
      });
    }
    for (const qid of entry.wikidata ?? []) {
      const factId = `${source.id}:${qid}`;
      addFact(acc, {
        factId,
        entityId: String(qid),
        propertyId: 'wikidata:entity',
        value: String(qid),
        retrievedAt: source.retrievedAt,
        source: receipt,
        status: 'review'
      });
      acc.entityEvidence = 'wikidata';
    }
    byAnswer.set(surface.answerForm, acc);
  });
}

export function materializeRecords(byAnswer, decisions = {}) {
  return [...byAnswer.values()]
    .sort((left, right) => left.answerForm.localeCompare(right.answerForm))
    .map((acc) => {
      const decision = decisions[acc.answerForm];
      const eligibility = decision?.action === 'approve' ? 'accepted' : decision?.action === 'reject' ? 'rejected' : 'review';
      const categories = [...acc.categories].sort();
      const senses = [...acc.senses.values()].sort((left, right) => left.senseId.localeCompare(right.senseId));
      const facts = [...acc.facts.values()].sort((left, right) => left.factId.localeCompare(right.factId));
      const sources = [...acc.sources.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
      return {
        schemaVersion: 1,
        lexemeId: `lex:${acc.answerForm}`,
        answerForm: acc.answerForm,
        displayForm: acc.displayForm,
        length: acc.length,
        categories: categories.length > 0 ? categories : ['FORM_LEVEL'],
        language: 'en-US',
        relations: acc.relations,
        eligibility,
        ...(eligibility === 'rejected' ? { rejectionReason: decision.reason || 'editorial rejection' } : {}),
        signals: {
          ...(acc.cwlScore === undefined ? {} : { cwlScore: acc.cwlScore }),
          ...(acc.esdbSize === undefined ? {} : { esdbSize: acc.esdbSize }),
          spellingEvidence: acc.spellingEvidence,
          ...(acc.wordfreqZipf === undefined ? {} : { wordfreqZipf: acc.wordfreqZipf }),
          phraseEvidence: acc.phraseEvidence,
          entityEvidence: acc.entityEvidence,
          diagnosticFlags: [...acc.diagnosticFlags].sort()
        },
        senses,
        facts,
        sources,
        ...(decision ? { editorial: { ...decision, policyVersion: decision.policyVersion ?? 'inventory-review-v1' } } : {})
      };
    });
}

export async function buildInventory(options) {
  const byAnswer = new Map();
  if (options.cwl) await parseCwl(options.cwl.path, options.cwl.source, byAnswer);
  if (options.esdb) await parseEsdb(options.esdb.path, options.esdb.source, byAnswer, options.esdb.size ?? 60);
  if (options.wiktextract) await parseWiktextract(options.wiktextract.path, options.wiktextract.source, byAnswer);
  return materializeRecords(byAnswer, options.decisions ?? {});
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--cwl') result.cwl = value;
    else if (flag === '--esdb') result.esdb = value;
    else if (flag === '--wiktextract') result.wiktextract = value;
    else if (flag === '--out') result.out = value;
    else if (flag === '--decisions') result.decisions = value;
  }
  return result;
}

async function fileSource(filePath, id, name, version, license, attribution) {
  const bytes = await readFile(filePath);
  return { id, name, version, url: `file://${path.resolve(filePath)}`, sha256: sha256(bytes), license, attribution, retrievedAt: new Date().toISOString() };
}

const args = parseArgs(process.argv.slice(2));
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (!args.out || (!args.cwl && !args.esdb && !args.wiktextract)) {
    console.error('usage: build-inventory.mjs --out OUT [--cwl CWL] [--esdb ESDB] [--wiktextract JSONL] [--decisions JSON]');
    process.exit(2);
  }
  const sources = {
    cwl: args.cwl ? await fileSource(args.cwl, 'cwl', 'Crossword Nexus Collaborative Word List', 'pinned-file', 'MIT', 'Crossword-Nexus') : undefined,
    esdb: args.esdb ? await fileSource(args.esdb, 'esdb', 'English Speller Database', 'pinned-file', 'ESDB-CUSTOM', 'Kevin Atkinson and contributors') : undefined,
    wiktextract: args.wiktextract ? await fileSource(args.wiktextract, 'wiktextract', 'Wiktextract English extraction', 'pinned-file', 'CC-BY-SA-4.0', 'Wiktionary contributors; Tatu Ylonen') : undefined
  };
  const decisions = args.decisions ? JSON.parse(await readFile(args.decisions, 'utf8')) : {};
  const records = await buildInventory({
    cwl: sources.cwl ? { path: args.cwl, source: sources.cwl } : undefined,
    esdb: sources.esdb ? { path: args.esdb, source: sources.esdb } : undefined,
    wiktextract: sources.wiktextract ? { path: args.wiktextract, source: sources.wiktextract } : undefined,
    decisions
  });
  const artifact = {
    schemaVersion: 1,
    artifactId: 'lexical-semantic-inventory-v1',
    buildVersion: 'inventory-build-v1',
    generatedAt: new Date().toISOString(),
    sourceDigests: Object.fromEntries(Object.values(sources).filter(Boolean).map((source) => [source.id, source.sha256])),
    records
  };
  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`inventory: ${records.length} records (${records.filter((record) => record.eligibility === 'accepted').length} accepted)`);
}
