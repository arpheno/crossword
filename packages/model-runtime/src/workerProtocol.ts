import type {
  BrokerResult,
  CandidateRequest,
  ClueDraft,
  ModelManifest,
  ModelProgress,
  ModelProgressPhase,
  ModelState,
  RuntimeProbe,
  SpokenAnswerRequest
} from './broker';
import { MAX_SPOKEN_TARGET_LENGTH, MIN_SPOKEN_TARGET_LENGTH } from './broker';

export type ModelWorkerConfig = Readonly<{
  manifest: ModelManifest;
  runtime: RuntimeProbe;
}>;

export type ModelWorkerOperation = 'inspect-cache' | 'install' | 'load' | 'generate-candidates' | 'resolve-spoken-answer' | 'compose-clues' | 'unload' | 'delete-cache';
type ModelWorkerPayload = CandidateRequest | SpokenAnswerRequest | Readonly<{ answer: string; intendedSense: string }>;

export type ModelWorkerRequest = Readonly<
  | { version: 1; type: 'configure'; requestId: string; config: ModelWorkerConfig }
  | { version: 1; type: 'execute'; requestId: string; operation: ModelWorkerOperation; payload?: ModelWorkerPayload }
  | { version: 1; type: 'cancel'; requestId: string }
>;

export type ModelWorkerResponse = Readonly<
  | { version: 1; type: 'state'; state: ModelState }
  | { version: 1; type: 'progress'; requestId: string; progress: ModelProgress }
  | { version: 1; type: 'result'; requestId: string; operation: ModelWorkerOperation | 'configure'; result: BrokerResult<unknown> }
  | { version: 1; type: 'protocol-error'; requestId?: string; message: string }
>;

const modelStates: readonly ModelState[] = ['uninstalled', 'installed', 'loaded', 'generating', 'unloading'];
const operations: readonly ModelWorkerOperation[] = ['inspect-cache', 'install', 'load', 'generate-candidates', 'resolve-spoken-answer', 'compose-clues', 'unload', 'delete-cache'];
const progressPhases: readonly ModelProgressPhase[] = ['downloading', 'loading-runtime', 'generating', 'unloading', 'deleting-cache'];
const failureCodes = ['unsupported-device', 'storage-quota', 'model-not-enabled', 'invalid-model-output', 'busy', 'cancelled', 'runtime-error'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProgress(value: unknown): value is ModelProgress {
  if (!isRecord(value) || !progressPhases.includes(value.phase as ModelProgressPhase) || typeof value.text !== 'string' || value.text.length > 500) return false;
  return value.progress === null || (isFiniteNumber(value.progress) && value.progress >= 0 && value.progress <= 1);
}

function isManifest(value: unknown): value is ModelManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.version !== 'string' || typeof value.quantization !== 'string' || typeof value.runtimeVersion !== 'string' || typeof value.promptVersion !== 'string' || !isFiniteNumber(value.minimumMemoryMb) || !Array.isArray(value.shards) || (value.distribution !== undefined && value.distribution !== 'webllm-mlc')) return false;
  if (value.estimatedBytes !== undefined && (!Number.isInteger(value.estimatedBytes) || (value.estimatedBytes as number) <= 0)) return false;
  return value.shards.every((shard) => isRecord(shard) && typeof shard.url === 'string' && typeof shard.sha256 === 'string' && /^[a-f0-9]{64}$/.test(shard.sha256) && Number.isInteger(shard.bytes) && (shard.bytes as number) > 0);
}

function isRuntime(value: unknown): value is RuntimeProbe {
  return isRecord(value) && typeof value.webgpu === 'boolean' && (value.availableMemoryMb === null || isFiniteNumber(value.availableMemoryMb)) && isFiniteNumber(value.storageQuotaBytes) && isFiniteNumber(value.storageUsageBytes);
}

function isCandidateRequest(value: unknown): value is CandidateRequest {
  return isRecord(value)
    && typeof value.seed === 'string'
    && typeof value.audienceSummary === 'string'
    && Array.isArray(value.requestedRoles)
    && value.requestedRoles.every((role) => ['theme', 'long', 'general', 'glue', 'stretch'].includes(role as string))
    && Array.isArray(value.excludedAnswers)
    && value.excludedAnswers.every((answer) => typeof answer === 'string')
    && Number.isInteger(value.maxSuggestions)
    && (value.maxSuggestions as number) > 0
    && (value.maxSuggestions as number) <= 64
    && (value.focus === undefined || (typeof value.focus === 'string' && value.focus.trim().length > 0 && value.focus.length <= 500))
    && (value.targetLengths === undefined || (
      Array.isArray(value.targetLengths)
      && value.targetLengths.length > 0
      && value.targetLengths.length <= 8
      && value.targetLengths.every((length) => Number.isInteger(length) && length >= 3 && length <= 15)
    ));
}

function isClueRequest(value: unknown): value is Readonly<{ answer: string; intendedSense: string }> {
  return isRecord(value) && typeof value.answer === 'string' && typeof value.intendedSense === 'string';
}

function isCandidateRole(value: unknown): boolean {
  return ['theme', 'long', 'general', 'glue', 'stretch'].includes(value as string);
}

