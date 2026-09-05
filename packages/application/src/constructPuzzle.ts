/**
 * End-to-end original construction (docs/plans/02 pipeline):
 *
 *   recipe + seed -> template -> topology -> model candidate bag ->
 *   lexicon resolution (+ theme locks) -> deterministic CSP fill ->
 *   clue ladder -> validators -> immutable manifest
 *
 * The model supplies candidates and clue language; the deterministic engine
 * owns topology, crossings, eligibility, and the publish gate. Every failure
 * is a typed diagnostic, never a playable half-puzzle.
 */
import {
  adaptiveScore,
  blendScore,
  curatedTemplateBank,
  deriveTopology,
  scoreFill,
  type FillCandidate,
  type FillProgress,
  type FillRequest,
  type FillResult,
  type LearnerProfile,
  type Lexicon
} from '@crossword/construction';
import type { CandidateRequest, CandidateSuggestion, ClueDraft, ModelBroker } from '@crossword/model-runtime';
import type { PuzzleDocument, ProvenanceRecord } from '@crossword/domain';

export type { FillCandidate } from '@crossword/construction';

import { assembleDraftManifest, finalizeIntegrity } from './manifest';
import { clueLadderNeedsRuntime, type ClueCatalog } from './clueCatalog';
import type { DayRecipe } from './recipes';

export interface PuzzleFillGrid {
  solve: (
    request: FillRequest,
    options?: { signal?: AbortSignal; onProgress?: (progress: FillProgress) => void }
  ) => FillResult | Promise<FillResult>;
}

export type ConstructPuzzleRequest = Readonly<{
  recipe: DayRecipe;
  seed: string;
  lexicon: Lexicon;
  modelId: string;
  /** Surfaces to exclude (recent answers, household exclusions). */
  excludedAnswers?: readonly string[];
  audienceSummary?: string;
  /**
   * Optional household learner profile (docs/crossword research.md): shifts
   * candidate preference toward due-for-review, ability-aligned, affordant
   * vocabulary. Local data only; never sent anywhere.
   */
  learnerProfile?: LearnerProfile;
  /** Optional immutable catalog; missing/unsuitable entries use the local model. */
  clueCatalog?: ClueCatalog;
}>;

export type ConstructionStage = 'model' | 'lexicon' | 'topology' | 'fill' | 'clues';

export type ConstructFailure = Readonly<{
  stage: ConstructionStage;
  code: string;
  message: string;
}>;

export type ConstructResult =
  | { ok: true; puzzle: PuzzleDocument; templateId: string; restartCount: number }
  | { ok: false; error: ConstructFailure };

export type ConstructionProgress = Readonly<{
  phase: 'topology' | 'model' | 'lexicon' | 'fill' | 'clues' | 'publishing';
  progress: number | null;
  attempt: number;
  totalAttempts: number;
  text: string;
}>;

export type ConstructionProgressListener = (progress: ConstructionProgress) => void;

const SOLVER_VERSION = 'csp-mac-1';
const PROMPT_VERSION = 'candidates-v1';
const MAX_TARGET_LENGTHS = 8;

/** Select the clue grounding key without inventing a dictionary sense. */
export function intendedSenseForCandidate(
  word: string,
  candidate?: Pick<FillCandidate, 'senseId'>,
  suggestedSense?: string
): string {
  return candidate?.senseId || suggestedSense?.trim() || `surface:${word}:unresolved`;
}

/** Numeric seed from an arbitrary string, stable across calls. */
export function numericSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function targetLengthPages(targetLengths: readonly number[]): readonly (readonly number[])[] {
  const normalized = [...new Set(targetLengths)].sort((left, right) => left - right);
  const pages: number[][] = [];
  for (let offset = 0; offset < normalized.length; offset += MAX_TARGET_LENGTHS) {
    pages.push(normalized.slice(offset, offset + MAX_TARGET_LENGTHS));
  }
  return pages;
}

