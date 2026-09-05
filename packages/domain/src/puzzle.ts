export type Direction = 'across' | 'down';
export type CellId = string & { readonly __brand: 'CellId' };
export type EntryId = string & { readonly __brand: 'EntryId' };
export type PuzzleId = string & { readonly __brand: 'PuzzleId' };
export type PuzzleSource = 'synthetic-fixture' | 'local-construction' | 'import';
export type ClueMechanism = 'direct' | 'standard' | 'oblique' | 'nudge';

export type ClueVariant = Readonly<{
  mechanism: ClueMechanism;
  text: string;
  difficulty: number;
}>;

export type ClueSet = Readonly<{
  entryId: EntryId;
  variants: readonly ClueVariant[];
}>;

export type ProvenanceRecord = Readonly<{
  id: string;
  kind: 'fixture' | 'lexicon' | 'fact' | 'model';
  source: string;
  license: string;
  digest: string;
}>;

export type GenerationReceipt = Readonly<{
  modelId: string;
  promptVersion: string;
  lexiconVersion: string;
  solverVersion: string;
  generatedAt: string;
  restartCount: number;
  /**
   * Deterministic fill evidence carried into the published manifest
   * (CI-P0-2, ADR 0009). Optional so existing manifests stay valid.
   */
  fill?: Readonly<{
    attempt: number;
    seed: string;
    terminationReason: string;
    provenOptimal: boolean;
    nodesExplored: number;
    bestBound: number | null;
    gap: number | null;
    incumbentScore: number | null;
    elapsedMs: number;
  }>;
}>;

export type QualityReport = Readonly<{
  score: number;
  thresholds: Readonly<Record<string, number>>;
  validators: readonly string[];
}>;

export type IntegrityDigest = Readonly<{
  algorithm: 'sha256';
  value: string;
}>;

export type Cell = Readonly<{
  id: CellId;
  row: number;
  column: number;
  block: boolean;
  circled: boolean;
  shaded: boolean;
  rebus?: string;
}>;

export type Entry = Readonly<{
  id: EntryId;
  number: number;
  direction: Direction;
  cellIds: readonly CellId[];
  answer: string;
  clue: string;
}>;

export type PuzzleTopology = Readonly<{
  width: number;
  height: number;
  blockedCellIds: readonly CellId[];
  minEntryLength: number;
}>;

export type PuzzleProvenance = Readonly<{
  source: PuzzleSource;
  recipeId: string;
  records: readonly ProvenanceRecord[];
}>;

export type PuzzleDocument = Readonly<{
  schemaVersion: 1;
  id: PuzzleId;
  seed: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  cells: readonly Cell[];
  entries: readonly Entry[];
  clues: readonly ClueSet[];
  provenance: PuzzleProvenance;
  generation: GenerationReceipt;
  quality: QualityReport;
  integrity: IntegrityDigest;
  topology: PuzzleTopology;
  createdBy: PuzzleSource;
}>;

export type PuzzleManifest = PuzzleDocument;

export function normalizeCrosswordAnswer(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '');
}

