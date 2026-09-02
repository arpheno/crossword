import {
  assertValidPuzzle,
  type Cell,
  type CellId,
  type Direction,
  type Entry,
  type EntryId,
  type PuzzleDocument,
  type PuzzleId
} from '@crossword/domain';

type LegacyCharacter = Readonly<{
  letters: string;
  is_circled?: boolean;
  is_shaded?: boolean;
}>;

type LegacyEntry = Readonly<{
  clue_number: number;
  clue_text: string;
  direction: Direction;
  start_x: number;
  start_y: number;
  characters: readonly LegacyCharacter[];
}>;

type LegacyPuzzlePayload = Readonly<{
  metadata: Readonly<{
    date: string;
    title: string;
    authors?: readonly string[];
    width: number;
    height: number;
    notepad?: string | null;
  }>;
  entries: readonly LegacyEntry[];
}>;

export type NytWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type NytCrosswordClient = Readonly<{
  loadByDate: (date: string, signal?: AbortSignal) => Promise<PuzzleDocument>;
  loadRandom: (weekday: NytWeekday, signal?: AbortSignal) => Promise<PuzzleDocument>;
}>;

const apiOrigin = (import.meta.env.VITE_CROSSWORD_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`NYT API payload has an invalid ${label}`);
  }
  return value.trim();
}

function asInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`NYT API payload has an invalid ${label}`);
  }
  return value;
}