export async function constructPuzzle(
  broker: ModelBroker,
  fillGrid: PuzzleFillGrid,
  request: ConstructPuzzleRequest,
  signal?: AbortSignal,
  onProgress?: ConstructionProgressListener
): Promise<ConstructResult> {
  const { recipe, lexicon, seed, learnerProfile } = request;

  if (signal?.aborted) {
    return { ok: false, error: { stage: 'model', code: 'cancelled', message: 'Construction was canceled before it started' } };
  }

  if (!recipe.available) {
    return { ok: false, error: { stage: 'topology', code: 'recipe-unavailable', message: recipe.note } };
  }
  if (recipe.templateIds.length === 0) {
    return { ok: false, error: { stage: 'topology', code: 'no-templates', message: 'The recipe has no curated templates' } };
  }

  const baseSeed = numericSeed(seed);

  // 0. Pre-derive every recipe template: the requested candidate lengths come
  // from the templates the day can actually use (review P1: requested lengths
  // must not make theme-lock days fail by asking only 3-10).
  const recipeTopologies = recipe.templateIds
    .map((templateId) => curatedTemplateBank().find((entry) => entry.id === templateId))
    .map((template) => (template ? deriveTopology(template.mask, { templateId: template.id }) : undefined))
    .map((derived) => (derived && derived.ok ? derived.topology : undefined))
    .filter((topology): topology is NonNullable<typeof topology> => topology !== undefined);
  if (recipeTopologies.length === 0) {
    return { ok: false, error: { stage: 'topology', code: 'template-missing', message: 'No recipe template derived successfully' } };
  }
  // 3. Seeded attempts over the recipe's templates. The topology is selected
  // FIRST (review 2.5): the semantic bag is requested per topology, paged in
  // batches of at most MAX_TARGET_LENGTHS lengths so the real broker
  // contract is honored (the fake port alone must not be the boundary test).
  let lastDiagnostic = 'unknown';
  for (let attempt = 0; attempt < recipe.maxRestarts; attempt += 1) {
    const attemptNumber = attempt + 1;
    onProgress?.({
      phase: 'topology',
      progress: attempt / recipe.maxRestarts,
      attempt: attemptNumber,
      totalAttempts: recipe.maxRestarts,
      text: `Selecting topology (attempt ${attemptNumber} of ${recipe.maxRestarts})…`
    });
    const templateId = recipe.templateIds[(baseSeed + attempt) % recipe.templateIds.length]!;
    const template = curatedTemplateBank().find((entry) => entry.id === templateId);
    if (!template) {
      return { ok: false, error: { stage: 'topology', code: 'template-missing', message: `Template ${templateId} is not in the curated bank` } };
    }
    const topology = recipeTopologies.find((entry) => entry.templateId === templateId);
    if (!topology) {
      lastDiagnostic = `topology: ${templateId} failed derivation`;
      continue;
    }
    if (topology.width !== recipe.width || topology.height !== recipe.height) {
      lastDiagnostic = `format: template ${template.id} is ${topology.width}x${topology.height}, recipe wants ${recipe.width}x${recipe.height}`;
      continue;
    }

    const targetLengths = [...new Set(topology.slots.map((slot) => slot.length))].sort((left, right) => left - right);
    const baseRequest: CandidateRequest = {
      seed: `${seed}:${recipe.day}:attempt-${attempt + 1}`,
      audienceSummary: request.audienceSummary ?? 'household blend, broad interests',
      requestedRoles: recipe.themeLocks > 0 ? ['theme', 'long', 'general', 'glue'] : ['general', 'glue', 'stretch'],
      excludedAnswers: [...(request.excludedAnswers ?? [])],
      maxSuggestions: recipe.themeLocks > 0 ? 48 : 24,
      targetLengths: []
    };
    const suggestions: CandidateSuggestion[] = [];
    const resolvedSuggestions: FillCandidate[] = [];
    const targetLengthPagesForAttempt = targetLengthPages(targetLengths);
    for (const [pageIndex, page] of targetLengthPagesForAttempt.entries()) {
      onProgress?.({
        phase: 'model',
        progress: pageIndex / targetLengthPagesForAttempt.length,
        attempt: attemptNumber,
        totalAttempts: recipe.maxRestarts,
        text: `Generating candidate ideas (${pageIndex + 1} of ${targetLengthPagesForAttempt.length})…`
      });
      const generated = await broker.generateCandidates({ ...baseRequest, seed: `${baseRequest.seed}:page-${pageIndex + 1}`, targetLengths: page }, signal);
      if (!generated.ok) {
        return { ok: false, error: { stage: 'model', code: String(generated.error.code), message: generated.error.message } };
      }
      suggestions.push(...generated.value);
    }
    onProgress?.({
      phase: 'lexicon',
      progress: 0,
      attempt: attemptNumber,
      totalAttempts: recipe.maxRestarts,
      text: 'Resolving candidates against the licensed lexicon…'
    });
    // Lexicon resolution is authoritative for eligibility. Model metadata is
    // retained separately so it can influence ranking without changing the
    // candidate's base editorial score.
    for (const suggestion of suggestions) {
      const candidate = lexicon.resolve(suggestion.surface);
      if (candidate !== undefined) resolvedSuggestions.push(candidate);
    }

    // 3a. Lab lexicon slice for the slot lengths, plus resolved model ideas.
    const neededLengths = [...new Set(topology.slots.map((slot) => slot.length))];
    const lexiconCandidates: FillCandidate[] = [];
    for (const length of neededLengths) {
      for (const word of lexicon.wordsOfLength(length, Number.POSITIVE_INFINITY)) {
        const candidate = lexicon.resolve(word);
        if (candidate !== undefined) lexiconCandidates.push(candidate);
      }
    }
    const deduped = dedupeCandidates([...resolvedSuggestions, ...lexiconCandidates]);
    // Quality scoring consumes the base crossword-quality score, never the
    // learner-blended preference.
    const baseScoreByWord = new Map(deduped.map((candidate) => [candidate.word, candidate.score] as const));
    const modelRanked = applyModelPreferences(deduped, suggestions);
    const candidates = applyLearnerPreferences(modelRanked, learnerProfile);
    const poorEntryLimit = qualityAlignedPoorEntryLimit(recipe, topology);
    const candidateScoreFloor = candidates.reduce(
      (minimum, candidate) => Math.min(minimum, candidate.score),
      Number.POSITIVE_INFINITY
    );
    const poorSlots = Math.min(topology.slots.length, Math.max(0, poorEntryLimit));
    const minimumAssignmentScore = Number.isFinite(candidateScoreFloor)
      && learnerProfile === undefined
      ? (topology.slots.length - poorSlots) * recipe.poorEntryFloor + poorSlots * candidateScoreFloor
      : undefined;

    // 3b. Theme locks for gimmick days.
    const locks = bindThemeLocks(recipe, topology.slots, suggestions, lexicon);
    if (!locks.ok) return { ok: false, error: locks.error };

    // 4. Deterministic fill.
    const fillStartedAt = Date.now();
    onProgress?.({
      phase: 'fill',
      progress: 0,
      attempt: attemptNumber,
      totalAttempts: recipe.maxRestarts,
      text: `Searching the grid (attempt ${attemptNumber} of ${recipe.maxRestarts})…`
    });
    const fillResult = await fillGrid.solve(
      {
        slots: topology.slots,
        intersections: topology.intersections,
        candidates,
        lockedWords: locks.value,
        seed: baseSeed + attempt,
        maxNodes: recipe.maxNodes,
        minimumAssignmentScore,
        poorEntryFloor: recipe.poorEntryFloor,
        poorEntryLimit,
        excludedWords: request.excludedAnswers
      },
      {
        signal,
        onProgress: (progress) => onProgress?.({
          phase: 'fill',
          progress: null,
          attempt: attemptNumber,
          totalAttempts: recipe.maxRestarts,
          text: `Searching the grid · ${progress.nodes.toLocaleString()} nodes explored…`
        })
      }
    );
    if (fillResult.status !== 'solved' || !fillResult.solution) {
      if (fillResult.termination === 'cancelled' || signal?.aborted) {
        return { ok: false, error: { stage: 'fill', code: 'cancelled', message: 'Construction was canceled during grid search' } };
      }
      lastDiagnostic = `fill: ${fillResult.failure?.code ?? 'unknown'}`;
      continue;
    }

    const words: Record<string, string> = {};
    const wordScores: Record<string, number> = {};
    for (const [slotId, candidate] of Object.entries(fillResult.solution.assignments)) {
      words[slotId] = candidate.word;
      wordScores[slotId] = baseScoreByWord.get(candidate.word) ?? candidate.score;
    }

    // 4. Editorial quality gate on the normalized 0..1 score: a complete
    // fill that misses the recipe's bar is a diagnostic, never a puzzle.
    const baseScoreForQuality = (slotId: string): number =>
      baseScoreByWord.get(words[slotId] ?? '') ?? 0;
    const quality = scoreFill({
      assignments: topology.slots.map((slot) => ({
        word: words[slot.id] ?? '',
        score: baseScoreForQuality(slot.id),
        crossings: crossingsForSlot(topology, slot.id)
      })),
      whiteCellCount: topology.whiteCellCount,
      crossingCellCount: topology.intersections.length
    });
    if (quality.score < recipe.qualityThreshold) {
      lastDiagnostic = `quality: ${quality.score.toFixed(3)} < ${recipe.qualityThreshold}`;
      continue;
    }

    // 5. Clue ladder per entry; model composition is required.
    onProgress?.({
      phase: 'clues',
      progress: 0,
      attempt: attemptNumber,
      totalAttempts: recipe.maxRestarts,
      text: 'Drafting and validating clue ladders…'
    });
    const clueVariants: Record<string, ClueDraft[]> = {};
    const suggestionByWord = new Map(
      suggestions.map((suggestion) => [suggestion.surface.trim().toUpperCase(), suggestion] as const)
    );
    const runtimeClueNeeds: RuntimeClueNeed[] = [];
    for (const entry of topology.entries) {
      const word = words[entry.id]!;
      const intendedSense = intendedSenseForCandidate(
        word,
        fillResult.solution.assignments[entry.id],
        suggestionByWord.get(word)?.intendedSense
      );
      const catalogDrafts = request.clueCatalog?.lookup(word, intendedSense) ?? [];
      if (request.clueCatalog && !clueLadderNeedsRuntime(catalogDrafts)) {
        clueVariants[entry.id] = [...catalogDrafts];
      } else {
        runtimeClueNeeds.push({ entryId: entry.id, answer: word, intendedSense });
      }
    }
    if (runtimeClueNeeds.length > 0) {
      const runtime = await composeRuntimeClues(broker, runtimeClueNeeds, signal);
      if (!runtime.ok) return { ok: false, error: runtime.error };
      Object.assign(clueVariants, runtime.value);
    }

    // 5. Provenance, quality, manifest, integrity.
    onProgress?.({
      phase: 'publishing',
      progress: 1,
      attempt: attemptNumber,
      totalAttempts: recipe.maxRestarts,
      text: 'Finalizing the integrity-pinned puzzle…'
    });
    const provenance: ProvenanceRecord[] = [
      lexicon.provenance,
      {
        id: `model-candidates-${baseSeed}-r${attempt}`,
        kind: 'model',
        source: 'local model candidate bag (structured JSON, deterministic seed)',
        license: 'Local inference; no external distribution',
        digest: `seed-${baseSeed}-r${attempt}`
      },
      ...Object.entries(locks.value).map(([slotId, word]) => ({
        id: `theme-lock-${slotId}`,
        kind: 'model' as const,
        source: `theme lock ${slotId} from model candidate bag`,
        license: 'Local model output; validated in-grid',
        digest: word
      }))
    ];

    const manifest = assembleDraftManifest({
      seed: `${seed}:${recipe.day}:r${attempt}`,
      title: titleFor(recipe),
      subtitle: subtitleFor(recipe, template),
      topology,
      words,
      wordScores,
      clueVariants,
      clueMix: recipe.clueMix,
      provenanceRecords: provenance,
      generation: {
        modelId: request.modelId,
        promptVersion: PROMPT_VERSION,
        lexiconVersion: lexicon.id,
        solverVersion: SOLVER_VERSION,
        generatedAt: new Date().toISOString(),
        restartCount: attempt,
        fill: {
          attempt,
          seed: String(baseSeed + attempt),
          terminationReason: fillResult.terminationReason,
          provenOptimal: fillResult.provenOptimal === true,
          nodesExplored: fillResult.nodesExplored,
          bestBound: fillResult.bestBound ?? null,
          gap: fillResult.gap ?? null,
          incumbentScore: fillResult.solution.score,
          elapsedMs: Math.max(0, Date.now() - fillStartedAt)
        }
      },
      quality: {
        score: quality.score,
        thresholds: { qualityThreshold: recipe.qualityThreshold },
        validators: ['topology', 'crossings', 'all-different', 'lexicon-membership', 'provenance', 'integrity']
      },
      source: 'local-construction',
      recipeId: recipe.day,
      createdBy: 'local-construction' as const
    });

    const puzzle = await finalizeIntegrity(manifest);
    return { ok: true, puzzle, templateId: template.id, restartCount: attempt };
  }

  return {
    ok: false,
    error: {
      stage: 'fill',
      code: signal?.aborted ? 'cancelled' : 'exhausted-restarts',
      message: signal?.aborted ? 'Construction was canceled' : `Fill failed after ${recipe.maxRestarts} attempts (last: ${lastDiagnostic})`
    }
  };
}

