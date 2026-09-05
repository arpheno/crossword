import { entrySolveState, type CellId, type Direction, type Entry, type PuzzleIndex } from '@crossword/domain';
import type { SolveSessionSnapshot } from '@crossword/domain';

type ClueColumnProps = {
  direction: Direction;
  label: 'ACROSS' | 'DOWN';
  entries: readonly Entry[];
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  onSelectEntry: (entry: Entry) => void;
  onSelectPattern: (entry: Entry, position: number) => void;
  voicePreview?: Readonly<{ entryId: string; answer: string }> | null;
};

/**
 * Exact replica of the legacy clue column (newapp.html): a wrapped list whose
 * odd/even rows mirror around the number seam, giant rotated watermark
 * behind (styled by the ported legacy stylesheet), affected clues tinted by
 * the active direction.
 */
export function ClueColumn({
  direction,
  label,
  entries,
  index,
  session,
  onSelectEntry,
  onSelectPattern,
  voicePreview
}: ClueColumnProps) {
  const active = session.selection.direction === direction;
  const activeEntry = index.entriesById.get(session.selection.entryId);

  // legacy getIntersectingClues: opposite-direction entries crossing the
  // active entry, mapped to their exact shared cell ids
  const shared = new Map<string, CellId[]>();
  if (activeEntry) {
    const other: Direction = activeEntry.direction === 'across' ? 'down' : 'across';
    for (const cellId of activeEntry.cellIds) {
      const crossingId = index.entryAt.get(cellId)?.[other];
      if (!crossingId || crossingId === activeEntry.id) continue;
      const cells = shared.get(crossingId);
      if (cells) cells.push(cellId);
      else shared.set(crossingId, [cellId]);
    }
  }

  // the template names the intersection class after the ACTIVE direction,
  // so the ring color follows the active entry's family
  const intersectionClass = activeEntry?.direction === 'across'
    ? 'intersection-cell-across'
    : 'intersection-cell-down';

  return (
    <div
      aria-label={`${label} clues`}
      className={`clue-column ${active ? 'active' : 'inactive'}`}
      data-label={label}
      tabIndex={0}
    >
      <ul id={direction}>
        {entries.map((entry) => {
          const highlighted = session.selection.entryId === entry.id;
          const affected = shared.has(entry.id);
          const sharedCells = shared.get(entry.id) ?? [];
          const solveState = entrySolveState(entry, session);
          return (
            <li
              aria-label={`${entry.number} ${entry.direction}: ${entry.clue}`}
              aria-current={highlighted ? 'true' : undefined}
              className={`${highlighted ? 'highlighted-clue' : ''} ${affected ? 'affected-clue' : ''} clue-${solveState}`}
              data-entry-id={entry.id}
              data-lane={entry.number % 2 === 0 ? 'far' : 'near'}
              data-solve-state={solveState}
              key={entry.id}
              onClick={() => onSelectEntry(entry)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectEntry(entry);
                }
              }}
              tabIndex={0}
            >        {direction === 'down' && <strong className="clue-number">{entry.number}.</strong>}
              <div className="clue-content">
                <span className="clue-text">{entry.clue}</span>
                <div className="state-container">
                  {entry.cellIds.map((cellId, position) => {
                    const char = session.entered[cellId] ?? ' ';
                    const empty = char === ' ' || char === '';
                    const previewLetter = voicePreview?.entryId === entry.id
                      ? voicePreview.answer[position] ?? ''
                      : '';
                    const evaluation = session.checkPresentation.evaluations[cellId];
                    const evaluationIsCurrent = evaluation?.valueAtEvaluation === (empty ? '' : char);
                    const checking = session.checkPresentation.mode === 'on';
                    const incorrect = checking && evaluationIsCurrent && evaluation.state === 'incorrect';
                    const green = checking && evaluationIsCurrent && (evaluation.state === 'correct' || evaluation.state === 'revealed');
                    const crossing = sharedCells.includes(cellId) ? ` ${intersectionClass}` : '';
                    return (
                      <span
                        aria-label={`${entry.number} ${entry.direction}, letter ${position + 1}${empty && previewLetter ? `, proposed ${previewLetter}` : ''}`}
                        className={`state${crossing}${incorrect ? ' red' : ''}${green ? ' green' : ''}${empty && previewLetter ? ' voice-preview-state' : ''}`}
                        key={cellId}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectPattern(entry, position);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectPattern(entry, position);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {empty ? previewLetter || '\u00A0' : char}
                      </span>
                    );
                  })}
                </div>
              </div>
              {direction === 'across' && <strong className="clue-number">{entry.number}.</strong>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
