import {
  assertValidPuzzle,
  validateSessionSnapshot,
  validateSolveEvent,
  validatePuzzle,
  type PuzzleDocument,
  type SolveEvent,
  type SolveSessionSnapshot
} from '@crossword/domain';

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

export type ContinuityExportInput = Readonly<{
  preferences: JsonValue;
  profiles: JsonValue;
  puzzles: readonly PuzzleDocument[];
  sessions: readonly SolveSessionSnapshot[];
  events?: readonly SolveEvent[];
}>;

export type ContinuityArchive = Readonly<{
  kind: 'crossword-continuity';
  schemaVersion: 1;
  exportedAt: string;
  preferences: JsonValue;
  profiles: JsonValue;
  puzzles: readonly PuzzleDocument[];
  sessions: readonly SolveSessionSnapshot[];
  events: readonly SolveEvent[];
  integrity: Readonly<{ algorithm: 'sha256'; value: string }>;
}>;

export type ContinuityPreview = Readonly<{
  schemaVersion: 1;
  exportedAt: string;
  puzzleCount: number;
  sessionCount: number;
  eventCount: number;
}>;

const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const ARCHIVE_KEYS = new Set(['kind', 'schemaVersion', 'exportedAt', 'preferences', 'profiles', 'puzzles', 'sessions', 'events', 'integrity']);

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 20 || value === null) return value === null;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.entries(value).every(([key, item]) => key.length <= 200 && isJsonValue(item, depth + 1));
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify continuity archive integrity');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function archiveBody(input: ContinuityExportInput, exportedAt: string) {
  return {
    kind: 'crossword-continuity' as const,
    schemaVersion: 1 as const,
    exportedAt,
    preferences: input.preferences,
    profiles: input.profiles,
    puzzles: input.puzzles,
    sessions: input.sessions,
    events: input.events ?? []
  };
}

export async function createContinuityExport(
  input: ContinuityExportInput,
  exportedAt = new Date().toISOString()
): Promise<string> {
  if (!isJsonValue(input.preferences) || !isJsonValue(input.profiles)) throw new Error('Continuity settings must contain JSON values only');
  for (const puzzle of input.puzzles) assertValidPuzzle(puzzle);
  const body = archiveBody(input, exportedAt);
  const value = canonicalJson(body as unknown as JsonValue);
  const archive = { ...body, integrity: { algorithm: 'sha256' as const, value: await sha256(value) } };
  return JSON.stringify(archive);
}

function validateArchive(value: unknown): value is Omit<ContinuityArchive, 'integrity'> & { integrity: { algorithm: 'sha256'; value: string } } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !ARCHIVE_KEYS.has(key))) return false;
  if (candidate.kind !== 'crossword-continuity' || candidate.schemaVersion !== 1 || typeof candidate.exportedAt !== 'string' || !isJsonValue(candidate.preferences) || !isJsonValue(candidate.profiles) || !Array.isArray(candidate.puzzles) || !Array.isArray(candidate.sessions) || !Array.isArray(candidate.events)) return false;
  if (!candidate.puzzles.every(validatePuzzle) || !candidate.sessions.every(validateSessionSnapshot) || !candidate.events.every(validateSolveEvent)) return false;
  if (typeof candidate.integrity !== 'object' || candidate.integrity === null || Array.isArray(candidate.integrity)) return false;
  const integrity = candidate.integrity as Record<string, unknown>;
  return integrity.algorithm === 'sha256' && typeof integrity.value === 'string' && /^[a-f0-9]{64}$/.test(integrity.value);
}

export async function parseContinuityExport(serialized: string): Promise<ContinuityArchive> {
  if (new TextEncoder().encode(serialized).byteLength > MAX_EXPORT_BYTES) throw new Error('Continuity archive exceeds the 10 MiB import limit');
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Continuity archive is not valid JSON');
  }
  if (!validateArchive(value)) throw new Error('Continuity archive schema or puzzle content is invalid');
  const { integrity, ...body } = value;
  const expected = await sha256(canonicalJson(body as unknown as JsonValue));
  if (expected !== integrity.value) throw new Error('Continuity archive integrity check failed');
  return value as ContinuityArchive;
}

export async function previewContinuityExport(serialized: string): Promise<ContinuityPreview> {
  const archive = await parseContinuityExport(serialized);
  return {
    schemaVersion: archive.schemaVersion,
    exportedAt: archive.exportedAt,
    puzzleCount: archive.puzzles.length,
    sessionCount: archive.sessions.length,
    eventCount: archive.events.length
  };
}