export function isSupportedCrosswordAnswer(value: string): boolean {
  const normalized = value.trim().toUpperCase().replace(/[\u2018\u2019]/g, "'");
  return /^[A-Z]+(?:[\s'-]+[A-Z]+)*$/.test(normalized);
}

export type PuzzleIndex = Readonly<{
  cellsById: ReadonlyMap<CellId, Cell>;
  entriesById: ReadonlyMap<EntryId, Entry>;
  entryAt: ReadonlyMap<string, Readonly<{ across?: EntryId; down?: EntryId }>>;
  intersections: ReadonlyMap<string, Readonly<{ across?: EntryId; down?: EntryId }>>;
  numberByCellId: ReadonlyMap<CellId, number>;
}>;

const asCellId = (value: string): CellId => value as CellId;
const asEntryId = (value: string): EntryId => value as EntryId;
const asPuzzleId = (value: string): PuzzleId => value as PuzzleId;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCellId(value: unknown): value is CellId {
  return typeof value === 'string' && value.length > 0;
}

function isEntryId(value: unknown): value is EntryId {
  return typeof value === 'string' && value.length > 0;
}

function isDirection(value: unknown): value is Direction {
  return value === 'across' || value === 'down';
}

function isPuzzleSource(value: unknown): value is PuzzleSource {
  return value === 'synthetic-fixture' || value === 'local-construction' || value === 'import';
}

function isClueMechanism(value: unknown): value is ClueMechanism {
  return value === 'direct' || value === 'standard' || value === 'oblique' || value === 'nudge';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function coordinatesAreContiguous(puzzle: PuzzleDocument, entry: Entry): boolean {
  const cellsById = new Map(puzzle.cells.map((cell) => [cell.id, cell] as const));
  return entry.cellIds.every((cellId, position) => {
    const current = cellsById.get(cellId);
    const previousId = entry.cellIds[position - 1];
    const previous = previousId ? cellsById.get(previousId) : undefined;
    if (!current) return false;
    if (!previous) return true;
    return entry.direction === 'across'
      ? current.row === previous.row && current.column === previous.column + 1
      : current.column === previous.column && current.row === previous.row + 1;
  });
}

function entryStartsAtBoundary(puzzle: PuzzleDocument, entry: Entry): boolean {
  const first = puzzle.cells.find((cell) => cell.id === entry.cellIds[0]);
  const last = puzzle.cells.find((cell) => cell.id === entry.cellIds.at(-1));
  if (!first || !last) return false;
  const before = entry.direction === 'across'
    ? puzzle.cells.find((cell) => cell.row === first.row && cell.column === first.column - 1)
    : puzzle.cells.find((cell) => cell.column === first.column && cell.row === first.row - 1);
  const after = entry.direction === 'across'
    ? puzzle.cells.find((cell) => cell.row === last.row && cell.column === last.column + 1)
    : puzzle.cells.find((cell) => cell.column === last.column && cell.row === last.row + 1);
  return !before || before.block ? !after || after.block : false;
}

export function deriveEntryNumbers(puzzle: PuzzleDocument): ReadonlyMap<CellId, number> {
  const starts = [...new Set(puzzle.entries.map((entry) => entry.cellIds[0]).filter(isCellId))]
    .map((cellId) => puzzle.cells.find((cell) => cell.id === cellId))
    .filter((cell): cell is Cell => Boolean(cell))
    .sort((left, right) => left.row - right.row || left.column - right.column);
  return new Map(starts.map((cell, position) => [cell.id, position + 1] as const));
}

export function validatePuzzle(value: unknown): value is PuzzleDocument {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.seed !== 'string') return false;
  if (typeof value.title !== 'string' || typeof value.subtitle !== 'string') return false;
  if (typeof value.width !== 'number' || typeof value.height !== 'number' || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1) return false;
  if (!Array.isArray(value.cells) || !Array.isArray(value.entries)) return false;
  if (!Array.isArray(value.clues)) return false;
  if (!isRecord(value.provenance) || !isPuzzleSource(value.provenance.source) || !isNonEmptyString(value.provenance.recipeId) || !Array.isArray(value.provenance.records)) return false;
  const generation = value.generation;
  if (!isRecord(generation) || !isNonEmptyString(generation.modelId) || !isNonEmptyString(generation.promptVersion) || !isNonEmptyString(generation.lexiconVersion) || !isNonEmptyString(generation.solverVersion) || !isNonEmptyString(generation.generatedAt) || typeof generation.restartCount !== 'number' || !Number.isInteger(generation.restartCount) || generation.restartCount < 0) return false;
  if (generation.fill !== undefined) {
    const fill = generation.fill as Record<string, unknown>;
    if (!isRecord(generation.fill) || !isNonEmptyString(fill.terminationReason) || typeof fill.provenOptimal !== 'boolean' || typeof fill.nodesExplored !== 'number' || !Number.isInteger(fill.nodesExplored) || fill.nodesExplored < 0 || typeof fill.elapsedMs !== 'number' || !Number.isFinite(fill.elapsedMs) || fill.elapsedMs < 0 || typeof fill.attempt !== 'number' || !Number.isInteger(fill.attempt) || fill.attempt < 0 || !isNonEmptyString(fill.seed)) return false;
    if (fill.bestBound !== null && typeof fill.bestBound !== 'number') return false;
    if (fill.gap !== null && typeof fill.gap !== 'number') return false;
    if (fill.incumbentScore !== null && typeof fill.incumbentScore !== 'number') return false;
  }
  if (!isRecord(value.quality) || typeof value.quality.score !== 'number' || !Number.isFinite(value.quality.score) || !isRecord(value.quality.thresholds) || !Array.isArray(value.quality.validators) || !value.quality.validators.every(isNonEmptyString)) return false;
  if (!isRecord(value.integrity) || value.integrity.algorithm !== 'sha256' || !isNonEmptyString(value.integrity.value)) return false;
  if (!isRecord(value.topology) || value.topology.width !== value.width || value.topology.height !== value.height) return false;
  if (typeof value.topology.minEntryLength !== 'number' || !Number.isInteger(value.topology.minEntryLength) || value.topology.minEntryLength < 1) return false;
  if (!Array.isArray(value.topology.blockedCellIds) || !value.topology.blockedCellIds.every(isCellId)) return false;
  if (!isPuzzleSource(value.createdBy) || value.createdBy !== value.provenance.source) return false;

  const cells = value.cells as Cell[];
  const entries = value.entries as Entry[];
  const provenanceRecords = value.provenance.records as ProvenanceRecord[];
  if (provenanceRecords.some((record) => !isRecord(record) || !isNonEmptyString(record.id) || !['fixture', 'lexicon', 'fact', 'model'].includes(record.kind as string) || !isNonEmptyString(record.source) || !isNonEmptyString(record.license) || !isNonEmptyString(record.digest))) return false;
  if (cells.length !== value.width * value.height) return false;
  const cellIds = new Set<CellId>();
  const coordinates = new Set<string>();
  for (const cell of cells) {
    if (!isRecord(cell) || !isCellId(cell.id) || cellIds.has(cell.id)) return false;
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column)) return false;
    if (cell.row < 0 || cell.row >= value.height || cell.column < 0 || cell.column >= value.width) return false;
    if (typeof cell.block !== 'boolean' || typeof cell.circled !== 'boolean' || typeof cell.shaded !== 'boolean') return false;
    if (cell.rebus !== undefined && typeof cell.rebus !== 'string') return false;
    const coordinateKey = `${cell.row}:${cell.column}`;
    if (coordinates.has(coordinateKey)) return false;
    cellIds.add(cell.id);
    coordinates.add(coordinateKey);
  }
  const blockedCellIds = new Set(value.topology.blockedCellIds as CellId[]);
  if (blockedCellIds.size !== value.topology.blockedCellIds.length) return false;
  if (![...blockedCellIds].every((cellId) => cellIds.has(cellId))) return false;
  if (cells.filter((cell) => cell.block).some((cell) => !blockedCellIds.has(cell.id))) return false;
  if (cells.filter((cell) => cell.block).length !== blockedCellIds.size) return false;

  const entryIds = new Set<EntryId>();
  const numbers = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entryIds.has(entry.id as EntryId)) return false;
    const numberKey = `${entry.direction}:${entry.number}`;
    if (!Number.isInteger(entry.number) || entry.number < 1 || numbers.has(numberKey)) return false;
    if (!isDirection(entry.direction) || !Array.isArray(entry.cellIds) || entry.cellIds.length < value.topology.minEntryLength) return false;
    if (!entry.cellIds.every((cellId) => cellIds.has(cellId))) return false;
    if (new Set(entry.cellIds).size !== entry.cellIds.length) return false;
    if (typeof entry.answer !== 'string' || entry.answer.length !== entry.cellIds.length || typeof entry.clue !== 'string' || !entry.clue) return false;
    entryIds.add(entry.id as EntryId);
    numbers.add(numberKey);
  }

  const candidate = value as PuzzleDocument;
  if (!entries.every((entry) => coordinatesAreContiguous(candidate, entry) && entryStartsAtBoundary(candidate, entry))) return false;
  const numberByCellId = deriveEntryNumbers(candidate);
  if (!entries.every((entry) => numberByCellId.get(entry.cellIds[0]!) === entry.number)) return false;

  const answerByCell = new Map<CellId, string>();
  for (const entry of entries) {
    for (const [position, cellId] of entry.cellIds.entries()) {
      const letter = entry.answer[position];
      if (!letter) return false;
      const previous = answerByCell.get(cellId);
      if (previous && previous !== letter) return false;
      answerByCell.set(cellId, letter);
    }
  }

  const clueEntryIds = new Set<EntryId>();
  for (const clueSet of value.clues) {
    if (!isRecord(clueSet) || !isEntryId(clueSet.entryId) || clueEntryIds.has(clueSet.entryId) || !Array.isArray(clueSet.variants) || clueSet.variants.length === 0 || !entries.some((entry) => entry.id === clueSet.entryId)) return false;
    clueEntryIds.add(clueSet.entryId);
    if (!clueSet.variants.every((variant) => isRecord(variant) && isClueMechanism(variant.mechanism) && isNonEmptyString(variant.text) && typeof variant.difficulty === 'number' && Number.isFinite(variant.difficulty) && variant.difficulty >= 0 && variant.difficulty <= 1)) return false;
  }
  if (clueEntryIds.size !== entries.length) return false;

  const entryAt = new Map<string, { across?: EntryId; down?: EntryId }>();
  for (const entry of entries) {
    for (const cellId of entry.cellIds) {
      const current = entryAt.get(cellId) ?? {};
      if (current[entry.direction]) return false;
      entryAt.set(cellId, { ...current, [entry.direction]: entry.id as EntryId });
    }
  }
  return cells.filter((cell) => !cell.block).every((cell) => {
    const membership = entryAt.get(cell.id);
    return Boolean(membership?.across && membership.down);
  });
}

