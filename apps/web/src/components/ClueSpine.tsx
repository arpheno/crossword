import {
  patternForEntry,
  type CellId,
  type Direction,
  type Entry,
  type PuzzleIndex
} from '@crossword/domain';
import type { CSSProperties } from 'react';
import type { SolveSessionSnapshot } from '@crossword/domain';

type ClueSpineProps = {
  direction: Direction;
  entries: readonly Entry[];
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  incorrectCellIds: readonly CellId[];
  side: 'left' | 'right';
  onSelectEntry: (entry: Entry) => void;
  onSelectPattern: (entry: Entry, position: number) => void;
};

function isSolved(entry: Entry, session: SolveSessionSnapshot): boolean {
  return entry.cellIds.every((cellId) => Boolean(session.entered[cellId]));
}

function ClueItem({
  entry,
  index,
  session,
  incorrectCellIds,
  onSelectEntry,
  onSelectPattern,
  style
}: {
  entry: Entry;
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  incorrectCellIds: readonly CellId[];
  onSelectEntry: (entry: Entry) => void;
  onSelectPattern: (entry: Entry, position: number) => void;
  style?: CSSProperties;
}) {
  const active = session.selection.entryId === entry.id;
  const solved = isSolved(entry, session);
  const pattern = patternForEntry(entry, session);
  const hasIncorrect = entry.cellIds.some((cellId) => incorrectCellIds.includes(cellId));
  const firstOpen = entry.cellIds.find((cellId) => !session.entered[cellId]) ?? entry.cellIds[0];

  return (
    <li className={`clue-item ${active ? 'is-active' : ''} ${solved ? 'is-solved' : ''} ${hasIncorrect ? 'has-error' : ''}`} style={style}>
      <button
        aria-current={active ? 'true' : undefined}
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
          return (
            <button
              aria-label={`${entry.direction} ${entry.number}, letter ${position + 1}, ${letter === '_' ? 'empty' : letter}`}
              className={`pattern-position ${selected ? 'is-selected' : ''} ${cell?.circled ? 'is-circled' : ''}`}
              key={cellId}
              onClick={() => onSelectPattern(entry, position)}
              type="button"
            >
              {letter === '_' ? '.' : letter}
            </button>
          );
        })}
      </div>
      {firstOpen && <span className="sr-only">First unresolved cell available.</span>}
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
  onSelectEntry,
  onSelectPattern
}: ClueSpineProps) {
  const laneEntries = entries.map((entry, position) => ({
    entry,
    lane: position % 2 === 0 ? 'outer' : 'inner',
    row: Math.floor(position / 2) + 1
  }));
  const rows = Math.max(1, Math.ceil(entries.length / 2));

  return (
    <aside
      className={`clue-spine clue-spine-${side} direction-${direction} ${session.selection.direction === direction ? 'is-direction-active' : ''}`}
      aria-label={`${direction} clues`}
    >
      <div className="spine-heading">
        <span>{direction}</span>
        <span>{entries.length.toString().padStart(2, '0')} entries</span>
      </div>
      <div className="spine-layout" style={{ gridTemplateRows: `repeat(${rows}, minmax(82px, auto))` }}>
        <ol className="clue-lane lane-outer">
          {laneEntries.filter(({ lane }) => lane === 'outer').map(({ entry, row }) => (
            <ClueItem
              entry={entry}
              index={index}
              incorrectCellIds={incorrectCellIds}
              key={entry.id}
              onSelectEntry={onSelectEntry}
              onSelectPattern={onSelectPattern}
              session={session}
              style={{ gridRow: row }}
            />
          ))}
        </ol>
        <div className="number-spine" aria-hidden="true">
          {Array.from({ length: rows }, (_, row) => {
            const first = laneEntries[row * 2]?.entry.number;
            const second = laneEntries[row * 2 + 1]?.entry.number;
            return <span key={row}>{first}{second ? ` / ${second}` : ''}</span>;
          })}
        </div>
        <ol className="clue-lane lane-inner">
          {laneEntries.filter(({ lane }) => lane === 'inner').map(({ entry, row }) => (
            <ClueItem
              entry={entry}
              index={index}
              incorrectCellIds={incorrectCellIds}
              key={entry.id}
              onSelectEntry={onSelectEntry}
              onSelectPattern={onSelectPattern}
              session={session}
              style={{ gridRow: row }}
            />
          ))}
        </ol>
      </div>
    </aside>
  );
}