type SlotLike = Readonly<{ id: string; length: number }>;

function bindThemeLocks(
  recipe: DayRecipe,
  slots: readonly SlotLike[],
  suggestions: readonly CandidateSuggestion[],
  lexicon: Lexicon
): { ok: true; value: Record<string, string> } | { ok: false; error: ConstructFailure } {
  if (recipe.themeLocks === 0) return { ok: true, value: {} };
  const longSlots = [...slots].sort((left, right) => right.length - left.length).slice(0, recipe.themeLocks);
  const used = new Set<string>();
  const value: Record<string, string> = {};
  for (const slot of longSlots) {
    const match = suggestions.find((suggestion) =>
      suggestion.role === 'theme'
      && !used.has(suggestion.surface.toUpperCase())
      && /^[A-Z]+$/.test(suggestion.surface.toUpperCase())
      && suggestion.surface.toUpperCase().length === slot.length
      && lexicon.contains(suggestion.surface)
    );
    if (!match) {
      return {
        ok: false,
        error: {
          stage: 'model',
          code: 'theme-unresolved',
          message: `The model produced no ${slot.length}-letter theme entry for slot ${slot.id}`
        }
      };
    }
    const word = match.surface.toUpperCase();
    used.add(word);
    value[slot.id] = word;
  }
  return { ok: true, value };
}