export function assertValidPuzzle(value: unknown): asserts value is PuzzleDocument {
  if (!validatePuzzle(value)) {
    throw new Error('Invalid puzzle manifest or topology');
  }
}

export function serializePuzzle(puzzle: PuzzleDocument): string {
  assertValidPuzzle(puzzle);
  return JSON.stringify(puzzle);
}

export function parsePuzzle(serialized: string): PuzzleDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Puzzle manifest is not valid JSON');
  }
  assertValidPuzzle(value);
  return value;
}

export function indexPuzzle(puzzle: PuzzleDocument): PuzzleIndex {
  assertValidPuzzle(puzzle);
  const cellsById = new Map(puzzle.cells.map((cell) => [cell.id, cell] as const));
  const entriesById = new Map(puzzle.entries.map((entry) => [entry.id, entry] as const));
  const entryAt = new Map<string, { across?: EntryId; down?: EntryId }>();

  for (const entry of puzzle.entries) {
    for (const cellId of entry.cellIds) {
      const current = entryAt.get(cellId) ?? {};
      entryAt.set(cellId, { ...current, [entry.direction]: entry.id });
    }
  }

  const numberByCellId = deriveEntryNumbers(puzzle);
  return { cellsById, entriesById, entryAt, intersections: entryAt, numberByCellId };
}

