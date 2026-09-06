import {
  enterLetter,
  selectCell,
  touchSession,
  type Direction,
  type Entry,
  type EntryId,
  isSupportedCrosswordAnswer,
  normalizeCrosswordAnswer,
  type PuzzleDocument,
  type PuzzleIndex,
  type SolveSessionSnapshot
} from '@crossword/domain';

export type VoiceCommand = Readonly<{
  number: number;
  direction: Direction;
  spokenAnswer: string;
}>;

export type VoiceParseResult = Readonly<
  | { ok: true; command: VoiceCommand }
  | { ok: false; message: string }
>;

export type VoiceCandidate = Readonly<{
  surface: string;
  note?: string;
}>;

const phoneticGroups: readonly (readonly string[])[] = [
  ['air', 'err'],
  ['bare', 'bear'],
  ['buy', 'by', 'bye'],
  ['cell', 'sell'],
  ['dear', 'deer'],
  ['flour', 'flower'],
  ['for', 'four'],
  ['hear', 'here'],
  ['hour', 'our'],
  ['know', 'no'],
  ['mail', 'male'],
  ['pair', 'pare', 'pear'],
  ['right', 'rite', 'write', 'wright'],
  ['sea', 'see'],
  ['sole', 'soul'],
  ['some', 'sum'],
  ['son', 'sun'],
  ['their', 'there', "they're"],
  ['to', 'too', 'two'],
  ['waist', 'waste'],
  ['wear', 'where'],
  ['weather', 'whether'],
  ['wood', 'would'],
  ['your', "you're"]
];

export type VoiceAnswerIntent = Readonly<{
  puzzleId: string;
  puzzleRevision: string;
  entryId: EntryId;
  pattern: string;
  sessionRevision: string;
}>;

export type VoiceEntryLookup = Readonly<
  | { status: 'found'; entry: Entry }
  | { status: 'missing' }
  | { status: 'ambiguous'; entries: readonly Entry[] }
>;

export type VoiceFillResult = Readonly<
  | { ok: true; snapshot: SolveSessionSnapshot; answer: string }
  | { ok: false; snapshot: SolveSessionSnapshot; reason: 'paused' | 'incompatible-answer' | 'stale-intent' | 'unsupported-rebus' }
>;

const smallNumberWords: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19
};

const tensWords: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};

const directionAliases: Readonly<Record<string, Direction>> = {
  across: 'across',
  horizontal: 'across',
  down: 'down',
  vertical: 'down'
};

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const numberConfusions: Readonly<Record<string, string>> = {
  for: 'four',
  to: 'two',
  won: 'one'
};

const MAX_VOICE_TRANSCRIPT_LENGTH = 500;
const MAX_VOICE_TOKEN_COUNT = 64;