const MODEL_ROLE_WEIGHT: Readonly<Record<CandidateSuggestion['role'], number>> = {
  theme: 1,
  long: 0.8,
  general: 0.6,
  glue: 0.25,
  stretch: 0.45
};

/**
 * Give eligible model proposals a small, bounded ranking signal. The
 * lexicon score remains the quality source of truth; this only makes role and
 * confidence matter to the fill objective on ordinary days.
 */
function applyModelPreferences(
  candidates: readonly FillCandidate[],
  suggestions: readonly CandidateSuggestion[]
): FillCandidate[] {
  const byWord = new Map<string, CandidateSuggestion>();
  for (const suggestion of suggestions) {
    const word = suggestion.surface.trim().toUpperCase();
    const current = byWord.get(word);
    const currentStrength = current === undefined ? -1 : MODEL_ROLE_WEIGHT[current.role] * current.confidence;
    const strength = MODEL_ROLE_WEIGHT[suggestion.role] * suggestion.confidence;
    if (strength > currentStrength) byWord.set(word, suggestion);
  }
  return candidates.map((candidate) => {
    const suggestion = byWord.get(candidate.word.trim().toUpperCase());
    if (!suggestion) return candidate;
    const boost = 0.08 * MODEL_ROLE_WEIGHT[suggestion.role] * suggestion.confidence;
    return {
      ...candidate,
      score: Math.min(1, candidate.score + boost),
      qualityScore: candidate.qualityScore ?? candidate.score
    };
  });
}

