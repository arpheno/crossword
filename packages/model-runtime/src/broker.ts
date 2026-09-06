export type ModelShard = Readonly<{
  url: string;
  sha256: string;
  bytes: number;
}>;

export type ModelManifest = Readonly<{
  schemaVersion: 1;
  id: string;
  version: string;
  quantization: string;
  runtimeVersion: string;
  promptVersion: string;
  minimumMemoryMb: number;
  shards: readonly ModelShard[];
  distribution?: 'webllm-mlc';
  /**
   * Conservative full-download byte estimate (ADR 0004 §7). Used by the
   * storage preflight when shard receipts are absent; the UI must present it
   * as an estimate, never as a measured size.
   */
  estimatedBytes?: number;
}>;

export type RuntimeProbe = Readonly<{
  webgpu: boolean;
  availableMemoryMb: number | null;
  storageQuotaBytes: number;
  storageUsageBytes: number;
}>;

export type CandidateRole = 'theme' | 'long' | 'general' | 'glue' | 'stretch';

export type CandidateSuggestion = Readonly<{
  surface: string;
  intendedSense: string;
  associations: readonly string[];
  role: CandidateRole;
  confidence: number;
}>;

export type CandidateRequest = Readonly<{
  seed: string;
  audienceSummary: string;
  requestedRoles: readonly CandidateRole[];
  excludedAnswers: readonly string[];
  maxSuggestions: number;
  focus?: string;
  targetLengths?: readonly number[];
}>;

export type SpokenAnswerRequest = Readonly<{
  spokenAnswer: string;
  targetLength: number;
  pattern: string;
  locale: string;
  maxSuggestions: number;
}>;

export type SpokenAnswerCandidate = Readonly<{
  surface: string;
  note?: string;
}>;

export type ClueDraft = Readonly<{
  mechanism: 'direct' | 'standard' | 'oblique' | 'nudge';
  text: string;
  difficulty: number;
}>;

export type ClueBatchItem = Readonly<{
  id: string;
  answer: string;
  intendedSense: string;
}>;

export type ClueBatchRequest = Readonly<{
  items: readonly ClueBatchItem[];
}>;

export type ClueBatchResult = Readonly<Record<string, readonly ClueDraft[]>>;

export type ModelState = 'uninstalled' | 'installed' | 'loaded' | 'generating' | 'unloading';
export type ModelFailureCode = 'unsupported-device' | 'storage-quota' | 'model-not-enabled' | 'invalid-model-output' | 'busy' | 'cancelled' | 'runtime-error';
export type BrokerResult<T> = Readonly<{ ok: true; value: T } | { ok: false; error: Readonly<{ code: ModelFailureCode; message: string }> }>;

export type ModelProgressPhase = 'downloading' | 'loading-runtime' | 'generating' | 'unloading' | 'deleting-cache';
export type ModelProgress = Readonly<{
  phase: ModelProgressPhase;
  progress: number | null;
  text: string;
}>;
export type ModelProgressListener = (progress: ModelProgress) => void;

export type LocalModelAdapter = Readonly<{
  install: (manifest: ModelManifest, signal?: AbortSignal, onProgress?: ModelProgressListener) => Promise<void>;
  load: (manifest: ModelManifest, signal?: AbortSignal, onProgress?: ModelProgressListener) => Promise<void>;
  generateCandidates: (request: CandidateRequest, signal?: AbortSignal) => Promise<unknown>;
  resolveSpokenAnswer: (request: SpokenAnswerRequest, signal?: AbortSignal) => Promise<unknown>;
  composeClues: (request: Readonly<{ answer: string; intendedSense: string }>, signal?: AbortSignal) => Promise<unknown>;
  /** Optional optimized path; the broker falls back to composeClues when absent. */
  composeCluesBatch?: (request: ClueBatchRequest, signal?: AbortSignal) => Promise<unknown>;
  unload: () => Promise<void>;
  hasCache?: (manifest: ModelManifest) => Promise<boolean>;
  deleteCache?: (manifest: ModelManifest) => Promise<void>;
}>;