function parseLegacyPayload(value: unknown): LegacyPuzzlePayload {
  if (!isRecord(value) || !isRecord(value.metadata) || !Array.isArray(value.entries)) {
    throw new Error('NYT API response is not a crossword payload');
  }
  const metadata = value.metadata;
  const width = asInteger(metadata.width, 'metadata.width', 1);
  const height = asInteger(metadata.height, 'metadata.height', 1);
  const authors = metadata.authors === undefined
    ? []
    : Array.isArray(metadata.authors)
      ? metadata.authors.map((author) => asNonEmptyString(author, 'metadata.authors'))
      : (() => { throw new Error('NYT API payload has an invalid metadata.authors'); })();
  const entries = value.entries.map((candidate, entryIndex) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.characters)) {
      throw new Error(`NYT API payload has an invalid entry at index ${entryIndex}`);
    }
    const direction = candidate.direction;
    if (direction !== 'across' && direction !== 'down') {
      throw new Error(`NYT API payload has an invalid entry direction at index ${entryIndex}`);
    }
    const characters = candidate.characters.map((character, characterIndex) => {
      if (!isRecord(character)) {
        throw new Error(`NYT API payload has an invalid character at entry ${entryIndex}, position ${characterIndex}`);
      }
      return {
        letters: asNonEmptyString(character.letters, `entry ${entryIndex} character ${characterIndex}`),
        is_circled: character.is_circled === true,
        is_shaded: character.is_shaded === true
      };
    });
    return {
      clue_number: asInteger(candidate.clue_number, `entry ${entryIndex}.clue_number`, 1),
      clue_text: asNonEmptyString(candidate.clue_text, `entry ${entryIndex}.clue_text`),
      direction: direction as Direction,
      start_x: asInteger(candidate.start_x, `entry ${entryIndex}.start_x`),
      start_y: asInteger(candidate.start_y, `entry ${entryIndex}.start_y`),
      characters
    };
  });
  if (entries.length === 0) throw new Error('NYT API payload contains no entries');
  return {
    metadata: {
      date: asNonEmptyString(metadata.date, 'metadata.date'),
      title: asNonEmptyString(metadata.title, 'metadata.title'),
      authors,
      width,
      height,
      notepad: metadata.notepad === null || metadata.notepad === undefined
        ? undefined
        : asNonEmptyString(metadata.notepad, 'metadata.notepad')
    },
    entries
  };
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]!.slice(-2)}${iso[2]}${iso[3]}`;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (compact) return `${compact[1]!.slice(-2)}${compact[2]}${compact[3]}`;
  throw new Error('Enter a puzzle date as YYMMDD or YYYY-MM-DD');
}

function cellId(date: string, row: number, column: number): CellId {
  return `nyt-cell-${date}-${row}-${column}` as CellId;
}

function entryId(date: string, direction: Direction, number: number): EntryId {
  return `nyt-entry-${date}-${direction}-${number}` as EntryId;
}

function puzzleId(date: string): PuzzleId {
  return `nyt-${date}` as PuzzleId;
}

function byteDigestInput(puzzle: Omit<PuzzleDocument, 'integrity'>): string {
  return JSON.stringify({ ...puzzle, integrity: null });
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify imported puzzle integrity');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function legacyPayloadToPuzzle(value: unknown): Promise<PuzzleDocument> {
  const payload = parseLegacyPayload(value);
  const date = normalizeDate(payload.metadata.date);
  const occupied = new Map<string, { token: string; circled: boolean; shaded: boolean }>();
  const entries: Entry[] = [];

  for (const sourceEntry of payload.entries) {
    if (sourceEntry.start_x >= payload.metadata.width || sourceEntry.start_y >= payload.metadata.height) {
      throw new Error(`NYT entry ${sourceEntry.clue_number} starts outside the grid`);
    }
    if (sourceEntry.characters.length < 1) {
      throw new Error(`NYT entry ${sourceEntry.clue_number} has no characters`);
    }
    const cellIds: CellId[] = [];
    const answer: string[] = [];
    sourceEntry.characters.forEach((character, position) => {
      const row = sourceEntry.start_y + (sourceEntry.direction === 'down' ? position : 0);
      const column = sourceEntry.start_x + (sourceEntry.direction === 'across' ? position : 0);
      if (row >= payload.metadata.height || column >= payload.metadata.width) {
        throw new Error(`NYT entry ${sourceEntry.clue_number} runs outside the grid`);
      }
      const token = character.letters.toUpperCase();
      if (!/^[A-Z]+$/.test(token)) {
        throw new Error(`NYT entry ${sourceEntry.clue_number} contains unsupported characters`);
      }
      const key = `${row}:${column}`;
      const previous = occupied.get(key);
      if (previous && previous.token !== token) {
        throw new Error(`NYT entries disagree at row ${row + 1}, column ${column + 1}`);
      }
      occupied.set(key, {
        token,
        circled: Boolean(previous?.circled || character.is_circled),
        shaded: Boolean(previous?.shaded || character.is_shaded)
      });
      cellIds.push(cellId(date, row, column));
      answer.push(token[0]!);
    });
    entries.push({
      id: entryId(date, sourceEntry.direction, sourceEntry.clue_number),
      number: sourceEntry.clue_number,
      direction: sourceEntry.direction,
      cellIds,
      answer: answer.join(''),
      clue: sourceEntry.clue_text
    });
  }

  const cells: Cell[] = [];
  for (let row = 0; row < payload.metadata.height; row += 1) {
    for (let column = 0; column < payload.metadata.width; column += 1) {
      const state = occupied.get(`${row}:${column}`);
      cells.push({
        id: cellId(date, row, column),
        row,
        column,
        block: !state,
        circled: state?.circled ?? false,
        shaded: state?.shaded ?? false,
        rebus: state && state.token.length > 1 ? state.token : undefined
      });
    }
  }

  const draft: Omit<PuzzleDocument, 'integrity'> = {
    schemaVersion: 1,
    id: puzzleId(date),
    seed: `nyt-${date}`,
    title: payload.metadata.title,
    subtitle: payload.metadata.authors?.length
      ? `Imported puzzle by ${payload.metadata.authors.join(', ')}`
      : 'Imported puzzle from the local NYT bridge',
    width: payload.metadata.width,
    height: payload.metadata.height,
    cells,
    entries,
    clues: entries.map((entry) => ({
      entryId: entry.id,
      variants: [{ mechanism: 'direct' as const, text: entry.clue, difficulty: 0.5 }]
    })),
    provenance: {
      source: 'import',
      recipeId: 'legacy-nyt-api-v1',
      records: [{
        id: `nyt-api-${date}`,
        kind: 'fact',
        source: 'Local legacy NYT compatibility API',
        license: 'owner-review-required',
        digest: `nyt-api-payload-${date}`
      }]
    },
    generation: {
      modelId: 'legacy-provider',
      promptVersion: 'none',
      lexiconVersion: 'provider-supplied',
      solverVersion: 'provider-supplied',
      generatedAt: new Date(0).toISOString(),
      restartCount: 0
    },
    quality: {
      score: 1,
      thresholds: { topology: 1, crossings: 1, providerPayload: 1 },
      validators: ['topology', 'crossings', 'provider-payload']
    },
    topology: {
      width: payload.metadata.width,
      height: payload.metadata.height,
      blockedCellIds: cells.filter((cell) => cell.block).map((cell) => cell.id),
      minEntryLength: 1
    },
    createdBy: 'import'
  };
  const puzzle: PuzzleDocument = {
    ...draft,
    integrity: { algorithm: 'sha256', value: await sha256(byteDigestInput(draft)) }
  };
  assertValidPuzzle(puzzle);
  return puzzle;
}

export function createNytCrosswordClient(
  fetchImpl: typeof fetch = fetch,
  baseUrl = apiOrigin
): NytCrosswordClient {
  const root = baseUrl.replace(/\/$/, '');
  async function request(path: string, signal?: AbortSignal): Promise<PuzzleDocument> {
    const response = await fetchImpl(`${root}${path}`, { signal });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`NYT API returned a non-JSON response (${response.status})`);
    }
    if (!response.ok) {
      const error = isRecord(payload) && typeof payload.error === 'string' ? payload.error : `NYT API request failed (${response.status})`;
      throw new Error(error);
    }
    return legacyPayloadToPuzzle(payload);
  }
  return {
    loadByDate: (date, signal) => request(`/crossword_by_date/${encodeURIComponent(normalizeDate(date))}`, signal),
    loadRandom: (weekday, signal) => request(`/random_crossword/${weekday}`, signal)
  };
}