function crossingsForSlot(topology: { intersections: readonly { slotId: string; otherSlotId: string }[] }, slotId: string): number {
  let count = 0;
  for (const intersection of topology.intersections) {
    if (intersection.slotId === slotId || intersection.otherSlotId === slotId) count += 1;
  }
  return count;
}

function qualityAlignedPoorEntryLimit(
  recipe: DayRecipe,
  topology: Readonly<{
    slots: readonly { id: string; length: number }[];
    whiteCellCount: number;
    intersections: readonly { slotId: string; otherSlotId: string }[];
  }>
): number {
  if (recipe.poorEntryFloor !== 0.45) return recipe.poorEntryLimit;
  const probe = (score: number): number => scoreFill({
    assignments: topology.slots.map((slot) => ({
      word: 'A'.repeat(slot.length),
      score,
      crossings: crossingsForSlot(topology, slot.id)
    })),
    whiteCellCount: topology.whiteCellCount,
    crossingCellCount: topology.intersections.length
  }).score;
  const baseline = probe(0);
  const allGood = probe(1);
  if (recipe.qualityThreshold > allGood) return recipe.poorEntryLimit;
  const qualityGain = allGood - baseline;
  if (qualityGain <= 0 || recipe.qualityThreshold <= baseline) return recipe.poorEntryLimit;
  const requiredGood = Math.ceil(
    topology.slots.length * (recipe.qualityThreshold - baseline) / qualityGain - Number.EPSILON
  );
  return Math.min(recipe.poorEntryLimit, Math.max(0, topology.slots.length - requiredGood));
}

