import type {
  CellId,
  Direction,
  Entry,
  EntryId,
  PuzzleIndex,
  SolveSessionSnapshot
} from '@crossword/domain';

export type ClueLane = 'outer' | 'inner';

export type CluePlacement = Readonly<{
  entryId: EntryId;
  lane: ClueLane;
  row: number;
}>;

export type CompletionPolicy = 'visible' | 'collapsed' | 'hidden';

export type ClueRowState = 'active' | 'affected' | 'solved' | 'error' | 'idle';

/**
 * Stable placement (docs/plans/06 §6): lane and row are computed once from
 * the ordered entries for a direction. Completion, filtering, and nudges
 * must never mutate placement — spatial memory is a product invariant.
 */
export function placeEntries(entries: readonly Entry[]): readonly CluePlacement[] {
  return entries.map((entry, position) => ({
    entryId: entry.id,
    lane: position % 2 === 0 ? 'outer' : 'inner',
    row: Math.floor(position / 2)
  }));
}

export function isEntrySolved(entry: Entry, session: SolveSessionSnapshot): boolean {
  return entry.cellIds.length > 0 && entry.cellIds.every((cellId) => Boolean(session.entered[cellId]));
}

/**
 * Active-entry crossing map (docs/plans/06 §7.2): every entry of the
 * opposite direction that intersects the active entry, mapped to its exact
 * shared cell ids. Derived from PuzzleIndex — never a second selection model.
 */
export function activeCrossingCells(
  index: PuzzleIndex,
  session: SolveSessionSnapshot
): ReadonlyMap<EntryId, readonly CellId[]> {
  const shared = new Map<EntryId, CellId[]>();
  const active = index.entriesById.get(session.selection.entryId);
  if (!active) return shared;
  const other: Direction = active.direction === 'across' ? 'down' : 'across';
  for (const cellId of active.cellIds) {
    const crossingId = index.entryAt.get(cellId)?.[other];
    if (!crossingId || crossingId === active.id) continue;
    const cells = shared.get(crossingId);
    if (cells) cells.push(cellId);
    else shared.set(crossingId, [cellId]);
  }
  return shared;
}

export function clueRowState(
  entry: Entry,
  session: SolveSessionSnapshot,
  incorrectCellIds: readonly CellId[],
  sharedCells: ReadonlyMap<EntryId, readonly CellId[]>
): { state: ClueRowState; sharedCellIds: readonly CellId[] } {
  const sharedCellIds = sharedCells.get(entry.id) ?? [];
  const hasError = entry.cellIds.some((cellId) => incorrectCellIds.includes(cellId));
  // Precedence: error > solved > active > affected > idle. Solved outranks
  // active so a just-completed entry quiets immediately (the legacy
  // opening-up effect) even while the selection still rests inside it.
  if (hasError) return { state: 'error', sharedCellIds };
  if (isEntrySolved(entry, session)) return { state: 'solved', sharedCellIds };
  if (session.selection.entryId === entry.id) return { state: 'active', sharedCellIds };
  if (sharedCellIds.length > 0) return { state: 'affected', sharedCellIds };
  return { state: 'idle', sharedCellIds };
}