export type ModelBroker = Readonly<{
  state: () => ModelState;
  probe: () => RuntimeProbe;
  install: (signal?: AbortSignal, onProgress?: ModelProgressListener) => Promise<BrokerResult<void>>;
  load: (signal?: AbortSignal, onProgress?: ModelProgressListener) => Promise<BrokerResult<void>>;
  generateCandidates: (request: CandidateRequest, signal?: AbortSignal) => Promise<BrokerResult<readonly CandidateSuggestion[]>>;
  resolveSpokenAnswer: (request: SpokenAnswerRequest, signal?: AbortSignal) => Promise<BrokerResult<readonly SpokenAnswerCandidate[]>>;
  composeClues: (request: Readonly<{ answer: string; intendedSense: string }>, signal?: AbortSignal) => Promise<BrokerResult<readonly ClueDraft[]>>;
  /** Optional optimized path; older test/fake brokers remain source-compatible. */
  composeCluesBatch?: (request: ClueBatchRequest, signal?: AbortSignal) => Promise<BrokerResult<ClueBatchResult>>;
  unload: () => Promise<BrokerResult<void>>;
  inspectCache: () => Promise<BrokerResult<boolean>>;
  deleteCache: (signal?: AbortSignal) => Promise<BrokerResult<void>>;
}>;

const candidateRoles: readonly CandidateRole[] = ['theme', 'long', 'general', 'glue', 'stretch'];
const clueMechanisms = ['direct', 'standard', 'oblique', 'nudge'] as const;
const MAX_SUGGESTIONS = 64;
const MAX_TEXT_LENGTH = 500;
const MAX_TARGET_LENGTHS = 8;
const MAX_SPOKEN_ANSWER_LENGTH = 200;
const MAX_SPOKEN_SUGGESTIONS = 8;
export const MAX_CLUE_BATCH_ITEMS = 16;
export const MIN_SPOKEN_TARGET_LENGTH = 1;
export const MAX_SPOKEN_TARGET_LENGTH = 64;

function success<T>(value: T): BrokerResult<T> {
  return { ok: true, value };
}

function failure<T>(code: ModelFailureCode, message: string): BrokerResult<T> {
  return { ok: false, error: { code, message } };
}

function isManifestValid(manifest: ModelManifest): boolean {
  // webllm-mlc (ADR 0002) delegates weight integrity to the pinned WebLLM
  // runtime manifest; M2.4 records explicit shard receipts. Shards are
  // optional, but any recorded shard still needs a digest and size.
  return manifest.schemaVersion === 1
    && Boolean(manifest.id && manifest.version && manifest.quantization && manifest.runtimeVersion && manifest.promptVersion)
    && (manifest.distribution === undefined || manifest.distribution === 'webllm-mlc')
    && Number.isInteger(manifest.minimumMemoryMb)
    && manifest.minimumMemoryMb > 0
    && (manifest.estimatedBytes === undefined || (Number.isInteger(manifest.estimatedBytes) && (manifest.estimatedBytes as number) > 0))
    && manifest.shards.every((shard) => Boolean(shard.url) && /^[a-f0-9]{64}$/.test(shard.sha256) && Number.isInteger(shard.bytes) && shard.bytes > 0);
}

function isCandidateSuggestion(value: unknown): value is CandidateSuggestion {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.surface === 'string'
    && candidate.surface.length > 0
    && candidate.surface.length <= MAX_TEXT_LENGTH
    && typeof candidate.intendedSense === 'string'
    && candidate.intendedSense.length > 0
    && candidate.intendedSense.length <= MAX_TEXT_LENGTH
    && Array.isArray(candidate.associations)
    && candidate.associations.length <= 16
    && candidate.associations.every((association) => typeof association === 'string' && association.length <= MAX_TEXT_LENGTH)
    && candidateRoles.includes(candidate.role as CandidateRole)
    && typeof candidate.confidence === 'number'
    && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0
    && candidate.confidence <= 1;
}

function isClueDraft(value: unknown): value is ClueDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return clueMechanisms.includes(draft.mechanism as typeof clueMechanisms[number])
    && typeof draft.text === 'string'
    && draft.text.length > 0
    && draft.text.length <= MAX_TEXT_LENGTH
    && typeof draft.difficulty === 'number'
    && Number.isFinite(draft.difficulty)
    && draft.difficulty >= 0
    && draft.difficulty <= 1;
}