function isCandidateSuggestion(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.surface === 'string'
    && value.surface.length > 0
    && value.surface.length <= 500
    && typeof value.intendedSense === 'string'
    && value.intendedSense.length > 0
    && value.intendedSense.length <= 500
    && Array.isArray(value.associations)
    && value.associations.length <= 16
    && value.associations.every((association) => typeof association === 'string' && association.length <= 500)
    && isCandidateRole(value.role)
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1;
}

function isSpokenAnswerCandidate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.surface === 'string'
    && value.surface.length > 0
    && value.surface.length <= 500
    && (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 500));
}

function isClueDraft(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['direct', 'standard', 'oblique', 'nudge'].includes(value.mechanism as string)
    && typeof value.text === 'string'
    && value.text.length > 0
    && value.text.length <= 500
    && typeof value.difficulty === 'number'
    && Number.isFinite(value.difficulty)
    && value.difficulty >= 0
    && value.difficulty <= 1;
}

function isSpokenAnswerRequest(value: unknown): value is SpokenAnswerRequest {
  return isRecord(value)
    && typeof value.spokenAnswer === 'string'
    && value.spokenAnswer.trim().length > 0
    && value.spokenAnswer.length <= 200
    && Number.isInteger(value.targetLength)
    && (value.targetLength as number) >= MIN_SPOKEN_TARGET_LENGTH
    && (value.targetLength as number) <= MAX_SPOKEN_TARGET_LENGTH
    && typeof value.pattern === 'string'
    && value.pattern.length === value.targetLength
    && /^[A-Z.]+$/.test(value.pattern)
    && typeof value.locale === 'string'
    && value.locale.trim().length > 0
    && value.locale.length <= 35
    && Number.isInteger(value.maxSuggestions)
    && (value.maxSuggestions as number) >= 1
    && (value.maxSuggestions as number) <= 8;
}

export function parseModelWorkerRequest(value: unknown): ModelWorkerRequest | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') return undefined;
  if (value.type === 'cancel' && typeof value.requestId === 'string' && value.requestId) return { version: 1, type: 'cancel', requestId: value.requestId };
  if (value.type === 'configure' && typeof value.requestId === 'string' && value.requestId && isRecord(value.config) && isManifest(value.config.manifest) && isRuntime(value.config.runtime)) {
    return {
      version: 1,
      type: 'configure',
      requestId: value.requestId,
      config: {
        manifest: value.config.manifest,
        runtime: value.config.runtime
      }
    };
  }
  if (value.type !== 'execute' || typeof value.requestId !== 'string' || !value.requestId || !operations.includes(value.operation as ModelWorkerOperation)) return undefined;
  const operation = value.operation as ModelWorkerOperation;
  if (operation === 'generate-candidates' && !isCandidateRequest(value.payload)) return undefined;
  if (operation === 'resolve-spoken-answer' && !isSpokenAnswerRequest(value.payload)) return undefined;
  if (operation === 'compose-clues' && !isClueRequest(value.payload)) return undefined;
  if (['inspect-cache', 'install', 'load', 'unload', 'delete-cache'].includes(operation) && value.payload !== undefined) return undefined;
  return { version: 1, type: 'execute', requestId: value.requestId, operation, payload: value.payload as ModelWorkerPayload };
}

function isBrokerResult(value: unknown, operation: ModelWorkerOperation | 'configure'): value is BrokerResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;
  if (!value.ok) {
    return isRecord(value.error)
      && failureCodes.includes(value.error.code as typeof failureCodes[number])
      && typeof value.error.message === 'string'
      && value.error.message.length <= 500;
  }
  if (operation === 'inspect-cache') return typeof value.value === 'boolean';
  if (operation === 'generate-candidates') return Array.isArray(value.value) && value.value.length <= 64 && value.value.every(isCandidateSuggestion);
  if (operation === 'resolve-spoken-answer') return Array.isArray(value.value) && value.value.length <= 8 && value.value.every(isSpokenAnswerCandidate);
  if (operation === 'compose-clues') return Array.isArray(value.value) && value.value.length > 0 && value.value.length <= 4 && value.value.every(isClueDraft);
  return value.value === undefined;
}

export function parseModelWorkerResponse(value: unknown): ModelWorkerResponse | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') return undefined;
  if (value.type === 'state' && modelStates.includes(value.state as ModelState)) return { version: 1, type: 'state', state: value.state as ModelState };
  if (value.type === 'progress' && typeof value.requestId === 'string' && value.requestId && isProgress(value.progress)) return { version: 1, type: 'progress', requestId: value.requestId, progress: value.progress };
  if (value.type === 'protocol-error' && typeof value.message === 'string' && (value.requestId === undefined || typeof value.requestId === 'string')) return { version: 1, type: 'protocol-error', requestId: value.requestId, message: value.message };
  if (value.type === 'result' && typeof value.requestId === 'string' && value.requestId && (value.operation === 'configure' || operations.includes(value.operation as ModelWorkerOperation)) && isBrokerResult(value.result, value.operation as ModelWorkerOperation | 'configure')) {
    return { version: 1, type: 'result', requestId: value.requestId, operation: value.operation as ModelWorkerOperation | 'configure', result: value.result };
  }
  return undefined;
}
