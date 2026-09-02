import type { NytWeekday } from '../nytApi';

type SessionCommandsProps = {
  onCheck: (scope: 'cell' | 'entry' | 'puzzle') => void;
  onReveal: (scope: 'cell' | 'entry' | 'puzzle') => void;
  onNewPuzzle: () => void;
  onModelSetup: () => void;
  onNudge: () => void;
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

export function SessionCommands({
  onCheck,
  onReveal,
  onNewPuzzle,
  onModelSetup,
  onNudge,
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
}: SessionCommandsProps) {
  return (
    <div className="session-commands" aria-label="Puzzle actions">
      <div className="command-group">
        <span className="command-label">Check</span>
        <button type="button" onClick={() => onCheck('cell')}>Cell</button>
        <button type="button" onClick={() => onCheck('entry')}>Entry</button>
        <button type="button" onClick={() => onCheck('puzzle')}>Puzzle</button>
      </div>
      <div className="command-group">
        <span className="command-label">Reveal</span>
        <button type="button" onClick={() => onReveal('cell')}>Cell</button>
        <button type="button" onClick={() => onReveal('entry')}>Entry</button>
        <button type="button" onClick={() => onReveal('puzzle')}>Puzzle</button>
      </div>
      <button className="command-secondary" type="button" onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>
      <button className="command-secondary" type="button" onClick={onNudge}>Nudge</button>
      <button className="command-secondary" type="button" onClick={onNewPuzzle}>Restart</button>
      <button className="command-secondary" type="button" onClick={onModelSetup}>Model setup</button>
      <button className="command-secondary" type="button" onClick={onExport}>Export</button>
      <div className="command-group nyt-loader" aria-label="Load NYT puzzle">
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
      <label className="command-secondary file-command">
        Import
        <input type="file" accept="application/json,.json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.target.value = '';
        }} />
      </label>
    </div>
  );
}