function isClueBatchRequestValid(request: ClueBatchRequest): boolean {
  return Array.isArray(request.items)
    && request.items.length > 0
    && request.items.length <= MAX_CLUE_BATCH_ITEMS
    && new Set(request.items.map((item) => item.id)).size === request.items.length
    && request.items.every((item) => typeof item.id === 'string'
      && item.id.length > 0
      && item.id.length <= MAX_TEXT_LENGTH
      && typeof item.answer === 'string'
      && item.answer.length > 0
      && item.answer.length <= MAX_TEXT_LENGTH
      && typeof item.intendedSense === 'string'
      && item.intendedSense.length > 0
      && item.intendedSense.length <= MAX_TEXT_LENGTH);
}

function isClueBatchResult(value: unknown, request: ClueBatchRequest): value is ClueBatchResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return request.items.every((item) => {
    const drafts = result[item.id];
    return Array.isArray(drafts)
      && drafts.length > 0
      && drafts.length <= 4
      && drafts.every(isClueDraft);
  });
}

function isSpokenAnswerCandidate(value: unknown): value is SpokenAnswerCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const suggestion = value as Record<string, unknown>;
  return typeof suggestion.surface === 'string'
    && suggestion.surface.length > 0
    && suggestion.surface.length <= MAX_TEXT_LENGTH
    && (suggestion.note === undefined || (typeof suggestion.note === 'string' && suggestion.note.length <= MAX_TEXT_LENGTH));
}

function isCancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function isCandidateRequestValid(request: CandidateRequest): boolean {
  return Number.isInteger(request.maxSuggestions)
    && request.maxSuggestions >= 1
    && request.maxSuggestions <= MAX_SUGGESTIONS
    && (request.focus === undefined || (request.focus.trim().length > 0 && request.focus.length <= MAX_TEXT_LENGTH))
    && (request.targetLengths === undefined || (
      request.targetLengths.length > 0
      && request.targetLengths.length <= MAX_TARGET_LENGTHS
      && request.targetLengths.every((length) => Number.isInteger(length) && length >= 3 && length <= 15)
    ));
}

function isSpokenAnswerRequestValid(request: SpokenAnswerRequest): boolean {
  return typeof request.spokenAnswer === 'string'
    && request.spokenAnswer.trim().length > 0
    && request.spokenAnswer.length <= MAX_SPOKEN_ANSWER_LENGTH
    && Number.isInteger(request.targetLength)
    && request.targetLength >= MIN_SPOKEN_TARGET_LENGTH
    && request.targetLength <= MAX_SPOKEN_TARGET_LENGTH
    && typeof request.pattern === 'string'
    && request.pattern.length === request.targetLength
    && /^[A-Z.]+$/.test(request.pattern)
    && typeof request.locale === 'string'
    && request.locale.trim().length > 0
    && request.locale.length <= 35
    && Number.isInteger(request.maxSuggestions)
    && request.maxSuggestions >= 1
    && request.maxSuggestions <= MAX_SPOKEN_SUGGESTIONS;
}

