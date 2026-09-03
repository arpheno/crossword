/**
 * Fill lexicon: loading, eligibility, and crossword-quality scoring.
 *
 * The artifact is a plain sorted uppercase word list built by
 * `scripts/build-fill-lexicon.mjs` from a public-domain source, with a
 * JSON manifest pinning source and artifact digests. The loader parses the
 * artifact in one pass and keeps compact typed-array score data (docs/plans/02
 * "Build artifacts should be compact positional indexes").
 *
 * Scores are deterministic and human-legible: frequency in the artifact is not
 * used (web2 carries none); instead a curated staple set plus length and
 * letter-bag heuristics produce a 0..1 fill score. The score is a search
 * *preference*, never an eligibility rule — eligibility is policy.
 */
import { createHash } from 'node:crypto';

import type { FillCandidate } from './csp';

export type LexiconProvenanceRecord = Readonly<{
  id: string;
  kind: 'lexicon';
  source: string;
  license: string;
  digest: string;
}>;

export type LoadLexiconOptions = Readonly<{
  /** Maximum words loaded; the artifact is sorted, so this keeps a prefix. */
  limit?: number;
  /** Drop words above this length. */
  maxLength?: number;
  /** Explicit words to exclude (household exclusions, recent answers). */
  excluded?: readonly string[];
}>;

export type Lexicon = Readonly<{
  id: string;
  wordCount: number;
  digest: string;
  provenance: LexiconProvenanceRecord;
  /** Resolves a surface to a fill candidate, or undefined if ineligible. */
  resolve: (surface: string) => FillCandidate | undefined;
  /** Words of a given length, best-first. Bounded for diagnostics. */
  wordsOfLength: (length: number, limit?: number) => readonly string[];
  contains: (surface: string) => boolean;
}>;

const STAPLES: Readonly<Record<string, number>> = {
  // Recurring crossword vocabulary gets a modest familiarity boost; the list
  // is intentionally small and only lifts words already present in the
  // artifact. Scores stay within [0.25, 1].
  ERA: 0.95, AREA: 0.95, ERE: 0.7, OLE: 0.7, EWE: 0.75, YEW: 0.75, AWE: 0.8,
  ATE: 0.9, EEL: 0.8, ELK: 0.8, APE: 0.8, ACE: 0.9, ARC: 0.85, ADO: 0.8,
  OPT: 0.8, ORB: 0.7, OAR: 0.75, OBS: 0.45, ULE: 0.3, FRO: 0.55, THO: 0.45
};

const COMMON_TRIGRAPHS = [
  'THE', 'AND', 'ING', 'ION', 'ENT', 'ATE', 'ERA', 'ONE', 'ALL', 'HAS',
  'ERE', 'ORE', 'ARE', 'AVE', 'ILL', 'LIN', 'RAA', 'ESS', 'SSE', 'ELI',
  'ISS', 'ATT', 'TTE', 'RAN', 'AIN', 'NTI', 'TIO', 'STA', 'NTE', 'NSE'
];

function stapleScore(word: string): number {
  const direct = STAPLES[word];
  if (direct !== undefined) return direct;
  let score = 0.42;
  for (let index = 0; index + 3 <= word.length; index += 1) {
    if (COMMON_TRIGRAPHS.includes(word.slice(index, index + 3))) score += 0.06;
  }
  // Heavy Scrabble-unfriendly letters hurt fill; common vowels/consonants help.
  const rareLetters = (word.match(/[JQXZ]/g) ?? []).length;
  const vowels = (word.match(/[AEIOU]/g) ?? []).length;
  if (rareLetters > 0) score -= 0.12 * rareLetters;
  if (vowels / word.length < 0.25) score -= 0.1;
  if (vowels / word.length > 0.62) score -= 0.05;
  return Math.min(1, Math.max(0.05, score));
}

function normalizeSurface(surface: string): string {
  return surface.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export function loadLexicon(text: string, options: LoadLexiconOptions = {}): Lexicon {
  const excluded = new Set((options.excluded ?? []).map(normalizeSurface));
  const maxLength = options.maxLength ?? 15;
  const words: string[] = [];
  const wordSet = new Set<string>();
  for (const line of text.split('\n')) {
    if (words.length >= (options.limit ?? Number.POSITIVE_INFINITY)) break;
    const word = line.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(word) || word.length < 3 || word.length > maxLength) continue;
    if (excluded.has(word)) continue;
    if (wordSet.has(word)) continue;
    wordSet.add(word);
    words.push(word);
  }
  if (words.length === 0) throw new Error('Lexicon artifact is empty');

  const digest = createHash('sha256').update(text).digest('hex');
  const byLength = new Map<number, string[]>();
  for (const word of words) {
    const bucket = byLength.get(word.length);
    if (bucket) bucket.push(word);
    else byLength.set(word.length, [word]);
  }
  for (const bucket of byLength.values()) {
    bucket.sort((left, right) => stapleScore(right) - stapleScore(left) || left.localeCompare(right));
  }

  const provenance: LexiconProvenanceRecord = {
    id: 'fill-lexicon-v1',
    kind: 'lexicon',
    source: "Webster's Second International word list (web2), public domain",
    license: 'Public domain',
    digest
  };

  return {
    id: provenance.id,
    wordCount: words.length,
    digest,
    provenance,
    resolve(surface) {
      const normalized = normalizeSurface(surface);
      if (!normalized || normalized.length < 3 || normalized.length > maxLength || !wordSet.has(normalized)) return undefined;
      return {
        word: normalized,
        score: stapleScore(normalized),
        lexemeId: `web2:${normalized}`,
        sourceIds: [provenance.id]
      };
    },
    wordsOfLength(length, limit = 50) {
      return (byLength.get(length) ?? []).slice(0, limit);
    },
    contains(surface) {
      return wordSet.has(normalizeSurface(surface));
    }
  };
}

export function lexiconProvenanceFrom(lexicon: Lexicon): LexiconProvenanceRecord {
  return lexicon.provenance;
}