function parseNumberTokens(input: readonly string[]): number | undefined {
  const tokens = [...input];
  while (tokens[0] === 'the' || tokens[0] === 'clue' || tokens[0] === 'number' || tokens[0] === 'entry') {
    tokens.shift();
  }
  if (tokens.length === 0) return undefined;

  if (tokens.length === 1) {
    const digitMatch = /^(\d+)(?:st|nd|rd|th)?$/.exec(tokens[0] ?? '');
    if (digitMatch) {
      const value = Number(digitMatch[1]);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  }

  let total = 0;
  let current = 0;
  let sawNumber = false;
  let previousToken: 'small' | 'tens' | 'scale' | 'and' | '' = '';
  for (const originalToken of tokens) {
    const token = numberConfusions[originalToken] ?? originalToken;
    if (token === 'and') {
      if (previousToken !== 'scale') return undefined;
      previousToken = 'and';
      continue;
    }
    const small = smallNumberWords[token];
    if (small !== undefined) {
      if (previousToken === 'small') return undefined;
      if (previousToken === 'tens' || previousToken === 'scale' || previousToken === 'and') current += small;
      else current = small;
      sawNumber = true;
      previousToken = 'small';
      continue;
    }
    const tens = tensWords[token];
    if (tens !== undefined) {
      if (previousToken === 'small' && current !== 0 || previousToken === 'tens') return undefined;
      if (previousToken === 'and' || previousToken === 'scale') current += tens;
      else current = tens;
      sawNumber = true;
      previousToken = 'tens';
      continue;
    }
    if (token === 'hundred' || token === 'thousand') {
      if (!sawNumber) return undefined;
      if (previousToken === 'and' || current === 0) return undefined;
      const multiplier = token === 'hundred' ? 100 : 1_000;
      if (token === 'hundred') {
        if (current > 9) return undefined;
        current *= multiplier;
      } else {
        if (total !== 0) return undefined;
        total += current * multiplier;
        current = 0;
      }
      sawNumber = true;
      previousToken = 'scale';
      continue;
    }
    return undefined;
  }

  if (previousToken === 'and' || (previousToken === 'scale' && current === 0 && total === 0)) return undefined;
  const value = total + current;
  return sawNumber && Number.isSafeInteger(value) ? value : undefined;
}

export function parseVoiceCommand(transcript: string): VoiceParseResult {
  if (transcript.length > MAX_VOICE_TRANSCRIPT_LENGTH) return { ok: false, message: 'That voice message is too long. Say one clue reference and answer.' };
  const rawTokens = normalizedTokens(transcript);
  if (rawTokens.length > MAX_VOICE_TOKEN_COUNT) return { ok: false, message: 'That voice message contains too many words. Say one clue reference and answer.' };
  const tokens: string[] = [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    if (rawTokens[index] === 'a' && rawTokens[index + 1] === 'cross') {
      tokens.push('across');
      index += 1;
    } else {
      tokens.push(rawTokens[index]!);
    }
  }
  const directionIndex = tokens.findIndex((token) => directionAliases[token] !== undefined);
  if (directionIndex < 0) return { ok: false, message: 'Say a clue number, across or down, and an answer.' };

  const number = parseNumberTokens(tokens.slice(0, directionIndex));
  if (!number || number < 1) return { ok: false, message: 'I could not understand the clue number.' };

  const answerTokens = tokens.slice(directionIndex + 1);
  if (answerTokens[0] === 'answer' && answerTokens[1] === 'is') answerTokens.splice(0, 2);
  const spokenAnswer = answerTokens.join(' ').trim();
  if (!spokenAnswer) return { ok: false, message: 'I heard the clue reference but no answer.' };

  return {
    ok: true,
    command: {
      number,
      direction: directionAliases[tokens[directionIndex] ?? ''] ?? 'across',
      spokenAnswer
    }
  };
}

export function normalizeVoiceAnswer(value: string): string {
  return normalizeCrosswordAnswer(value);
}

export function voicePhoneticCandidates(spokenAnswer: string): readonly VoiceCandidate[] {
  const normalized = normalizeVoiceAnswer(spokenAnswer);
  const group = phoneticGroups.find((variants) => variants.some((variant) => normalizeVoiceAnswer(variant) === normalized));
  return (group ?? [])
    .map((surface) => normalizeVoiceAnswer(surface))
    .filter((surface) => surface !== normalized)
    .map((surface) => ({ surface, note: 'phonetic alternative' }));
}

function hashParts(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= 124;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function voicePuzzleFingerprint(puzzle: PuzzleDocument): string {
  return hashParts([
    puzzle.id,
    puzzle.title,
    puzzle.subtitle,
    `${puzzle.width}x${puzzle.height}`,
    `${puzzle.topology.minEntryLength}:${puzzle.topology.blockedCellIds.join(',')}`,
    ...puzzle.cells.map((cell) => `${cell.id}:${cell.row}:${cell.column}:${cell.block ? 1 : 0}:${cell.rebus ?? ''}`),
    ...puzzle.entries.map((entry) => `${entry.id}:${entry.number}:${entry.direction}:${entry.answer}:${entry.cellIds.join(',')}`),
    ...puzzle.clues.map((clueSet) => `${clueSet.entryId}:${clueSet.variants.map((variant) => `${variant.mechanism}:${variant.text}:${variant.difficulty}`).join('|')}`)
  ]);
}

export function lookupVoiceEntry(puzzle: PuzzleDocument, command: VoiceCommand): VoiceEntryLookup {
  const entries = puzzle.entries.filter((entry) => entry.number === command.number && entry.direction === command.direction);
  if (entries.length === 1) return { status: 'found', entry: entries[0]! };
  if (entries.length > 1) return { status: 'ambiguous', entries };
  return { status: 'missing' };
}

export function voiceSessionFingerprint(snapshot: SolveSessionSnapshot): string {
  return `${snapshot.revision}:${snapshot.events.at(-1)?.id ?? ''}`;
}

function entryHasRebus(puzzle: PuzzleDocument, entry: Entry): boolean {
  const cellsById = new Map(puzzle.cells.map((cell) => [cell.id, cell] as const));
  return entry.cellIds.some((cellId) => cellsById.get(cellId)?.rebus !== undefined);
}

export function voiceEntryHasRebus(puzzle: PuzzleDocument, entry: Entry): boolean {
  return entryHasRebus(puzzle, entry);
}

export function voiceEntryPattern(entry: Entry, session: SolveSessionSnapshot): string {
  return entry.cellIds.map((cellId) => {
    const value = session.entered[cellId] ?? '';
    const normalized = normalizeVoiceAnswer(value);
    return normalized.length === 1 ? normalized : '.';
  }).join('');
}

function candidateFitsEntry(
  entry: Entry,
  session: SolveSessionSnapshot,
  candidate: VoiceCandidate
): VoiceCandidate | undefined {
  if (!isSupportedCrosswordAnswer(candidate.surface)) return undefined;
  const answer = normalizeVoiceAnswer(candidate.surface);
  if (answer.length !== entry.cellIds.length || answer.length === 0) return undefined;
  for (const [position, cellId] of entry.cellIds.entries()) {
    const entered = session.entered[cellId] ?? '';
    if (!entered) continue;
    const normalizedEntered = normalizeVoiceAnswer(entered);
    if (normalizedEntered.length !== 1 || normalizedEntered !== answer[position]) return undefined;
  }
  return { ...candidate, surface: answer };
}

export function filterVoiceCandidates(
  entry: Entry,
  session: SolveSessionSnapshot,
  candidates: readonly VoiceCandidate[]
): readonly VoiceCandidate[] {
  const seen = new Set<string>();
  const compatible: VoiceCandidate[] = [];
  for (const candidate of candidates) {
    const filtered = candidateFitsEntry(entry, session, candidate);
    if (!filtered || seen.has(filtered.surface)) continue;
    seen.add(filtered.surface);
    compatible.push(filtered);
  }
  return compatible;
}

function fillVoiceEntry(
  snapshot: SolveSessionSnapshot,
  puzzle: PuzzleDocument,
  index: PuzzleIndex,
  entry: Entry,
  answer: string,
  nowMs = Date.now(),
  intent?: VoiceAnswerIntent
): VoiceFillResult {
  if (snapshot.paused) return { ok: false, snapshot, reason: 'paused' };
  if (intent && (
    snapshot.puzzleId !== intent.puzzleId
    || voicePuzzleFingerprint(puzzle) !== intent.puzzleRevision
    || entry.id !== intent.entryId
    || voiceSessionFingerprint(snapshot) !== intent.sessionRevision
    || voiceEntryPattern(entry, snapshot) !== intent.pattern
  )) return { ok: false, snapshot, reason: 'stale-intent' };
  if (entryHasRebus(puzzle, entry)) return { ok: false, snapshot, reason: 'unsupported-rebus' };
  const compatible = filterVoiceCandidates(entry, snapshot, [{ surface: answer }]);
  const normalized = compatible[0]?.surface;
  if (!normalized) return { ok: false, snapshot, reason: 'incompatible-answer' };

  let next = selectCell(
    touchSession(snapshot, nowMs),
    index,
    entry.cellIds[0]!,
    entry.direction
  );
  for (const letter of normalized) {
    next = enterLetter(next, puzzle, index, letter);
  }
  return { ok: true, snapshot: next, answer: normalized };
}

export function confirmVoiceEntry(
  snapshot: SolveSessionSnapshot,
  puzzle: PuzzleDocument,
  index: PuzzleIndex,
  entry: Entry,
  answer: string,
  intent: VoiceAnswerIntent,
  nowMs = Date.now()
): VoiceFillResult {
  const currentEntries = puzzle.entries.filter((candidate) => candidate.id === intent.entryId);
  const currentEntry = currentEntries.length === 1 ? currentEntries[0] : undefined;
  if (!currentEntry || entry.id !== intent.entryId) return { ok: false, snapshot, reason: 'stale-intent' };
  return fillVoiceEntry(snapshot, puzzle, index, currentEntry, answer, nowMs, intent);
}