export function createModelBroker(manifest: ModelManifest, adapter: LocalModelAdapter, runtime: RuntimeProbe): ModelBroker {
  if (!isManifestValid(manifest)) throw new Error('Invalid model manifest');
  let currentState: ModelState = 'uninstalled';

  const canInstall = (): BrokerResult<void> => {
    if (!runtime.webgpu || (runtime.availableMemoryMb !== null && runtime.availableMemoryMb < manifest.minimumMemoryMb)) return failure('unsupported-device', 'This device does not meet the local model requirements');
    // Shard receipts are authoritative; the manifest estimate (ADR 0004 §7)
    // keeps the preflight honest when the pinned runtime owns the bytes.
    const shardBytes = manifest.shards.reduce((total, shard) => total + shard.bytes, 0);
    const requiredBytes = Math.max(shardBytes, manifest.estimatedBytes ?? 0);
    if (runtime.storageQuotaBytes - runtime.storageUsageBytes < requiredBytes) return failure('storage-quota', 'There is not enough local storage for the pinned model');
    return success(undefined);
  };

  // One atomic prepare at a time (ADR 0004 §2): overlapping install calls
  // join the in-flight prepare instead of racing a second engine into
  // existence. Each caller keeps its own cancellation outcome.
  let prepareInFlight: Promise<BrokerResult<void>> | null = null;

  return {
    state: () => currentState,
    probe: () => runtime,
    async install(signal, onProgress) {
      // Atomic prepare (ADR 0004 §2): one engine, one prepare. A resident or
      // already-cached install must not re-enter the adapter and must not
      // create a second engine.
      if (currentState === 'installed' || currentState === 'loaded') return success(undefined);
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      const capability = canInstall();
      if (!capability.ok) return capability;
      if (isCancelled(signal)) return failure('cancelled', 'Model installation cancelled');
      if (prepareInFlight) {
        const joined = await prepareInFlight;
        if (isCancelled(signal)) return failure('cancelled', 'Model installation cancelled');
        return joined;
      }
      const prepare = (async (): Promise<BrokerResult<void>> => {
        try {
          await adapter.install(manifest, signal, onProgress);
        } catch (error) {
          if (isCancelled(signal)) return failure('cancelled', 'Model installation cancelled');
          return failure('runtime-error', error instanceof Error ? error.message : 'Model installation failed');
        }
        // No post-success cancellation check: the adapter owns that boundary and
        // disposes before surfacing a cancellation. A resolved install really is
        // cached AND resident, so the honest state is `loaded`.
        currentState = 'loaded';
        return success(undefined);
      })();
      prepareInFlight = prepare;
      try {
        return await prepare;
      } finally {
        if (prepareInFlight === prepare) prepareInFlight = null;
      }
    },
    async load(signal, onProgress) {
      if (currentState === 'uninstalled') return failure('model-not-enabled', 'Install the pinned local model before loading it');
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      if (currentState === 'loaded') return success(undefined);
      if (isCancelled(signal)) return failure('cancelled', 'Model loading cancelled');
      try {
        await adapter.load(manifest, signal, onProgress);
      } catch (error) {
        if (isCancelled(signal)) return failure('cancelled', 'Model loading cancelled');
        return failure('runtime-error', error instanceof Error ? error.message : 'Model loading failed');
      }
      if (isCancelled(signal)) return failure('cancelled', 'Model loading cancelled');
      currentState = 'loaded';
      return success(undefined);
    },
    async generateCandidates(request, signal) {
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      if (currentState !== 'loaded') return failure('model-not-enabled', 'Load the local model before original construction');
      if (!isCandidateRequestValid(request)) return failure('invalid-model-output', 'Candidate request contains invalid bounded constraints');
      if (isCancelled(signal)) return failure('cancelled', 'Candidate generation cancelled');
      currentState = 'generating';
      try {
        let output: unknown;
        try {
          output = await adapter.generateCandidates(request, signal);
        } catch (error) {
          if (isCancelled(signal)) return failure('cancelled', 'Candidate generation cancelled');
          return failure('runtime-error', error instanceof Error ? error.message : 'Candidate generation failed');
        }
        if (isCancelled(signal)) return failure('cancelled', 'Candidate generation cancelled');
        if (!Array.isArray(output) || output.length > request.maxSuggestions || !output.every(isCandidateSuggestion)) return failure('invalid-model-output', 'The local model returned an invalid candidate bag');
        return success(output);
      } finally {
        currentState = 'loaded';
      }
    },
    async resolveSpokenAnswer(request, signal) {
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      if (currentState !== 'loaded') return failure('model-not-enabled', 'Load the local model before resolving a spoken answer');
      if (!isSpokenAnswerRequestValid(request)) return failure('invalid-model-output', 'Spoken answer request contains invalid bounded constraints');
      if (isCancelled(signal)) return failure('cancelled', 'Spoken answer resolution cancelled');
      currentState = 'generating';
      try {
        let output: unknown;
        try {
          output = await adapter.resolveSpokenAnswer(request, signal);
        } catch (error) {
          if (isCancelled(signal)) return failure('cancelled', 'Spoken answer resolution cancelled');
          return failure('runtime-error', error instanceof Error ? error.message : 'Spoken answer resolution failed');
        }
        if (isCancelled(signal)) return failure('cancelled', 'Spoken answer resolution cancelled');
        if (!Array.isArray(output) || output.length > request.maxSuggestions || !output.every(isSpokenAnswerCandidate)) return failure('invalid-model-output', 'The local model returned invalid spoken-answer candidates');
        return success(output);
      } finally {
        currentState = 'loaded';
      }
    },
    async composeClues(request, signal) {
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      if (currentState !== 'loaded') return failure('model-not-enabled', 'Load the local model before original construction');
      if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
      currentState = 'generating';
      try {
        let output: unknown;
        try {
          output = await adapter.composeClues(request, signal);
        } catch (error) {
          if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
          return failure('runtime-error', error instanceof Error ? error.message : 'Clue generation failed');
        }
        if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
        if (!Array.isArray(output) || output.length === 0 || output.length > 4 || !output.every(isClueDraft)) return failure('invalid-model-output', 'The local model returned invalid clue drafts');
        return success(output);
      } finally {
        currentState = 'loaded';
      }
    },
    async composeCluesBatch(request, signal) {
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      if (currentState !== 'loaded') return failure('model-not-enabled', 'Load the local model before original construction');
      if (!isClueBatchRequestValid(request)) return failure('invalid-model-output', 'Clue batch request contains invalid bounded constraints');
      if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
      currentState = 'generating';
      try {
        let output: unknown;
        try {
          if (adapter.composeCluesBatch) {
            output = await adapter.composeCluesBatch(request, signal);
          } else {
            // Compatibility implementation: the caller gets one logical
            // operation and one result map even when an older adapter still
            // needs one completion per item.
            const fallback: Record<string, readonly ClueDraft[]> = {};
            for (const item of request.items) {
              const drafts: unknown = await adapter.composeClues({ answer: item.answer, intendedSense: item.intendedSense }, signal);
              if (!Array.isArray(drafts) || drafts.length === 0 || drafts.length > 4 || !drafts.every(isClueDraft)) {
                throw new Error('The local model returned invalid clue drafts');
              }
              fallback[item.id] = drafts;
            }
            output = fallback;
          }
        } catch (error) {
          if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
          return failure('runtime-error', error instanceof Error ? error.message : 'Clue batch generation failed');
        }
        if (isCancelled(signal)) return failure('cancelled', 'Clue generation cancelled');
        if (!isClueBatchResult(output, request)) return failure('invalid-model-output', 'The local model returned an invalid clue batch');
        return success(output);
      } finally {
        currentState = 'loaded';
      }
    },
    async unload() {
      if (currentState === 'uninstalled' || currentState === 'installed') return success(undefined);
      if (currentState === 'generating') return failure('busy', 'Wait for the current local generation to finish');
      currentState = 'unloading';
      try {
        await adapter.unload();
        currentState = 'installed';
        return success(undefined);
      } catch (error) {
        // Typed-result convention (RTO-P1-1). Residency was not provably
        // released, so the state stays conservatively `loaded` and the caller
        // receives the failure instead of an unhandled throw.
        currentState = 'loaded';
        return failure('runtime-error', error instanceof Error ? error.message : 'Model unload failed');
      }
    },
    async inspectCache() {
      if (!adapter.hasCache) return failure('runtime-error', 'This model runtime cannot inspect its browser cache');
      try {
        return success(await adapter.hasCache(manifest));
      } catch (error) {
        return failure('runtime-error', error instanceof Error ? error.message : 'Unable to inspect the model cache');
      }
    },
    async deleteCache(signal) {
      if (!adapter.deleteCache) return failure('runtime-error', 'This model runtime cannot delete its browser cache');
      if (isCancelled(signal)) return failure('cancelled', 'Model cache deletion cancelled');
      if (currentState === 'generating' || currentState === 'unloading') return failure('busy', 'The local model is busy');
      try {
        if (currentState === 'loaded') {
          const unloaded = await this.unload();
          if (!unloaded.ok) return unloaded;
        }
        await adapter.deleteCache(manifest);
        currentState = 'uninstalled';
        return success(undefined);
      } catch (error) {
        // A cancelled deletion is reported as cancelled, not as a runtime fault.
        if (isCancelled(signal)) return failure('cancelled', 'Model cache deletion cancelled');
        return failure('runtime-error', error instanceof Error ? error.message : 'Model cache deletion failed');
      }
    }
  };
}
