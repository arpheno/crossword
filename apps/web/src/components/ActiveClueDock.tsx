import type { Entry, PuzzleIndex } from '@crossword/domain';
import { patternForEntry, type SolveSessionSnapshot } from '@crossword/domain';

type ActiveClueDockProps = {
  entry: Entry;
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  onSelectPattern: (entry: Entry, position: number) => void;
};

export function ActiveClueDock({ entry, index, session, onSelectPattern }: ActiveClueDockProps) {
  const pattern = patternForEntry(entry, session);
  return (
    <section className="active-clue-dock" aria-label="Active clue">
      <div className="dock-kicker">{entry.number} {entry.direction}</div>
      <p>{entry.clue}</p>
      <div className="dock-pattern" aria-label="Active answer pattern">
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
    </section>
  );
}