/**
 * Blend learner-profile preference into the static crossword-quality score
 * (docs/crossword research.md). `filledCrossLetters` stays 0: in the MAC
 * engine, crossing-letter pressure is handled by domain propagation, so the
 * static preference ranks the unassisted-recall (k = 0) priority the document
 * calls out. Base surprisal is derived from staple familiarity: household
 * staples are low-surprisal, obscure web2 entries high-surprisal.
 */
export function applyLearnerPreferences(
  candidates: readonly FillCandidate[],
  profile: LearnerProfile | undefined,
  adaptWeight = 0.35
): FillCandidate[] {
  if (!profile || candidates.length === 0) return [...candidates];

  // Branching index: (length, position, letter) -> how many pool candidates
  // carry that letter there. Higher branching = a letter that keeps crossing
  // slots flexible (the doc's affordance metric).
  const branching = new Map<string, number>();
  for (const candidate of candidates) {
    for (let position = 0; position < candidate.word.length; position += 1) {
      const key = `${candidate.word.length}:${position}:${candidate.word[position]!}`;
      branching.set(key, (branching.get(key) ?? 0) + 1);
    }
  }

  return candidates.map((candidate) => {
    const baseSurprisal = 6 * (1 - Math.min(1, Math.max(0, candidate.qualityScore ?? candidate.score))) + 1;
    const adaptive = adaptiveScore(
      { lemma: candidate.word, baseSurprisal },
      0,
      profile,
      (position, letter) => branching.get(`${candidate.word.length}:${position}:${letter}`) ?? 0
    );
    // Logistic squash to 0..1; the raw score spans roughly [-2, +2].
    const adaptive01 = 1 / (1 + Math.exp(-adaptive / 2));
    return { ...candidate, score: blendScore(candidate.score, adaptive01, adaptWeight) };
  });
}