export function createFixturePuzzle(): PuzzleDocument {
  const answers = ['CARE', 'AREA', 'REAR', 'EARN'];
  const clues = [
    'Attention or concern',
    'Region or space',
    'Raise, or a back part',
    'Gain through work'
  ];
  const cells: Cell[] = [];

  for (let row = 0; row < answers.length; row += 1) {
    const answer = answers[row];
    if (!answer) {
      throw new Error(`Missing fixture answer for row ${row}`);
    }
    for (let column = 0; column < answer.length; column += 1) {
      cells.push({
        id: asCellId(`cell-${row}-${column}`),
        row,
        column,
        block: false,
        circled: (row === 0 && column === 0) || (row === 3 && column === 3),
        shaded: row === 2 && column === 1
      });
    }
  }

  const entries: Entry[] = [];
  let number = 1;
  for (let row = 0; row < answers.length; row += 1) {
    const answer = answers[row];
    const clue = clues[row];
    if (!answer || !clue) {
      throw new Error(`Incomplete fixture row ${row}`);
    }
    entries.push({
      id: asEntryId(`entry-across-${row}`),
      number: [1, 5, 6, 7][row] ?? number,
      direction: 'across',
      cellIds: answer.split('').map((_, column) => asCellId(`cell-${row}-${column}`)),
      answer,
      clue
    });
    number += 1;
  }

  for (let column = 0; column < answers.length; column += 1) {
    const answer = answers.map((row) => row?.[column] ?? '').join('');
    entries.push({
      id: asEntryId(`entry-down-${column}`),
      number: column + 1,
      direction: 'down',
      cellIds: answers.map((_, row) => asCellId(`cell-${row}-${column}`)),
      answer,
      clue: clues[column] ?? 'A crossing answer'
    });
  }

  return {
    schemaVersion: 1,
    id: asPuzzleId('fixture-word-square-001'),
    seed: 'fixture-word-square-seed',
    title: 'A Small Beginning',
    subtitle: 'A four-by-four practice grid',
    width: 4,
    height: 4,
    cells,
    entries,
    clues: entries.map((entry) => ({
      entryId: entry.id,
      variants: [{ mechanism: 'direct', text: entry.clue, difficulty: 0.2 }]
    })),
    provenance: {
      source: 'synthetic-fixture',
      recipeId: 'fixture-word-square',
      records: [{
        id: 'fixture-word-square-record',
        kind: 'fixture',
        source: 'crossword synthetic fixture pack',
        license: 'MIT',
        digest: 'fixture-word-square-v1'
      }]
    },
    generation: {
      modelId: 'none-fixture',
      promptVersion: 'fixture-v1',
      lexiconVersion: 'fixture-v1',
      solverVersion: 'fixture-v1',
      generatedAt: '2026-01-01T00:00:00.000Z',
      restartCount: 0
    },
    quality: {
      score: 1,
      thresholds: { crossings: 1, provenance: 1 },
      validators: ['topology', 'crossings', 'fixture-provenance']
    },
    integrity: { algorithm: 'sha256', value: 'fixture-word-square-v1' },
    topology: {
      width: 4,
      height: 4,
      blockedCellIds: [],
      minEntryLength: 3
    },
    createdBy: 'synthetic-fixture'
  };
}

