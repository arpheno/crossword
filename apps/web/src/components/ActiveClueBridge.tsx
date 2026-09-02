import type { Entry, PuzzleIndex } from '@crossword/domain';
import { patternForEntry, type SolveSessionSnapshot } from '@crossword/domain';

type ActiveClueBridgeProps = {
  entry: Entry;
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  onSelectPattern: (entry: Entry, position: number) => void;
  onNudge: () => void;
};

/**
 * Active-clue bridge (docs/plans/06 §8.2, §15): bridges eye movement between
 * grid and spines in every layout mode. Owns the nearest Nudge action and
 * shows the crossing clue at the selected cell, subordinate.
 */
export function ActiveClueBridge({ entry, index, session, onSelectPattern, onNudge }: ActiveClueBridgeProps) {
  const pattern = patternForEntry(entry, session);
  const other: 'across' | 'down' = entry.direction === 'across' ? 'down' : 'across';
  const crossingId = index.entryAt.get(session.selection.cellId)?.[other];
  const crossing = crossingId ? index.entriesById.get(crossingId) : undefined;

  return (
    <section className="active-clue-bridge" aria-label="Active clue">
      <div className="bridge-primary">
        <span className="bridge-kicker">{entry.number} {entry.direction}</span>
        <p className="bridge-clue">{entry.clue}</p>
        <div className="dock-pattern bridge-pattern" aria-label="Active answer pattern">
          {pattern.map((letter, position) => {
            const cellId = entry.cellIds[position];
            const cell = cellId ? index.cellsById.get(cellId) : undefined;
            return (
              <button
                className={`${cellId === session.selection.cellId ? 'is-selected' : ''} ${cell?.circled ? 'is-circled' : ''}`}
                key={cellId}
                onClick={() => onSelectPattern(entry, position)}
                type="button"
              >
                {letter === '_' ? '.' : letter}
              </button>
            );
          })}
        </div>
        <button className="bridge-nudge" type="button" onClick={onNudge}>Nudge</button>
      </div>
      {crossing && (
        <p className="bridge-crossing">
          <span className="bridge-crossing-kicker">{crossing.number} {crossing.direction}</span>
          <span className="bridge-crossing-text">{crossing.clue}</span>
        </p>
      )}
    </section>
  );
}