function dedupeCandidates(candidates: readonly FillCandidate[]): FillCandidate[] {
  const seen = new Set<string>();
  const out: FillCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.word.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function titleFor(recipe: DayRecipe): string {
  const day = recipe.day.charAt(0).toUpperCase() + recipe.day.slice(1);
  return `${day} Crossword`;
}

function subtitleFor(recipe: DayRecipe, template: Readonly<{ id: string; style: string }>): string {
  return `Locally constructed ${recipe.width}x${recipe.height} · ${template.id}`;
}

type RuntimeClueNeed = Readonly<{
  entryId: string;
  answer: string;
  intendedSense: string;
}>;

type BatchClueBroker = ModelBroker & Readonly<{
  composeCluesBatch?: (
    request: Readonly<{ items: readonly (RuntimeClueNeed & { id: string })[] }>,
    signal?: AbortSignal
  ) => Promise<Readonly<
    | { ok: true; value: Readonly<Record<string, readonly ClueDraft[]>> }
    | { ok: false; error: Readonly<{ code: string; message: string }> }
  >>;
}>;

/**
 * Resolves all catalog misses as one logical operation. Older brokers without
 * the batch capability retain compatibility through the singular method; the
 * real browser broker implements the batched operation.
 */
async function composeRuntimeClues(
  broker: ModelBroker,
  needs: readonly RuntimeClueNeed[],
  signal?: AbortSignal
): Promise<{ ok: true; value: Record<string, ClueDraft[]> } | { ok: false; error: ConstructFailure }> {
  const batchBroker = broker as BatchClueBroker;
  if (typeof batchBroker.composeCluesBatch === 'function') {
    const result = await batchBroker.composeCluesBatch({
      items: needs.map((need) => ({ ...need, id: need.entryId }))
    }, signal);
    if (!result.ok) {
      return { ok: false, error: { stage: 'clues', code: String(result.error.code), message: result.error.message } };
    }
    const value: Record<string, ClueDraft[]> = {};
    for (const need of needs) {
      const drafts = result.value[need.entryId];
      if (!Array.isArray(drafts) || drafts.length === 0 || !drafts.every(isClueDraft)) {
        return {
          ok: false,
          error: { stage: 'clues', code: 'invalid-runtime-clue-batch', message: `The local model produced no valid clue ladder for ${need.answer}` }
        };
      }
      value[need.entryId] = [...drafts];
    }
    return { ok: true, value };
  }

  // Compatibility path for test/fake brokers and older workers. It preserves
  // correctness while the batch protocol is rolled out independently.
  const value: Record<string, ClueDraft[]> = {};
  for (const need of needs) {
    const result = await broker.composeClues({ answer: need.answer, intendedSense: need.intendedSense }, signal);
    if (!result.ok) {
      return { ok: false, error: { stage: 'clues', code: String(result.error.code), message: result.error.message } };
    }
    if (result.value.length === 0 || !result.value.every(isClueDraft)) {
      return {
        ok: false,
        error: { stage: 'clues', code: 'empty-clue-ladder', message: `The model produced no clue drafts for ${need.answer}` }
      };
    }
    value[need.entryId] = [...result.value];
  }
  return { ok: true, value };
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
    && typeof draft.difficulty === 'number'
    && Number.isFinite(draft.difficulty)
    && draft.difficulty >= 0
    && draft.difficulty <= 1;
}