type RealSlot = Readonly<{
  row: number;
  column: number;
  answer: string;
  clue: string;
}>;

const realPuzzleMask = [
  '....#....#.....',
  '....#....#.....',
  '....#....#.....',
  '...........#...',
  '####...#...#...',
  '......#......##',
  '.....#....#....',
  '.....#...#.....',
  '....#....#.....',
  '##......#......',
  '...#...#...####',
  '...#...........',
  '.....#....#....',
  '.....#....#....',
  '.....#....#....'
] as const;

const realAcrossSlots: readonly RealSlot[] = [
  { row: 0, column: 0, answer: 'ABAB', clue: 'Alternating pattern in a four-beat phrase' },
  { row: 0, column: 5, answer: 'ACAN', clue: 'Container, with an indefinite article folded in' },
  { row: 0, column: 10, answer: 'AANDE', clue: 'A pair of vowels around a consonant' },
  { row: 1, column: 0, answer: 'CABO', clue: 'Peninsula prefix often paired with San Lucas' },
  { row: 1, column: 5, answer: 'DOTO', clue: 'A tiny musical pair, informally' },
  { row: 1, column: 10, answer: 'BAAED', clue: 'A baroque musical phrase, perhaps' },
  { row: 2, column: 0, answer: 'DIOS', clue: 'Spanish word for a deity' },
  { row: 2, column: 5, answer: 'ACAT', clue: 'A feline preceded by a small article' },
  { row: 2, column: 10, answer: 'HAIFA', clue: 'Israeli port city' },
  { row: 3, column: 0, answer: 'COUCHPOTATO', clue: 'Person who prefers the sofa to the gym' },
  { row: 3, column: 12, answer: 'LAM', clue: 'Strike suddenly, or flee' },
  { row: 4, column: 4, answer: 'ATA', clue: 'Association of travel agencies, briefly' },
  { row: 4, column: 8, answer: 'SER', clue: 'To be, in Spanish' },
  { row: 4, column: 12, answer: 'BTS', clue: 'Pop group behind "Dynamite," for short' },
  { row: 5, column: 0, answer: 'EMBEDS', clue: 'Places snugly inside' },
  { row: 5, column: 7, answer: 'AGASSI', clue: 'Tennis star Andre' },
  { row: 6, column: 0, answer: 'PAOLO', clue: 'Sorrentino\'s first name' },
  { row: 6, column: 6, answer: 'AMOK', clue: 'Wildly out of control' },
  { row: 6, column: 11, answer: 'TTAB', clue: 'Two table tabs, in a spreadsheet' },
  { row: 7, column: 0, answer: 'AUXIN', clue: 'Plant-growth hormone' },
  { row: 7, column: 6, answer: 'BAO', clue: 'Steamed bun' },
  { row: 7, column: 10, answer: 'ALITO', clue: 'Justice Samuel, by surname' },
  { row: 8, column: 0, answer: 'DICE', clue: 'Cubes used in games' },
  { row: 8, column: 5, answer: 'ADHD', clue: 'Attention disorder, briefly' },
  { row: 8, column: 10, answer: 'GENES', clue: 'Units of heredity' },
  { row: 9, column: 2, answer: 'USEFUL', clue: 'Handy' },
  { row: 9, column: 9, answer: 'SLOGAN', clue: 'Advertising catchphrase' },
  { row: 10, column: 0, answer: 'MET', clue: 'Encountered' },
  { row: 10, column: 4, answer: 'LAC', clue: 'Resin from an insect, or 100,000' },
  { row: 10, column: 8, answer: 'FAO', clue: 'U.N. food agency initials' },
  { row: 11, column: 0, answer: 'ATT', clue: 'Telecom initials' },
  { row: 11, column: 4, answer: 'ARTHURWYNNE', clue: 'Creator credited with an early modern crossword' },
  { row: 12, column: 0, answer: 'CHERI', clue: 'Singer Currie of the Runaways' },
  { row: 12, column: 6, answer: 'ORSA', clue: 'A bear, in Italian' },
  { row: 12, column: 11, answer: 'AARP', clue: 'Retirement advocacy group initials' },
  { row: 13, column: 0, answer: 'AARON', clue: 'Biblical brother of Moses' },
  { row: 13, column: 6, answer: 'RASH', clue: 'Hasty, or a skin eruption' },
  { row: 13, column: 11, answer: 'DATO', clue: 'Information, in Spanish' },
  { row: 14, column: 0, answer: 'UNSEE', clue: 'Erase from mental sight' },
  { row: 14, column: 6, answer: 'SPYS', clue: 'Keeps watch, informally' },
  { row: 14, column: 11, answer: 'ANIS', clue: 'Licorice-flavored seeds'
  }
];

