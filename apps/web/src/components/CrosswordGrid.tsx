import type { Cell, CellId, PuzzleDocument, PuzzleIndex } from '@crossword/domain';
import type { SolveSessionSnapshot } from '@crossword/domain';

type CrosswordGridProps = {
  puzzle: PuzzleDocument;
  index: PuzzleIndex;
  session: SolveSessionSnapshot;
  incorrectCellIds: readonly CellId[];
  onSelectCell: (cellId: CellId) => void;
  onMove: (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => void;
  onEnterLetter: (value: string) => void;
  onClearCell: () => void;
  onToggleDirection: () => void;
  onStepEntry: (step: 'next' | 'previous') => void;
};

function cellStatus(
  cell: Cell,
  session: SolveSessionSnapshot,
  incorrectCellIds: readonly CellId[]
): string {
  if (incorrectCellIds.includes(cell.id)) return 'incorrect';
  if (session.revealedCellIds.includes(cell.id)) return 'revealed';
  if (session.checkedCellIds.includes(cell.id)) return 'checked';
  return '';
}

export function CrosswordGrid({
  puzzle,
  index,
  session,
  incorrectCellIds,
  onSelectCell,
  onMove,
  onEnterLetter,
  onClearCell,
  onToggleDirection,
  onStepEntry
}: CrosswordGridProps) {
  const numbersByCellId = new Map<CellId, string>();
  for (const entry of puzzle.entries) {
    const firstCellId = entry.cellIds[0];
    if (!firstCellId) continue;
    const current = numbersByCellId.get(firstCellId);
    if (!current) numbersByCellId.set(firstCellId, `${entry.number}`);
    else if (current !== `${entry.number}`) numbersByCellId.set(firstCellId, `${current}/${entry.number}`);
  }
  const rows = Array.from({ length: puzzle.height }, (_, row) =>
    puzzle.cells.filter((cell) => cell.row === row)
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, cell: Cell) {
    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      onEnterLetter(event.key);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      onClearCell();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      onToggleDirection();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      onStepEntry(event.shiftKey ? 'previous' : 'next');
      return;
    }
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight'
    ) {
      event.preventDefault();
      onMove(event.key);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelectCell(cell.id);
    }
  }

  return (
    <div
      className="crossword-grid"
      data-grid-size={puzzle.width >= 10 || puzzle.height >= 10 ? 'large' : 'standard'}
      role="grid"
      aria-label={`${puzzle.title} crossword grid`}
      style={{
        gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${puzzle.height}, minmax(0, 1fr))`
      }}
    >
      {rows.map((row, rowIndex) => (
        <div className="grid-row" role="row" key={rowIndex}>
          {row.map((cell) => {
            if (cell.block) {
              return (
                <div
                  aria-disabled="true"
                  aria-label={`Row ${cell.row + 1}, column ${cell.column + 1}, blocked`}
                  className="grid-cell is-block"
                  data-block="true"
                  data-cell-id={cell.id}
                  key={cell.id}
                  role="gridcell"
                />
              );
            }
            const isActive = cell.id === session.selection.cellId;
            const isInEntry = index.entriesById
              .get(session.selection.entryId)
              ?.cellIds.includes(cell.id) ?? false;
            const status = cellStatus(cell, session, incorrectCellIds);
            const letter = session.entered[cell.id] ?? '';
            return (
              <button
                aria-label={`Row ${cell.row + 1}, column ${cell.column + 1}${letter ? `, ${letter}` : ', empty'}${isActive ? ', selected' : ''}`}
                aria-selected={isActive}
                className={`grid-cell ${isActive ? 'is-active' : ''} ${isInEntry ? 'is-entry' : ''} ${status}`}
                data-block="false"
                data-cell-id={cell.id}
                key={cell.id}
                onClick={() => onSelectCell(cell.id)}
                onKeyDown={(event) => handleKeyDown(event, cell)}
                role="gridcell"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {cell.circled && <span className="cell-circle" aria-hidden="true" />}
                {cell.shaded && <span className="cell-shade" aria-hidden="true" />}
                <span className="cell-number" aria-hidden="true">
                  {numbersByCellId.get(cell.id) ?? ''}
                </span>
                <span className="cell-letter">{letter}</span>
                {status === 'incorrect' && <span className="cell-status" aria-hidden="true">!</span>}
                {status === 'revealed' && <span className="cell-status" aria-hidden="true">R</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
