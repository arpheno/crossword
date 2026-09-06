import type { ClueDraft } from '@crossword/model-runtime';

/**
 * A catalog entry is keyed by answer form and (when known) intended sense.
 * Catalogs are immutable release data; runtime-generated clues are allowed to
 * use the same shape in a private extension catalog.
 */
export type ClueCatalogEntry = Readonly<{
  answer: string;
  intendedSense?: string;
  drafts: readonly ClueDraft[];
}>;

export interface ClueCatalog {
  lookup(answer: string, intendedSense: string): readonly ClueDraft[];
}

const NORMALIZE = (value: string): string => value.trim().toUpperCase();

function senseKey(answer: string, intendedSense: string): string {
  return `${NORMALIZE(answer)}\u0000${intendedSense.trim().toLowerCase()}`;
}

/** Creates a deterministic in-memory adapter for static or test catalog data. */
export function createMemoryClueCatalog(entries: readonly ClueCatalogEntry[]): ClueCatalog {
  const exact = new Map<string, readonly ClueDraft[]>();
  const generic = new Map<string, readonly ClueDraft[]>();
  for (const entry of entries) {
    const answer = NORMALIZE(entry.answer);
    if (!answer || !Array.isArray(entry.drafts)) continue;
    const drafts = entry.drafts.filter(isClueDraft);
    if (drafts.length === 0) continue;
    if (entry.intendedSense?.trim()) exact.set(senseKey(answer, entry.intendedSense), drafts);
    else generic.set(answer, drafts);
  }
  return {
    lookup(answer, intendedSense) {
      return exact.get(senseKey(answer, intendedSense)) ?? generic.get(NORMALIZE(answer)) ?? [];
    }
  };
}

/**
 * Catalog coverage is intentionally stricter than “some text exists”. A
 * publishable entry needs a primary clue and an easier recovery path. Missing
 * coverage is a runtime generation obligation, not a reason to publish a bad
 * clue or silently drop an otherwise excellent answer.
 */
export function clueLadderNeedsRuntime(drafts: readonly ClueDraft[]): boolean {
  const valid = drafts.filter(isClueDraft);
  const primary = valid.some((draft) => draft.mechanism !== 'nudge');
  const nudge = valid.some((draft) => draft.mechanism === 'nudge');
  return !primary || !nudge;
}

function isClueDraft(value: unknown): value is ClueDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return (draft.mechanism === 'direct'
    || draft.mechanism === 'standard'
    || draft.mechanism === 'oblique'
    || draft.mechanism === 'nudge')
    && typeof draft.text === 'string'
    && draft.text.trim().length > 0
    && draft.text.length <= 500
    && typeof draft.difficulty === 'number'
    && Number.isFinite(draft.difficulty)
    && draft.difficulty >= 0
    && draft.difficulty <= 1;
}