const realDownSlots: readonly RealSlot[] = [
  { row: 0, column: 0, answer: 'ACDC', clue: 'Rock band named for alternating current' },
  { row: 0, column: 1, answer: 'BAIO', clue: 'Actor Scott' },
  { row: 0, column: 2, answer: 'ABOU', clue: 'Start of a name in Arabic contexts' },
  { row: 0, column: 3, answer: 'BOSC', clue: 'Pear variety' },
  { row: 0, column: 5, answer: 'ADAPTS', clue: 'Adjusts to new conditions' },
  { row: 0, column: 6, answer: 'COCOA', clue: 'Chocolate drink' },
  { row: 0, column: 7, answer: 'ATAT', clue: 'Imperial walker, with punctuation removed' },
  { row: 0, column: 8, answer: 'NOTASGOOD', clue: 'Underwhelming comparison' },
  { row: 0, column: 10, answer: 'ABHORS', clue: 'Detests' },
  { row: 0, column: 11, answer: 'AAA', clue: 'Top rating, in brief' },
  { row: 0, column: 12, answer: 'NAILBITING', clue: 'Tense, as a finish' },
  { row: 0, column: 13, answer: 'DEFAT', clue: 'Remove grease from' },
  { row: 0, column: 14, answer: 'EDAMS', clue: 'Cheeses named for a Dutch town' },
  { row: 3, column: 4, answer: 'HADON', clue: 'Wore, in a two-word phrase' },
  { row: 3, column: 9, answer: 'TEAK', clue: 'Hard wood' },
  { row: 5, column: 0, answer: 'EPAD', clue: 'Electronic writing surface, perhaps' },
  { row: 5, column: 1, answer: 'MAUI', clue: 'Hawaiian island' },
  { row: 5, column: 2, answer: 'BOXCUTTERS', clue: 'Utility-knife plural' },
  { row: 5, column: 3, answer: 'ELIES', clue: 'Old-fashioned deceives' },
  { row: 5, column: 7, answer: 'AMAHL', clue: 'Opera title boy in a Menotti work' },
  { row: 5, column: 11, answer: 'STLEO', clue: 'A saint abbreviation plus a name' },
  { row: 6, column: 6, answer: 'ABDUCTORS', clue: 'Muscles that pull limbs inward' },
  { row: 6, column: 13, answer: 'ATEA', clue: 'Preposition and article, compressed' },
  { row: 6, column: 14, answer: 'BOSN', clue: 'Bosnia, in an abbreviation' },
  { row: 7, column: 10, answer: 'AGLOW', clue: 'Shining' },
  { row: 8, column: 5, answer: 'AFAR', clue: 'At a distance' },
  { row: 9, column: 4, answer: 'ELAINE', clue: 'Arthurian lady, or a Seinfeld name' },
  { row: 9, column: 9, answer: 'SARAHS', clue: 'Two women named Sarah, possessively' },
  { row: 10, column: 0, answer: 'MACAU', clue: 'Chinese gaming destination' },
  { row: 10, column: 1, answer: 'ETHAN', clue: 'Hawke or Hunt' },
  { row: 10, column: 8, answer: 'FUSSY', clue: 'Hard to please' },
  { row: 11, column: 7, answer: 'HRAP', clue: 'A hurried rap, compressed' },
  { row: 11, column: 11, answer: 'YADA', clue: 'Repetitive filler, as in blah blah' },
  { row: 11, column: 12, answer: 'NAAN', clue: 'Leavened flatbread' },
  { row: 11, column: 13, answer: 'NRTI', clue: 'Antiretroviral drug class, initially' },
  { row: 11, column: 14, answer: 'EPOS', clue: 'Long narrative poems' },
  { row: 12, column: 3, answer: 'ROE', clue: 'Deer offspring' }
];

