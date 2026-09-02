import type { NytWeekday } from '../nytApi';

type SolveCommandsProps = {
  onCheck: (scope: 'cell' | 'entry' | 'puzzle') => void;
  onReveal: (scope: 'cell' | 'entry' | 'puzzle') => void;
  onNewPuzzle: () => void;
  onModelSetup: () => void;
  onPause: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onLoadDate: () => void;
  onLoadRandom: () => void;
  puzzleDate: string;
  puzzleLoading: boolean;
  randomWeekday: NytWeekday;
  setPuzzleDate: (value: string) => void;
  setRandomWeekday: (value: NytWeekday) => void;
  paused: boolean;
};

/**
 * Compact command strip attached to the center stage (docs/plans/06 §8.3):
 * scope escalation lives in native details menus, so Check/Reveal/Pause/More
 * stay reachable without document scrolling. Nudge lives on the bridge.
 */
export function SolveCommands({
  onCheck,
  onReveal,
  onNewPuzzle,
  onModelSetup,
  onPause,
  onExport,
  onImport,
  onLoadDate,
  onLoadRandom,
  puzzleDate,
  puzzleLoading,
  randomWeekday,
  setPuzzleDate,
  setRandomWeekday,
  paused
}: SolveCommandsProps) {
  return (
    <div className="session-commands solve-commands" aria-label="Solve commands">
      <details className="command-menu">
        <summary>Check</summary>
        <div className="command-menu-items">
          <button type="button" onClick={() => onCheck('cell')}>Cell</button>
          <button type="button" onClick={() => onCheck('entry')}>Entry</button>
          <button type="button" onClick={() => onCheck('puzzle')}>Puzzle</button>
        </div>
      </details>
      <details className="command-menu">
        <summary>Reveal</summary>
        <div className="command-menu-items">
          <button type="button" onClick={() => onReveal('cell')}>Cell</button>
          <button type="button" onClick={() => onReveal('entry')}>Entry</button>
          <button type="button" onClick={() => onReveal('puzzle')}>Puzzle</button>
        </div>
      </details>
      <button className="command-secondary" type="button" onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>
      <details className="command-menu command-more">
        <summary>More</summary>
        <div className="command-menu-items">
          <button type="button" onClick={onNewPuzzle}>Restart puzzle</button>
          <button type="button" onClick={onExport}>Export archive</button>
          <label className="file-command">
            Import archive
            <input type="file" accept="application/json,.json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = '';
            }} />
          </label>
          <button type="button" onClick={onModelSetup}>Model setup</button>
          <div className="nyt-loader" aria-label="Load NYT puzzle">
            <label htmlFor="puzzle-date">NYT date</label>
            <input
              id="puzzle-date"
              inputMode="numeric"
              onChange={(event) => setPuzzleDate(event.target.value)}
              placeholder="YYMMDD"
              value={puzzleDate}
            />
            <button type="button" onClick={onLoadDate} disabled={puzzleLoading || puzzleDate.trim().length === 0}>
              {puzzleLoading ? 'Loading...' : 'Load'}
            </button>
            <label htmlFor="random-weekday">Random weekday</label>
            <select id="random-weekday" value={randomWeekday} onChange={(event) => setRandomWeekday(event.target.value as NytWeekday)}>
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((weekday) => (
                <option key={weekday} value={weekday}>{weekday}</option>
              ))}
            </select>
            <button type="button" onClick={onLoadRandom} disabled={puzzleLoading}>
              Random
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
