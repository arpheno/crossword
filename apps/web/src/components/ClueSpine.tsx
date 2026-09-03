import {
  patternForEntry,
  type CellId,
  type Direction,
  type Entry,
  type PuzzleIndex
} from '@crossword/domain';
import type { SolveSessionSnapshot } from '@crossword/domain';
import type { CSSProperties } from 'react';
import {
  activeCrossingCells,
  clueRowState,
  isEntrySolved,
  placeEntries,
  type CompletionPolicy
} from '../cluePlacement';

type ClueSpineProps = {
  direction: Direction;
  entries: readonly Entry[];
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  incorrectCellIds: readonly CellId[];
  side: 'left' | 'right';
  completionPolicy?: CompletionPolicy;
  onSelectEntry: (entry: Entry) => void;
  onSelectPattern: (entry: Entry, position: number) => void;
};

function ClueItem({
  entry,
  index,
  session,
  state,
  sharedCellIds,
  collapsed,
  lane,
  row,
  onSelectEntry,
  onSelectPattern,
  style
}: {
  entry: Entry;
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  state: string;
  sharedCellIds: readonly CellId[];
  collapsed: boolean;
  lane: 'outer' | 'inner';
  row: number;
  onSelectEntry: (entry: Entry) => void;
  onSelectPattern: (entry: Entry, position: number) => void;
  style?: CSSProperties;
}) {
  const solved = state === 'solved';
  const pattern = patternForEntry(entry, session);

  return (
    <li
      aria-label={`${entry.number} ${entry.direction}, ${state}${collapsed ? ', collapsed' : ''}`}
      className={`clue-item ${state === 'active' ? 'is-active' : ''} ${state === 'affected' ? 'is-affected' : ''} ${solved ? 'is-solved' : ''} ${state === 'error' ? 'has-error' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      data-collapsed={collapsed ? 'true' : undefined}
      data-entry-id={entry.id}
      data-lane={lane}
      data-row={row}
      data-state={state}
      style={style}
    >
      {/* Spoken-workflow number: one player says "17 across", the other finds
          it instantly. Lives at the seam edge of every row, legacy-style. */}
      <span aria-hidden="true" className="clue-number-tag">{entry.number}</span>
      <button
        aria-current={state === 'active' ? 'true' : undefined}
        aria-label={`${entry.number} ${entry.direction}: ${entry.clue}${solved ? ', solved' : ''}`}
        className="clue-select"
        onClick={() => onSelectEntry(entry)}
        type="button"
      >
        <span className="clue-copy">
          <span className="clue-text">{entry.clue}</span>
          <span className="clue-meta">{entry.direction} / {entry.cellIds.length} letters</span>
        </span>
        <span aria-hidden="true" className="clue-mark">{solved ? '[done]' : ''}</span>
      </button>
      <div className="answer-pattern" aria-label={`${entry.number} answer pattern`}>
        {pattern.map((letter, position) => {
          const cellId = entry.cellIds[position];
          if (!cellId) return null;
          const cell = index.cellsById.get(cellId);
          const selected = session.selection.cellId === cellId;
          const crossing = sharedCellIds.includes(cellId);
          return (
            <button
              aria-label={`${entry.direction} ${entry.number}, letter ${position + 1}, ${letter === '_' ? 'empty' : letter}${crossing ? ', crossing the selected entry' : ''}`}
              className={`pattern-position ${selected ? 'is-selected' : ''} ${crossing ? 'is-crossing' : ''} ${cell?.circled ? 'is-circled' : ''}`}
              data-cell-id={cellId}
              data-crossing={crossing ? 'true' : undefined}
              key={cellId}
              onClick={() => onSelectPattern(entry, position)}
              type="button"
            >
              {letter === '_' ? '.' : letter}
            </button>
          );
        })}
      </div>
    </li>
  );
}

export function ClueSpine({
  direction,
  entries,
  index,
  session,
  incorrectCellIds,
  side,
  completionPolicy = 'collapsed',
  onSelectEntry,
  onSelectPattern
}: ClueSpineProps) {
  const policy: CompletionPolicy = completionPolicy;
  const sharedCells = activeCrossingCells(index, session);
  const solvedByEntry = new Map(entries.map((entry) => [entry.id, isEntrySolved(entry, session)]));

  // 'hidden' is the one policy allowed to reflow: the player explicitly
  // requested reclaiming space (docs/plans/06 §6.3).
  const visibleEntries = policy === 'hidden'
    ? entries.filter((entry) => !solvedByEntry.get(entry.id))
    : entries;
  const placed = placeEntries(visibleEntries);
  const rows = Math.max(1, Math.ceil(placed.length / 2));

  // 'collapsed' keeps every footprint; a row shrinks only when BOTH of its
  // paired entries are solved, so the paired spine never tears (§6.3).
  const collapsedRows = new Set<number>();
  if (policy === 'collapsed') {
    for (let row = 0; row < rows; row += 1) {
      const pair = placed.filter((placement) => placement.row === row);
      if (pair.length > 0 && pair.every((placement) => solvedByEntry.get(placement.entryId))) {
        collapsedRows.add(row);
      }
    }
  }
  const rowTemplate = collapsedRows.size > 0
    ? Array.from({ length: rows }, (_, row) => (collapsedRows.has(row) ? '34px' : 'minmax(82px, auto)')).join(' ')
    : `repeat(${rows}, minmax(82px, auto))`;

  return (
    <aside
      className={`clue-spine clue-spine-${side} direction-${direction} ${session.selection.direction === direction ? 'is-direction-active' : ''}`}
      aria-label={`${direction} clues`}
      data-direction={direction}
    >
      <div className="spine-heading">
        <span>{direction}</span>
        <span>{placed.length.toString().padStart(2, '0')} entries</span>
      </div>
      <div className="spine-layout" style={{ gridTemplateRows: rowTemplate }}>
        <ol className="clue-lane lane-outer">
          {placed.filter(({ lane }) => lane === 'outer').map(({ entryId, row }) => {
            const entry = entries.find((candidate) => candidate.id === entryId);
            if (!entry) return null;
            const { state, sharedCellIds } = clueRowState(entry, session, incorrectCellIds, sharedCells);
            const collapsed = policy === 'collapsed' && solvedByEntry.get(entry.id) === true;
            return (
              <ClueItem
                collapsed={collapsed}
                entry={entry}
                index={index}
                key={entryId}
                lane="outer"
                onSelectEntry={onSelectEntry}
                onSelectPattern={onSelectPattern}
                row={row + 1}
                session={session}
                sharedCellIds={sharedCellIds}
                state={state}
                style={{ gridRow: row + 1 }}
              />
            );
          })}
        </ol>
        <div className="number-spine" aria-hidden="true" />
        <ol className="clue-lane lane-inner">
          {placed.filter(({ lane }) => lane === 'inner').map(({ entryId, row }) => {
            const entry = entries.find((candidate) => candidate.id === entryId);
            if (!entry) return null;
            const { state, sharedCellIds } = clueRowState(entry, session, incorrectCellIds, sharedCells);
            const collapsed = policy === 'collapsed' && solvedByEntry.get(entry.id) === true;
            return (
              <ClueItem
                collapsed={collapsed}
                entry={entry}
                index={index}
                key={entryId}
                lane="inner"
                onSelectEntry={onSelectEntry}
                onSelectPattern={onSelectPattern}
                row={row + 1}
                session={session}
                sharedCellIds={sharedCellIds}
                state={state}
                style={{ gridRow: row + 1 }}
              />
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