function realCellId(row: number, column: number): CellId {
  return asCellId(`real-cell-${row}-${column}`);
}

function realEntryId(direction: Direction, number: number): EntryId {
  return asEntryId(`real-entry-${direction}-${number}`);
}

function createRealEntry(
  slot: RealSlot,
  direction: Direction,
  numberByStart: ReadonlyMap<string, number>
): Entry {
  const cells = Array.from({ length: slot.answer.length }, (_, position) => realCellId(
    slot.row + (direction === 'down' ? position : 0),
    slot.column + (direction === 'across' ? position : 0)
  ));
  const number = numberByStart.get(`${slot.row}:${slot.column}`);
  if (!number) throw new Error(`Missing number for ${direction} slot at ${slot.row}:${slot.column}`);
  return {
    id: realEntryId(direction, number),
    number,
    direction,
    cellIds: cells,
    answer: slot.answer,
    clue: slot.clue
  };
}

export function createRealPuzzle(): PuzzleDocument {
  const height = realPuzzleMask.length;
  const width = realPuzzleMask[0]?.length ?? 0;
  const numberByStart = new Map<string, number>();
  let nextNumber = 1;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (realPuzzleMask[row]?.[column] === '#') continue;
      const startsAcross = (column === 0 || realPuzzleMask[row]?.[column - 1] === '#')
        && column + 1 < width
        && realPuzzleMask[row]?.[column + 1] !== '#';
      const startsDown = (row === 0 || realPuzzleMask[row - 1]?.[column] === '#')
        && row + 1 < height
        && realPuzzleMask[row + 1]?.[column] !== '#';
      if (startsAcross || startsDown) {
        numberByStart.set(`${row}:${column}`, nextNumber);
        nextNumber += 1;
      }
    }
  }

  const cells: Cell[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      cells.push({
        id: realCellId(row, column),
        row,
        column,
        block: realPuzzleMask[row]?.[column] === '#',
        circled: false,
        shaded: false
      });
    }
  }

  const entries = [
    ...realAcrossSlots.map((slot) => createRealEntry(slot, 'across', numberByStart)),
    ...realDownSlots.map((slot) => createRealEntry(slot, 'down', numberByStart))
  ];
  const puzzle: PuzzleDocument = {
    schemaVersion: 1,
    id: asPuzzleId('local-crossword-001'),
    seed: 'local-crossword-001-seed',
    title: 'Crossing Signals',
    subtitle: 'A locally constructed fifteen-by-fifteen crossword',
    width,
    height,
    cells,
    entries,
    clues: entries.map((entry) => ({
      entryId: entry.id,
      variants: [{ mechanism: 'direct' as const, text: entry.clue, difficulty: 0.35 }]
    })),
    provenance: {
      source: 'local-construction',
      recipeId: 'local-crossword-mask-csp-v1',
      records: [
        {
          id: 'preferred-crossword-wordlist-v1',
          kind: 'lexicon',
          source: 'https://raw.githubusercontent.com/christophsjones/crossword-wordlist/refs/heads/master/crossword_wordlist.txt',
          license: 'NOASSERTION; no license stated by source repository',
          digest: '24c597c27f5396b4c84907ba6400d5c7bf249330558696110d84443d278697be'
        },
        {
          id: 'private-topology-mask-v1',
          kind: 'fact',
          source: 'Private topology reference; only the block mask was retained',
          license: 'NOASSERTION',
          digest: '969e204f1a60cd800664901700412f881178229b0d7e9dc8aa43f2249450f825'
        }
      ]
    },
    generation: {
      modelId: 'deterministic-csp',
      promptVersion: 'local-clues-v1',
      lexiconVersion: 'crossword-wordlist-2026-08-30',
      solverVersion: 'csp-v1',
      generatedAt: '2026-08-30T00:00:00.000Z',
      restartCount: 0
    },
    quality: {
      score: 0.82,
      thresholds: { crossings: 1, lexiconMembership: 1, provenance: 1, integrity: 1 },
      validators: ['topology', 'crossings', 'all-different', 'lexicon-membership', 'provenance', 'integrity']
    },
    integrity: { algorithm: 'sha256', value: '969e204f1a60cd800664901700412f881178229b0d7e9dc8aa43f2249450f825' },
    topology: {
      width,
      height,
      blockedCellIds: cells.filter((cell) => cell.block).map((cell) => cell.id),
      minEntryLength: 3
    },
    createdBy: 'local-construction'
  };
  assertValidPuzzle(puzzle);
  return puzzle;
}

export function createLargeFixturePuzzle(): PuzzleDocument {
  return createRealPuzzle();
}

export function getEntryForCell(
  index: PuzzleIndex,
  cellId: CellId,
  direction: Direction
): Entry | undefined {
  const entryId = index.entryAt.get(cellId)?.[direction];
  return entryId ? index.entriesById.get(entryId) : undefined;
}

export function getCellPosition(entry: Entry, cellId: CellId): number {
  const position = entry.cellIds.indexOf(cellId);
  if (position < 0) {
    throw new Error(`Cell ${cellId} does not belong to entry ${entry.id}`);
  }
  return position;
}
